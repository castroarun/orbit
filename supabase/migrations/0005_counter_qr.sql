-- Counter QR: each business gets a short public code for its QR card, and a
-- switch for starting review requests automatically (QR scans, daily lists).
-- Safe to run more than once.

alter table orbit.businesses
  add column if not exists qr_code text unique,
  add column if not exists auto_requests boolean not null default true;

-- Visits can now come from the counter QR.
alter table orbit.visits drop constraint if exists visits_source_check;
alter table orbit.visits add constraint visits_source_check
  check (source in ('staff', 'import', 'billing', 'manual', 'qr'));
