-- Card-paid book packages: record what was paid on the customer's activity line.
--
-- create_book_package_from_stripe (0047) wrote its account_activity row with amount_cents null,
-- so the purchase showed in the customer's history and the admin user history with no amount.
-- Card money never enters the wallet, so there is still no credit_ledger row and no balance:
-- amount_cents is the amount charged, negative like every other purchase line
-- (a wallet-paid package shows -price too), and balance_after_cents stays null.
--
-- Same function as 0047 with only the activity insert changed, plus a backfill of the rows
-- already written.

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
    -p_amount_cents, null, p_session_id, 'purchase_code', v_code_id
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

-- Backfill: card-paid packages bought before this migration.
update public.account_activity a
set amount_cents = -c.package_price_cents
from public.purchase_codes c
where a.type = 'book_package'
  and a.reference_type = 'purchase_code'
  and a.reference_id = c.id
  and a.amount_cents is null
  and c.source = 'package'
  and c.paid_with = 'card';
