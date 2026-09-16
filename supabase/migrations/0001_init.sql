-- ucp-econtract initial schema
create extension if not exists pgcrypto;

create type journey_t    as enum ('electricity','fiber','bundle');
create type doc_type_t   as enum ('ID','SUPPLY','OWNERSHIP');
create type doc_status_t as enum ('pending','approved','rejected');
create type app_state_t  as enum ('DRAFT','IDENTIFIED','ELIGIBLE','CONFIGURED','DATA_COMPLETE','DOCS_PENDING','DOCS_VERIFIED','PAYMENT_SET','CONTRACT_PRESENTED','SIGNED','SUBMITTED','ACTIVATED','RETURNED');

create table applications (
  id             text primary key,                 -- MYD-XXXXXX
  token          text not null,                    -- per-application bearer for the customer session
  created_at     timestamptz not null default now(),
  journey        journey_t not null,
  state          app_state_t not null default 'DRAFT',
  kyc            jsonb,                            -- {name, afm, id_no, method, assurance, retrieved_at}
  supply_point   text,
  address        text,
  products       text[] not null default '{}',
  email          text,
  phone          text,
  payment        text,
  signed_at      timestamptz,
  activated_at   timestamptz,
  fiber_serviceable boolean,                       -- result of the coverage check, drives cross-sell
  offers         jsonb not null default '[]',      -- [{offer_id, shown, decision, at}]
  parent_id      text references applications(id)  -- set on post-signature add-on applications that reuse identity
);

create table documents (
  id             uuid primary key default gen_random_uuid(),
  application_id text not null references applications(id) on delete cascade,
  doc_type       doc_type_t not null,
  storage_path   text not null,
  file_name      text not null,
  mime           text not null,
  bytes          int  not null,
  sha256         text not null,
  status         doc_status_t not null default 'pending',
  reject_reason  text,
  reject_note    text,
  uploaded_at    timestamptz not null default now(),
  reviewed_at    timestamptz,
  reviewed_by    text
);
create index on documents(application_id);

create table extractions (
  id             uuid primary key default gen_random_uuid(),
  document_id    uuid not null references documents(id) on delete cascade,
  model          text not null,                    -- claude-sonnet-4-6 | gemini-2.5-pro | stub
  fields         jsonb not null,                   -- {field:{value,confidence}}
  checks         jsonb not null,                   -- [{key,ok,expected,found,note}]
  confidence     numeric(4,3) not null,
  recommendation text not null,                    -- auto_approve | human | auto_return
  latency_ms     int,
  created_at     timestamptz not null default now()
);
create index on extractions(document_id);

create table otp_challenges (
  id             uuid primary key default gen_random_uuid(),
  application_id text not null references applications(id) on delete cascade,
  phone          text not null,
  purpose        text not null default 'signature',   -- signature | identity
  code_hash      text not null,
  attempts       int not null default 0,
  expires_at     timestamptz not null,
  consumed_at    timestamptz,
  created_at     timestamptz not null default now()
);

-- Append-only, hash-chained evidence. One row per legal contract in the signed set.
create table evidence_records (
  seq            bigserial primary key,
  id             text not null unique,             -- EVD-...
  application_id text not null references applications(id),
  contract_id    text not null,                    -- catalogue SKU
  document_set   text[] not null,
  canonical_hash text not null,                    -- sha256 of canonical contract text
  signatory      jsonb not null,
  otp            jsonb not null,
  consents       text[] not null,
  withdrawal     jsonb not null,
  client         jsonb not null,
  catalogue_version text not null,
  prev_hash      text,
  row_hash       text not null,
  created_at     timestamptz not null default now()
);
create or replace function evidence_chain() returns trigger language plpgsql as $$
declare last text;
begin
  select row_hash into last from evidence_records order by seq desc limit 1;
  new.prev_hash := last;
  new.row_hash := encode(digest(coalesce(last,'') || new.id || new.canonical_hash || new.signatory::text || new.otp::text || new.created_at::text, 'sha256'),'hex');
  return new;
end $$;
create trigger evidence_chain_trg before insert on evidence_records for each row execute function evidence_chain();
create or replace function block_mutation() returns trigger language plpgsql as $$
begin raise exception 'evidence_records is append-only'; end $$;
create trigger evidence_no_update before update or delete on evidence_records for each row execute function block_mutation();

create table events (
  id             bigserial primary key,
  application_id text references applications(id) on delete cascade,
  at             timestamptz not null default now(),
  actor          text not null,                    -- customer | agent | system
  system         text not null,                    -- gov-kyc | ddhe | catalogue | ocr | otp | signature | review | orchestration
  event          text not null,
  detail         jsonb
);
create index on events(application_id, at desc);

-- All access goes through edge functions with the service role. Lock tables to everyone else.
alter table applications     enable row level security;
alter table documents        enable row level security;
alter table extractions      enable row level security;
alter table otp_challenges   enable row level security;
alter table evidence_records enable row level security;
alter table events           enable row level security;

insert into storage.buckets (id, name, public) values ('scans','scans',false) on conflict do nothing;
