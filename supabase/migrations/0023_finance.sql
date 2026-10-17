-- Financials dashboard (/admin/finance).
--
-- Most of the numbers already exist: card top-ups (credit_stripe_sessions), every
-- wallet charge and promo grant (credit_ledger), print orders and what Lulu charged
-- us (book_orders), and every AI call's cost (vision_usage_events). What the app
-- cannot know on its own is what the business spends outside it — hosting,
-- subscriptions, marketing, salaries — so those are entered here by hand, along
-- with the card-fee rate and an optional opening cash balance for runway.

-- Fixed and operating costs, prorated into whatever period the dashboard shows.
create table if not exists public.finance_costs (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(btrim(name)) between 1 and 120),
  vendor       text check (vendor is null or char_length(vendor) <= 120),
  category     text not null check (
    category in ('hosting', 'software', 'ai_platform', 'marketing', 'payroll', 'professional', 'other')
  ),
  -- monthly / annual: spread evenly over each day they are active; one_time: lands on starts_on.
  cadence      text not null check (cadence in ('monthly', 'annual', 'one_time')),
  amount_cents integer not null check (amount_cents between 0 and 100000000),
  starts_on    date not null,
  -- Inclusive last day; null = still running.
  ends_on      date check (ends_on is null or ends_on >= starts_on),
  notes        text check (notes is null or char_length(notes) <= 500),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null,
  updated_by   uuid references auth.users (id) on delete set null
);

comment on table public.finance_costs is
  'Costs the app cannot see (hosting, software, marketing, payroll…), entered on /admin/finance.';

drop trigger if exists finance_costs_set_updated_at on public.finance_costs;
create trigger finance_costs_set_updated_at
  before update on public.finance_costs
  for each row
  execute function public.set_updated_at();

-- Single-row settings for the dashboard.
create table if not exists public.finance_settings (
  id                   boolean primary key default true check (id),
  -- Card processing: percent of each top-up plus a fixed fee (Stripe US standard by default).
  card_fee_pct         numeric(5, 3) not null default 2.9 check (card_fee_pct between 0 and 20),
  card_fee_fixed_cents integer not null default 30 check (card_fee_fixed_cents between 0 and 1000),
  -- Bank balance on a known day; cash on hand = this + net cash flow since. Null = not tracked.
  opening_cash_cents   bigint check (opening_cash_cents is null or abs(opening_cash_cents) <= 100000000000),
  opening_cash_on      date,
  updated_at           timestamptz not null default now(),
  updated_by           uuid references auth.users (id) on delete set null,
  constraint finance_settings_opening_cash_pair
    check ((opening_cash_cents is null) = (opening_cash_on is null))
);

insert into public.finance_settings (id) values (true)
on conflict (id) do nothing;

drop trigger if exists finance_settings_set_updated_at on public.finance_settings;
create trigger finance_settings_set_updated_at
  before update on public.finance_settings
  for each row
  execute function public.set_updated_at();

-- AI spend per UTC day and operation, so the dashboard never pages through every call.
create or replace function public.finance_ai_cost_daily(p_from timestamptz, p_to timestamptz)
returns table (day date, operation text, calls bigint, cost_usd numeric)
language sql
stable
set search_path = public
as $$
  select timezone('utc', e.at)::date, e.operation, count(*), coalesce(sum(e.total_cost_usd), 0)
  from public.vision_usage_events e
  where e.at >= p_from and e.at < p_to
  group by 1, 2
  order by 1, 2;
$$;

-- Server-only: every read/write goes through the API with the service role.
alter table public.finance_costs enable row level security;
alter table public.finance_settings enable row level security;
grant select, insert, update, delete on table public.finance_costs to service_role;
grant select, update on table public.finance_settings to service_role;

revoke all on function public.finance_ai_cost_daily(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.finance_ai_cost_daily(timestamptz, timestamptz) to service_role;
