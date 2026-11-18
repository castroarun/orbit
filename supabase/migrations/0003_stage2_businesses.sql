-- Stage 2 (review engine pilot): extra business details, and letting signed-in
-- staff write their own audit entries (imports, consent changes).
-- Safe to run more than once.

alter table orbit.businesses
  add column if not exists area text,          -- "Velachery"
  add column if not exists kind text,          -- "dental clinic", "salon"
  add column if not exists owner_phone text,   -- digits, e.g. 919840012345: complaint alerts go here
  add column if not exists notes text;

drop policy if exists "write audit for own businesses" on orbit.audit_log;
create policy "write audit for own businesses" on orbit.audit_log
  for insert with check (actor = auth.uid() and business_id is not null and orbit.can_access(business_id));
