-- Complaints pause the review sequence until someone marks them resolved.
-- A customer reply that isn't a simple "ok/thanks" opens a case, pauses all
-- review messages, and waits. On "resolved", one apology message with the
-- same review link goes (everyone is still asked: no review gating).

alter table orbit.review_requests drop constraint if exists review_requests_stage_check;
alter table orbit.review_requests add constraint review_requests_stage_check check (stage in (
  'scheduled', 'checkin_sent', 'replied', 'no_reply', 'link_sent',
  'reminder_sent', 'tapped', 'thanked', 'stopped', 'expired',
  'on_hold', 'followup_sent'));
alter table orbit.review_requests add column if not exists held_from_stage text;

alter table orbit.cases add column if not exists review_request_id uuid references orbit.review_requests on delete set null;
alter table orbit.cases add column if not exists note text;
alter table orbit.cases add column if not exists resolved_at timestamptz;
alter table orbit.cases add column if not exists resolved_by uuid references orbit.profiles;
create index if not exists cases_open on orbit.cases (business_id, status);
