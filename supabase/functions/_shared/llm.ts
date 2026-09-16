// Vision extraction adapter. Anthropic if ANTHROPIC_API_KEY, else Gemini if GEMINI_API_KEY, else stub.
import { DocType, jsonSchemaFor, extractionPrompt, FIELD_SCHEMAS } from "./schemas.ts";
import type { Fields } from "./rules.ts";

export async function extractFields(doc: DocType, bytes: Uint8Array, mime: string): Promise<{ model: string; fields: Fields }> {
  const b64 = toB64(bytes);
  const anth = Deno.env.get("ANTHROPIC_API_KEY"), gem = Deno.env.get("GEMINI_API_KEY");
  const override = Deno.env.get("EXTRACT_MODEL");
  if (anth) return anthropic(doc, b64, mime, override || "claude-sonnet-4-6", anth);
  if (gem) return gemini(doc, b64, mime, override || "gemini-2.5-pro", gem);
  return stub(doc);
}

function toB64(bytes: Uint8Array) { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); }

async function anthropic(doc: DocType, b64: string, mime: string, model: string, key: string) {
  const isPdf = mime === "application/pdf";
  const content = [
    isPdf ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
          : { type: "image", source: { type: "base64", media_type: mime, data: b64 } },
    { type: "text", text: extractionPrompt(doc) },
  ];
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model, max_tokens: 1024, messages: [{ role: "user", content }],
      tools: [{ name: "record_fields", description: "Record extracted fields", input_schema: jsonSchemaFor(doc) }],
      tool_choice: { type: "tool", name: "record_fields" },
    }),
  });
  if (!r.ok) throw new Error(`anthropic ${r.status}: ${await r.text()}`);
  const j = await r.json();
  const tu = (j.content as Array<{ type: string; input?: unknown }>).find((c) => c.type === "tool_use");
  if (!tu) throw new Error("no tool_use in response");
  return { model, fields: coerce(doc, tu.input as Fields) };
}

async function gemini(doc: DocType, b64: string, mime: string, model: string, key: string) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ inline_data: { mime_type: mime, data: b64 } }, { text: extractionPrompt(doc) }] }],
      generationConfig: { response_mime_type: "application/json", response_schema: geminiSchema(doc) },
    }),
  });
  if (!r.ok) throw new Error(`gemini ${r.status}: ${await r.text()}`);
  const j = await r.json();
  const text = j.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  return { model, fields: coerce(doc, JSON.parse(text)) };
}
// Gemini's schema dialect: no union types, no additionalProperties.
function geminiSchema(doc: DocType) {
  const props: Record<string, unknown> = {};
  for (const k of Object.keys(FIELD_SCHEMAS[doc])) props[k] = { type: "OBJECT", properties: { value: { type: "STRING", nullable: true }, confidence: { type: "NUMBER" } }, required: ["value", "confidence"] };
  return { type: "OBJECT", properties: props, required: Object.keys(props) };
}

function coerce(doc: DocType, raw: Fields): Fields {
  const out: Fields = {};
  for (const k of Object.keys(FIELD_SCHEMAS[doc])) {
    const x = (raw as Record<string, { value?: unknown; confidence?: unknown }>)[k] ?? {};
    const v = x.value == null || x.value === "" ? null : String(x.value);
    const c = typeof x.confidence === "number" ? Math.max(0, Math.min(1, x.confidence)) : 0;
    out[k] = { value: v, confidence: v === null ? 0 : c };
  }
  return out;
}

// No key: returns empty low-confidence fields so the flow still runs and the UI says "stub".
export function stub(doc: DocType): { model: string; fields: Fields } {
  const f: Fields = {}; for (const k of Object.keys(FIELD_SCHEMAS[doc])) f[k] = { value: null, confidence: 0 };
  return { model: "stub", fields: f };
}
