-- Orbit · module 1 (review engine) schema
-- Run once in Supabase → SQL Editor (or `supabase db push`).
-- Every table holding customer data carries business_id; row-level security
-- lets agency staff see everything and owners/staff only their own business.

create extension if not exists pgcrypto;

-- ───────────────────────── people ─────────────────────────

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  is_agency boolean not null default false,   -- us (AS Groups · Digital Marketing)
  created_at timestamptz not null default now()
);

-- every new login gets a profile row
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── businesses ─────────────────────────

create table public.businesses (
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
create table public.business_secrets (
  business_id uuid primary key references public.businesses on delete cascade,
  meta_access_token text,
  updated_at timestamptz not null default now()
);

create table public.memberships (
  user_id uuid references public.profiles on delete cascade,
  business_id uuid references public.businesses on delete cascade,
  role text not null check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  primary key (user_id, business_id)
);

-- ───────────────────────── access helpers ─────────────────────────

create function public.is_agency() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_agency from public.profiles where id = auth.uid()), false)
$$;

create function public.can_access(bid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_agency()
      or exists (select 1 from public.memberships m where m.user_id = auth.uid() and m.business_id = bid)
$$;

-- ───────────────────────── customers & visits ─────────────────────────

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
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

create table public.visits (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  customer_id uuid not null references public.customers on delete cascade,
  visited_at timestamptz not null default now(),
  source text not null default 'staff' check (source in ('staff', 'import', 'billing', 'manual')),
  created_by uuid references public.profiles,
  created_at timestamptz not null default now()
);

-- ───────────────────────── review engine ─────────────────────────

create table public.review_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  visit_id uuid unique references public.visits on delete cascade,
  customer_id uuid not null references public.customers on delete cascade,
  stage text not null default 'scheduled' check (stage in (
    'scheduled', 'checkin_sent', 'replied', 'no_reply', 'link_sent',
    'reminder_sent', 'tapped', 'thanked', 'stopped', 'expired')),
  started_at timestamptz not null default now(),
  link_tapped_at timestamptz,
  completed_at timestamptz,
  stop_reason text
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  customer_id uuid references public.customers on delete set null,
  review_request_id uuid references public.review_requests on delete set null,
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
  sent_by uuid references public.profiles,
  created_at timestamptz not null default now(),
  status_at timestamptz
);
create index messages_business_created on public.messages (business_id, created_at desc);

create table public.short_links (
  code text primary key,               -- r.<domain>/k7f2
  business_id uuid not null references public.businesses on delete cascade,
  review_request_id uuid references public.review_requests on delete cascade,
  target_url text not null,
  created_at timestamptz not null default now()
);

create table public.link_taps (
  id bigint generated always as identity primary key,
  code text not null references public.short_links on delete cascade,
  tapped_at timestamptz not null default now(),
  user_agent text
);

create table public.cases (               -- complaints
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  customer_id uuid not null references public.customers on delete cascade,
  trigger_message_id uuid references public.messages on delete set null,
  status text not null default 'open' check (status in (
    'open', 'owner_done', 'checked_back', 'resolved', 'unresolved', 'closed')),
  owner_alerted_at timestamptz,
  owner_done_at timestamptz,
  checkback_sent_at timestamptz,
  outcome text,
  created_at timestamptz not null default now()
);

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
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

create table public.review_snapshots (
  business_id uuid not null references public.businesses on delete cascade,
  snapshot_date date not null,
  rating numeric(2, 1),
  review_count integer,
  primary key (business_id, snapshot_date)
);

create table public.google_reviews (      -- stage 4, after Google API approval
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  google_review_id text unique,
  author_name text,
  stars smallint check (stars between 1 and 5),
  text text,
  review_time timestamptz,
  matched_customer_id uuid references public.customers on delete set null,  -- "possible match"
  draft_reply text,
  approved_by uuid references public.profiles,
  approved_at timestamptz,
  posted_at timestamptz
);

-- ───────────────────────── scheduler & audit ─────────────────────────

create table public.jobs (
  id bigint generated always as identity primary key,
  business_id uuid references public.businesses on delete cascade,
  run_at timestamptz not null,
  type text not null,                  -- send_checkin | send_review_link | send_reminder | owner_reminder …
  payload jsonb not null default '{}',
  state text not null default 'queued' check (state in ('queued', 'running', 'done', 'failed', 'cancelled')),
  attempts smallint not null default 0,
  last_error text,
  created_at timestamptz not null default now()
);
create index jobs_due on public.jobs (state, run_at);

create table public.audit_log (
  id bigint generated always as identity primary key,
  business_id uuid references public.businesses on delete set null,
  actor uuid references public.profiles,
  action text not null,                -- consent_given | opted_out | customer_deleted | reply_approved …
  details jsonb not null default '{}',
  at timestamptz not null default now()
);

-- ───────────────────────── row-level security ─────────────────────────

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.business_secrets enable row level security;   -- no policies = server only
alter table public.memberships enable row level security;
alter table public.customers enable row level security;
alter table public.visits enable row level security;
alter table public.review_requests enable row level security;
alter table public.messages enable row level security;
alter table public.short_links enable row level security;
alter table public.link_taps enable row level security;
alter table public.cases enable row level security;
alter table public.templates enable row level security;
alter table public.review_snapshots enable row level security;
alter table public.google_reviews enable row level security;
alter table public.jobs enable row level security;
alter table public.audit_log enable row level security;

create policy "own profile or agency" on public.profiles
  for select using (id = auth.uid() or public.is_agency());

create policy "see own businesses" on public.businesses
  for select using (public.can_access(id));
create policy "agency manages businesses" on public.businesses
  for all using (public.is_agency()) with check (public.is_agency());

create policy "see own memberships" on public.memberships
  for select using (user_id = auth.uid() or public.is_agency());
create policy "agency manages memberships" on public.memberships
  for all using (public.is_agency()) with check (public.is_agency());

-- business-scoped tables: same rule for read and write
do $$
declare t text;
begin
  foreach t in array array['customers', 'visits', 'review_requests', 'messages', 'short_links',
                           'cases', 'templates', 'review_snapshots', 'google_reviews']
  loop
    execute format(
      'create policy "business access" on public.%I for all using (public.can_access(business_id)) with check (public.can_access(business_id))',
      t);
  end loop;
end $$;

create policy "taps via link" on public.link_taps
  for select using (exists (select 1 from public.short_links s where s.code = link_taps.code and public.can_access(s.business_id)));

create policy "agency sees jobs" on public.jobs
  for select using (public.is_agency());

create policy "see audit for own businesses" on public.audit_log
  for select using (public.is_agency() or (business_id is not null and public.can_access(business_id)));
