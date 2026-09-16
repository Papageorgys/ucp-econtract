# ucp-econtract

White-label e-contract prototype for a utility / telecom onboarding checkout, built as activatable blocks
(identity, eligibility, product, customer data, documents, payment, contract, activation):
document extraction (vision LLM + deterministic rules), OTP signature with a hash-chained evidence
record, agent review, and a customer/agent UI. Runs entirely on Supabase (Postgres, Storage, Edge Functions).

**This is a prototype.** It is not an eIDAS advanced electronic signature. It is OTP consent +
document hash + append-only evidence. Swap `seal()` in `otp/index.ts` for a qualified provider
(PAdES via Adacom / Evrotrust / DocuSign eIDAS) before any production claim.

## Layout

```
supabase/migrations/0001_init.sql        schema, RLS, hash-chain trigger
supabase/functions/_shared/              rules layer, schemas, LLM adapter, crypto, db helper
supabase/functions/applications/         create / read / list applications (customer + agent)
supabase/functions/extract/              upload scan -> Storage -> vision extraction -> rules -> extraction row
supabase/functions/otp/                  send / verify OTP; verify seals the contract set and writes evidence
supabase/functions/review/               agent approve / reject / activate
supabase/functions/app/                  serves web/index.html from the same origin
supabase/functions/app/index.html       single-page UI (customer + agent), served by the app function
eval/                                    labelled sample format + scoring script for the extractor
```

## Branding

All names come from function secrets; nothing in the code names a supplier:

```bash
supabase secrets set BRAND_NAME="myUtility" SUPPLIER_LEGAL="Utility S.A." SUPPORT_PHONE="" \
  EID_NAME="e-ID Wallet" GRID_OPERATOR="the grid operator" TAX_ID_LABEL="Tax ID" DEFAULT_LOCALE=el
```

## Deploy

```bash
supabase link --project-ref <ref>
supabase db push
supabase secrets set PROTO_AGENT_TOKEN=<random> \
  ANTHROPIC_API_KEY=<key>        # or GEMINI_API_KEY; with neither set, extraction runs in stub mode
deno task deploy      # = embed UI + type-check + supabase functions deploy … --no-verify-jwt
```
Open `https://<ref>.supabase.co/functions/v1/app`.

## What is deterministic and what is AI

| Step | Mechanism |
|---|---|
| Field extraction from scans | Vision LLM, forced JSON schema per document type (`_shared/schemas.ts`) |
| Name / supply point / address / date checks | Code (`_shared/rules.ts`). Never the model. |
| Auto-approve / return / human queue | Thresholds in `rules.ts` (`AUTO_APPROVE`, `AUTO_RETURN`) |
| OTP | Server-side, 6 digits, 5-minute expiry, 3 attempts, hashed at rest |
| Sealing | Canonical contract text -> SHA-256 -> `evidence_records` (append-only, each row hashes the previous) |
| Identity | Two routes. **e-ID**: national wallet, simulated, assurance *substantial*. **Manual**: typed name + tax ID, phone verified by OTP, ID document mandatory, assurance *low*; the ID document can never be auto-approved and activation requires an agent approval on it. The route and assurance level are written into every evidence record. |

## Evaluation

`eval/` holds the labelled-sample format. You need ~200 real, anonymised documents per type before
the thresholds in `rules.ts` mean anything. `deno run -A eval/score.ts` compares extractor output
against labels and prints per-field accuracy and threshold hit rates.
