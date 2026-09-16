import { createClient } from "npm:@supabase/supabase-js@2";
export const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

export const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type, x-agent-token", "access-control-allow-methods": "GET,POST,OPTIONS" };
export function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...CORS } }); }
export function err(msg: string, status = 400) { return json({ error: msg }, status); }
export function preflight(req: Request) { if (req.method === "OPTIONS") return new Response(null, { headers: CORS }); }

// Customer session: Authorization: Bearer <application token>. Agent: x-agent-token: <PROTO_AGENT_TOKEN>.
export async function customerApp(req: Request, appId: string) {
  const tok = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data } = await db.from("applications").select("*").eq("id", appId).eq("token", tok).maybeSingle();
  return data;
}
export function isAgent(req: Request) {
  const expected = Deno.env.get("PROTO_AGENT_TOKEN"); return !!expected && req.headers.get("x-agent-token") === expected;
}
export async function logEvent(application_id: string | null, actor: string, system: string, event: string, detail?: unknown) {
  await db.from("events").insert({ application_id, actor, system, event, detail: detail ?? null });
}
export async function setState(id: string, state: string) { await db.from("applications").update({ state }).eq("id", id); }
