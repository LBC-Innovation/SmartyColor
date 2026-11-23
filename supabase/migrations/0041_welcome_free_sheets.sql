-- Welcome credit as a number of free coloring sheets.
--
-- The sign-up gift used to be a dollar amount (welcome_credit_cents). It is now a count of sheets:
-- on email confirmation the account is credited enough to make that many sheets at the current
-- ai.sheet_generation price. The credit still lands in the wallet as cents, so it is spent like any
-- other credit. welcome_credit_cents is no longer read; it stays for history.

alter table public.promo_settings
  add column if not exists welcome_free_sheets integer not null default 0
    check (welcome_free_sheets between 0 and 1000);                 -- 0 turns the gift off

comment on column public.promo_settings.welcome_free_sheets is
  'Sign-up gift: credit for this many coloring sheets at the ai.sheet_generation price, granted when an account''s email is first confirmed. 0 turns it off.';
comment on column public.promo_settings.welcome_credit_cents is
  'Retired by welcome_free_sheets (0041); no longer read.';

-- Carry the current gift over: as many whole sheets as the old amount bought.
update public.promo_settings s
set welcome_free_sheets = least(1000, floor(s.welcome_credit_cents::numeric / p.list_price_cents)::integer)
from public.price_items p
where s.id
  and p.sku = 'ai.sheet_generation'
  and p.list_price_cents > 0
  and s.welcome_free_sheets = 0;

create or replace function public.grant_welcome_credit(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_settled timestamptz;
  v_sheets integer;
  v_price integer;
  v_amount integer;
begin
  select credits_balance, welcome_credit_settled_at
  into v_balance, v_settled
  from public.profiles
  where id = p_user_id
  for update;

  if not found or v_settled is not null then
    return 0;
  end if;

  select welcome_free_sheets into v_sheets
  from public.promo_settings
  where id;

  select case when billable then list_price_cents else 0 end into v_price
  from public.price_items
  where sku = 'ai.sheet_generation';

  v_amount := coalesce(v_sheets, 0) * coalesce(v_price, 0);

  update public.profiles
  set welcome_credit_settled_at = now(),
      credits_balance = credits_balance + v_amount
  where id = p_user_id;

  if v_amount > 0 then
    insert into public.credit_ledger (user_id, delta, balance_after, reason, note)
    values (
      p_user_id,
      v_amount,
      v_balance + v_amount,
      'welcome_credit',
      format('“Welcome To Colorful Memories”: %s free coloring %s', v_sheets, case when v_sheets = 1 then 'page' else 'pages' end)
    );
  end if;

  return v_amount;
end;
$$;

revoke all on function public.grant_welcome_credit(uuid)
  from public, anon, authenticated;
grant execute on function public.grant_welcome_credit(uuid) to service_role;
