-- What each customer, and each guest, costs to serve (admin Customers panel and /admin/guests).
--
-- AI: every call is already in vision_usage_events with the signed-in user_id. Guest calls had no
-- user and nothing else, so from now on they carry the visitor's address and the approximate
-- location the hosting platform reports (Vercel's x-vercel-ip-* headers). guest_ip is the key the
-- guest limits use: an IPv4 address as is, an IPv6 address cut to its /64 ("v6/2001:db8:1:2").
-- Rows from before this migration, and rows of deleted accounts (user_id is set null), have
-- neither a user nor an address; the admin pages show them as "not attributed".
--
-- Storage: every library image lives under "<user id>/..." in the library bucket. Lifetime storage
-- cost is GB-months held (bytes × time since upload) at the rate in finance_settings. Deleted
-- images no longer appear, so this slightly undercounts. Guests keep images in their browser and
-- cost no storage.

alter table public.vision_usage_events
  add column if not exists guest_ip     text,
  add column if not exists geo_country  text,
  add column if not exists geo_region   text,
  add column if not exists geo_city     text,
  add column if not exists geo_postal   text,
  add column if not exists geo_latitude  numeric(8, 5),
  add column if not exists geo_longitude numeric(8, 5);

comment on column public.vision_usage_events.guest_ip is
  'Guest calls only: the visitor''s IPv4 address, or the /64 of an IPv6 one. Null for signed-in calls.';

create index if not exists vision_usage_events_guest_ip_idx
  on public.vision_usage_events (guest_ip, at desc)
  where guest_ip is not null;

-- Unattributed and guest rows are looked up by "user_id is null".
create index if not exists vision_usage_events_no_user_idx
  on public.vision_usage_events (at desc)
  where user_id is null;

alter table public.finance_settings
  add column if not exists storage_usd_per_gb_month numeric(8, 5) not null default 0.021
    check (storage_usd_per_gb_month between 0 and 10);

comment on column public.finance_settings.storage_usd_per_gb_month is
  'What one GB of image storage costs per month (Supabase Storage: $0.021 past the plan''s included GB).';

-- AI spend and storage held per account, for the Customers list. One row per account with any.
create or replace function public.admin_user_costs()
returns table (
  user_id          uuid,
  ai_calls         bigint,
  ai_cost_usd      numeric,
  storage_objects  bigint,
  storage_bytes    bigint,
  storage_gb_months numeric
)
language sql
stable
security definer
set search_path = public, storage
as $$
  with ai as (
    select e.user_id, count(*)::bigint as calls, coalesce(sum(e.total_cost_usd), 0) as cost
      from public.vision_usage_events e
     where e.user_id is not null
     group by e.user_id
  ),
  files as (
    select split_part(o.name, '/', 1) as owner,
           count(*)::bigint as objects,
           coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint as bytes,
           coalesce(sum(
             (o.metadata ->> 'size')::numeric / 1e9
             * extract(epoch from (now() - coalesce(o.created_at, now()))) / (30.4375 * 86400)
           ), 0) as gb_months
      from storage.objects o
     where o.bucket_id = 'library'
     group by 1
  ),
  owners as (
    select f.owner::uuid as user_id, f.objects, f.bytes, f.gb_months
      from files f
     where f.owner ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
  select coalesce(ai.user_id, owners.user_id),
         coalesce(ai.calls, 0),
         coalesce(ai.cost, 0),
         coalesce(owners.objects, 0),
         coalesce(owners.bytes, 0),
         coalesce(owners.gb_months, 0)
    from ai
    full join owners on owners.user_id = ai.user_id;
$$;

-- AI spend with no account behind it, grouped by guest address. guest_ip is null for the
-- "not attributed" group. Location comes from the address's most recent call.
create or replace function public.admin_guest_costs(p_from timestamptz default null)
returns table (
  guest_ip     text,
  calls        bigint,
  cost_usd     numeric,
  first_at     timestamptz,
  last_at      timestamptz,
  geo_country  text,
  geo_region   text,
  geo_city     text,
  geo_postal   text,
  geo_latitude  numeric,
  geo_longitude numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with ev as (
    select * from public.vision_usage_events e
     where e.user_id is null
       and (p_from is null or e.at >= p_from)
  ),
  latest as (
    select distinct on (r.guest_ip) r.guest_ip, r.geo_country, r.geo_region, r.geo_city, r.geo_postal,
           r.geo_latitude, r.geo_longitude
      from ev r
     where r.guest_ip is not null
     order by r.guest_ip, (r.geo_country is null), r.at desc
  )
  select g.guest_ip, g.calls, g.cost, g.first_at, g.last_at,
         l.geo_country, l.geo_region, l.geo_city, l.geo_postal, l.geo_latitude, l.geo_longitude
    from (
      select r.guest_ip, count(*)::bigint as calls, coalesce(sum(r.total_cost_usd), 0) as cost,
             min(r.at) as first_at, max(r.at) as last_at
        from ev r
       group by r.guest_ip
    ) g
    left join latest l on l.guest_ip = g.guest_ip;
$$;

revoke all on function public.admin_user_costs() from public, anon, authenticated;
revoke all on function public.admin_guest_costs(timestamptz) from public, anon, authenticated;
grant execute on function public.admin_user_costs() to service_role;
grant execute on function public.admin_guest_costs(timestamptz) to service_role;
