// Deterministic reconciliation. This layer, not the model, decides.
export type Check = { key: string; ok: boolean | null; expected?: string | null; found?: string | null; note?: string };
export type Fields = Record<string, { value: string | null; confidence: number }>;

export const AUTO_APPROVE = 0.90;   // min confidence on every checked field AND all checks ok
export const AUTO_RETURN  = 0.40;   // any checked field below this -> return to customer
export const MAX_BILL_AGE_DAYS = 90;

const GREEK_MAP: Record<string, string> = {
  α:"a",ά:"a",β:"v",γ:"g",δ:"d",ε:"e",έ:"e",ζ:"z",η:"i",ή:"i",θ:"th",ι:"i",ί:"i",ϊ:"i",ΐ:"i",κ:"k",λ:"l",μ:"m",ν:"n",ξ:"x",ο:"o",ό:"o",π:"p",ρ:"r",σ:"s",ς:"s",τ:"t",υ:"y",ύ:"y",ϋ:"y",ΰ:"y",φ:"f",χ:"ch",ψ:"ps",ω:"o",ώ:"o",
};
export function normName(s: string | null | undefined): string {
  if (!s) return "";
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/ου/g, "ou").replace(/μπ/g, "b").replace(/ντ/g, "d").replace(/γκ/g, "gk").replace(/γγ/g, "ng")   // ELOT 743 digraphs
    .split("").map((c) => GREEK_MAP[c] ?? c).join("")
    .replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
}
// Token-set match: handles surname/first-name order and middle names. Greek "ου" endings for feminine surnames are not handled here — add rules from real data.
function lev(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
  return d[a.length][b.length];
}
// Tokens match exactly, or within edit distance 1 for tokens of 5+ chars (transliteration variance: -is/-es, y/i).
function tokEq(x: string, y: string) { return x === y || (x.length >= 5 && y.length >= 5 && lev(x, y) <= 1); }
export function nameMatch(a: string | null | undefined, b: string | null | undefined): { ok: boolean; score: number } {
  const A = new Set(normName(a).split(" ").filter(Boolean)), B = new Set(normName(b).split(" ").filter(Boolean));
  if (!A.size || !B.size) return { ok: false, score: 0 };
  let hit = 0; for (const t of A) if ([...B].some((u) => tokEq(t, u))) hit++;
  const score = hit / Math.max(A.size, B.size);
  return { ok: score >= 0.5 && hit >= 2 || (A.size === 1 && score === 1), score };
}
export function normDigits(s: string | null | undefined) { return (s ?? "").replace(/\D/g, ""); }
export function normAddr(s: string | null | undefined) {
  if (!s) return "";
  const x = s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/ου/g, "ou").split("").map((c) => GREEK_MAP[c] ?? c).join("")
    .replace(/[^a-z0-9\s]/g, " ").replace(/\b(odos|leof|leoforos|od|plateia|pl|tk)\b/g, "").replace(/\s+/g, " ").trim();
  return x;
}
export function addrMatch(a: string | null | undefined, b: string | null | undefined) {
  const A = normAddr(a), B = normAddr(b); if (!A || !B) return null;
  const numA = A.match(/\d+/)?.[0], numB = B.match(/\d+/)?.[0];
  const ta = new Set(A.split(" ")), tb = new Set(B.split(" ")); let hit = 0; for (const t of ta) if (tb.has(t)) hit++;
  return hit / Math.max(ta.size, tb.size) >= 0.5 && (!numA || !numB || numA === numB);
}
export function daysSince(iso: string | null | undefined) {
  if (!iso) return null; const d = Date.parse(iso); if (isNaN(d)) return null; return Math.floor((Date.now() - d) / 864e5);
}

export type AppCtx = { kyc_name?: string | null; kyc_id_no?: string | null; supply_point?: string | null; address?: string | null };

export function runChecks(doc: "ID" | "SUPPLY" | "OWNERSHIP", f: Fields, ctx: AppCtx): Check[] {
  const v = (k: string) => f[k]?.value ?? null;
  const out: Check[] = [];
  if (doc === "SUPPLY") {
    const nm = nameMatch(v("customer_name"), ctx.kyc_name);
    out.push({ key: "name_matches_kyc", ok: nm.ok, expected: ctx.kyc_name, found: v("customer_name"), note: `token score ${nm.score.toFixed(2)}` });
    out.push({ key: "supply_point_matches_entry", ok: !!ctx.supply_point && normDigits(v("supply_point")) === normDigits(ctx.supply_point), expected: ctx.supply_point, found: v("supply_point") });
    const age = daysSince(v("issue_date"));
    out.push({ key: "bill_recent", ok: age === null ? null : age <= MAX_BILL_AGE_DAYS, found: v("issue_date"), note: age === null ? "date unreadable" : `${age} days old` });
  }
  if (doc === "OWNERSHIP") {
    const kind = v("doc_kind"); const who = kind === "title" ? v("owner_name") : v("lessee_name");
    const nm = nameMatch(who, ctx.kyc_name);
    out.push({ key: "occupant_matches_kyc", ok: nm.ok, expected: ctx.kyc_name, found: who, note: `kind=${kind}` });
    const am = addrMatch(v("address"), ctx.address);
    out.push({ key: "address_matches_entry", ok: am, expected: ctx.address, found: v("address"), note: am === null ? "no address on application" : undefined });
    const end = v("end_date"); const ended = end ? daysSince(end) : null;
    out.push({ key: "lease_not_ended", ok: ended === null ? null : ended <= 0, found: end });
  }
  if (doc === "ID") {
    const nm = nameMatch(v("full_name"), ctx.kyc_name);
    out.push({ key: "name_matches_kyc", ok: nm.ok, expected: ctx.kyc_name, found: v("full_name") });
    out.push({ key: "id_number_matches_kyc", ok: ctx.kyc_id_no ? normDigits(v("id_number")) === normDigits(ctx.kyc_id_no) : null, expected: ctx.kyc_id_no, found: v("id_number"), note: ctx.kyc_id_no ? undefined : "no e-ID reference: manual route, agent compares against the scan" });
    const exp = v("expiry_date"); const d = exp ? daysSince(exp) : null;
    out.push({ key: "not_expired", ok: d === null ? null : d <= 0, found: exp });
  }
  return out;
}

import { REQUIRED_FIELDS } from "./schemas.ts";
export function recommend(doc: "ID" | "SUPPLY" | "OWNERSHIP", f: Fields, checks: Check[]): { recommendation: "auto_approve" | "human" | "auto_return"; confidence: number } {
  const confs = REQUIRED_FIELDS[doc].map((k) => f[k]?.confidence ?? 0);
  const minConf = confs.length ? Math.min(...confs) : 0;
  const meanConf = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : 0;
  const anyFail = checks.some((c) => c.ok === false);
  const anyUnknown = checks.some((c) => c.ok === null);
  if (minConf < AUTO_RETURN) return { recommendation: "auto_return", confidence: meanConf };
  if (!anyFail && !anyUnknown && minConf >= AUTO_APPROVE) return { recommendation: "auto_approve", confidence: meanConf };
  return { recommendation: "human", confidence: meanConf };
}
