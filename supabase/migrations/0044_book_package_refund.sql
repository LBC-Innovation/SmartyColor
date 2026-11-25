-- Book package refunds: a customer can cancel a book package they haven't used for a book yet.
--
-- Rule: refund = what they paid − (pages made × the catalog price of one new page), never below 0,
-- paid back to the wallet (store credit) for both card and credit purchases. The pages they made
-- are charged exactly what pay-as-you-go would have charged, so a package can't be used to make
-- pages cheaper, and everything unused (including the printing) comes back.
--
--   * Only the person who bought it, only while it is active and no book order holds it.
--   * One transaction, locked in the same order as every wallet charge (profile, then package),
--     so a double tap refunds once and a page being made at the same moment can't slip past.
--   * The package is voided: purchase_code_covers() only pays for 'active' codes, so from here
--     on the album's pages are ordinary wallet charges.
--   * The album itself is untouched here; the app deletes it afterwards when that was the choice.

alter table public.purchase_codes
  add column if not exists refunded_at timestamptz,
  add column if not exists refund_cents integer;

alter table public.purchase_codes
  drop constraint if exists purchase_codes_refund_cents_check,
  add constraint purchase_codes_refund_cents_check check (refund_cents is null or refund_cents >= 0);

comment on column public.purchase_codes.refunded_at is 'When a book package was canceled and its unused value returned to the wallet.';
comment on column public.purchase_codes.refund_cents is 'What the cancel returned to the wallet: package price minus pages made at the page price.';

-- What canceling would return right now, without changing anything. Same rule as the cancel.
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
  v_charged := least(coalesce(v_code.package_price_cents, 0), v_code.pages_used * v_page_price);

  return jsonb_build_object(
    'codeId', v_code.id,
    'bindingId', v_code.binding_id,
    'pricePaidCents', coalesce(v_code.package_price_cents, 0),
    'pagesUsed', v_code.pages_used,
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
  v_charged := least(coalesce(v_code.package_price_cents, 0), v_code.pages_used * v_page_price);
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
    'pagesUsed', v_code.pages_used,
    'pagesChargedCents', v_charged,
    'creditsBalanceCents', v_balance
  );
end;
$$;

revoke all on function public.cancel_book_package(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cancel_book_package(uuid, uuid) to service_role;
