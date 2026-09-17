export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serves the complete twelve-block journey (supabase/functions/app/index.html).
 *
 * Why it is served from here rather than from Supabase:
 *   Supabase Edge Functions refuse to serve HTML. Per their docs, "GET requests that return
 *   text/html will be rewritten to text/plain". The `app` Edge Function returns the correct
 *   bytes (sha256-verified) but with a content-type that makes a browser show source instead
 *   of rendering. So we fetch those bytes and re-serve them with the right label.
 *
 * Two lines are rewritten on the way through, both because this origin is Vercel, not Supabase:
 *   1. BASE — the UI derives its API root from its own path; here it must point at our proxy.
 *   2. the auth header — Vercel's edge consumes Authorization, so the per-application token
 *      travels in x-econtract-token, which is what the proxy expects.
 *
 * A replacement that silently fails to match would produce a subtly broken UI, so each one is
 * asserted and a mismatch is reported loudly rather than served.
 */

const UPSTREAM = "https://mwxfmkuedrlsbtssryxk.supabase.co/functions/v1/app";

const PATCHES: Array<{ name: string; from: string; to: string }> = [
  {
    name: "BASE",
    from:
      'const BASE=(location.pathname.includes("/functions/v1/")?location.origin+"/functions/v1":location.origin);',
    to: 'const BASE=location.origin+"/api/proxy";',
  },
  {
    name: "auth-header",
    from: 'if(token) h.authorization="Bearer "+token;',
    to: 'if(token) h["x-econtract-token"]=token;',
  },
];

let cached: string | null = null;

export async function GET() {
  if (!cached) {
    const upstream = await fetch(UPSTREAM, { cache: "no-store" });
    if (!upstream.ok) {
      return new Response(`upstream ${upstream.status} fetching the UI bundle`, { status: 502 });
    }
    let html = await upstream.text();

    const failed: string[] = [];
    for (const p of PATCHES) {
      if (!html.includes(p.from)) {
        failed.push(p.name);
        continue;
      }
      html = html.replaceAll(p.from, p.to);
    }
    if (failed.length) {
      return new Response(
        `UI patch did not apply: ${failed.join(", ")}. The upstream bundle changed; ` +
          `update PATCHES in web/app/ui/route.ts before serving.`,
        { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } },
      );
    }
    cached = html;
  }

  return new Response(cached, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
