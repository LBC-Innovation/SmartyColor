-- Daily usage limits for people who are not signed in.
--
-- Guests can make coloring pages without an account, and each page runs the paid image model.
-- The API counts attempts per (hashed IP, day, kind) so one visitor or bot cannot spend without
-- limit, and sums the day across everyone as a circuit breaker.
--
-- The IP is hashed (HMAC with a server secret) before it reaches this table; the raw address is
-- never stored. Server-only: every read and write goes through the API with the service role.
-- kind: 'page' (a generation), 'edit' (a correction), 'prepare' (HEIC conversion).

create table if not exists public.guest_usage (
  ip_hash    text        not null,
  day        date        not null,
  kind       text        not null,
  count      integer     not null default 0,
  updated_at timestamptz not null default now(),
  primary key (ip_hash, day, kind)
);

create index if not exists guest_usage_day_kind_idx on public.guest_usage (day, kind);

comment on table public.guest_usage is
  'Per-day guest attempts by hashed IP and kind. Service role only; rows older than 7 days are deleted as new ones are added.';

alter table public.guest_usage enable row level security;
-- No policies on purpose: only the service role (which bypasses RLS) reads/writes.
grant select, insert, update, delete on table public.guest_usage to service_role;

-- Adds one attempt unless the caller is already at p_limit. Returns the new count, or p_limit + 1
-- when the limit was already reached (nothing is added then, so refused attempts do not inflate
-- the day's total). One statement, so concurrent requests cannot both slip under the limit.
create or replace function public.guest_usage_try_increment(
  p_ip_hash text,
  p_day     date,
  p_kind    text,
  p_limit   integer
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.guest_usage as g (ip_hash, day, kind, count)
  values (p_ip_hash, p_day, p_kind, 1)
  on conflict (ip_hash, day, kind) do update
    set count = g.count + 1, updated_at = now()
    where g.count < p_limit
  returning g.count into v_count;

  if v_count is null then
    return p_limit + 1;
  end if;
  -- Rows are kept for about a week: whenever someone's first attempt of the day creates a row,
  -- sweep out the old ones (indexed on day, so this is cheap).
  if v_count = 1 then
    delete from public.guest_usage where day < p_day - 7;
  end if;
  return v_count;
end;
$$;

-- Gives one attempt back, e.g. when the model call failed. Never goes below zero.
create or replace function public.guest_usage_refund(
  p_ip_hash text,
  p_day     date,
  p_kind    text
) returns void
language sql
security definer
set search_path = public
as $$
  update public.guest_usage
     set count = greatest(count - 1, 0), updated_at = now()
   where ip_hash = p_ip_hash and day = p_day and kind = p_kind;
$$;

-- The day's attempts across all IPs for one kind.
create or replace function public.guest_usage_day_total(
  p_day  date,
  p_kind text
) returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(count), 0)::bigint from public.guest_usage where day = p_day and kind = p_kind;
$$;

revoke all on function public.guest_usage_try_increment(text, date, text, integer) from public, anon, authenticated;
revoke all on function public.guest_usage_day_total(date, text) from public, anon, authenticated;
revoke all on function public.guest_usage_refund(text, date, text) from public, anon, authenticated;
grant execute on function public.guest_usage_try_increment(text, date, text, integer) to service_role;
grant execute on function public.guest_usage_day_total(date, text) to service_role;
grant execute on function public.guest_usage_refund(text, date, text) to service_role;
