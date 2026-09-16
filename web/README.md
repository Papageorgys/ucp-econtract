# web — Next.js frontend on Vercel

The customer and agent UI, deployed to Vercel. Supabase keeps Postgres, Storage and the Edge
Functions; this app holds no business logic.

```
browser ──same-origin──▶ /api/proxy/…  (Vercel, Node runtime)
                              │
                              └─▶ https://<ref>.supabase.co/functions/v1/{applications,extract,otp,review}
```

## Why a proxy instead of calling Supabase from the browser

Two reasons, both load-bearing:

1. **CORS.** Same-origin fetches mean the Edge Functions do not need
   `access-control-allow-origin: *` to serve this frontend. That header is currently in
   `_shared/db.ts` and should be narrowed once nothing depends on it.
2. **`PROTO_AGENT_TOKEN` stays server-side.** It is one shared secret granting the entire agent
   surface — review, activation, every application, signed URLs for uploaded ID documents. Sending
   it to an agent's browser would place it in devtools, browser extensions and any XSS on the page.
   The proxy attaches it only to `/api/proxy/agent/*` requests that carry a valid session cookie.

Scope is explicit in the URL, never inferred from the request:

| Path | Auth carried by the browser | Header added server-side |
|---|---|---|
| `/api/proxy/<fn>/…` | `Authorization: Bearer <application token>` | none |
| `/api/proxy/agent/<fn>/…` | httpOnly `econtract_agent` cookie | `x-agent-token` |

`<fn>` is allowlisted to `applications`, `extract`, `otp`, `review`. Without that allowlist the
route would relay to anything else hosted under the Supabase functions origin.

## Environment

See `.env.example`. Nothing is `NEXT_PUBLIC_*`; no secret reaches the client bundle.

| Variable | Purpose |
|---|---|
| `SUPABASE_FUNCTIONS_URL` | Edge Functions base URL, no trailing slash |
| `PROTO_AGENT_TOKEN` | Same value as the Supabase secret; attached to agent-scoped calls |
| `AGENT_CONSOLE_PASSWORD` | Gate for `/agent` |
| `AGENT_SESSION_SECRET` | HMAC key for the session cookie — must be independent of the token above |

## Local development

```bash
npm install
cp .env.example .env.local   # fill in
npm run dev
```

## Known limits of this base

These are real and deliberate, not oversights to discover later:

- **Shared agent identity.** One password, one upstream token, no per-agent accounts. The proxy
  fixes *where the secret lives*, not *who used it* — `review` still records whatever `agent_id`
  the caller sends. Any claim that "an agent approved this document" remains self-asserted until
  the agent console gets real accounts and the Edge Functions stop trusting a client-supplied
  `agent_id`.
- **Types are hand-maintained.** `lib/types.ts` mirrors the Edge Function responses by hand,
  because `_shared/*.ts` are Deno modules with `.ts` import specifiers that a Node build cannot
  import. The fix is to extract `_shared` into a package both runtimes consume; until then, schema
  changes on the Supabase side will not break this build, they will break it at runtime.
- **Upload size.** `/api/proxy/extract` buffers the request body. Vercel's serverless request body
  limit (4.5 MB) applies to document scans routed through it.
- **Port is partial.** The full flow still lives in `supabase/functions/app/index.html`. This app
  covers application creation, the identity block, the state/blocks/events view and the agent
  queue — enough to prove the transport and to migrate the remaining blocks one at a time.
