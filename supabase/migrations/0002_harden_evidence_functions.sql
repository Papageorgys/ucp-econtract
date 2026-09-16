-- Pin the search_path of the two evidence-integrity functions.
--
-- evidence_chain() computes the hash that makes evidence_records tamper-evident, and it called
-- digest() unqualified. With a role-mutable search_path, whoever controls the caller's search_path
-- controls which digest() runs — and therefore what the chain hashes to. block_mutation() is the
-- append-only guard and gets the same treatment. Both are now schema-qualified and pinned.

create or replace function evidence_chain() returns trigger
language plpgsql
set search_path = public, extensions
as $$
declare last text;
begin
  select row_hash into last from evidence_records order by seq desc limit 1;
  new.prev_hash := last;
  new.row_hash := encode(
    extensions.digest(
      coalesce(last, '') || new.id || new.canonical_hash || new.signatory::text || new.otp::text || new.created_at::text,
      'sha256'
    ),
    'hex'
  );
  return new;
end $$;

create or replace function block_mutation() returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin raise exception 'evidence_records is append-only'; end $$;
