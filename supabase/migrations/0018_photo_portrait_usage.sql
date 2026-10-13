-- Portrait versions of landscape photos: an AI action paid from the wallet at the
-- price of generating a sheet (src/lib/credits/pricing.ts). Adds the 'portrait'
-- usage kind to the 0013 charge/refund functions and names it in account activity.

-- Same as 0013, plus the 'portrait' kind. The charge is recorded against the source photo.
create or replace function public.charge_sheet_usage(
  p_user_id uuid,
  p_photo_id uuid,
  p_kind text,
  p_price_cents integer,
  p_free_edits integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_edit_count integer;
  v_cost integer;
begin
  if p_kind not in ('generation', 'edit', 'portrait') then
    raise exception 'unknown usage kind';
  end if;
  if p_price_cents < 0 then
    raise exception 'price must not be negative';
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

  v_cost := p_price_cents;
  if p_kind = 'edit' and v_edit_count < p_free_edits then
    v_cost := 0;
  end if;

  if v_balance < v_cost then
    raise exception 'insufficient credits';
  end if;

  if p_kind = 'edit' then
    v_edit_count := v_edit_count + 1;
    update public.library_photos
    set edit_count = v_edit_count
    where id = p_photo_id;
  end if;

  if v_cost > 0 then
    v_balance := v_balance - v_cost;

    update public.profiles
    set credits_balance = v_balance
    where id = p_user_id;

    insert into public.credit_ledger (
      user_id,
      delta,
      balance_after,
      reason,
      reference_type,
      reference_id
    )
    values (
      p_user_id,
      -v_cost,
      v_balance,
      case p_kind
        when 'edit' then 'sheet_edit'
        when 'portrait' then 'photo_portrait'
        else 'sheet_generation'
      end,
      'library_photo',
      p_photo_id
    );
  end if;

  return jsonb_build_object(
    'chargedCents', v_cost,
    'creditsBalanceCents', v_balance,
    'editCount', v_edit_count
  );
end;
$$;

revoke all on function public.charge_sheet_usage(uuid, uuid, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.charge_sheet_usage(uuid, uuid, text, integer, integer)
  to service_role;

-- Same as 0013, plus a note for refunded portraits.
create or replace function public.refund_sheet_usage(
  p_user_id uuid,
  p_photo_id uuid,
  p_kind text,
  p_charged_cents integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  if p_charged_cents < 0 then
    raise exception 'refund must not be negative';
  end if;

  select credits_balance into v_balance
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'profile not found';
  end if;

  if p_kind = 'edit' then
    update public.library_photos
    set edit_count = greatest(edit_count - 1, 0)
    where id = p_photo_id;
  end if;

  if p_charged_cents > 0 then
    v_balance := v_balance + p_charged_cents;

    update public.profiles
    set credits_balance = v_balance
    where id = p_user_id;

    insert into public.credit_ledger (
      user_id,
      delta,
      balance_after,
      reason,
      reference_type,
      reference_id,
      note
    )
    values (
      p_user_id,
      p_charged_cents,
      v_balance,
      'usage_refund',
      'library_photo',
      p_photo_id,
      case p_kind
        when 'edit' then 'Sheet edit could not be saved'
        when 'portrait' then 'Portrait photo could not be saved'
        else 'Coloring sheet could not be saved'
      end
    );
  end if;

  return v_balance;
end;
$$;

revoke all on function public.refund_sheet_usage(uuid, uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.refund_sheet_usage(uuid, uuid, text, integer)
  to service_role;

-- Same as 0016, plus a branch so portrait versions read correctly in activity.
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
