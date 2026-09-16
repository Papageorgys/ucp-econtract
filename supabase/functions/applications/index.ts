// POST /applications                       {journey}                        -> create (id + token)
// GET  /applications/:id                   Bearer token | x-agent-token     -> full record + active blocks + offers
// POST /applications/:id/blocks/:block     Bearer token {…block payload}    -> routed to the block's submit() (see _shared/blocks.ts)
// GET  /applications                       x-agent-token                    -> agent queue
import { db, json, err, preflight, customerApp, isAgent, logEvent } from "../_shared/db.ts";
import { randomId, randomToken } from "../_shared/crypto.ts";
import { PRODUCTS, BUNDLES, OFFERS, requiredDocs, CATALOGUE_VERSION } from "../_shared/catalogue.ts";
import { activeBlocks, blockById, SLOT_OF_BLOCK, type AppRow } from "../_shared/blocks.ts";
import { offersFor } from "../_shared/offers.ts";

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  const parts = new URL(req.url).pathname.split("/").filter(Boolean); // ["applications", id?, "blocks"?, block?]
  const id = parts[1];

  if (req.method === "POST" && !id) {
    const { journey } = await req.json();
    if (!["electricity", "fiber", "bundle"].includes(journey)) return err("bad journey");
    const app = { id: randomId("MYD-"), token: randomToken(), journey };
    const { error } = await db.from("applications").insert(app); if (error) return err(error.message, 500);
    await logEvent(app.id, "customer", "orchestration", "application_created", { journey });
    return json(app);
  }

  if (req.method === "GET" && !id) {
    if (!isAgent(req)) return err("agent token required", 401);
    const { data } = await db.from("applications").select("id,created_at,journey,state,kyc,products,signed_at,activated_at,parent_id").not("kyc", "is", null).order("created_at", { ascending: false }).limit(100);
    const ids = (data ?? []).map((a) => a.id);
    const { data: docs } = await db.from("documents").select("application_id,doc_type,status").in("application_id", ids);
    return json({ applications: (data ?? []).map((a) => ({ ...a, kyc: { name: a.kyc?.name, afm: a.kyc?.afm, method: a.kyc?.method }, docs: (docs ?? []).filter((d) => d.application_id === a.id).map((d) => ({ doc_type: d.doc_type, status: d.status })) })) });
  }

  if (req.method === "GET" && id) {
    const agent = isAgent(req); const app = agent ? (await db.from("applications").select("*").eq("id", id).maybeSingle()).data : await customerApp(req, id);
    if (!app) return err("not found", 404);
    const { data: docs } = await db.from("documents").select("*").eq("application_id", id).order("uploaded_at");
    const docIds = (docs ?? []).map((d) => d.id);
    const { data: ext } = docIds.length ? await db.from("extractions").select("*").in("document_id", docIds).order("created_at", { ascending: false }) : { data: [] };
    const { data: ev } = agent ? await db.from("evidence_records").select("id,contract_id,canonical_hash,row_hash,prev_hash,created_at,otp,consents,signatory").eq("application_id", id) : { data: null };
    const { data: events } = await db.from("events").select("at,actor,system,event,detail").eq("application_id", id).order("at", { ascending: false }).limit(60);
    const documents = await Promise.all((docs ?? []).map(async (d) => {
      const latest = (ext ?? []).find((e) => e.document_id === d.id) ?? null; let preview: string | null = null;
      if (agent) { const { data: s } = await db.storage.from("scans").createSignedUrl(d.storage_path, 600); preview = s?.signedUrl ?? null; }
      return { ...d, storage_path: undefined, extraction: latest, preview };
    }));
    const { token: _t, ...safe } = app;
    const offers: Record<string, unknown> = {}; for (const [blk, slot] of Object.entries(SLOT_OF_BLOCK)) offers[blk] = app.kyc ? offersFor(app, slot) : [];
    return json({ application: safe, blocks: activeBlocks(app as AppRow), offers, required_docs: requiredDocs(app.products, app.kyc), documents, evidence: ev ?? [], events: events ?? [],
      catalogue: { version: CATALOGUE_VERSION, products: PRODUCTS, bundles: BUNDLES, offer_rules: OFFERS.length } });
  }

  if (req.method === "POST" && id && parts[2] === "blocks" && parts[3]) {
    const app = await customerApp(req, id) as AppRow | null; if (!app) return err("not found", 404);
    const block = blockById(parts[3]); if (!block?.submit) return err("block has no submit handler", 404);
    if (!activeBlocks(app).includes(block.id)) return err("block not active for this application", 409);
    if (app.signed_at && !["offers_3"].includes(block.id)) return err("application already signed", 409);
    const body = await req.json().catch(() => ({}));
    const r = await block.submit({ app, body, insertChild: async (row) => { const { error } = await db.from("applications").insert(row); if (error) throw new Error(error.message); } });
    if (r.error) return json({ error: r.error.message, field: r.error.field ?? null }, r.error.status ?? 400);
    if (r.patch && Object.keys(r.patch).length) { const { error } = await db.from("applications").update(r.patch).eq("id", id); if (error) return err(error.message, 500); }
    for (const e of r.events ?? []) await logEvent(id, e.actor, e.system, e.event, e.detail);
    return json({ ok: true, block: block.id, state: r.patch?.state ?? app.state, ...(r.response ?? {}) });
  }
  return err("not found", 404);
});
