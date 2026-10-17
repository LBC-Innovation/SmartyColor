-- Price catalog: every action that costs the customer money is priced here,
-- from what it costs us (COGS) plus a markup, and edited on /admin/pricing.
--
--   list price = max(ceil(cost × (1 + markup% / 100)), minimum price)
--
-- AI actions and the digital book have a fixed unit cost the admin keeps up to
-- date (the page shows the observed AI cost to set it from). Printed books are
-- priced per order from Lulu's live quote: the markup applies to the book
-- (print + Lulu's fulfillment fee); shipping and tax pass through at cost.
--
-- Charges read the price inside the database, so what the wallet is charged can
-- never drift from the catalog. The 0013/0016/0018 functions that took a price
-- from the API stay until the app no longer calls them (drop in a later migration).

create table if not exists public.price_items (
  sku             text primary key check (sku ~ '^[a-z0-9_]+(\.[a-z0-9_]+)*$'),
  category        text not null check (category in ('ai', 'digital', 'print')),
  name            text not null,
  description     text,
  cost_basis      text not null check (cost_basis in ('fixed', 'lulu_quote')),
  -- What one unit costs us, in USD cents with sub-cent precision (AI calls cost fractions of a cent).
  unit_cost_cents numeric(12, 4) check (unit_cost_cents >= 0),
  -- Markup on cost. Never negative: the catalog cannot sell below cost.
  markup_pct      numeric(7, 2) not null default 0 check (markup_pct between 0 and 1000),
  -- Floor on the list price (for items whose cost is near zero, like a PDF).
  min_price_cents integer not null default 0 check (min_price_cents between 0 and 100000),
  -- Uses given free before charging (per coloring sheet for edits).
  free_quota      integer not null default 0 check (free_quota between 0 and 100),
  -- Off = the customer is not charged and we absorb the cost.
  billable        boolean not null default true,
  -- Which vision_usage_events.operation measures this item's real cost.
  ai_operation    text,
  -- Print items: the Lulu binding this prices.
  binding_id      text,
  sort_order      integer not null default 0,
  list_price_cents integer generated always as (
    case
      when cost_basis = 'fixed'
        then greatest(ceil(unit_cost_cents * (1 + markup_pct / 100))::integer, min_price_cents)
    end
  ) stored,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users (id) on delete set null,
  constraint price_items_fixed_has_cost check (cost_basis <> 'fixed' or unit_cost_cents is not null),
  constraint price_items_print_has_binding check (category <> 'print' or binding_id is not null)
);

comment on table public.price_items is
  'Price catalog: cost of goods + markup = list price for every billable action. Edited on /admin/pricing.';
comment on column public.price_items.unit_cost_cents is
  'COGS per unit in USD cents (4 decimals). Null for lulu_quote items, which are costed per order.';
comment on column public.price_items.list_price_cents is
  'What the wallet is charged per unit (fixed items). Print items are priced per order from the Lulu quote.';

drop trigger if exists price_items_set_updated_at on public.price_items;
create trigger price_items_set_updated_at
  before update on public.price_items
  for each row
  execute function public.set_updated_at();

-- Every change to a price is kept, with who made it.
create table if not exists public.price_item_changes (
  id         uuid primary key default gen_random_uuid(),
  sku        text not null references public.price_items (sku) on delete cascade,
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users (id) on delete set null,
  old_values jsonb,
  new_values jsonb not null
);

create index if not exists price_item_changes_sku_idx
  on public.price_item_changes (sku, changed_at desc);

create or replace function public.log_price_item_change()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
begin
  v_new := jsonb_build_object(
    'unit_cost_cents', new.unit_cost_cents,
    'markup_pct', new.markup_pct,
    'min_price_cents', new.min_price_cents,
    'free_quota', new.free_quota,
    'billable', new.billable,
    'list_price_cents', new.list_price_cents
  );
  if tg_op = 'UPDATE' then
    v_old := jsonb_build_object(
      'unit_cost_cents', old.unit_cost_cents,
      'markup_pct', old.markup_pct,
      'min_price_cents', old.min_price_cents,
      'free_quota', old.free_quota,
      'billable', old.billable,
      'list_price_cents', old.list_price_cents
    );
    if v_old = v_new then
      return new;
    end if;
  end if;
  insert into public.price_item_changes (sku, changed_by, old_values, new_values)
  values (new.sku, new.updated_by, v_old, v_new);
  return new;
end;
$$;

drop trigger if exists price_items_log_change on public.price_items;
create trigger price_items_log_change
  after insert or update on public.price_items
  for each row
  execute function public.log_price_item_change();

-- Server-only tables: the API reads and writes them with the service role.
alter table public.price_items enable row level security;
alter table public.price_item_changes enable row level security;
grant select, insert, update on table public.price_items to service_role;
grant select, insert on table public.price_item_changes to service_role;

-- Starting catalog. AI costs are the 30-day p90 of vision_usage_events (Oct 2026),
-- so a typical call is covered; the digital book keeps its $1.00 price via the floor.
insert into public.price_items
  (sku, category, name, description, cost_basis, unit_cost_cents, markup_pct, min_price_cents, free_quota, billable, ai_operation, binding_id, sort_order)
values
  ('ai.sheet_generation', 'ai', 'Create coloring sheet', 'Turn a photo into a coloring sheet.',
   'fixed', 12.5000, 40, 0, 0, true, 'photoToColoring', null, 10),
  ('ai.sheet_edit', 'ai', 'Edit coloring sheet', 'An AI touch-up of a coloring sheet. Each sheet gets a few free.',
   'fixed', 12.7000, 40, 0, 3, true, 'correctPhotoColoring', null, 20),
  ('ai.photo_portrait', 'ai', 'Convert photo to portrait', 'An AI portrait version of a landscape photo.',
   'fixed', 12.4000, 40, 0, 0, true, 'photoToPortrait', null, 30),
  ('ai.storybook_chat', 'ai', 'Story book photo chat', 'One message in the story book photo chat.',
   'fixed', 0.5000, 40, 0, 0, false, 'storybookPhotoChat', null, 40),
  ('ai.storybook_generate', 'ai', 'Write story book', 'Write the illustrated story for an album.',
   'fixed', 2.0000, 40, 0, 0, false, 'storybookGenerate', null, 50),
  ('book.digital', 'digital', 'Digital download (PDF)', 'Print-at-home PDF of an arranged book.',
   'fixed', 1.0000, 0, 100, 0, true, null, null, 60),
  ('book.print.saddle_stitch', 'print', 'Printed book · stapled booklet', 'Lulu saddle stitch, 8.5×11 B&W, 4–48 pages.',
   'lulu_quote', null, 20, 0, 0, true, null, 'saddle_stitch', 70),
  ('book.print.coil_bound', 'print', 'Printed book · spiral bound', 'Lulu coil bound, 8.5×11 B&W, 2–470 pages.',
   'lulu_quote', null, 20, 0, 0, true, null, 'coil_bound', 80),
  ('book.print.perfect_bound', 'print', 'Printed book · paperback', 'Lulu perfect bound, 8.5×11 B&W, 32–800 pages.',
   'lulu_quote', null, 20, 0, 0, true, null, 'perfect_bound', 90)
on conflict (sku) do nothing;

-- What was sold, at what cost, recorded with each charge so margin can be reported later.
alter table public.credit_ledger
  add column if not exists price_sku text references public.price_items (sku),
  add column if not exists cogs_cents numeric(12, 4);

comment on column public.credit_ledger.price_sku is 'Catalog item this charge was for.';
comment on column public.credit_ledger.cogs_cents is 'Our cost for what was sold, in USD cents, at the time of the charge.';

alter table public.book_orders
  add column if not exists price_sku text references public.price_items (sku),
  add column if not exists markup_pct numeric(7, 2),
  add column if not exists markup_cents integer;

comment on column public.book_orders.lulu_cost_cents is
  'Print orders: Lulu''s quoted total (print, fulfillment, shipping, tax) in USD cents — our cost.';
comment on column public.book_orders.subtotal_cents is 'Print orders: the book price charged, markup included.';
comment on column public.book_orders.markup_cents is 'Print orders: our markup on the book, in USD cents.';

-- One priced action on a photo: a sheet generation, a sheet edit, or a portrait version.
create or replace function public.charge_photo_usage(
  p_user_id uuid,
  p_photo_id uuid,
  p_kind text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sku text;
  v_item public.price_items%rowtype;
  v_balance integer;
  v_edit_count integer;
  v_cost integer;
begin
  v_sku := case p_kind
    when 'generation' then 'ai.sheet_generation'
    when 'edit' then 'ai.sheet_edit'
    when 'portrait' then 'ai.photo_portrait'
  end;
  if v_sku is null then
    raise exception 'unknown usage kind';
  end if;

  select * into v_item from public.price_items where sku = v_sku;
  if not found or v_item.list_price_cents is null then
    raise exception 'price not configured for %', v_sku;
  end if;

  select credits_balance into v_balance
  from public.profiles
  where id = p_user_id
  for update;
  if not found then
    raise exception 'profile not found';
  end if;

  select edit_count into v_edit_count
  from public.library_photos
  where id = p_photo_id
  for update;
  if not found then
    raise exception 'photo not found';
  end if;

  v_cost := case when v_item.billable then v_item.list_price_cents else 0 end;
  if p_kind = 'edit' and v_edit_count < v_item.free_quota then
    v_cost := 0;
  end if;

  if v_balance < v_cost then
    raise exception 'insufficient credits';
  end if;

  if p_kind = 'edit' then
    v_edit_count := v_edit_count + 1;
    update public.library_photos set edit_count = v_edit_count where id = p_photo_id;
  end if;

  if v_cost > 0 then
    v_balance := v_balance - v_cost;
    update public.profiles set credits_balance = v_balance where id = p_user_id;

    insert into public.credit_ledger (
      user_id, delta, balance_after, reason, reference_type, reference_id, price_sku, cogs_cents
    )
    values (
      p_user_id, -v_cost, v_balance,
      case p_kind
        when 'edit' then 'sheet_edit'
        when 'portrait' then 'photo_portrait'
        else 'sheet_generation'
      end,
      'library_photo', p_photo_id, v_sku, v_item.unit_cost_cents
    );
  end if;

  return jsonb_build_object(
    'chargedCents', v_cost,
    'creditsBalanceCents', v_balance,
    'editCount', v_edit_count
  );
end;
$$;

revoke all on function public.charge_photo_usage(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.charge_photo_usage(uuid, uuid, text) to service_role;

-- One priced action that isn't tied to a photo (story book AI). Free when the item isn't billable.
create or replace function public.charge_wallet_usage(
  p_user_id uuid,
  p_sku text,
  p_reference_type text default null,
  p_reference_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.price_items%rowtype;
  v_balance integer;
  v_cost integer;
begin
  select * into v_item from public.price_items where sku = p_sku;
  if not found or v_item.list_price_cents is null then
    raise exception 'price not configured for %', p_sku;
  end if;

  select credits_balance into v_balance
  from public.profiles
  where id = p_user_id
  for update;
  if not found then
    raise exception 'profile not found';
  end if;

  v_cost := case when v_item.billable then v_item.list_price_cents else 0 end;
  if v_balance < v_cost then
    raise exception 'insufficient credits';
  end if;

  if v_cost > 0 then
    v_balance := v_balance - v_cost;
    update public.profiles set credits_balance = v_balance where id = p_user_id;

    insert into public.credit_ledger (
      user_id, delta, balance_after, reason, reference_type, reference_id, note, price_sku, cogs_cents
    )
    values (
      p_user_id, -v_cost, v_balance, 'ai_usage', p_reference_type, p_reference_id,
      v_item.name, p_sku, v_item.unit_cost_cents
    );
  end if;

  return jsonb_build_object('chargedCents', v_cost, 'creditsBalanceCents', v_balance);
end;
$$;

revoke all on function public.charge_wallet_usage(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.charge_wallet_usage(uuid, text, text, uuid) to service_role;

-- Same as 0016's create_digital_book_order, with the price read from the catalog.
create or replace function public.purchase_digital_book(
  p_user_id uuid,
  p_order_id uuid,
  p_email text,
  p_title text,
  p_page_count integer,
  p_pages jsonb,
  p_pdf_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.price_items%rowtype;
  v_price integer;
  v_balance integer;
begin
  select * into v_item from public.price_items where sku = 'book.digital';
  if not found or v_item.list_price_cents is null then
    raise exception 'price not configured for book.digital';
  end if;
  v_price := case when v_item.billable then v_item.list_price_cents else 0 end;
  if p_page_count < 1 then
    raise exception 'page count must be positive';
  end if;

  select credits_balance into v_balance
  from public.profiles
  where id = p_user_id
  for update;
  if not found then
    raise exception 'profile not found';
  end if;

  if v_balance < v_price then
    raise exception 'insufficient credits';
  end if;

  v_balance := v_balance - v_price;
  update public.profiles set credits_balance = v_balance where id = p_user_id;

  insert into public.book_orders (
    id, user_id, product_id, project_title, page_count, status, payment_method,
    total_cents, subtotal_cents, credits_applied, contact_email, fulfillment, digital_pages,
    digital_pdf_path, paid_at, price_sku
  )
  values (
    p_order_id, p_user_id, 'coloring-book-digital-pdf', p_title, p_page_count,
    'paid', 'credits', v_price, v_price, v_price, p_email, 'digital', p_pages,
    p_pdf_path, now(), 'book.digital'
  );

  if v_price > 0 then
    insert into public.credit_ledger (
      user_id, delta, balance_after, reason, reference_type, reference_id, note, price_sku, cogs_cents
    )
    values (
      p_user_id, -v_price, v_balance, 'digital_book_payment',
      'book_order', p_order_id, 'Print-at-home book', 'book.digital', v_item.unit_cost_cents
    );
  end if;

  return jsonb_build_object(
    'orderId', p_order_id,
    'creditsBalanceCents', v_balance,
    'creditsAppliedCents', v_price
  );
end;
$$;

revoke all on function public.purchase_digital_book(uuid, uuid, text, text, integer, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.purchase_digital_book(uuid, uuid, text, text, integer, jsonb, text)
  to service_role;

-- Same as 0009, plus: never take payment for a print order priced below what Lulu charges us,
-- and record the order's cost and catalog item on its ledger entry.
create or replace function public.place_book_order_with_credits(
  p_user_id uuid,
  p_order_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.book_orders%rowtype;
  v_balance integer;
  v_total integer;
begin
  select * into v_order
  from public.book_orders
  where id = p_order_id
    and user_id = p_user_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'order not found';
  end if;

  if v_order.status <> 'awaiting_payment' then
    raise exception 'order is not awaiting payment';
  end if;

  v_total := v_order.total_cents;
  if v_total is null or v_total <= 0 then
    raise exception 'order total is not set';
  end if;
  if v_order.lulu_cost_cents is not null and v_total < v_order.lulu_cost_cents then
    raise exception 'order priced below cost';
  end if;

  select credits_balance into v_balance
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'profile not found';
  end if;

  if v_balance < v_total then
    raise exception 'insufficient credits';
  end if;

  v_balance := v_balance - v_total;

  update public.profiles
  set credits_balance = v_balance
  where id = p_user_id;

  insert into public.credit_ledger (
    user_id, delta, balance_after, reason, reference_type, reference_id, note, price_sku, cogs_cents
  )
  values (
    p_user_id, -v_total, v_balance, 'order_payment', 'book_order', p_order_id,
    'Book order payment', v_order.price_sku, v_order.lulu_cost_cents
  );

  update public.book_orders
  set
    status = 'paid',
    payment_method = 'credits',
    credits_applied = v_total,
    paid_at = now(),
    updated_at = now()
  where id = p_order_id;

  return jsonb_build_object(
    'orderId', p_order_id,
    'status', 'paid',
    'creditsBalanceCents', v_balance,
    'creditsAppliedCents', v_total
  );
end;
$$;

revoke all on function public.place_book_order_with_credits(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.place_book_order_with_credits(uuid, uuid)
  to service_role;

-- Same as 0018, plus a branch so story book AI charges read correctly in activity.
create or replace function public.record_ledger_activity(p_entry public.credit_ledger)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_category text := 'wallet';
  v_type text;
  v_description text;
  v_name text;
  v_note text := nullif(trim(p_entry.note), '');
begin
  case p_entry.reason
    when 'stripe_purchase' then
      v_type := 'funds_added';
      v_description := 'Added funds by card';
    when 'order_payment' then
      select nullif(trim(project_title), '') into v_name
      from public.book_orders
      where id = p_entry.reference_id;
      v_category := 'orders';
      v_type := 'book_ordered';
      v_description := case
        when v_name is null then 'Ordered a printed book'
        else format('Ordered printed book “%s”', v_name)
      end;
    when 'digital_book_payment' then
      select nullif(trim(project_title), '') into v_name
      from public.book_orders
      where id = p_entry.reference_id;
      v_category := 'orders';
      v_type := 'digital_book_ordered';
      v_description := case
        when v_name is null then 'Bought a print-at-home book'
        else format('Bought print-at-home book “%s”', v_name)
      end;
    when 'sheet_generation', 'sheet_edit' then
      select nullif(trim(file_name), '') into v_name
      from public.library_photos
      where id = p_entry.reference_id;
      v_category := 'sheets';
      if p_entry.reason = 'sheet_edit' then
        v_type := 'sheet_edited';
        v_description := case
          when v_name is null then 'Edited a coloring sheet'
          else format('Edited the coloring sheet for “%s”', v_name)
        end;
      else
        v_type := 'sheet_generated';
        v_description := case
          when v_name is null then 'Generated a coloring sheet'
          else format('Generated a coloring sheet from “%s”', v_name)
        end;
      end if;
    when 'photo_portrait' then
      select nullif(trim(file_name), '') into v_name
      from public.library_photos
      where id = p_entry.reference_id;
      v_category := 'photos';
      v_type := 'photo_portrait';
      v_description := case
        when v_name is null then 'Made a portrait version of a photo'
        else format('Made a portrait version of “%s”', v_name)
      end;
    when 'ai_usage' then
      v_category := 'albums';
      v_type := 'ai_usage';
      v_description := coalesce(v_note, 'Used an AI feature');
    when 'usage_refund' then
      v_type := 'refund';
      v_description := case when v_note is null then 'Refund' else 'Refund: ' || v_note end;
    else
      if p_entry.delta >= 0 then
        v_type := 'credit_granted';
        v_description := coalesce(v_note, 'Credit added by Colorful Memories');
      else
        v_type := 'credit_removed';
        v_description := coalesce(v_note, 'Credit adjustment by Colorful Memories');
      end if;
  end case;

  insert into public.account_activity (
    user_id, category, type, description, amount_cents, balance_after_cents,
    ledger_id, reference_type, reference_id, occurred_at
  )
  values (
    p_entry.user_id, v_category, v_type, v_description, p_entry.delta,
    p_entry.balance_after, p_entry.id, p_entry.reference_type,
    p_entry.reference_id, p_entry.created_at
  )
  on conflict (ledger_id) do nothing;
end;
$$;

revoke all on function public.record_ledger_activity(public.credit_ledger)
  from public, anon, authenticated;
