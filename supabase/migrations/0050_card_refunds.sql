-- Card refunds issued from the admin customer drawer.
--
-- Card money reaches us two ways, and both can now be refunded back to the card:
--   * a wallet top-up (credit_stripe_sessions): the refunded amount also leaves the wallet, so a
--     customer can never keep credit for money they got back. Only unspent balance can be refunded.
--   * a book package paid by card (purchase_codes.paid_with = 'card'): no wallet row is involved.
--     The admin either cancels the package (it is voided, like cancel_book_package, but the money
--     goes to the card instead of the wallet) or gives a partial refund and the package stays.
--
-- A refund runs in three steps so the wallet and Stripe can't disagree:
--   1. admin_begin_card_refund   checks the amount, holds it (pending row), takes it out of the
--                                wallet for a top-up. Pending rows count as refunded, so two
--                                admins can't refund the same money twice.
--   2. the server asks Stripe to refund, with the pending row's id as the idempotency key.
--   3. admin_finish_card_refund  marks it succeeded (and voids the package when asked), or
--      admin_fail_card_refund    marks it failed and puts any wallet money back.

create table if not exists public.card_refunds (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid references auth.users (id) on delete set null,
  stripe_checkout_session_id  text not null,
  stripe_refund_id            text unique,
  kind                        text not null check (kind in ('wallet_topup', 'book_package')),
  purchase_code_id            uuid references public.purchase_codes (id) on delete set null,
  amount_cents                integer not null check (amount_cents > 0),
  wallet_debit_cents          integer not null default 0 check (wallet_debit_cents >= 0),
  cancels_package             boolean not null default false,
  status                      text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  note                        text check (note is null or char_length(note) <= 500),
  error                       text,
  created_by                  uuid references auth.users (id) on delete set null,
  created_at                  timestamptz not null default now(),
  completed_at                timestamptz
);

create index if not exists card_refunds_session_idx on public.card_refunds (stripe_checkout_session_id);
create index if not exists card_refunds_user_idx on public.card_refunds (user_id, created_at desc);

comment on table public.card_refunds is
  'Refunds to a card, issued from /admin/users. pending and succeeded rows count as refunded.';

alter table public.card_refunds enable row level security;
grant select, insert, update on table public.card_refunds to service_role;

-- ---------------------------------------------------------------------------------------------
-- 1. Begin: validate, hold the amount, take it out of the wallet for a top-up.
-- ---------------------------------------------------------------------------------------------
create or replace function public.admin_begin_card_refund(
  p_session_id text,
  p_amount_cents integer,
  p_cancel_package boolean,
  p_created_by uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_user uuid;
  v_charged integer;
  v_code public.purchase_codes%rowtype;
  v_refunded integer;
  v_balance integer;
  v_refund_id uuid := gen_random_uuid();
  v_ledger_id uuid;
  v_note text := nullif(trim(p_note), '');
begin
  if p_session_id is null or length(trim(p_session_id)) = 0 then
    raise exception 'session id is required';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'amount must be positive';
  end if;

  perform pg_advisory_xact_lock(hashtext('card_refund:' || p_session_id));

  select user_id, amount_cents into v_user, v_charged
  from public.credit_stripe_sessions where stripe_checkout_session_id = p_session_id;
  if found then
    v_kind := 'wallet_topup';
  else
    select * into v_code from public.purchase_codes
    where stripe_session_id = p_session_id and source = 'package' and paid_with = 'card'
    for update;
    if not found then
      raise exception 'card payment not found';
    end if;
    v_kind := 'book_package';
    v_user := coalesce(v_code.redeemed_by, v_code.created_by);
    v_charged := coalesce(v_code.package_price_cents, 0);
  end if;

  select coalesce(sum(amount_cents), 0) into v_refunded
  from public.card_refunds
  where stripe_checkout_session_id = p_session_id and status in ('pending', 'succeeded');

  if p_amount_cents > v_charged - v_refunded then
    raise exception 'amount exceeds refundable';
  end if;

  if v_kind = 'book_package' and p_cancel_package then
    if v_code.status <> 'active' or v_code.refunded_at is not null then
      raise exception 'package not active';
    end if;
    if v_code.book_order_id is not null then
      raise exception 'book already ordered';
    end if;
  end if;

  if v_kind = 'wallet_topup' then
    select credits_balance into v_balance from public.profiles where id = v_user for update;
    if not found then
      raise exception 'profile not found';
    end if;
    if v_balance < p_amount_cents then
      raise exception 'insufficient credits';
    end if;
    v_balance := v_balance - p_amount_cents;
    update public.profiles set credits_balance = v_balance where id = v_user;

    insert into public.credit_ledger (
      user_id, delta, balance_after, reason, reference_type, reference_id, created_by, note
    )
    values (
      v_user, -p_amount_cents, v_balance, 'card_refund', 'card_refund', v_refund_id, p_created_by,
      coalesce(v_note, 'Refunded to your card')
    )
    returning id into v_ledger_id;

    update public.account_activity
    set type = 'card_refund',
        description = 'Refunded to your card'
    where ledger_id = v_ledger_id;
  end if;

  insert into public.card_refunds (
    id, user_id, stripe_checkout_session_id, kind, purchase_code_id, amount_cents,
    wallet_debit_cents, cancels_package, note, created_by
  )
  values (
    v_refund_id, v_user, p_session_id, v_kind,
    case when v_kind = 'book_package' then v_code.id end,
    p_amount_cents,
    case when v_kind = 'wallet_topup' then p_amount_cents else 0 end,
    v_kind = 'book_package' and coalesce(p_cancel_package, false),
    v_note, p_created_by
  );

  return jsonb_build_object(
    'refundId', v_refund_id,
    'kind', v_kind,
    'userId', v_user,
    'amountCents', p_amount_cents,
    'chargedCents', v_charged,
    'refundedCents', v_refunded + p_amount_cents,
    'creditsBalanceCents', v_balance
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 2. Finish: Stripe accepted the refund.
-- ---------------------------------------------------------------------------------------------
create or replace function public.admin_finish_card_refund(p_refund_id uuid, p_stripe_refund_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_refund public.card_refunds%rowtype;
begin
  select * into v_refund from public.card_refunds where id = p_refund_id for update;
  if not found then
    raise exception 'refund not found';
  end if;
  if v_refund.status = 'succeeded' then
    return jsonb_build_object('refundId', v_refund.id, 'status', v_refund.status);
  end if;
  if v_refund.status <> 'pending' then
    raise exception 'refund not pending';
  end if;

  update public.card_refunds
  set status = 'succeeded', stripe_refund_id = p_stripe_refund_id, completed_at = now()
  where id = p_refund_id;

  if v_refund.kind = 'book_package' then
    if v_refund.cancels_package then
      update public.purchase_codes
      set status = 'void',
          voided_at = now(),
          voided_by = v_refund.created_by,
          refunded_at = now(),
          refund_cents = coalesce(refund_cents, 0) + v_refund.amount_cents
      where id = v_refund.purchase_code_id;
    end if;

    -- No wallet row for card package money, so the customer's history gets its own line.
    if v_refund.user_id is not null then
      insert into public.account_activity (
        user_id, category, type, description, amount_cents, balance_after_cents,
        stripe_checkout_session_id, reference_type, reference_id
      )
      values (
        v_refund.user_id, 'orders', 'card_refund',
        case when v_refund.cancels_package
          then 'Canceled a book package. Refunded to your card'
          else 'Refunded part of a book package to your card' end,
        v_refund.amount_cents, null, v_refund.stripe_checkout_session_id, 'card_refund', v_refund.id
      );
    end if;
  end if;

  return jsonb_build_object('refundId', v_refund.id, 'status', 'succeeded');
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. Fail: Stripe refused. Put the wallet money back with a visible line.
-- ---------------------------------------------------------------------------------------------
create or replace function public.admin_fail_card_refund(p_refund_id uuid, p_error text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_refund public.card_refunds%rowtype;
  v_balance integer;
  v_ledger_id uuid;
begin
  select * into v_refund from public.card_refunds where id = p_refund_id for update;
  if not found then
    raise exception 'refund not found';
  end if;
  if v_refund.status <> 'pending' then
    return jsonb_build_object('refundId', v_refund.id, 'status', v_refund.status);
  end if;

  update public.card_refunds
  set status = 'failed', error = left(p_error, 500), completed_at = now()
  where id = p_refund_id;

  if v_refund.wallet_debit_cents > 0 and v_refund.user_id is not null then
    select credits_balance into v_balance from public.profiles where id = v_refund.user_id for update;
    if found then
      v_balance := v_balance + v_refund.wallet_debit_cents;
      update public.profiles set credits_balance = v_balance where id = v_refund.user_id;
      insert into public.credit_ledger (
        user_id, delta, balance_after, reason, reference_type, reference_id, created_by, note
      )
      values (
        v_refund.user_id, v_refund.wallet_debit_cents, v_balance, 'card_refund_reversal', 'card_refund',
        v_refund.id, v_refund.created_by, 'Card refund didn''t go through. Credit put back'
      )
      returning id into v_ledger_id;

      update public.account_activity
      set type = 'card_refund_reversal',
          description = 'Card refund didn''t go through. Credit put back'
      where ledger_id = v_ledger_id;
    end if;
  end if;

  return jsonb_build_object('refundId', v_refund.id, 'status', 'failed', 'creditsBalanceCents', v_balance);
end;
$$;

revoke all on function public.admin_begin_card_refund(text, integer, boolean, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_finish_card_refund(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_fail_card_refund(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_begin_card_refund(text, integer, boolean, uuid, text) to service_role;
grant execute on function public.admin_finish_card_refund(uuid, text) to service_role;
grant execute on function public.admin_fail_card_refund(uuid, text) to service_role;

-- ---------------------------------------------------------------------------------------------
-- Per account money for the customers list (/admin/users), wallet and card together.
--   spent_cents          what they bought, however they paid, less refunds of those purchases:
--                        every wallet line that isn't funding (top-ups, gifts, admin changes,
--                        card refunds), plus book packages paid by card, less card refunds of them.
--   card_charged_cents   everything charged to their card: top-ups and card-paid packages.
--   card_refunded_cents  sent back to their card through the admin.
-- ---------------------------------------------------------------------------------------------
create or replace function public.admin_user_money()
returns table (user_id uuid, spent_cents bigint, card_charged_cents bigint, card_refunded_cents bigint)
language sql
stable
security definer
set search_path = public
as $$
  with wallet as (
    select l.user_id, -sum(l.delta) as spent
    from public.credit_ledger l
    where l.reason not in (
      'stripe_purchase', 'admin_grant', 'welcome_credit', 'referral_credit', 'card_refund', 'card_refund_reversal'
    )
    group by l.user_id
  ),
  topups as (
    select s.user_id, sum(s.amount_cents) as charged
    from public.credit_stripe_sessions s
    group by s.user_id
  ),
  packages as (
    select coalesce(c.redeemed_by, c.created_by) as user_id, sum(c.package_price_cents) as charged
    from public.purchase_codes c
    where c.source = 'package' and c.paid_with = 'card' and c.stripe_session_id is not null
    group by 1
  ),
  refunds as (
    select r.user_id,
           sum(r.amount_cents) as total,
           coalesce(sum(r.amount_cents) filter (where r.kind = 'book_package'), 0) as packages
    from public.card_refunds r
    where r.status = 'succeeded'
    group by r.user_id
  ),
  ids as (
    select user_id from wallet
    union select user_id from topups
    union select user_id from packages
    union select user_id from refunds
  )
  select ids.user_id,
         (coalesce(w.spent, 0) + coalesce(p.charged, 0) - coalesce(r.packages, 0))::bigint,
         (coalesce(t.charged, 0) + coalesce(p.charged, 0))::bigint,
         coalesce(r.total, 0)::bigint
  from ids
  left join wallet w on w.user_id = ids.user_id
  left join topups t on t.user_id = ids.user_id
  left join packages p on p.user_id = ids.user_id
  left join refunds r on r.user_id = ids.user_id
  where ids.user_id is not null;
$$;

revoke all on function public.admin_user_money() from public, anon, authenticated;
grant execute on function public.admin_user_money() to service_role;
