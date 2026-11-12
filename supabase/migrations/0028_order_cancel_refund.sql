-- Customer/admin cancellation of a print order while Lulu still allows it, with the wallet refunded.

alter table public.book_orders
  add column if not exists cancel_reason text,
  add column if not exists refunded_cents integer,
  add column if not exists refunded_at timestamptz,
  -- When Lulu's production delay ends and the book can no longer be canceled.
  add column if not exists lulu_production_due_at timestamptz;

-- Marks the order canceled and puts what it charged back in the wallet, in one transaction.
-- Safe to call again: an order that is already canceled is only refunded if it wasn't yet.
create or replace function public.cancel_and_refund_book_order(
  p_order_id uuid,
  p_canceled_by uuid,
  p_reason text,
  p_allowed_statuses text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.book_orders%rowtype;
  v_balance integer;
  v_refund integer := 0;
begin
  select * into v_order
  from public.book_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'order not found';
  end if;

  if v_order.status <> 'canceled' then
    if not (v_order.status::text = any (p_allowed_statuses)) then
      raise exception 'order cannot be canceled from status %', v_order.status;
    end if;

    update public.book_orders
    set
      status = 'canceled',
      canceled_at = coalesce(canceled_at, now()),
      canceled_by = p_canceled_by,
      cancel_reason = nullif(trim(p_reason), ''),
      quote_expires_at = null,
      updated_at = now()
    where id = p_order_id;
  else
    -- Already canceled (e.g. a status sync saw Lulu's cancel first): keep who and why.
    update public.book_orders
    set
      canceled_at = coalesce(canceled_at, now()),
      canceled_by = coalesce(canceled_by, p_canceled_by),
      cancel_reason = coalesce(cancel_reason, nullif(trim(p_reason), ''))
    where id = p_order_id;
  end if;

  if v_order.refunded_at is null
     and v_order.paid_at is not null
     and coalesce(v_order.credits_applied, 0) > 0 then
    v_refund := v_order.credits_applied;

    select credits_balance into v_balance
    from public.profiles
    where id = v_order.user_id
    for update;

    if not found then
      raise exception 'profile not found';
    end if;

    v_balance := v_balance + v_refund;

    update public.profiles
    set credits_balance = v_balance
    where id = v_order.user_id;

    insert into public.credit_ledger (
      user_id, delta, balance_after, reason, reference_type, reference_id, created_by, note
    )
    values (
      v_order.user_id, v_refund, v_balance, 'order_refund', 'book_order', p_order_id,
      p_canceled_by, 'Canceled book order'
    );

    update public.book_orders
    set refunded_cents = v_refund, refunded_at = now()
    where id = p_order_id;
  end if;

  return jsonb_build_object(
    'orderId', p_order_id,
    'status', 'canceled',
    'refundedCents', v_refund,
    'creditsBalanceCents', v_balance
  );
end;
$$;

revoke all on function public.cancel_and_refund_book_order(uuid, uuid, text, text[])
  from public, anon, authenticated;
grant execute on function public.cancel_and_refund_book_order(uuid, uuid, text, text[])
  to service_role;

-- Same as 0022, plus an 'order_refund' entry shown as a refund under Orders.
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
    when 'order_refund' then
      select nullif(trim(project_title), '') into v_name
      from public.book_orders
      where id = p_entry.reference_id;
      v_category := 'orders';
      v_type := 'refund';
      v_description := case
        when v_name is null then 'Refund for a canceled book order'
        else format('Refund for canceled book “%s”', v_name)
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
