// POST /extract  Bearer <app token>  multipart: application_id, doc_type, file
// Stores the scan, runs vision extraction, runs the rules layer, writes documents + extractions rows.
import { db, json, err, preflight, customerApp, logEvent, setState } from "../_shared/db.ts";
import { sha256Hex } from "../_shared/crypto.ts";
import { extractFields, stub } from "../_shared/llm.ts";
import { runChecks, recommend } from "../_shared/rules.ts";
import type { DocType } from "../_shared/schemas.ts";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  if (req.method !== "POST") return err("POST only", 405);
  // A request with no body or a non-multipart content-type makes formData() throw. Unhandled,
  // that escapes Deno.serve as a plain-text 500; every other bad input here answers with JSON.
  let form: FormData;
  try { form = await req.formData(); } catch { return err("multipart/form-data body required"); }
  const appId = String(form.get("application_id") ?? ""), docType = String(form.get("doc_type") ?? "") as DocType;
  const file = form.get("file");
  if (!(file instanceof File)) return err("file required");
  if (!["ID", "SUPPLY", "OWNERSHIP"].includes(docType)) return err("bad doc_type");
  if (!ALLOWED.includes(file.type)) return err("unsupported mime " + file.type);
  if (file.size > MAX_BYTES) return err("file too large");
  const app = await customerApp(req, appId); if (!app) return err("not found", 404);
  if (!app.kyc) return err("identity first");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha = await sha256Hex(bytes);
  const path = `${appId}/${docType}-${Date.now()}-${sha.slice(0, 8)}`;
  const up = await db.storage.from("scans").upload(path, bytes, { contentType: file.type, upsert: false });
  if (up.error) return err(up.error.message, 500);

  // Replace any previous pending/rejected document of this type (re-upload).
  await db.from("documents").delete().eq("application_id", appId).eq("doc_type", docType).neq("status", "approved");
  const { data: doc, error } = await db.from("documents").insert({ application_id: appId, doc_type: docType, storage_path: path, file_name: file.name, mime: file.type, bytes: file.size, sha256: sha }).select().single();
  if (error) return err(error.message, 500);
  await logEvent(appId, "customer", "ocr", "document_uploaded", { doc_type: docType, sha256: sha, bytes: file.size });

  const t0 = Date.now(); let model = "stub", fields;
  try { ({ model, fields } = await extractFields(docType, bytes, file.type)); }
  catch (e) { await logEvent(appId, "system", "ocr", "extraction_failed", { error: String(e) }); ({ fields } = stub(docType)); model = "stub(error)"; }
  const checks = runChecks(docType, fields, { kyc_name: app.kyc.name, kyc_id_no: app.kyc.id_no, supply_point: app.supply_point, address: app.address });
  const { recommendation, confidence } = recommend(docType, fields, checks);
  const { data: ext } = await db.from("extractions").insert({ document_id: doc.id, model, fields, checks, confidence, recommendation, latency_ms: Date.now() - t0 }).select().single();
  await logEvent(appId, "system", "ocr", "extraction_completed", { doc_type: docType, model, confidence, recommendation, latency_ms: Date.now() - t0 });

  // Policy: auto_approve is applied only when a real model produced it. Stub output always goes to a human.
  const humanOnly = docType === "ID" && app.kyc.method === "manual";   // low-assurance identity is always a human decision
  if (recommendation === "auto_approve" && !model.startsWith("stub") && !humanOnly) {
    await db.from("documents").update({ status: "approved", reviewed_at: new Date().toISOString(), reviewed_by: "system:rules" }).eq("id", doc.id);
    await logEvent(appId, "system", "review", "auto_approved", { doc_type: docType });
  }
  return json({ document_id: doc.id, model, fields, checks, confidence, recommendation, auto_approved: recommendation === "auto_approve" && !model.startsWith("stub") });
});
