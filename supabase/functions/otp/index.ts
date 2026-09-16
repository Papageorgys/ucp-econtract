// POST /otp/send    Bearer {application_id, consents:[...]}
// POST /otp/verify  Bearer {application_id, code}  -> seals the contract set, writes evidence_records
import { db, json, err, preflight, customerApp, logEvent } from "../_shared/db.ts";
import { sha256Hex, otpCode, maskPhone, randomId } from "../_shared/crypto.ts";
import { BRAND } from "../_shared/brand.ts";
import { canonicalContract, CATALOGUE_VERSION, WITHDRAWAL } from "../_shared/catalogue.ts";

const TTL_MS = 5 * 60 * 1000, MAX_ATTEMPTS = 3;
const REQUIRED_CONSENTS = ["precontract_info", "terms", "withdrawal", "privacy"];

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  if (req.method !== "POST") return err("POST only", 405);
  const action = new URL(req.url).pathname.split("/").filter(Boolean)[1];
  const body = await req.json();
  const app = await customerApp(req, body.application_id); if (!app) return err("not found", 404);
  const purpose = body.purpose === "identity" ? "identity" : "signature";
  if (!app.kyc || !app.phone) return err("application incomplete");
  if (purpose === "signature" && !app.products?.length) return err("application incomplete");
  if (purpose === "identity" && app.kyc.method !== "manual") return err("identity OTP only for manual route");

  if (action === "send") {
    const consents: string[] = body.consents ?? [];
    if (purpose === "signature" && REQUIRED_CONSENTS.some((c) => !consents.includes(c))) return err("required consents missing");
    const code = otpCode();
    await db.from("otp_challenges").update({ consumed_at: new Date().toISOString() }).eq("application_id", app.id).eq("purpose", purpose).is("consumed_at", null); // invalidate previous
    await db.from("otp_challenges").insert({ application_id: app.id, phone: app.phone, purpose, code_hash: await sha256Hex(`${app.id}:${purpose}:${code}`), expires_at: new Date(Date.now() + TTL_MS).toISOString() });
    const hook = Deno.env.get("SMS_WEBHOOK_URL");
    if (hook) await fetch(hook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ to: app.phone, text: `${BRAND.name}: κωδικός υπογραφής ${code}. Ισχύει 5 λεπτά.` }) });
    else console.log(`[OTP] ${app.id} -> ${maskPhone(app.phone)} code=${code}`);
    if (purpose === "signature") await db.from("applications").update({ state: "CONTRACT_PRESENTED" }).eq("id", app.id);
    await logEvent(app.id, "system", "otp", "code_sent", { purpose, channel: hook ? "sms" : "log", recipient: maskPhone(app.phone), consents });
    return json({ ok: true, sent_to: maskPhone(app.phone), delivered_via: hook ? "sms" : "server-log" });
  }

  if (action === "verify") {
    const { data: ch } = await db.from("otp_challenges").select("*").eq("application_id", app.id).eq("purpose", purpose).is("consumed_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!ch) return err("no active code", 409);
    if (Date.parse(ch.expires_at) < Date.now()) return err("code expired", 410);
    if (ch.attempts >= MAX_ATTEMPTS) return err("too many attempts", 429);
    const ok = ch.code_hash === await sha256Hex(`${app.id}:${purpose}:${String(body.code ?? "")}`);
    await db.from("otp_challenges").update({ attempts: ch.attempts + 1, ...(ok ? { consumed_at: new Date().toISOString() } : {}) }).eq("id", ch.id);
    if (!ok) { await logEvent(app.id, "customer", "otp", "code_rejected", { purpose, attempt: ch.attempts + 1 }); return err(`wrong code (${ch.attempts + 1}/${MAX_ATTEMPTS})`, 401); }
    if (purpose === "identity") {
      await db.from("applications").update({ kyc: { ...app.kyc, phone_verified: true }, state: "IDENTIFIED" }).eq("id", app.id);
      await logEvent(app.id, "system", "identity", "manual_identity_phone_verified", { recipient: maskPhone(app.phone) });
      return json({ ok: true, purpose, assurance: "low", note: "Manual route: ID document required; agent review mandatory before activation." });
    }
    if (app.kyc.method === "manual" && !app.kyc.phone_verified) return err("identity not verified", 409);

    // Seal: one evidence record per legal contract, sharing the document set.
    const verifiedAt = new Date().toISOString();
    const bundle = app.journey === "bundle" ? "BN-EL-FB" : undefined;
    const client = { ip: req.headers.get("x-forwarded-for") ?? null, user_agent: req.headers.get("user-agent") ?? null };
    const consents = (body.consents ?? REQUIRED_CONSENTS) as string[];
    const records = [];
    for (const sku of app.products) {
      const canonical = canonicalContract({ id: app.id, kyc: app.kyc }, sku, bundle);
      const rec = {
        id: randomId("EVD-", 8), application_id: app.id, contract_id: sku, document_set: app.products,
        canonical_hash: await sha256Hex(canonical),
        signatory: { name: app.kyc.name, afm: app.kyc.afm, identity_method: app.kyc.method, assurance: app.kyc.assurance, kyc_ref: app.kyc.method === "manual" ? null : app.kyc.retrieved_at, id_document_verified: app.kyc.method === "manual" ? "see documents.ID" : "n/a" },
        otp: { channel: "sms", recipient_masked: maskPhone(app.phone), attempts: ch.attempts + 1, verified_at: verifiedAt, challenge_id: ch.id },
        consents, withdrawal: { ...WITHDRAWAL, disclosed: true }, client, catalogue_version: CATALOGUE_VERSION,
      };
      const { data, error } = await db.from("evidence_records").insert(rec).select("id,row_hash,prev_hash,canonical_hash").single();
      if (error) return err(error.message, 500);
      records.push(data);
    }
    await db.from("applications").update({ state: "SIGNED", signed_at: verifiedAt }).eq("id", app.id);
    await logEvent(app.id, "system", "signature", "sealed", { records: records.map((r) => r.id) });
    return json({ ok: true, signed_at: verifiedAt, evidence: records, note: "OTP consent + hash. Not an eIDAS AES/QES." });
  }
  return err("not found", 404);
});
