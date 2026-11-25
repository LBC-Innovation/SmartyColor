-- Book packages: pages brought into the album already made count toward the book, not the refund.
--
-- The year album copies photos into a package album with their coloring pages. Those pages should
-- fill the book's included photos in album order (the first 20 of a 20-photo book are the book),
-- but the package didn't make them, so canceling must not charge for them.
--
--   * purchase_codes.pages_brought_in counts included photos taken by pages that came in already
--     made. pages_used still counts every included photo taken (made or brought in), so the
--     allowance checks in purchase_code_covers() are unchanged.
--   * claim_brought_in_page() takes one included photo for such a page. It never charges anything.
--   * The refund charges only for pages the package made: pages_used - pages_brought_in. It's a
--     counter, not a count of rows, so deleting a brought-in photo can't turn it into a made page.

alter table public.purchase_codes
  add column if not exists pages_brought_in integer not null default 0;

alter table public.purchase_codes
  drop constraint if exists purchase_codes_pages_brought_in_check,
  add constraint purchase_codes_pages_brought_in_check check (pages_brought_in >= 0 and pages_brought_in <= pages_used);

comment on column public.purchase_codes.pages_brought_in is
  'Included photos taken by pages copied in already made (not made by the package); not charged on refund.';

alter table public.purchase_code_photos
  add column if not exists brought_in boolean not null default false;

comment on column public.purchase_code_photos.brought_in is
  'The page came into the album already made; the package counts it toward the book but did not make it.';

-- Takes one of the album's included photos for a page that came in already made. Returns the code
-- id, or null when there is no active, unordered code with an included photo left, or the photo
-- already has one.
create or replace function public.claim_brought_in_page(p_photo_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project uuid;
  v_code public.purchase_codes%rowtype;
begin
  select project_id into v_project from public.library_photos where id = p_photo_id;
  if not found then
    return null;
  end if;

  select * into v_code from public.purchase_codes
  where project_id = v_project and status = 'active'
  for update;
  if not found or v_code.book_order_id is not null or v_code.pages_used >= v_code.included_pages then
    return null;
  end if;

  if exists (select 1 from public.purchase_code_photos where code_id = v_code.id and photo_id = p_photo_id) then
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

-- Same as 0044, charging only pages the package made. 'pagesUsed' is pages made (what the cancel
-- dialog shows as "pages made × price"); 'pagesBroughtIn' is the rest of the included photos taken.
create or replace function public.book_package_refund_quote(p_user_id uuid, p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_code public.purchase_codes%rowtype;
  v_page_price integer;
  v_made integer;
  v_charged integer;
begin
  select * into v_code from public.purchase_codes
  where project_id = p_project_id and source = 'package';
  if not found then
    return null;
  end if;

  select case when billable then list_price_cents else 0 end into v_page_price
  from public.price_items where sku = 'ai.sheet_generation';
  v_page_price := coalesce(v_page_price, 0);
  v_made := greatest(v_code.pages_used - v_code.pages_brought_in, 0);
  v_charged := least(coalesce(v_code.package_price_cents, 0), v_made * v_page_price);

  return jsonb_build_object(
    'codeId', v_code.id,
    'bindingId', v_code.binding_id,
    'pricePaidCents', coalesce(v_code.package_price_cents, 0),
    'pagesUsed', v_made,
    'pagesBroughtIn', v_code.pages_brought_in,
    'pagePriceCents', v_page_price,
    'pagesChargedCents', v_charged,
    'refundCents', greatest(coalesce(v_code.package_price_cents, 0) - v_charged, 0),
    'cancelable', v_code.status = 'active' and v_code.book_order_id is null and v_code.redeemed_by = p_user_id,
    'bookOrdered', v_code.book_order_id is not null,
    'refunded', v_code.refunded_at is not null,
    'isBuyer', v_code.redeemed_by = p_user_id
  );
end;
$$;

revoke all on function public.book_package_refund_quote(uuid, uuid) from public, anon, authenticated;
grant execute on function public.book_package_refund_quote(uuid, uuid) to service_role;

create or replace function public.cancel_book_package(p_user_id uuid, p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_code public.purchase_codes%rowtype;
  v_page_price integer;
  v_made integer;
  v_charged integer;
  v_refund integer;
  v_ledger_id uuid;
begin
  -- Profile first, the same lock order as charge_photo_usage and the package purchase.
  select credits_balance into v_balance
  from public.profiles
  where id = p_user_id
  for update;
  if not found then
    raise exception 'profile not found';
  end if;

  select * into v_code from public.purchase_codes
  where project_id = p_project_id and source = 'package'
  for update;
  if not found then
    raise exception 'no package';
  end if;
  if v_code.redeemed_by is distinct from p_user_id then
    raise exception 'not the buyer';
  end if;
  if v_code.refunded_at is not null then
    raise exception 'already refunded';
  end if;
  if v_code.book_order_id is not null then
    raise exception 'book already ordered';
  end if;
  if v_code.status <> 'active' then
    raise exception 'package not active';
  end if;

  select case when billable then list_price_cents else 0 end into v_page_price
  from public.price_items where sku = 'ai.sheet_generation';
  v_page_price := coalesce(v_page_price, 0);
  v_made := greatest(v_code.pages_used - v_code.pages_brought_in, 0);
  v_charged := least(coalesce(v_code.package_price_cents, 0), v_made * v_page_price);
  v_refund := greatest(coalesce(v_code.package_price_cents, 0) - v_charged, 0);

  update public.purchase_codes
  set status = 'void',
      voided_at = now(),
      voided_by = p_user_id,
      refunded_at = now(),
      refund_cents = v_refund
  where id = v_code.id;

  if v_refund > 0 then
    v_balance := v_balance + v_refund;
    update public.profiles set credits_balance = v_balance where id = p_user_id;

    insert into public.credit_ledger (
      user_id, delta, balance_after, reason, reference_type, reference_id, note
    )
    values (
      p_user_id, v_refund, v_balance, 'book_package_refund', 'purchase_code', v_code.id,
      'Book package canceled'
    )
    returning id into v_ledger_id;

    -- The ledger trigger mirrored this as a generic credit line; give it its own.
    update public.account_activity
    set category = 'orders',
        type = 'book_package_refund',
        description = 'Canceled a book package. Unused value returned to your credit'
    where ledger_id = v_ledger_id;
  end if;

  return jsonb_build_object(
    'codeId', v_code.id,
    'refundCents', v_refund,
    'pagesUsed', v_made,
    'pagesBroughtIn', v_code.pages_brought_in,
    'pagesChargedCents', v_charged,
    'creditsBalanceCents', v_balance
  );
end;
$$;

revoke all on function public.cancel_book_package(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cancel_book_package(uuid, uuid) to service_role;
