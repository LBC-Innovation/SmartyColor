-- Shipping paid up front with a book package.
--
-- On the package's Pay step the customer can enter the address the book goes to and pay its
-- standard shipping (and the tax Lulu adds to the order) in the same payment as the package.
-- The server quotes that amount live from Lulu and passes it in; it is kept on the package as
-- shipping_prepaid_cents. At book checkout purchaseCodeBookCoverage() adds it on top of the
-- printing the package already pays, so a book ordered as bought shows nothing left to pay.
--
-- Fund isolation still holds: the shipping is part of the one package payment (card straight to
-- the package, or one wallet debit), never wallet credit. package_price_cents is what the
-- customer paid in total (package + shipping), so a cancel before the book is ordered returns the
-- shipping with everything else; pages made are only ever charged against the package part.

alter table public.purchase_codes
  add column if not exists shipping_prepaid_cents integer not null default 0;

alter table public.purchase_codes
  drop constraint if exists purchase_codes_shipping_prepaid_check,
  add constraint purchase_codes_shipping_prepaid_check check (shipping_prepaid_cents >= 0);

comment on column public.purchase_codes.shipping_prepaid_cents is
  'Packages: standard shipping and tax paid with the package (included in package_price_cents). Applied at book checkout.';

-- ---------------------------------------------------------------------------------------------
-- Wallet purchase: as 0043, plus p_shipping_cents, debited in the same transaction.
-- ---------------------------------------------------------------------------------------------

drop function if exists public.buy_book_package_with_credits(uuid, text, text, integer);

create or replace function public.buy_book_package_with_credits(
  p_user_id uuid,
  p_binding_id text,
  p_project_name text default null,
  p_expected_price_cents integer default null,
  p_shipping_cents integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pkg public.book_packages%rowtype;
  v_balance integer;
  v_price integer;
  v_shipping integer := coalesce(p_shipping_cents, 0);
  v_total integer;
  v_name text;
  v_project_id uuid;
  v_code_id uuid := gen_random_uuid();
  v_code text;
  v_ledger_id uuid;
begin
  if v_shipping < 0 or v_shipping > 100000 then
    raise exception 'invalid shipping amount';
  end if;

  -- Profile first: the same lock order as every other wallet debit, so two spends serialize.
  select credits_balance into v_balance
  from public.profiles
  where id = p_user_id
  for update;
  if not found then
    raise exception 'profile not found';
  end if;

  select * into v_pkg
  from public.book_packages
  where binding_id = p_binding_id and active and price_cents is not null;
  if not found then
    raise exception 'package not available';
  end if;

  v_price := v_pkg.price_cents;
  if p_expected_price_cents is not null and p_expected_price_cents <> v_price then
    raise exception 'price changed';
  end if;
  v_total := v_price + v_shipping;

  if v_balance < v_total then
    raise exception 'insufficient credits';
  end if;

  v_balance := v_balance - v_total;
  update public.profiles set credits_balance = v_balance where id = p_user_id;

  v_name := left(coalesce(nullif(trim(p_project_name), ''), 'My book'), 80);
  insert into public.library_projects (user_id, name)
  values (p_user_id, v_name)
  returning id into v_project_id;

  v_code := 'PK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.purchase_codes (
    id, code, campaign, campaign_slug,
    included_pages, edits_per_page, portraits_per_page,
    binding_id, backs_included, shipping_level, max_book_cents,
    status, created_by, redeemed_by, redeemed_at, project_id,
    source, shipping_included, package_price_cents, paid_with, shipping_prepaid_cents
  )
  values (
    v_code_id, v_code, 'package', 'book-package',
    v_pkg.included_photos, v_pkg.edits_per_photo, 0,
    v_pkg.binding_id, true, 'MAIL', null,
    'active', p_user_id, p_user_id, now(), v_project_id,
    'package', false, v_total, 'credit', v_shipping
  );

  insert into public.credit_ledger (
    user_id, delta, balance_after, reason, reference_type, reference_id, note
  )
  values (
    p_user_id, -v_total, v_balance, 'book_package', 'purchase_code', v_code_id,
    case when v_shipping > 0 then 'Book package and shipping' else 'Book package' end
  )
  returning id into v_ledger_id;

  update public.account_activity
  set category = 'orders',
      type = 'book_package',
      description = case when v_shipping > 0 then 'Bought a book package with shipping' else 'Bought a book package' end
  where ledger_id = v_ledger_id;

  return jsonb_build_object(
    'codeId', v_code_id,
    'projectId', v_project_id,
    'bindingId', v_pkg.binding_id,
    'includedPhotos', v_pkg.included_photos,
    'editsPerPhoto', v_pkg.edits_per_photo,
    'priceCents', v_total,
    'shippingPrepaidCents', v_shipping,
    'creditsBalanceCents', v_balance,
    'created', true
  );
end;
$$;

revoke all on function public.buy_book_package_with_credits(uuid, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.buy_book_package_with_credits(uuid, text, text, integer, integer)
  to service_role;

-- ---------------------------------------------------------------------------------------------
-- Card purchase: as 0043, plus p_shipping_cents (the shipping line of the paid checkout, read by
-- the server from its metadata). p_amount_cents stays what Stripe collected in total.
-- ---------------------------------------------------------------------------------------------

drop function if exists public.create_book_package_from_stripe(text, uuid, text, integer, text, text, integer, integer);

create or replace function public.create_book_package_from_stripe(
  p_session_id text,
  p_user_id uuid,
  p_binding_id text,
  p_amount_cents integer,
  p_code text default null,
  p_project_name text default null,
  p_included_photos integer default null,
  p_edits_per_photo integer default null,
  p_shipping_cents integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.purchase_codes%rowtype;
  v_pkg public.book_packages%rowtype;
  v_included integer;
  v_edits integer;
  v_shipping integer := coalesce(p_shipping_cents, 0);
  v_name text;
  v_project_id uuid;
  v_code_id uuid := gen_random_uuid();
  v_code text;
begin
  if p_session_id is null or length(trim(p_session_id)) = 0 then
    raise exception 'session id is required';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'amount must be positive';
  end if;
  if v_shipping < 0 or v_shipping >= p_amount_cents then
    raise exception 'invalid shipping amount';
  end if;

  perform pg_advisory_xact_lock(hashtext('book_package:' || p_session_id));

  select * into v_existing from public.purchase_codes where stripe_session_id = p_session_id;
  if found then
    if v_existing.redeemed_by is distinct from p_user_id then
      raise exception 'checkout belongs to another account';
    end if;
    return jsonb_build_object(
      'codeId', v_existing.id,
      'projectId', v_existing.project_id,
      'bindingId', v_existing.binding_id,
      'includedPhotos', v_existing.included_pages,
      'editsPerPhoto', v_existing.edits_per_page,
      'priceCents', v_existing.package_price_cents,
      'shippingPrepaidCents', v_existing.shipping_prepaid_cents,
      'created', false
    );
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'profile not found';
  end if;

  select * into v_pkg from public.book_packages where binding_id = p_binding_id;
  if not found then
    raise exception 'package not available';
  end if;
  v_included := coalesce(p_included_photos, v_pkg.included_photos);
  v_edits := coalesce(p_edits_per_photo, v_pkg.edits_per_photo);
  if v_included not between 1 and 200 or v_edits not between 0 and 20 then
    raise exception 'invalid package contents';
  end if;

  v_name := left(coalesce(nullif(trim(p_project_name), ''), 'My book'), 80);
  insert into public.library_projects (user_id, name)
  values (p_user_id, v_name)
  returning id into v_project_id;

  v_code := coalesce(
    nullif(trim(p_code), ''),
    'PK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
  );

  insert into public.purchase_codes (
    id, code, campaign, campaign_slug,
    included_pages, edits_per_page, portraits_per_page,
    binding_id, backs_included, shipping_level, max_book_cents,
    status, created_by, redeemed_by, redeemed_at, project_id,
    source, shipping_included, package_price_cents, stripe_session_id, paid_with, shipping_prepaid_cents
  )
  values (
    v_code_id, v_code, 'package', 'book-package',
    v_included, v_edits, 0,
    p_binding_id, true, 'MAIL', null,
    'active', p_user_id, p_user_id, now(), v_project_id,
    'package', false, p_amount_cents, p_session_id, 'card', v_shipping
  );

  insert into public.account_activity (
    user_id, category, type, description, amount_cents, balance_after_cents,
    stripe_checkout_session_id, reference_type, reference_id
  )
  values (
    p_user_id, 'orders', 'book_package',
    case when v_shipping > 0 then 'Bought a book package with shipping by card' else 'Bought a book package by card' end,
    null, null, p_session_id, 'purchase_code', v_code_id
  );

  return jsonb_build_object(
    'codeId', v_code_id,
    'projectId', v_project_id,
    'bindingId', p_binding_id,
    'includedPhotos', v_included,
    'editsPerPhoto', v_edits,
    'priceCents', p_amount_cents,
    'shippingPrepaidCents', v_shipping,
    'created', true
  );
end;
$$;

revoke all on function public.create_book_package_from_stripe(text, uuid, text, integer, text, text, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.create_book_package_from_stripe(text, uuid, text, integer, text, text, integer, integer, integer)
  to service_role;

-- ---------------------------------------------------------------------------------------------
-- Refunds: as 0045, except pages made are charged against the package part only, so prepaid
-- shipping always comes back in full while the book has not been ordered.
-- ---------------------------------------------------------------------------------------------

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
  v_charged := least(greatest(coalesce(v_code.package_price_cents, 0) - v_code.shipping_prepaid_cents, 0), v_made * v_page_price);

  return jsonb_build_object(
    'codeId', v_code.id,
    'bindingId', v_code.binding_id,
    'pricePaidCents', coalesce(v_code.package_price_cents, 0),
    'pagesUsed', v_made,
    'pagesBroughtIn', v_code.pages_brought_in,
    'shippingPrepaidCents', v_code.shipping_prepaid_cents,
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
  v_charged := least(greatest(coalesce(v_code.package_price_cents, 0) - v_code.shipping_prepaid_cents, 0), v_made * v_page_price);
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
