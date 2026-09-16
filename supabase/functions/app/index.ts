// Serves the UI from the same origin as the API. HTML is embedded at build time (deno task embed).
import { BRAND } from "../_shared/brand.ts";
import { HTML } from "./html.ts";
const html = HTML.replace("/*BRAND*/", `window.BRAND=${JSON.stringify(BRAND)};`);
Deno.serve(() => new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }));
