-- Admins choose which of an album's pages its pre-paid book (package or purchase code) includes.
--
-- A page is in the book when it has a purchase_code_photos row. From the admin customer drawer an
-- admin can:
--   * include a page: it fills one of the book's slots. A slot is free when the album has fewer
--     included photos than included_pages (slots taken by photos since deleted count as free here).
--     When every slot holds a page, the book grows by one page (included_pages + 1): a granted
--     extra page, which the package's printing then covers too.
--   * exclude a page: its slot is given back (and a granted extra page shrinks the book again).
--
-- Neither charges the customer or changes a refund: an included page is counted with the pages
-- brought in (pages_brought_in), which a refund never charges for. Both refuse once the book is
-- ordered or the code is no longer active.

alter table public.purchase_code_photos
  add column if not exists granted_by uuid references auth.users (id) on delete set null,
  add column if not exists granted_extra boolean not null default false;

comment on column public.purchase_code_photos.granted_by is
  'Admin who included this page by hand from the customer drawer; null when the package claimed it.';
comment on column public.purchase_code_photos.granted_extra is
  'Including this page grew the book by one page (included_pages + 1); excluding it shrinks it again.';

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

    -- generations_used 1 when the page exists, so making it again isn't part of the package; 0
    -- lets the package make it.
    insert into public.purchase_code_photos (
      code_id, photo_id, generations_used, brought_in, granted_by, granted_extra
    )
    values (v_code.id, p_photo_id, case when v_has_page then 1 else 0 end, true, p_admin_id, v_extra);

    if v_extra then
      update public.purchase_codes
      set included_pages = included_pages + 1,
          pages_used = pages_used + 1,
          pages_brought_in = pages_brought_in + 1
      where id = v_code.id;
    elsif v_code.pages_used < v_code.included_pages then
      -- Takes one of the customer's unused slots (the book has a fixed size); not charged on refund.
      update public.purchase_codes
      set pages_used = pages_used + 1,
          pages_brought_in = pages_brought_in + 1
      where id = v_code.id;
    end if;
    -- Otherwise it reuses a slot counted as used by a photo since deleted: no counter changes.

    return jsonb_build_object('included', true, 'changed', true, 'grewBook', v_extra);
  end if;

  if not found then
    return jsonb_build_object('included', false, 'changed', false);
  end if;

  delete from public.purchase_code_photos where code_id = v_code.id and photo_id = p_photo_id;

  update public.purchase_codes
  set included_pages = case when v_use.granted_extra then greatest(included_pages - 1, 1) else included_pages end,
      pages_used = greatest(pages_used - 1, 0),
      pages_brought_in = least(
        greatest(pages_brought_in - case when v_use.brought_in then 1 else 0 end, 0),
        greatest(pages_used - 1, 0)
      )
  where id = v_code.id;

  return jsonb_build_object('included', false, 'changed', true, 'shrankBook', v_use.granted_extra);
end;
$$;

revoke all on function public.admin_set_package_page(uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function public.admin_set_package_page(uuid, boolean, uuid) to service_role;
