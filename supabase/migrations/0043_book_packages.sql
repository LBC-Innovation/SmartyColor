-- Book packages and design themes.
--
-- A Book Package is a purchase code (0037) the customer buys for themselves. It is bound to one
-- album at purchase and reuses the same allowance machinery: purchase_code_covers() inside
-- charge_photo_usage() pays for included pages and edits before the wallet is touched, and
-- place_book_order_with_credits() charges the wallet only total - covered_cents.
--
-- Fund isolation (the rule that must never break):
--   * The package price is paid ONCE, at purchase, either by card (Stripe straight to the package;
--     no wallet row is written) or from the wallet (one transaction: debit + album + package).
--   * After that the package is an allowance, not a balance. Nothing here can turn it back into
--     wallet credit, and the wallet cannot draw it down except through purchase_code_covers().
--   * Anything past the allowance (more photos, more edits, shipping, a different binding) is a
--     normal wallet charge.
--
-- NOT APPLIED by the agent that wrote it. The owner applies it.

-- ---------------------------------------------------------------------------------------------
-- Catalog: what each binding's package includes and costs. Owner-edited on /admin/pricing.
-- price_cents null = hidden (no tile is shown until the owner sets a price).
-- ---------------------------------------------------------------------------------------------

create table if not exists public.book_packages (
  binding_id      text primary key check (binding_id in ('saddle_stitch', 'coil_bound', 'perfect_bound')),
  included_photos integer not null check (included_photos between 1 and 200),
  edits_per_photo integer not null default 2 check (edits_per_photo between 0 and 20),
  price_cents     integer check (price_cents is null or price_cents > 0),
  active          boolean not null default true,
  sort_order      integer not null default 0,
  updated_at      timestamptz not null default now()
);

comment on table public.book_packages is
  'Book package catalog. price_cents null hides the package. Edited on /admin/pricing.';

insert into public.book_packages (binding_id, included_photos, edits_per_photo, price_cents, active, sort_order)
values
  ('saddle_stitch', 20, 2, null, true, 10),
  ('coil_bound',    30, 2, null, true, 20),
  ('perfect_bound', 40, 2, null, true, 30)
on conflict (binding_id) do nothing;

drop trigger if exists book_packages_set_updated_at on public.book_packages;
create trigger book_packages_set_updated_at
  before update on public.book_packages
  for each row
  execute function public.set_updated_at();

-- Server-only table: customers see packages through the API, never the table.
alter table public.book_packages enable row level security;
grant select, insert, update, delete on table public.book_packages to service_role;

-- ---------------------------------------------------------------------------------------------
-- purchase_codes: package rows
-- ---------------------------------------------------------------------------------------------

alter table public.purchase_codes
  add column if not exists source text not null default 'admin',
  add column if not exists shipping_included boolean not null default true,
  add column if not exists package_price_cents integer,
  add column if not exists stripe_session_id text,
  add column if not exists paid_with text;

alter table public.purchase_codes
  drop constraint if exists purchase_codes_source_check,
  add constraint purchase_codes_source_check check (source in ('admin', 'package')),
  drop constraint if exists purchase_codes_paid_with_check,
  add constraint purchase_codes_paid_with_check check (paid_with is null or paid_with in ('card', 'credit')),
  drop constraint if exists purchase_codes_package_price_check,
  add constraint purchase_codes_package_price_check check (package_price_cents is null or package_price_cents > 0);

-- One package per Stripe checkout: this is what makes a double confirm impossible to double-create.
create unique index if not exists purchase_codes_stripe_session_idx
  on public.purchase_codes (stripe_session_id) where stripe_session_id is not null;
create index if not exists purchase_codes_source_idx on public.purchase_codes (source, created_at desc);

comment on column public.purchase_codes.source is
  'admin = created on /admin/purchase-codes (gift); package = bought by the customer for their own album.';
comment on column public.purchase_codes.shipping_included is
  'False for packages: the code pays the book''s printing only; shipping and its tax come from the wallet.';
comment on column public.purchase_codes.package_price_cents is 'What the customer paid for the package.';
comment on column public.purchase_codes.stripe_session_id is 'Stripe checkout that paid for the package (card path).';
comment on column public.purchase_codes.paid_with is 'card or credit (wallet), for package rows.';

-- ---------------------------------------------------------------------------------------------
-- Design themes
-- ---------------------------------------------------------------------------------------------

alter table public.library_projects
  add column if not exists design_theme text;

alter table public.library_projects
  drop constraint if exists library_projects_design_theme_check,
  add constraint library_projects_design_theme_check
    check (design_theme is null or char_length(design_theme) <= 200);

comment on column public.library_projects.design_theme is
  'Album-wide theme: new coloring pages from this album are drawn in this world. Untrusted text, max 200.';

-- ---------------------------------------------------------------------------------------------
-- Buying a package from the wallet: one transaction.
-- Locks the profile, reads the price from the catalog (never from the caller), checks the
-- balance, debits it with a ledger row, creates the album and the package row.
-- p_expected_price_cents is only a guard: when given and different from the catalog price the
-- purchase is refused ('price changed'); it never sets the price.
-- ---------------------------------------------------------------------------------------------

create or replace function public.buy_book_package_with_credits(
  p_user_id uuid,
  p_binding_id text,
  p_project_name text default null,
  p_expected_price_cents integer default null
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
  v_name text;
  v_project_id uuid;
  v_code_id uuid := gen_random_uuid();
  v_code text;
  v_ledger_id uuid;
begin
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

  if v_balance < v_price then
    raise exception 'insufficient credits';
  end if;

  v_balance := v_balance - v_price;
  update public.profiles set credits_balance = v_balance where id = p_user_id;

  v_name := left(coalesce(nullif(trim(p_project_name), ''), 'My book'), 80);
  insert into public.library_projects (user_id, name)
  values (p_user_id, v_name)
  returning id into v_project_id;

  -- The customer never sees or types this code; it only has to be unique and pass the code check.
  v_code := 'PK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.purchase_codes (
    id, code, campaign, campaign_slug,
    included_pages, edits_per_page, portraits_per_page,
    binding_id, backs_included, shipping_level, max_book_cents,
    status, created_by, redeemed_by, redeemed_at, project_id,
    source, shipping_included, package_price_cents, paid_with
  )
  values (
    v_code_id, v_code, 'package', 'book-package',
    v_pkg.included_photos, v_pkg.edits_per_photo, 0,
    v_pkg.binding_id, true, 'MAIL', null,
    'active', p_user_id, p_user_id, now(), v_project_id,
    'package', false, v_price, 'credit'
  );

  insert into public.credit_ledger (
    user_id, delta, balance_after, reason, reference_type, reference_id, note
  )
  values (
    p_user_id, -v_price, v_balance, 'book_package', 'purchase_code', v_code_id,
    'Book package'
  )
  returning id into v_ledger_id;

  -- The ledger trigger mirrored this into account_activity as a generic credit adjustment.
  -- Give it its own line.
  update public.account_activity
  set category = 'orders',
      type = 'book_package',
      description = 'Bought a book package'
  where ledger_id = v_ledger_id;

  return jsonb_build_object(
    'codeId', v_code_id,
    'projectId', v_project_id,
    'bindingId', v_pkg.binding_id,
    'includedPhotos', v_pkg.included_photos,
    'editsPerPhoto', v_pkg.edits_per_photo,
    'priceCents', v_price,
    'creditsBalanceCents', v_balance,
    'created', true
  );
end;
$$;

revoke all on function public.buy_book_package_with_credits(uuid, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.buy_book_package_with_credits(uuid, text, text, integer)
  to service_role;

-- ---------------------------------------------------------------------------------------------
-- Creating the package for a paid Stripe checkout. Idempotent on the checkout id: the webhook and
-- the return page both call it, in any order, any number of times, and exactly one package exists.
-- NO wallet movement: card money never enters the wallet, so there is no credit_ledger row.
-- p_amount_cents is what Stripe actually collected (the server read it from the paid session).
-- p_included_photos / p_edits_per_photo carry what the checkout was sold with (session metadata),
-- so a catalog edit between checkout and payment cannot change what a paid customer gets.
-- ---------------------------------------------------------------------------------------------

create or replace function public.create_book_package_from_stripe(
  p_session_id text,
  p_user_id uuid,
  p_binding_id text,
  p_amount_cents integer,
  p_code text default null,
  p_project_name text default null,
  p_included_photos integer default null,
  p_edits_per_photo integer default null
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

  -- Serialize every call for this checkout (webhook vs return page).
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
    source, shipping_included, package_price_cents, stripe_session_id, paid_with
  )
  values (
    v_code_id, v_code, 'package', 'book-package',
    v_included, v_edits, 0,
    p_binding_id, true, 'MAIL', null,
    'active', p_user_id, p_user_id, now(), v_project_id,
    'package', false, p_amount_cents, p_session_id, 'card'
  );

  -- Receipt line in the account history. amount_cents stays null: the wallet was not touched.
  insert into public.account_activity (
    user_id, category, type, description, amount_cents, balance_after_cents,
    stripe_checkout_session_id, reference_type, reference_id
  )
  values (
    p_user_id, 'orders', 'book_package', 'Bought a book package by card', null, null,
    p_session_id, 'purchase_code', v_code_id
  );

  return jsonb_build_object(
    'codeId', v_code_id,
    'projectId', v_project_id,
    'bindingId', p_binding_id,
    'includedPhotos', v_included,
    'editsPerPhoto', v_edits,
    'priceCents', p_amount_cents,
    'created', true
  );
end;
$$;

revoke all on function public.create_book_package_from_stripe(text, uuid, text, integer, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.create_book_package_from_stripe(text, uuid, text, integer, text, text, integer, integer)
  to service_role;
