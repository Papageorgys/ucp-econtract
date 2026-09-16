// ─────────────────────────────────────────────────────────────────────────────
// Block connector (server side).
// A block = { id, order, active(app), submit?(ctx) }. The applications function routes
// POST /applications/:id/blocks/:blockId to the block's submit(). Blocks never touch
// each other; they read the application and return a patch + events. The UI mirrors
// this registry (see app/index.html → BLOCKS_UI) and renders whatever `activeBlocks()`
// returns. Adding a block = one entry here + one entry there.
// ─────────────────────────────────────────────────────────────────────────────
import { PRODUCTS, BUNDLES, requiredDocs, familiesOf, assuranceOk, CATALOGUE_VERSION } from "./catalogue.ts";
import { offersFor, applyOffer } from "./offers.ts";
import { randomId, randomToken } from "./crypto.ts";

export type AppRow = { id: string; journey: "electricity" | "fiber" | "bundle"; state: string; kyc: Record<string, unknown> | null; products: string[];
  supply_point: string | null; address: string | null; fiber_serviceable: boolean | null; email: string | null; phone: string | null; payment: string | null;
  signed_at: string | null; activated_at: string | null; offers: Array<{ offer_id: string; shown: number; decision: string | null; at?: string }>; parent_id: string | null };
export type Patch = Partial<AppRow> & Record<string, unknown>;
export type Ev = { actor: string; system: string; event: string; detail?: unknown };
export type Ctx = { app: AppRow; body: Record<string, unknown>; insertChild: (row: Record<string, unknown>) => Promise<void> };
export type Result = { patch?: Patch; events?: Ev[]; response?: Record<string, unknown>; error?: { message: string; status?: number; field?: string } };
export type Block = { id: string; order: number; active: (a: AppRow) => boolean; submit?: (c: Ctx) => Promise<Result> };

const E = (message: string, field?: string, status = 400): Result => ({ error: { message, field, status } });
const s = (v: unknown) => String(v ?? "").trim();

export const BLOCKS: Block[] = [
  // ── Identity ──────────────────────────────────────────────────────────────
  { id: "identity", order: 10, active: () => true, async submit({ app, body }) {
    const method = body.method === "manual" ? "manual" : "eid";
    const name = s(body.name), afm = s(body.afm).replace(/\s/g, "");
    if (!name) return E("name_required", "name");
    if (!/^\d{9}$/.test(afm)) return E("afm_format", "afm");
    if (method === "manual") {
      const phone = s(body.phone).replace(/\s/g, "");
      if (phone.replace(/\D/g, "").length < 10) return E("phone_format", "phone");
      return { patch: { kyc: { name, afm, id_no: null, method: "manual", assurance: "low", phone_verified: false, retrieved_at: new Date().toISOString() }, phone, state: "DRAFT" },
        events: [{ actor: "customer", system: "identity", event: "manual_identity_entered", detail: { afm } }] };
    }
    // e-ID: SIMULATED. A real integration receives the record from the wallet callback, never from the client body.
    return { patch: { kyc: { name, afm, id_no: s(body.id_no) || null, method: "eid-kyc-simulated", assurance: "substantial", phone_verified: null, retrieved_at: new Date().toISOString() }, state: "IDENTIFIED" },
      events: [{ actor: "system", system: "eid", event: "record_retrieved_simulated", detail: { afm } }] };
  } },

  // ── Eligibility ───────────────────────────────────────────────────────────
  { id: "eligibility", order: 20, active: () => true, async submit({ app, body }) {
    if (!app.kyc) return E("identity_first", undefined, 409);
    const patch: Patch = {}; const events: Ev[] = [];
    if (app.journey !== "fiber") {
      const sp = s(body.supply_point).replace(/\s/g, "");
      if (!/^\d{9,14}$/.test(sp)) return E("supply_point_format", "supply_point");
      if (body.simulate_pending_switch) return E("supply_point_pending_switch", "supply_point", 409);
      patch.supply_point = sp; events.push({ actor: "system", system: "grid", event: "supply_point_checked_simulated", detail: { supply_point: sp } });
    }
    const address = s(body.address);
    if (app.journey !== "electricity" && !address) return E("address_required", "address");
    if (address) {
      const ok = !body.simulate_no_coverage;
      if (!ok && app.journey === "fiber") return E("no_coverage", "address", 409);
      patch.address = address; patch.fiber_serviceable = ok;
      events.push({ actor: "system", system: "coverage", event: "address_checked_simulated", detail: { address, serviceable: ok } });
      if (!ok && app.journey === "bundle") { patch.journey = "electricity"; events.push({ actor: "system", system: "orchestration", event: "journey_downgraded", detail: { from: "bundle", to: "electricity", reason: "no_coverage" } }); }
    }
    patch.state = "ELIGIBLE"; return { patch, events };
  } },

  { id: "offers_1", order: 25, active: (a) => a.journey === "electricity", submit: offerSubmit("after_eligibility") },

  // ── Product ───────────────────────────────────────────────────────────────
  { id: "product", order: 30, active: () => true, async submit({ app, body }) {
    const chosen: string[] = app.journey === "bundle" ? BUNDLES["BN-EL-FB"].components : (Array.isArray(body.skus) ? body.skus as string[] : [s(body.sku)]).filter(Boolean);
    if (!chosen.length) return E("sku_required", "sku");
    if (chosen.some((p) => !PRODUCTS[p] || PRODUCTS[p].kind !== "core")) return E("sku_unknown", "sku");
    // Keep add-ons and any core product of another family (e.g. fiber accepted as a cross-sell before choosing the electricity plan).
    const fams = new Set(chosen.map((p) => PRODUCTS[p].family));
    const keep = (app.products ?? []).filter((p) => PRODUCTS[p]?.kind === "addon" || !fams.has(PRODUCTS[p]?.family));
    const products = [...new Set([...chosen, ...keep])];
    if (!assuranceOk(products, (app.kyc?.assurance as "low" | "substantial" | "high") ?? "low")) return E("assurance_too_low", "sku", 403);
    return { patch: { products, state: "CONFIGURED" }, events: [{ actor: "system", system: "catalogue", event: "configured", detail: { products, version: CATALOGUE_VERSION } }] };
  } },

  { id: "offers_2", order: 35, active: () => true, submit: offerSubmit("after_product") },

  // ── Customer data ─────────────────────────────────────────────────────────
  { id: "customer", order: 40, active: () => true, async submit({ app, body }) {
    const email = s(body.email), phone = s(body.phone).replace(/\s/g, "");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return E("email_format", "email");
    if (phone.replace(/\D/g, "").length < 10) return E("phone_format", "phone");
    if (app.kyc?.method === "manual" && app.phone && phone !== app.phone) return E("phone_locked_manual", "phone");
    return { patch: { email, phone, state: requiredDocs(app.products, app.kyc as { method?: string }).length ? "DOCS_PENDING" : "DATA_COMPLETE" },
      events: [{ actor: "customer", system: "crm", event: "contact_captured", detail: { email_domain: email.split("@")[1] } }] };
  } },

  // Documents and Contract are handled by the extract / otp functions; registered here so the flow knows their position.
  { id: "documents", order: 50, active: (a) => requiredDocs(a.products, a.kyc as { method?: string }).length > 0 },

  // ── Payment ───────────────────────────────────────────────────────────────
  { id: "payment", order: 60, active: () => true, async submit({ app, body }) {
    const m = s(body.method);
    if (!["invoice", "sepa", "card"].includes(m)) return E("payment_required", "method");
    if (familiesOf(app.products).has("fiber") && m === "invoice") return E("payment_mandate_required", "method");
    return { patch: { payment: m, state: "CONTRACT_PRESENTED" }, events: [{ actor: "customer", system: "payment", event: "method_selected", detail: { method: m } }] };
  } },

  { id: "contract",   order: 70, active: () => true },
  { id: "activation", order: 80, active: () => true },
  { id: "offers_3",   order: 85, active: (a) => familiesOf(a.products).size > 0, submit: offerSubmit("post_signature") },
];

function offerSubmit(slot: "after_eligibility" | "after_product" | "post_signature") {
  return async ({ app, body, insertChild }: Ctx): Promise<Result> => {
    const id = s(body.offer_id); const decision = body.decision === "accepted" ? "accepted" : "declined";
    const o = offersFor(app as Parameters<typeof offersFor>[0], slot).find((x) => x.id === id); if (!o) return E("offer_unavailable", undefined, 409);
    const log = [...(app.offers ?? [])]; const i = log.findIndex((d) => d.offer_id === o.id);
    const entry = { offer_id: o.id, shown: (i >= 0 ? log[i].shown : 0) + 1, decision, at: new Date().toISOString() };
    if (i >= 0) log[i] = entry; else log.push(entry);
    const events: Ev[] = [{ actor: "customer", system: "offers", event: `offer_${decision}`, detail: { offer: o.id, kind: o.kind, sku: o.sku, slot } }];
    if (decision !== "accepted") return { patch: { offers: log }, events };
    if (slot === "post_signature") {
      // Signed contracts are immutable → child application reusing identity, contact, payment.
      const child = { id: randomId("MYD-"), token: randomToken(), journey: app.journey, parent_id: app.id, kyc: app.kyc, supply_point: app.supply_point, address: app.address,
        fiber_serviceable: app.fiber_serviceable, email: app.email, phone: app.phone, payment: app.payment, products: [o.sku], state: "CONFIGURED" };
      await insertChild(child);
      return { patch: { offers: log }, events: [...events, { actor: "system", system: "offers", event: "child_application_created", detail: { child: child.id, sku: o.sku } }], response: { child: { id: child.id, token: child.token } } };
    }
    const products = applyOffer(app.products, o);
    if (!assuranceOk(products, (app.kyc?.assurance as "low") ?? "low")) return E("assurance_too_low", undefined, 403);
    return { patch: { offers: log, products }, events };
  };
}

export const SLOT_OF_BLOCK: Record<string, "after_eligibility" | "after_product" | "post_signature"> = { offers_1: "after_eligibility", offers_2: "after_product", offers_3: "post_signature" };
export function activeBlocks(a: AppRow): string[] { return BLOCKS.filter((b) => b.active(a)).sort((x, y) => x.order - y.order).map((b) => b.id); }
export function blockById(id: string) { return BLOCKS.find((b) => b.id === id); }
