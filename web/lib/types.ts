// Mirrors the shapes returned by supabase/functions/*. Hand-maintained: the Edge Functions are
// Deno modules with .ts import specifiers and cannot be imported from a Node/Next build as-is.
// Drift here is a real risk — see web/README.md "Shared types" for the intended fix.

export type Journey = "electricity" | "fiber" | "bundle";

export type AppState =
  | "DRAFT" | "IDENTIFIED" | "ELIGIBLE" | "CONFIGURED" | "DATA_COMPLETE"
  | "DOCS_PENDING" | "DOCS_VERIFIED" | "PAYMENT_SET" | "CONTRACT_PRESENTED"
  | "SIGNED" | "SUBMITTED" | "ACTIVATED" | "RETURNED";

export type Kyc = {
  name?: string;
  afm?: string;
  id_no?: string | null;
  method?: "eid-kyc-simulated" | "manual";
  assurance?: "low" | "substantial" | "high";
  phone_verified?: boolean | null;
  retrieved_at?: string;
};

export type Application = {
  id: string;
  created_at: string;
  journey: Journey;
  state: AppState;
  kyc: Kyc | null;
  supply_point: string | null;
  address: string | null;
  products: string[];
  email: string | null;
  phone: string | null;
  payment: string | null;
  signed_at: string | null;
  activated_at: string | null;
  fiber_serviceable: boolean | null;
  offers: Array<{ offer_id: string; shown: number; decision: string | null; at?: string }>;
  parent_id: string | null;
};

export type DocStatus = "pending" | "approved" | "rejected";
export type DocType = "ID" | "SUPPLY" | "OWNERSHIP";

export type Extraction = {
  id: string;
  model: string;
  fields: Record<string, { value: string | null; confidence: number }>;
  checks: Array<{ key: string; ok: boolean; expected?: unknown; found?: unknown; note?: string }>;
  confidence: number;
  recommendation: "auto_approve" | "human" | "auto_return";
  latency_ms: number | null;
};

export type DocumentRow = {
  id: string;
  application_id: string;
  doc_type: DocType;
  file_name: string;
  mime: string;
  bytes: number;
  sha256: string;
  status: DocStatus;
  reject_reason: string | null;
  reject_note: string | null;
  uploaded_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  extraction: Extraction | null;
  preview: string | null;
};

export type EventRow = {
  at: string;
  actor: string;
  system: string;
  event: string;
  detail: unknown;
};

export type EvidenceRow = {
  id: string;
  contract_id: string;
  canonical_hash: string;
  row_hash: string;
  prev_hash: string | null;
  created_at: string;
  otp: Record<string, unknown>;
  consents: string[];
  signatory: Record<string, unknown>;
};

export type Offer = { id: string; kind: string; sku: string; title?: string; [k: string]: unknown };

/** GET /applications/:id */
export type ApplicationView = {
  application: Application;
  blocks: string[];
  offers: Record<string, Offer[]>;
  required_docs: DocType[];
  documents: DocumentRow[];
  evidence: EvidenceRow[];
  events: EventRow[];
  catalogue: { version: string; products: Record<string, unknown>; bundles: Record<string, unknown>; offer_rules: number };
};

/** GET /applications (agent queue) */
export type QueueRow = Pick<Application, "id" | "created_at" | "journey" | "state" | "products" | "signed_at" | "activated_at" | "parent_id"> & {
  kyc: Pick<Kyc, "name" | "afm" | "method"> | null;
  docs: Array<{ doc_type: DocType; status: DocStatus }>;
};

export type CreatedApplication = { id: string; token: string; journey: Journey };
