-- Print-at-home books: a $1 digital PDF of the pages a user arranged.
-- Paid from the wallet in one step; the arrangement is kept on the order so the
-- PDF can be downloaded again at any time from My Orders.

alter table public.book_orders
  add column if not exists fulfillment text not null default 'print'
    check (fulfillment in ('print', 'digital')),
  add column if not exists digital_pages jsonb,
  add column if not exists digital_pdf_path text;

comment on column public.book_orders.fulfillment is
  'print = shipped by the printer; digital = print-at-home PDF.';
comment on column public.book_orders.digital_pages is
  'Digital orders: ordered page manifest (revision ids, rotation, mirror, blank/lined pages).';
comment on column public.book_orders.digital_pdf_path is
  'Digital orders: stored copy of the PDF in the library bucket, when it fit.';

insert into public.print_products (id, name, pod_package_id, min_pages, max_pages)
values (
  'coloring-book-digital-pdf',
  'Digital coloring book (print-at-home PDF)',
  'digital',
  1,
  800
)
on conflict (id) do nothing;

-- Charge the wallet and create the paid digital order in one transaction.
create or replace function public.create_digital_book_order(
  p_user_id uuid,
  p_order_id uuid,
  p_email text,
  p_title text,
  p_page_count integer,
  p_price_cents integer,
  p_pages jsonb,
  p_pdf_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  if p_price_cents <= 0 then
    raise exception 'price must be positive';
  end if;
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

  if v_balance < p_price_cents then
    raise exception 'insufficient credits';
  end if;

  v_balance := v_balance - p_price_cents;

  update public.profiles
  set credits_balance = v_balance
  where id = p_user_id;

  insert into public.book_orders (
    id, user_id, product_id, project_title, page_count, status, payment_method,
    total_cents, credits_applied, contact_email, fulfillment, digital_pages,
    digital_pdf_path, paid_at
  )
  values (
    p_order_id, p_user_id, 'coloring-book-digital-pdf', p_title, p_page_count,
    'paid', 'credits', p_price_cents, p_price_cents, p_email, 'digital', p_pages,
    p_pdf_path, now()
  );

  insert into public.credit_ledger (
    user_id, delta, balance_after, reason, reference_type, reference_id, note
  )
  values (
    p_user_id, -p_price_cents, v_balance, 'digital_book_payment',
    'book_order', p_order_id, 'Print-at-home book'
  );

  return jsonb_build_object(
    'orderId', p_order_id,
    'creditsBalanceCents', v_balance,
    'creditsAppliedCents', p_price_cents
  );
end;
$$;

revoke all on function public.create_digital_book_order(uuid, uuid, text, text, integer, integer, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.create_digital_book_order(uuid, uuid, text, text, integer, integer, jsonb, text)
  to service_role;

-- Same as 0014, plus a branch so digital purchases read correctly in activity.
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
