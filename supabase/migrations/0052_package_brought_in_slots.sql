-- Book packages: pages already made fill the book up to its page count, however they got there.
--
-- What went wrong (a customer, 2026-11-27): 24 photos copied into a 30-page package album were
-- claimed as brought in, then deleted. Their purchase_code_photos rows went with them, but
-- pages_used and pages_brought_in kept counting them, so when 30 photos were copied in again
-- only 6 could be claimed and 24 made pages were left outside the book.
--
-- The rule now:
--   * Generations are what the package limits. A page the package MADE keeps its slot when its
--     photo is deleted (so a page can't be made, downloaded, deleted and made again for free).
--     pages_used - pages_brought_in, the pages made, still never goes down.
--   * A page BROUGHT IN already made costs the package nothing, so deleting its photo gives the
--     slot back: pages_brought_in counts brought-in photos still in the album, and pages_used
--     goes down with it (trigger below). pages_used = pages made + brought-in photos present.
--   * An already-made page joins the book while the album has fewer included photos than
--     included_pages (claim_brought_in_page), even when deleted made pages keep pages_used full.
--
-- Refunds are unchanged: they charge pages_used - pages_brought_in, which this never changes.

-- 1. A brought-in photo leaving the album gives its slot back.
create or replace function public.purchase_code_photo_removed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.brought_in then
    update public.purchase_codes
    set pages_used = greatest(pages_used - 1, 0),
        pages_brought_in = greatest(pages_brought_in - 1, 0)
    where id = old.code_id;
  end if;
  return old;
end;
$$;

revoke all on function public.purchase_code_photo_removed() from public, anon, authenticated;

drop trigger if exists purchase_code_photos_removed on public.purchase_code_photos;
create trigger purchase_code_photos_removed
  after delete on public.purchase_code_photos
  for each row
  execute function public.purchase_code_photo_removed();

-- 2. Claiming an already-made page: limited by the photos the book includes now.
create or replace function public.claim_brought_in_page(p_photo_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project uuid;
  v_code public.purchase_codes%rowtype;
  v_live integer;
begin
  select project_id into v_project from public.library_photos where id = p_photo_id;
  if not found then
    return null;
  end if;

  select * into v_code from public.purchase_codes
  where project_id = v_project and status = 'active'
  for update;
  if not found or v_code.book_order_id is not null then
    return null;
  end if;

  if exists (select 1 from public.purchase_code_photos where code_id = v_code.id and photo_id = p_photo_id) then
    return null;
  end if;

  select count(*) into v_live from public.purchase_code_photos where code_id = v_code.id;
  if v_live >= v_code.included_pages then
    return null;
  end if;

  -- generations_used 1: the page exists, so making it again isn't part of the package.
  insert into public.purchase_code_photos (code_id, photo_id, generations_used, brought_in)
  values (v_code.id, p_photo_id, 1, true);
  update public.purchase_codes
  set pages_used = pages_used + 1,
      pages_brought_in = pages_brought_in + 1
  where id = v_code.id;

  return v_code.id;
end;
$$;

revoke all on function public.claim_brought_in_page(uuid) from public, anon, authenticated;
grant execute on function public.claim_brought_in_page(uuid) to service_role;

-- 3. The admin toggle (0051) with the same counting: an included page always counts as brought
--    in, and the trigger above gives the slot back when it is taken out.
create or replace function public.admin_set_package_page(
  p_photo_id uuid,
  p_include boolean,
  p_admin_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project uuid;
  v_code public.purchase_codes%rowtype;
  v_use public.purchase_code_photos%rowtype;
  v_live integer;
  v_has_page boolean;
  v_extra boolean;
begin
  select project_id into v_project from public.library_photos where id = p_photo_id;
  if not found then
    raise exception 'photo not found';
  end if;

  select * into v_code from public.purchase_codes
  where project_id = v_project and status = 'active'
  for update;
  if not found then
    raise exception 'no active package';
  end if;
  if v_code.book_order_id is not null then
    raise exception 'book already ordered';
  end if;

  select * into v_use from public.purchase_code_photos
  where code_id = v_code.id and photo_id = p_photo_id
  for update;

  if p_include then
    if found then
      return jsonb_build_object('included', true, 'changed', false);
    end if;

    select count(*) into v_live from public.purchase_code_photos where code_id = v_code.id;
    v_extra := v_live >= v_code.included_pages;
    v_has_page := exists (
      select 1 from public.library_sheet_revisions where photo_id = p_photo_id and kind <> 'photo'
    );

    insert into public.purchase_code_photos (
      code_id, photo_id, generations_used, brought_in, granted_by, granted_extra
    )
    values (v_code.id, p_photo_id, case when v_has_page then 1 else 0 end, true, p_admin_id, v_extra);

    update public.purchase_codes
    set included_pages = included_pages + case when v_extra then 1 else 0 end,
        pages_used = pages_used + 1,
        pages_brought_in = pages_brought_in + 1
    where id = v_code.id;

    return jsonb_build_object('included', true, 'changed', true, 'grewBook', v_extra);
  end if;

  if not found then
    return jsonb_build_object('included', false, 'changed', false);
  end if;

  -- The trigger gives a brought-in page's slot back; a page the package made gives its slot back
  -- here, because an admin chose to.
  delete from public.purchase_code_photos where code_id = v_code.id and photo_id = p_photo_id;

  update public.purchase_codes
  set included_pages = case when v_use.granted_extra then greatest(included_pages - 1, 1) else included_pages end,
      pages_used = case when v_use.brought_in then pages_used else greatest(pages_used - 1, pages_brought_in) end
  where id = v_code.id;

  return jsonb_build_object('included', false, 'changed', true, 'shrankBook', v_use.granted_extra);
end;
$$;

revoke all on function public.admin_set_package_page(uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function public.admin_set_package_page(uuid, boolean, uuid) to service_role;

-- 4. Recount every code: pages made stay as they were; brought-in pages are the ones present.
update public.purchase_codes c
set pages_brought_in = live.n,
    pages_used = (c.pages_used - c.pages_brought_in) + live.n
from (
  select c2.id, count(u.photo_id) filter (where u.brought_in)::integer as n
  from public.purchase_codes c2
  left join public.purchase_code_photos u on u.code_id = c2.id
  group by c2.id
) live
where live.id = c.id
  and (c.pages_brought_in <> live.n);

-- 5. Fill open book slots with pages already made, in album order, as the studio does on its next
--    load (claimMadePagesForCode): photos with a page, not in the book, not paid for from the wallet.
do $$
declare
  v_photo record;
begin
  for v_photo in
    select p.id
    from public.purchase_codes c
    join public.library_photos p on p.project_id = c.project_id
    where c.status = 'active'
      and c.book_order_id is null
      and not exists (select 1 from public.purchase_code_photos u where u.code_id = c.id and u.photo_id = p.id)
      and exists (select 1 from public.library_sheet_revisions r where r.photo_id = p.id and r.kind <> 'photo')
      and not exists (
        select 1 from public.credit_ledger l
        where l.reference_type = 'library_photo' and l.reason = 'sheet_generation' and l.reference_id = p.id
      )
    order by c.id, p.position
  loop
    perform public.claim_brought_in_page(v_photo.id);
  end loop;
end;
$$;
