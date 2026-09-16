// Agent actions. x-agent-token required.
// POST /review {application_id, document_id, action:'approve'|'reject', reason?, note?}
// POST /review {application_id, action:'activate'}
import { db, json, err, preflight, isAgent, logEvent } from "../_shared/db.ts";
import { requiredDocs } from "../_shared/catalogue.ts";
const REASONS = ["illegible", "wrong_document", "name_mismatch", "expired", "other"];

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  if (req.method !== "POST") return err("POST only", 405);
  if (!isAgent(req)) return err("agent token required", 401);
  const b = await req.json(); const agent = "agent:" + (b.agent_id ?? "demo");
  const { data: app } = await db.from("applications").select("*").eq("id", b.application_id).maybeSingle(); if (!app) return err("not found", 404);

  if (b.action === "approve" || b.action === "reject") {
    if (b.action === "reject" && !REASONS.includes(b.reason)) return err("bad reason");
    const patch = b.action === "approve" ? { status: "approved", reject_reason: null, reject_note: null } : { status: "rejected", reject_reason: b.reason, reject_note: b.note ?? null };
    const { error } = await db.from("documents").update({ ...patch, reviewed_at: new Date().toISOString(), reviewed_by: agent }).eq("id", b.document_id).eq("application_id", app.id); if (error) return err(error.message, 500);
    await logEvent(app.id, agent, "review", b.action === "approve" ? "document_approved" : "document_rejected", { document_id: b.document_id, reason: b.reason, note: b.note });
    const { data: docs } = await db.from("documents").select("doc_type,status").eq("application_id", app.id);
    const req_ = requiredDocs(app.products, app.kyc); const allOk = req_.every((t) => docs?.find((d) => d.doc_type === t && d.status === "approved"));
    const anyRej = docs?.some((d) => d.status === "rejected");
    if (anyRej) await db.from("applications").update({ state: "RETURNED" }).eq("id", app.id);
    else if (allOk && app.signed_at) await db.from("applications").update({ state: "SUBMITTED" }).eq("id", app.id);
    else if (allOk) await db.from("applications").update({ state: "DOCS_VERIFIED" }).eq("id", app.id);
    return json({ ok: true, all_approved: allOk });
  }
  if (b.action === "activate") {
    const { data: docs } = await db.from("documents").select("doc_type,status").eq("application_id", app.id);
    const ok = requiredDocs(app.products, app.kyc).every((t) => docs?.find((d) => d.doc_type === t && d.status === "approved"));
    if (!ok || !app.signed_at) return err("all documents must be approved and the contract signed", 409);
    if (app.kyc?.method === "manual") {
      const { data: idDoc } = await db.from("documents").select("reviewed_by").eq("application_id", app.id).eq("doc_type", "ID").eq("status", "approved").maybeSingle();
      if (!idDoc || !String(idDoc.reviewed_by ?? "").startsWith("agent:")) return err("manual identity: ID document must be approved by an agent, not by rules", 409);
    }
    await db.from("applications").update({ state: "ACTIVATED", activated_at: new Date().toISOString() }).eq("id", app.id);
    // Pillar 3 hand-offs are stubs: log the intent, nothing is sent.
    if (app.journey !== "fiber") await logEvent(app.id, "system", "orchestration", "sap_isu_contract_create_stub", { supply_point: app.supply_point });
    if (app.journey !== "electricity") await logEvent(app.id, "system", "orchestration", "fiber_provisioning_stub", { address: app.address });
    await logEvent(app.id, agent, "orchestration", "activated", {});
    return json({ ok: true });
  }
  return err("unknown action");
});
