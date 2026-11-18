-- Review sequence: test routing per business, jobs linked to their review
-- request, and a once-a-minute tick that runs due steps.
-- Safe to run more than once.

-- Test mode: every message for this business goes to test_phone (through our
-- Meta test number) and waits are minutes instead of hours.
alter table orbit.businesses
  add column if not exists test_mode boolean not null default false,
  add column if not exists test_phone text;

alter table orbit.jobs
  add column if not exists review_request_id uuid references orbit.review_requests on delete cascade;
create index if not exists jobs_request on orbit.jobs (review_request_id);

-- Secrets only the server reads (row-level security on, no policies).
create table if not exists orbit.app_secrets (
  key text primary key,
  value text not null
);
alter table orbit.app_secrets enable row level security;
insert into orbit.app_secrets (key, value)
values ('cron', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

-- Once a minute: ask the app to run due steps. The app checks the secret.
create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.unschedule('orbit-tick') where exists (select 1 from cron.job where jobname = 'orbit-tick');
select cron.schedule(
  'orbit-tick',
  '* * * * *',
  $$ select net.http_post(
       url := 'https://orbit-livid-mu.vercel.app/api/cron/tick',
       headers := jsonb_build_object('content-type', 'application/json',
                                     'x-cron-secret', (select value from orbit.app_secrets where key = 'cron')),
       body := '{}'::jsonb,
       timeout_milliseconds := 25000) $$
);
