-- Automatic visits: billing software and our client websites send each
-- order/visit to Orbit, and daily lists can start review requests.
-- Safe to run more than once.

-- Start review requests automatically for new visits (link, daily list).
alter table orbit.businesses
  add column if not exists auto_requests boolean not null default true;

-- Each business's private key for sending visits to Orbit (server-only table).
alter table orbit.business_secrets
  add column if not exists ingest_key text unique;

-- The order or bill number from the sending system, so the same order is never counted twice.
alter table orbit.visits
  add column if not exists external_ref text;
create unique index if not exists visits_external_ref on orbit.visits (business_id, external_ref) where external_ref is not null;

alter table orbit.visits drop constraint if exists visits_source_check;
alter table orbit.visits add constraint visits_source_check
  check (source in ('staff', 'import', 'billing', 'manual', 'website', 'qr'));
