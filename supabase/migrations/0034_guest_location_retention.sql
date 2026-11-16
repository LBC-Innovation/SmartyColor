-- Guest addresses and locations (0033) are kept for 12 months, as the privacy page says. After that
-- the cost record stays (what the call cost, when, which action) with nothing that points to a person.
-- Run daily by the Vercel cron at /api/cron/guest-retention.

create or replace function public.scrub_old_guest_locations(p_keep interval default interval '12 months')
returns integer
language sql
security definer
set search_path = public
as $$
  with scrubbed as (
    update public.vision_usage_events
       set guest_ip = null,
           geo_country = null,
           geo_region = null,
           geo_city = null,
           geo_postal = null,
           geo_latitude = null,
           geo_longitude = null
     where at < now() - p_keep
       and (guest_ip is not null or geo_country is not null or geo_city is not null
            or geo_postal is not null or geo_latitude is not null)
    returning 1
  )
  select count(*)::integer from scrubbed;
$$;

comment on function public.scrub_old_guest_locations(interval) is
  'Clears guest IP and location from AI cost records older than p_keep (12 months by default). Returns rows changed.';

revoke all on function public.scrub_old_guest_locations(interval) from public, anon, authenticated;
grant execute on function public.scrub_old_guest_locations(interval) to service_role;
