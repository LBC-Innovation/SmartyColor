-- Credit purchases (Stripe) and paying for book orders with wallet balance

create table if not exists public.credit_stripe_sessions (
  stripe_checkout_session_id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  credited_at timestamptz not null default now()
);

create index if not exists credit_stripe_sessions_user_id_idx
  on public.credit_stripe_sessions (user_id, credited_at desc);

alter table public.credit_stripe_sessions enable row level security;

grant select, insert on table public.credit_stripe_sessions to service_role;

create or replace function public.grant_purchased_credits(
  p_user_id uuid,
  p_delta integer,
  p_stripe_session_id text,
  p_note text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  if p_delta <= 0 then
    raise exception 'delta must be positive';
  end if;

  if exists (
    select 1 from public.credit_stripe_sessions
    where stripe_checkout_session_id = p_stripe_session_id
  ) then
    select credits_balance into v_balance
    from public.profiles
    where id = p_user_id;
    return coalesce(v_balance, 0);
  end if;

  select credits_balance into v_balance
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'profile not found';
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
    note
  )
  values (
    p_user_id,
    p_delta,
    v_balance,
    'stripe_purchase',
    coalesce(nullif(trim(p_note), ''), p_stripe_session_id)
  );

  insert into public.credit_stripe_sessions (
    stripe_checkout_session_id,
    user_id,
    amount_cents
  )
  values (p_stripe_session_id, p_user_id, p_delta);

  return v_balance;
end;
$$;

revoke all on function public.grant_purchased_credits(uuid, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.grant_purchased_credits(uuid, integer, text, text)
  to service_role;

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
    -v_total,
    v_balance,
    'order_payment',
    'book_order',
    p_order_id,
    'Book order payment'
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
