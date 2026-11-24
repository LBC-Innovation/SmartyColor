-- Screen-sized display copies (<image>.display.webp) sit next to thumbnails (<image>.thumb.webp).
-- Count them as thumbnails, and as in use while the image they copy is still there.
-- Mirrors fileKindForPath() in src/server/storage/fileAudit.ts.

create or replace function public.library_file_kind(p_name text)
returns text
language sql
immutable
as $$
  select case
    when p_name like '%.thumb.webp' or p_name like '%.display.webp' then 'thumbnail'
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
                                    and s.name = regexp_replace(obj.name, '\.(thumb|display)\.webp$', ''))
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
