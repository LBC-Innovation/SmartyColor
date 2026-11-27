-- Page views: which screens a signed-in customer opened, for the admin History tab.
--
-- The app records one row each time a signed-in customer moves to a new screen (path plus a few
-- harmless query values such as the book builder step). Guests are not recorded, admin screens
-- are not recorded, and secret-bearing paths (redeem codes, invite and referral links) are cut
-- back to their prefix before they get here. Rows go with the account (on delete cascade) and
-- the guest-retention cron deletes rows older than 12 months, as /terms says.
--
-- Only the server (service role) reads and writes this table, through /api/page-views and the
-- admin history service.

create table if not exists public.page_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  path text not null check (char_length(path) between 1 and 300),
  at timestamptz not null default now()
);

create index if not exists page_views_user_at_idx on public.page_views (user_id, at desc);
create index if not exists page_views_at_idx on public.page_views (at);

comment on table public.page_views is 'Screens a signed-in customer opened; shown in the admin History tab, kept 12 months.';

alter table public.page_views enable row level security;
revoke all on public.page_views from anon, authenticated;
-- New tables in this project don't get the service role's default grants, so grant them explicitly.
grant select, insert, delete on public.page_views to service_role;

-- Run by /api/cron/guest-retention alongside the guest location scrub.
create or replace function public.delete_old_page_views()
returns integer
language sql
security definer
set search_path = public
as $$
  with gone as (
    delete from public.page_views where at < now() - interval '12 months' returning 1
  )
  select count(*)::integer from gone;
$$;

revoke all on function public.delete_old_page_views() from public, anon, authenticated;
grant execute on function public.delete_old_page_views() to service_role;
