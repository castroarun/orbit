-- Orbit · module 1 (review engine) schema
-- Run once in Supabase → SQL Editor (or `supabase db push`).
-- Everything lives in its own schema "orbit", so it can share a Supabase
-- project with another app without touching that app's tables.
-- Every table holding customer data carries business_id; row-level security
-- lets agency staff see everything and owners/staff only their own business.

create extension if not exists pgcrypto;

create schema if not exists orbit;

-- ───────────────────────── people ─────────────────────────

create table orbit.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  is_agency boolean not null default false,   -- us (AS Groups · Digital Marketing)
  created_at timestamptz not null default now()
);

-- No automatic profile on sign-up: the Supabase project may be shared with
-- another app, so only people we add to orbit.profiles can use Orbit.
-- Add someone:  insert into orbit.profiles (id, full_name, is_agency)
--               select id, email, true from auth.users where email = '...';

-- ───────────────────────── businesses ─────────────────────────

create table orbit.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_first_name text,
  google_place_id text,
  google_review_url text,
  wa_display_number text,
  waba_id text,
  wa_phone_number_id text unique,
  messaging_mode text not null default 'wame' check (messaging_mode in ('wame', 'meta', 'provider')),
  languages text[] not null default '{ta,en}',
  quiet_start time not null default '20:00',
  quiet_end time not null default '09:00',
  timezone text not null default 'Asia/Kolkata',
  plan text,
  status text not null default 'pilot' check (status in ('pilot', 'active', 'paused', 'ended')),
  is_sandbox boolean not null default false,   -- our own Meta test number
  created_at timestamptz not null default now()
);

-- API tokens: no policies, so only the server (secret key) can read them.
create table orbit.business_secrets (
  business_id uuid primary key references orbit.businesses on delete cascade,
  meta_access_token text,
  updated_at timestamptz not null default now()
);

create table orbit.memberships (
  user_id uuid references orbit.profiles on delete cascade,
  business_id uuid references orbit.businesses on delete cascade,
  role text not null check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  primary key (user_id, business_id)
);

-- ───────────────────────── access helpers ─────────────────────────

create function orbit.is_agency() returns boolean
language sql stable security definer set search_path = orbit as $$
  select coalesce((select is_agency from orbit.profiles where id = auth.uid()), false)
$$;

create function orbit.can_access(bid uuid) returns boolean
language sql stable security definer set search_path = orbit as $$
  select orbit.is_agency()
      or exists (select 1 from orbit.memberships m where m.user_id = auth.uid() and m.business_id = bid)
$$;

-- ───────────────────────── customers & visits ─────────────────────────

create table orbit.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references orbit.businesses on delete cascade,
  name text,
  phone text not null,                 -- digits only, e.g. 919840012345
  language text default 'ta',
  consent_at timestamptz,
  consent_source text,                 -- counter_qr | billing | import | staff | whatsapp
  opted_out_at timestamptz,            -- STOP / வேண்டாம்
  last_review_ask_at timestamptz,
  created_at timestamptz not null default now(),
  unique (business_id, phone)
);

create table orbit.visits (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references orbit.businesses on delete cascade,
  customer_id uuid not null references orbit.customers on delete cascade,
  visited_at timestamptz not null default now(),
  source text not null default 'staff' check (source in ('staff', 'import', 'billing', 'manual')),
  created_by uuid references orbit.profiles,
  created_at timestamptz not null default now()
);

-- ───────────────────────── review engine ─────────────────────────

create table orbit.review_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references orbit.businesses on delete cascade,
  visit_id uuid unique references orbit.visits on delete cascade,
  customer_id uuid not null references orbit.customers on delete cascade,
  stage text not null default 'scheduled' check (stage in (
    'scheduled', 'checkin_sent', 'replied', 'no_reply', 'link_sent',
    'reminder_sent', 'tapped', 'thanked', 'stopped', 'expired')),
  started_at timestamptz not null default now(),
  link_tapped_at timestamptz,
  completed_at timestamptz,
  stop_reason text
);

create table orbit.messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references orbit.businesses on delete cascade,
  customer_id uuid references orbit.customers on delete set null,
  review_request_id uuid references orbit.review_requests on delete set null,
  direction text not null check (direction in ('in', 'out')),
  kind text not null default 'text',   -- template | text | button | interactive | image …
  template_name text,
  phone text not null,                 -- the customer's number
  body text,
  mode text,                           -- wame | meta | provider (outgoing only)
  wa_message_id text unique,
  status text not null default 'queued' check (status in (
    'queued', 'link', 'sent', 'delivered', 'read', 'failed', 'received')),
  price_category text,                 -- utility | marketing | service (from Meta)
  error text,
  sent_by uuid references orbit.profiles,
  created_at timestamptz not null default now(),
  status_at timestamptz
);
create index messages_business_created on orbit.messages (business_id, created_at desc);

create table orbit.short_links (
  code text primary key,               -- r.<domain>/k7f2
  business_id uuid not null references orbit.businesses on delete cascade,
  review_request_id uuid references orbit.review_requests on delete cascade,
  target_url text not null,
  created_at timestamptz not null default now()
);

create table orbit.link_taps (
  id bigint generated always as identity primary key,
  code text not null references orbit.short_links on delete cascade,
  tapped_at timestamptz not null default now(),
  user_agent text
);

create table orbit.cases (               -- complaints
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references orbit.businesses on delete cascade,
  customer_id uuid not null references orbit.customers on delete cascade,
  trigger_message_id uuid references orbit.messages on delete set null,
  status text not null default 'open' check (status in (
    'open', 'owner_done', 'checked_back', 'resolved', 'unresolved', 'closed')),
  owner_alerted_at timestamptz,
  owner_done_at timestamptz,
  checkback_sent_at timestamptz,
  outcome text,
  created_at timestamptz not null default now()
);

create table orbit.templates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references orbit.businesses on delete cascade,
  name text not null,
  language text not null,
  category text not null check (category in ('UTILITY', 'MARKETING')),
  body text not null,
  meta_template_id text,
  status text not null default 'draft',   -- draft | PENDING | APPROVED | REJECTED | PAUSED …
  rejection_reason text,
  updated_at timestamptz not null default now(),
  unique (business_id, name, language)
);

create table orbit.review_snapshots (
  business_id uuid not null references orbit.businesses on delete cascade,
  snapshot_date date not null,
  rating numeric(2, 1),
  review_count integer,
  primary key (business_id, snapshot_date)
);

create table orbit.google_reviews (      -- stage 4, after Google API approval
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references orbit.businesses on delete cascade,
  google_review_id text unique,
  author_name text,
  stars smallint check (stars between 1 and 5),
  text text,
  review_time timestamptz,
  matched_customer_id uuid references orbit.customers on delete set null,  -- "possible match"
  draft_reply text,
  approved_by uuid references orbit.profiles,
  approved_at timestamptz,
  posted_at timestamptz
);

-- ───────────────────────── scheduler & audit ─────────────────────────

create table orbit.jobs (
  id bigint generated always as identity primary key,
  business_id uuid references orbit.businesses on delete cascade,
  run_at timestamptz not null,
  type text not null,                  -- send_checkin | send_review_link | send_reminder | owner_reminder …
  payload jsonb not null default '{}',
  state text not null default 'queued' check (state in ('queued', 'running', 'done', 'failed', 'cancelled')),
  attempts smallint not null default 0,
  last_error text,
  created_at timestamptz not null default now()
);
create index jobs_due on orbit.jobs (state, run_at);

create table orbit.audit_log (
  id bigint generated always as identity primary key,
  business_id uuid references orbit.businesses on delete set null,
  actor uuid references orbit.profiles,
  action text not null,                -- consent_given | opted_out | customer_deleted | reply_approved …
  details jsonb not null default '{}',
  at timestamptz not null default now()
);

-- ───────────────────────── row-level security ─────────────────────────

alter table orbit.profiles enable row level security;
alter table orbit.businesses enable row level security;
alter table orbit.business_secrets enable row level security;   -- no policies = server only
alter table orbit.memberships enable row level security;
alter table orbit.customers enable row level security;
alter table orbit.visits enable row level security;
alter table orbit.review_requests enable row level security;
alter table orbit.messages enable row level security;
alter table orbit.short_links enable row level security;
alter table orbit.link_taps enable row level security;
alter table orbit.cases enable row level security;
alter table orbit.templates enable row level security;
alter table orbit.review_snapshots enable row level security;
alter table orbit.google_reviews enable row level security;
alter table orbit.jobs enable row level security;
alter table orbit.audit_log enable row level security;

create policy "own profile or agency" on orbit.profiles
  for select using (id = auth.uid() or orbit.is_agency());

create policy "see own businesses" on orbit.businesses
  for select using (orbit.can_access(id));
create policy "agency manages businesses" on orbit.businesses
  for all using (orbit.is_agency()) with check (orbit.is_agency());

create policy "see own memberships" on orbit.memberships
  for select using (user_id = auth.uid() or orbit.is_agency());
create policy "agency manages memberships" on orbit.memberships
  for all using (orbit.is_agency()) with check (orbit.is_agency());

-- business-scoped tables: same rule for read and write
do $$
declare t text;
begin
  foreach t in array array['customers', 'visits', 'review_requests', 'messages', 'short_links',
                           'cases', 'templates', 'review_snapshots', 'google_reviews']
  loop
    execute format(
      'create policy "business access" on orbit.%I for all using (orbit.can_access(business_id)) with check (orbit.can_access(business_id))',
      t);
  end loop;
end $$;

create policy "taps via link" on orbit.link_taps
  for select using (exists (select 1 from orbit.short_links s where s.code = link_taps.code and orbit.can_access(s.business_id)));

create policy "agency sees jobs" on orbit.jobs
  for select using (orbit.is_agency());

create policy "see audit for own businesses" on orbit.audit_log
  for select using (orbit.is_agency() or (business_id is not null and orbit.can_access(business_id)));

-- ───────────────────────── API access to the orbit schema ─────────────────────────
-- Also add "orbit" under Project Settings → Data API → Exposed schemas.

grant usage on schema orbit to anon, authenticated, service_role;
grant all on all tables in schema orbit to authenticated, service_role;
grant all on all sequences in schema orbit to authenticated, service_role;
grant execute on all functions in schema orbit to authenticated, service_role;
alter default privileges in schema orbit grant all on tables to authenticated, service_role;
alter default privileges in schema orbit grant all on sequences to authenticated, service_role;
