// deno run -A eval/score.ts --dir eval/samples
import { extractFields } from "../supabase/functions/_shared/llm.ts";
import { recommend } from "../supabase/functions/_shared/rules.ts";
import type { DocType } from "../supabase/functions/_shared/schemas.ts";
const dir = Deno.args[Deno.args.indexOf("--dir") + 1] || "eval/samples";
const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const perField: Record<string, { n: number; ok: number; confOk: number[]; confBad: number[] }> = {};
const rec = { auto_approve: 0, human: 0, auto_return: 0 }; let n = 0;
for await (const e of Deno.readDir(dir)) {
  if (!e.name.endsWith(".json")) continue;
  const label = JSON.parse(await Deno.readTextFile(`${dir}/${e.name}`)); const stem = e.name.replace(/\.json$/, "");
  const img = ["jpg", "jpeg", "png", "webp", "pdf"].map((x) => `${dir}/${stem}.${x}`).find((p) => { try { Deno.statSync(p); return true; } catch { return false; } });
  if (!img) continue;
  const bytes = await Deno.readFile(img); const mime = img.endsWith(".pdf") ? "application/pdf" : img.endsWith(".png") ? "image/png" : "image/jpeg";
  const { fields } = await extractFields(label.doc_type as DocType, bytes, mime); n++;
  for (const [k, want] of Object.entries(label.fields)) {
    const got = fields[k]; const ok = norm(got?.value) === norm(want);
    const s = perField[k] ??= { n: 0, ok: 0, confOk: [], confBad: [] }; s.n++; if (ok) { s.ok++; s.confOk.push(got?.confidence ?? 0); } else s.confBad.push(got?.confidence ?? 0);
  }
  rec[recommend(label.doc_type as DocType, fields, []).recommendation]++;
}
const mean = (a: number[]) => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : "-";
console.log(`samples: ${n}`);
for (const [k, s] of Object.entries(perField)) console.log(`${k.padEnd(16)} acc ${(s.ok / s.n).toFixed(3)}  conf(correct) ${mean(s.confOk)}  conf(wrong) ${mean(s.confBad)}`);
console.log("recommendation split (checks excluded):", rec);
