// Fixed field schemas per document type. The model fills these; it never decides what to look for.
export type DocType = "ID" | "SUPPLY" | "OWNERSHIP";

export const FIELD_SCHEMAS: Record<DocType, Record<string, string>> = {
  SUPPLY: {
    issuer: "Name of the electricity supplier that issued the bill",
    customer_name: "Full name of the account holder exactly as printed",
    supply_point: "Supply point number (Αριθμός Παροχής), digits only, spaces removed",
    address: "Supply address as printed, single line",
    issue_date: "Bill issue date, ISO 8601 YYYY-MM-DD",
    period_end: "End of billing period, ISO 8601 YYYY-MM-DD, or null",
  },
  OWNERSHIP: {
    doc_kind: "One of: lease | title | other",
    lessee_name: "Full name of the lessee / occupant, or null for a title deed",
    owner_name: "Full name of the owner / lessor",
    address: "Property address, single line",
    start_date: "Lease start date ISO 8601, or null",
    end_date: "Lease end date ISO 8601, or null",
    aade_number: "ΑΑΔΕ lease registration number if present, else null",
  },
  ID: {
    doc_kind: "One of: id_card | passport | other",
    full_name: "Full name (Greek and/or Latin as printed)",
    id_number: "Document number exactly as printed",
    issue_date: "Issue date ISO 8601 or null",
    expiry_date: "Expiry date ISO 8601 or null",
  },
};

// Fields that must be present and confident for auto-approval. Others are optional (null allowed).
export const REQUIRED_FIELDS: Record<DocType, string[]> = {
  SUPPLY: ["customer_name", "supply_point", "issue_date"],
  OWNERSHIP: ["doc_kind", "address"],
  ID: ["full_name", "id_number"],
};

export function jsonSchemaFor(doc: DocType) {
  const props: Record<string, unknown> = {};
  for (const [k, desc] of Object.entries(FIELD_SCHEMAS[doc])) {
    props[k] = {
      type: "object",
      description: desc,
      properties: {
        value: { type: ["string", "null"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["value", "confidence"],
      additionalProperties: false,
    };
  }
  return { type: "object", properties: props, required: Object.keys(props), additionalProperties: false };
}

export function extractionPrompt(doc: DocType) {
  return `You are extracting fields from a scanned Greek ${doc === "SUPPLY" ? "electricity bill" : doc === "OWNERSHIP" ? "lease agreement or title deed" : "identity document"}.
Return ONLY a JSON object matching the schema. For each field give the value exactly as printed (no normalisation, no guessing) and a confidence 0-1.
If a field is not present or not legible, value = null and confidence = 0. Dates must be ISO 8601. Do not infer a value from another field.`;
}
