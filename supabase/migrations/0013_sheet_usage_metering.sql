-- Metered coloring sheets: generating a sheet and AI edits past the free allowance
-- are paid from the wallet. Prices are passed in by the API (src/lib/credits/pricing.ts).

alter table public.library_photos
  add column if not exists edit_count integer not null default 0;

comment on column public.library_photos.edit_count is
  'AI edits applied to this photo''s coloring sheet; the first few are free.';

-- Atomically charge the acting user for one generation or edit.
-- p_price_cents is the full price; edits inside the free allowance cost nothing.
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
  if p_kind not in ('generation', 'edit') then
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
      case when p_kind = 'edit' then 'sheet_edit' else 'sheet_generation' end,
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

-- Undo a charge when the sheet could not be saved after it was taken.
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
      case when p_kind = 'edit' then 'Sheet edit could not be saved' else 'Coloring sheet could not be saved' end
    );
  end if;

  return v_balance;
end;
$$;

revoke all on function public.refund_sheet_usage(uuid, uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.refund_sheet_usage(uuid, uuid, text, integer)
  to service_role;
