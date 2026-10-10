-- Atomic promo credit adjustments (admin-only via service role RPC)

create or replace function public.admin_adjust_user_credits(
  p_user_id uuid,
  p_delta integer,
  p_created_by uuid,
  p_note text default null,
  p_reason text default 'admin_grant'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  if p_delta = 0 then
    raise exception 'delta must be non-zero';
  end if;

  select credits_balance into v_balance
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'profile not found';
  end if;

  if v_balance + p_delta < 0 then
    raise exception 'insufficient credits';
  end if;

  v_balance := v_balance + p_delta;

  update public.profiles
  set credits_balance = v_balance
  where id = p_user_id;

  insert into public.credit_ledger (
    user_id,
    delta,
    balance_after,
    reason,
    created_by,
    note
  )
  values (
    p_user_id,
    p_delta,
    v_balance,
    coalesce(nullif(trim(p_reason), ''), 'admin_grant'),
    p_created_by,
    nullif(trim(p_note), '')
  );

  return v_balance;
end;
$$;

revoke all on function public.admin_adjust_user_credits(uuid, integer, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_adjust_user_credits(uuid, integer, uuid, text, text)
  to service_role;
