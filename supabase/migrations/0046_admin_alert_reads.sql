-- Admin alerts: which alerts each admin has marked read.
--
-- The admin area shows a column of open alerts (orders that need the owner, image service problems,
-- prices below cost, finance warnings). Alerts are computed live from those sources; nothing stores
-- the alerts themselves. An admin can mark one read to clear it from their column. alert_key names
-- the alert and the state it was in (an order's id and status, an error's time, a price), so the same
-- problem coming back in a new state shows up again.
--
-- Only the server (service role) reads and writes this table, through /api/admin/alerts/reads.

create table if not exists public.admin_alert_reads (
  user_id uuid not null references auth.users (id) on delete cascade,
  alert_key text not null check (char_length(alert_key) between 1 and 300),
  read_at timestamptz not null default now(),
  primary key (user_id, alert_key)
);

comment on table public.admin_alert_reads is 'Admin alerts each admin marked read; alerts themselves are computed live.';

alter table public.admin_alert_reads enable row level security;
revoke all on public.admin_alert_reads from anon, authenticated;
-- New tables in this project don't get the service role's default grants, so grant them explicitly.
grant select, insert, update, delete on public.admin_alert_reads to service_role;
