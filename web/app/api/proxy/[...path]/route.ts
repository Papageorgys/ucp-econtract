import { NextRequest, NextResponse } from "next/server";
import { AGENT_COOKIE, verifyAgentCookie } from "@/lib/agent-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-side proxy to the Supabase Edge Functions.
 *
 * Why this exists rather than fetching Supabase from the browser:
 *  1. Same-origin. The browser never makes a cross-origin call, so the Edge Functions do not
 *     need `access-control-allow-origin: *` to serve this frontend.
 *  2. PROTO_AGENT_TOKEN stays on the server. It is a single shared secret that grants the whole
 *     agent surface (review, activation, every application, signed document previews). Shipping
 *     it to an agent's browser tab would put it in devtools, extensions and any XSS.
 *
 * Scope is explicit in the path, never inferred:
 *   /api/proxy/<fn>/...         customer scope  — forwards the caller's Bearer application token
 *   /api/proxy/agent/<fn>/...   agent scope     — requires a valid agent cookie; injects the token
 */

const UPSTREAM_FUNCTIONS = new Set(["applications", "extract", "otp", "review"]);
const AGENT_ONLY_FUNCTIONS = new Set(["review"]);

function upstreamBase(): string | null {
  const raw = process.env.SUPABASE_FUNCTIONS_URL;
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

async function forward(req: NextRequest, segments: string[]): Promise<NextResponse> {
  const base = upstreamBase();
  if (!base) {
    return NextResponse.json({ error: "SUPABASE_FUNCTIONS_URL is not configured" }, { status: 503 });
  }

  const agentScope = segments[0] === "agent";
  const path = agentScope ? segments.slice(1) : segments;
  const fn = path[0];

  if (!fn || !UPSTREAM_FUNCTIONS.has(fn)) {
    // Never relay arbitrary paths: the allowlist is what stops this route being an open relay
    // to everything else hosted under the Supabase functions origin.
    return NextResponse.json({ error: "unknown endpoint" }, { status: 404 });
  }
  if (!agentScope && AGENT_ONLY_FUNCTIONS.has(fn)) {
    return NextResponse.json({ error: "agent scope required" }, { status: 401 });
  }

  const headers = new Headers();
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  if (agentScope) {
    const ok = verifyAgentCookie(req.cookies.get(AGENT_COOKIE)?.value);
    if (!ok) return NextResponse.json({ error: "agent session required" }, { status: 401 });
    const token = process.env.PROTO_AGENT_TOKEN;
    if (!token) return NextResponse.json({ error: "PROTO_AGENT_TOKEN is not configured" }, { status: 503 });
    headers.set("x-agent-token", token);
  } else {
    // Customer scope: the per-application bearer is the caller's to present. Any client-supplied
    // x-agent-token is dropped by construction — we only ever set headers we chose above.
    const auth = req.headers.get("authorization");
    if (auth) headers.set("authorization", auth);
  }

  const url = new URL(`${base}/${path.join("/")}`);
  url.search = req.nextUrl.search;

  const init: RequestInit = { method: req.method, headers, redirect: "manual" };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, init);
  } catch (e) {
    return NextResponse.json({ error: `upstream unreachable: ${(e as Error).message}` }, { status: 502 });
  }

  const body = await upstream.arrayBuffer();
  const out = new NextResponse(body, { status: upstream.status });
  out.headers.set("content-type", upstream.headers.get("content-type") ?? "application/json");
  out.headers.set("cache-control", "no-store");
  return out;
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return forward(req, (await ctx.params).path);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  return forward(req, (await ctx.params).path);
}
