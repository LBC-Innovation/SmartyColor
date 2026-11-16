-- File uploads and deletes (admin Files page, /admin/files).
--
-- Every write to and removal from the "library" bucket is recorded in file_events by
-- src/server/storage/libraryFiles.ts: who, when, what kind of file, how big, how long it took and
-- whether it worked. Browser uploads go straight to storage through a signed URL, so they are
-- recorded in two steps: a "pending" row when the URL is issued, closed by finish_file_upload()
-- when the app registers the file. A pending row whose file is in storage counts as a success; one
-- with no file after an hour counts as abandoned (the browser never finished).
--
-- What is stored right now is read from storage.objects itself, so the totals are exact even for
-- files written before this table existed. Rows are kept after an account is deleted (owner_id and
-- actor_id have no foreign key), and carry no email or name.
--
-- Backfill: one "upload" per file in the bucket today (source 'backfill', at the file's creation
-- time), and one "delete" per photo or album deletion already in account_activity (file count and
-- size unknown for those).

create table if not exists public.file_events (
  id           uuid primary key default gen_random_uuid(),
  occurred_at  timestamptz not null default now(),
  finished_at  timestamptz,
  action       text not null check (action in ('upload', 'delete')),
  kind         text not null check (kind in ('photo', 'sheet', 'thumbnail', 'cover', 'print_pdf', 'digital_pdf', 'other')),
  -- How it happened: browser, generated, edited, mirrored, copied, thumbnail, book_order, migration,
  -- photo_delete, album_delete, account_delete, replaced, cleanup, backfill.
  source       text not null,
  outcome      text not null check (outcome in ('pending', 'success', 'failed')),
  owner_id     uuid,          -- whose folder the file is in
  actor_id     uuid,          -- who did it; null for background work
  file_count   integer,       -- files written or removed; null when unknown (backfilled deletes)
  photo_count  integer,       -- library photos a delete removed
  bytes        bigint,
  storage_path text,          -- the file, or the folder for a folder delete
  upload_id    uuid,          -- signed uploads: the photo, revision or order id the URL was issued for
  duration_ms  integer,
  error        text,
  metadata     jsonb not null default '{}'::jsonb
);

create index if not exists file_events_occurred_idx on public.file_events (occurred_at desc);
create index if not exists file_events_action_kind_idx on public.file_events (action, kind, occurred_at desc);
create index if not exists file_events_pending_idx on public.file_events (upload_id) where outcome = 'pending';
create index if not exists file_events_owner_idx on public.file_events (owner_id, occurred_at desc);

alter table public.file_events enable row level security;
revoke all on table public.file_events from public, anon, authenticated;
grant select, insert, update on table public.file_events to service_role;

alter table public.finance_settings
  add column if not exists storage_included_gb numeric(10, 3) not null default 1
    check (storage_included_gb between 0 and 100000);

comment on column public.finance_settings.storage_included_gb is
  'Storage the hosting plan includes before it charges per GB (Supabase Free: 1 GB; Pro: 100 GB).';

-- What kind of file a library path holds. Mirrors fileKindForPath() in src/server/storage/fileAudit.ts.
create or replace function public.library_file_kind(p_name text)
returns text
language sql
immutable
as $$
  select case
    when p_name like '%.thumb.webp' then 'thumbnail'
    when split_part(p_name, '/', 2) = '_orders' then
      case
        when p_name ~ '/cover-front\.[a-z]+$' then 'cover'
        when p_name ~ '/(interior|cover)\.pdf$' then 'print_pdf'
        when p_name ~ '\.pdf$' then 'digital_pdf'
        else 'other'
      end
    when split_part(p_name, '/', 4) = 'sheets' then 'sheet'
    when split_part(p_name, '/', 4) ~ '^original' then 'photo'
    else 'other'
  end;
$$;

-- Close a signed upload's pending row (or record it, if the row is missing).
create or replace function public.finish_file_upload(
  p_upload_id uuid,
  p_outcome   text,
  p_bytes     bigint default null,
  p_error     text default null,
  p_row       jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  update public.file_events e
     set outcome = p_outcome,
         bytes = coalesce(p_bytes, e.bytes),
         error = p_error,
         finished_at = now(),
         duration_ms = least(extract(epoch from (now() - e.occurred_at)) * 1000, 2147483647)::integer
   where e.id = (
     select id from public.file_events
      where upload_id = p_upload_id and outcome = 'pending'
      order by occurred_at desc
      limit 1
   )
  returning e.id into v_id;

  if v_id is null then
    insert into public.file_events (action, kind, source, outcome, owner_id, actor_id, file_count, bytes,
                                    storage_path, upload_id, error, finished_at)
    values ('upload',
            coalesce(p_row ->> 'kind', 'other'),
            coalesce(p_row ->> 'source', 'browser'),
            p_outcome,
            (p_row ->> 'owner_id')::uuid,
            (p_row ->> 'actor_id')::uuid,
            1,
            p_bytes,
            p_row ->> 'storage_path',
            p_upload_id,
            p_error,
            now());
  end if;
end;
$$;

-- Events with pending uploads resolved against storage: success when the file is there (with its
-- real size), abandoned when it is not after an hour, else still pending.
create or replace function public.admin_file_events(
  p_from          timestamptz default null,
  p_limit         integer default 500,
  p_include_thumbs boolean default false
)
returns table (
  id           uuid,
  occurred_at  timestamptz,
  action       text,
  kind         text,
  source       text,
  outcome      text,
  owner_id     uuid,
  actor_id     uuid,
  file_count   integer,
  photo_count  integer,
  bytes        bigint,
  storage_path text,
  duration_ms  integer,
  error        text
)
language sql
stable
security definer
set search_path = public, storage
as $$
  select e.id, e.occurred_at, e.action, e.kind, e.source,
         case
           when e.outcome <> 'pending' then e.outcome
           when o.id is not null then 'success'
           when e.occurred_at < now() - interval '1 hour' then 'abandoned'
           else 'pending'
         end,
         e.owner_id, e.actor_id, e.file_count, e.photo_count,
         coalesce(e.bytes, (o.metadata ->> 'size')::bigint),
         e.storage_path, e.duration_ms, e.error
    from public.file_events e
    left join storage.objects o
      on e.outcome = 'pending' and o.bucket_id = 'library' and o.name = e.storage_path
   where (p_from is null or e.occurred_at >= p_from)
     and (p_include_thumbs or e.kind <> 'thumbnail')
   order by e.occurred_at desc
   limit greatest(least(p_limit, 5000), 1);
$$;

-- Totals for a period, by action, kind, source and resolved outcome.
create or replace function public.admin_file_event_totals(p_from timestamptz default null)
returns table (
  action      text,
  kind        text,
  source      text,
  outcome     text,
  events      bigint,
  files       bigint,
  photos      bigint,
  bytes       bigint,
  avg_ms      numeric,
  p95_ms      numeric
)
language sql
stable
security definer
set search_path = public, storage
as $$
  with ev as (
    select e.*,
           case
             when e.outcome <> 'pending' then e.outcome
             when o.id is not null then 'success'
             when e.occurred_at < now() - interval '1 hour' then 'abandoned'
             else 'pending'
           end as resolved,
           coalesce(e.bytes, (o.metadata ->> 'size')::bigint) as size
      from public.file_events e
      left join storage.objects o
        on e.outcome = 'pending' and o.bucket_id = 'library' and o.name = e.storage_path
     where p_from is null or e.occurred_at >= p_from
  )
  select ev.action, ev.kind, ev.source, ev.resolved,
         count(*)::bigint,
         coalesce(sum(ev.file_count), 0)::bigint,
         coalesce(sum(ev.photo_count), 0)::bigint,
         coalesce(sum(ev.size), 0)::bigint,
         avg(ev.duration_ms)::numeric,
         percentile_cont(0.95) within group (order by ev.duration_ms)::numeric
    from ev
   group by 1, 2, 3, 4;
$$;

-- Uploads and deletes per UTC day, for the chart.
create or replace function public.admin_file_daily(p_days integer default 30)
returns table (
  day          date,
  uploads      bigint,
  upload_bytes bigint,
  deletes      bigint,
  deleted_files bigint,
  delete_bytes bigint,
  failed       bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select (e.occurred_at at time zone 'utc')::date,
         count(*) filter (where e.action = 'upload' and e.outcome <> 'failed'),
         coalesce(sum(e.bytes) filter (where e.action = 'upload' and e.outcome <> 'failed'), 0)::bigint,
         count(*) filter (where e.action = 'delete' and e.outcome = 'success'),
         coalesce(sum(e.file_count) filter (where e.action = 'delete' and e.outcome = 'success'), 0)::bigint,
         coalesce(sum(e.bytes) filter (where e.action = 'delete' and e.outcome = 'success'), 0)::bigint,
         count(*) filter (where e.outcome = 'failed')
    from public.file_events e
   where e.occurred_at >= (now() at time zone 'utc')::date - (greatest(p_days, 1) - 1)
   group by 1;
$$;

-- What is stored now, by kind and whether anything still uses it:
--   in_use     the app points at it (or it's a thumbnail of a file that is still there)
--   orphaned   nothing points at it any more (left behind by a failed or interrupted step)
--   no_account its folder belongs to an account that no longer exists
-- Files under an hour old are counted as in use, since a browser upload may still be registering.
create or replace function public.admin_storage_summary()
returns table (
  kind       text,
  state      text,
  objects    bigint,
  bytes      bigint,
  gb_months  numeric,
  oldest     timestamptz,
  newest     timestamptz,
  added_30d_bytes bigint,
  added_30d_objects bigint
)
language sql
stable
security definer
set search_path = public, storage
as $$
  with obj as (
    select o.name, o.created_at,
           coalesce((o.metadata ->> 'size')::bigint, 0) as size,
           public.library_file_kind(o.name) as kind,
           split_part(o.name, '/', 1) as owner,
           split_part(o.name, '/', 3) as third
      from storage.objects o
     where o.bucket_id = 'library'
  ),
  referenced as (
    select storage_path as name from public.library_photos
    union
    select storage_path from public.library_sheet_revisions
  ),
  classified as (
    select obj.*,
           case
             when obj.owner !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               or not exists (select 1 from auth.users u where u.id::text = obj.owner) then 'no_account'
             when obj.created_at > now() - interval '1 hour' then 'in_use'
             when obj.kind = 'thumbnail' then
               case when exists (select 1 from storage.objects s
                                  where s.bucket_id = 'library'
                                    and s.name = left(obj.name, length(obj.name) - length('.thumb.webp')))
                    then 'in_use' else 'orphaned' end
             when obj.kind in ('photo', 'sheet') then
               case when exists (select 1 from referenced r where r.name = obj.name) then 'in_use' else 'orphaned' end
             when obj.kind in ('cover', 'print_pdf', 'digital_pdf') then
               case when exists (select 1 from public.book_orders b
                                  where b.id::text = regexp_replace(obj.third, '\.pdf$', ''))
                    then 'in_use' else 'orphaned' end
             else 'in_use'
           end as state
      from obj
  )
  select c.kind, c.state,
         count(*)::bigint,
         sum(c.size)::bigint,
         sum(c.size::numeric / 1e9 * extract(epoch from (now() - coalesce(c.created_at, now()))) / (30.4375 * 86400)),
         min(c.created_at), max(c.created_at),
         coalesce(sum(c.size) filter (where c.created_at >= now() - interval '30 days'), 0)::bigint,
         count(*) filter (where c.created_at >= now() - interval '30 days')::bigint
    from classified c
   group by 1, 2;
$$;

-- The biggest files in storage.
create or replace function public.admin_storage_largest(p_limit integer default 10)
returns table (name text, kind text, owner_id uuid, bytes bigint, created_at timestamptz)
language sql
stable
security definer
set search_path = public, storage
as $$
  select o.name,
         public.library_file_kind(o.name),
         case when split_part(o.name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(o.name, '/', 1)::uuid end,
         coalesce((o.metadata ->> 'size')::bigint, 0),
         o.created_at
    from storage.objects o
   where o.bucket_id = 'library'
   order by coalesce((o.metadata ->> 'size')::bigint, 0) desc
   limit greatest(least(p_limit, 100), 1);
$$;

revoke all on function public.finish_file_upload(uuid, text, bigint, text, jsonb) from public, anon, authenticated;
revoke all on function public.admin_file_events(timestamptz, integer, boolean) from public, anon, authenticated;
revoke all on function public.admin_file_event_totals(timestamptz) from public, anon, authenticated;
revoke all on function public.admin_file_daily(integer) from public, anon, authenticated;
revoke all on function public.admin_storage_summary() from public, anon, authenticated;
revoke all on function public.admin_storage_largest(integer) from public, anon, authenticated;
grant execute on function public.finish_file_upload(uuid, text, bigint, text, jsonb) to service_role;
grant execute on function public.admin_file_events(timestamptz, integer, boolean) to service_role;
grant execute on function public.admin_file_event_totals(timestamptz) to service_role;
grant execute on function public.admin_file_daily(integer) to service_role;
grant execute on function public.admin_storage_summary() to service_role;
grant execute on function public.admin_storage_largest(integer) to service_role;

-- --- Backfill -------------------------------------------------------------------------------------

-- Every file in the bucket today, as an upload at the time it was saved.
insert into public.file_events (occurred_at, finished_at, action, kind, source, outcome, owner_id, actor_id,
                                file_count, bytes, storage_path, metadata)
select o.created_at, o.created_at, 'upload', public.library_file_kind(o.name), 'backfill', 'success',
       case when split_part(o.name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            then split_part(o.name, '/', 1)::uuid end,
       coalesce(p.uploaded_by, r.created_by),
       1, coalesce((o.metadata ->> 'size')::bigint, 0), o.name, '{"backfilled": true}'::jsonb
  from storage.objects o
  left join public.library_photos p on p.storage_path = o.name
  left join public.library_sheet_revisions r on r.storage_path = o.name
 where o.bucket_id = 'library'
   and not exists (select 1 from public.file_events e where e.source = 'backfill' and e.storage_path = o.name);

-- Photo and album deletions already in customers' history.
insert into public.file_events (occurred_at, finished_at, action, kind, source, outcome, owner_id, actor_id,
                                photo_count, metadata)
select a.occurred_at, a.occurred_at, 'delete', 'photo',
       case a.type when 'album_deleted' then 'album_delete' else 'photo_delete' end,
       'success', a.user_id, a.user_id,
       coalesce((a.metadata ->> 'photoCount')::integer, case when a.type = 'photo_deleted' then 1 else 0 end),
       jsonb_build_object('backfilled', true, 'activity_id', a.id)
  from public.account_activity a
 where a.type in ('photo_deleted', 'album_deleted')
   and not exists (select 1 from public.file_events e where e.metadata ->> 'activity_id' = a.id::text);
