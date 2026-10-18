-- Sharing a single coloring page, and the refer-a-friend credit.
--
-- Shared pages: an owner can make an unlisted, read-only link to one coloring page. The link
-- points at one sheet revision, never the photo or the album, and stops working the moment
-- it is revoked (revoked_at set). Sharing again makes a new token, so an old link stays dead.
--
-- Referrals: each account gets a short referral code (assigned by the API the first time the
-- account asks for its link). Visitors arriving with ?ref=CODE keep it in the cm_attr cookie,
-- which is copied onto profiles.attribution at sign-up and book_orders.attribution per order
-- (0024). When a referred person's first order is paid, both accounts get the referral credit,
-- once, from a trigger on book_orders so every payment path (wallet, digital) is covered.

-- 0024 adds these; repeated so this migration stands on its own.
alter table public.profiles add column if not exists attribution jsonb;
alter table public.book_orders add column if not exists attribution jsonb;

-- ---------------------------------------------------------------------------
-- Shared pages
-- ---------------------------------------------------------------------------

create table if not exists public.page_shares (
  id           uuid primary key default gen_random_uuid(),
  token        text not null unique,          -- unguessable, in the public URL
  user_id      uuid not null references auth.users (id) on delete cascade, -- who shared it
  photo_id     uuid not null references public.library_photos (id) on delete cascade,
  revision_id  uuid not null references public.library_sheet_revisions (id) on delete cascade,
  created_at   timestamptz not null default now(),
  revoked_at   timestamptz
);

-- At most one live link per page and person.
create unique index if not exists page_shares_live_idx
  on public.page_shares (photo_id, user_id) where revoked_at is null;
create index if not exists page_shares_user_idx
  on public.page_shares (user_id, created_at desc);

comment on table public.page_shares is
  'Unlisted read-only links to one coloring page (a sheet revision). Dead once revoked_at is set.';

-- Server-only table: every read/write goes through the API with the service role.
alter table public.page_shares enable row level security;
grant select, insert, update, delete on table public.page_shares to service_role;

-- ---------------------------------------------------------------------------
-- Referrals
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists referral_code text;
create unique index if not exists profiles_referral_code_idx
  on public.profiles (referral_code) where referral_code is not null;

alter table public.promo_settings
  add column if not exists referral_credit_cents integer not null default 500
    check (referral_credit_cents between 0 and 50000); -- USD cents, to each account; 0 turns it off

-- One row per referred account: the primary key is what makes the credit happen once.
create table if not exists public.referral_credits (
  referred_user_id uuid primary key references auth.users (id) on delete cascade,
  referrer_id      uuid references auth.users (id) on delete set null,
  order_id         uuid references public.book_orders (id) on delete set null,
  amount_cents     integer not null,
  created_at       timestamptz not null default now()
);
create index if not exists referral_credits_referrer_idx
  on public.referral_credits (referrer_id, created_at desc);

alter table public.referral_credits enable row level security;
grant select, insert, update, delete on table public.referral_credits to service_role;

create or replace function public.add_promo_credit(p_user_id uuid, p_amount integer, p_reason text, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  update public.profiles
  set credits_balance = credits_balance + p_amount
  where id = p_user_id
  returning credits_balance into v_balance;
  if not found then
    return;
  end if;
  insert into public.credit_ledger (user_id, delta, balance_after, reason, note)
  values (p_user_id, p_amount, v_balance, p_reason, p_note);
end;
$$;

revoke all on function public.add_promo_credit(uuid, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.add_promo_credit(uuid, integer, text, text) to service_role;

-- Credit the buyer and whoever referred them, if this paid order is the buyer's first.
-- Returns the amount credited to each account (0 when nothing was granted).
create or replace function public.grant_referral_credit(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_paid timestamptz;
  v_order_attr jsonb;
  v_profile_attr jsonb;
  v_code text;
  v_referrer uuid;
  v_amount integer;
begin
  select user_id, paid_at, attribution
  into v_user, v_paid, v_order_attr
  from public.book_orders
  where id = p_order_id;

  if v_user is null or v_paid is null then
    return 0;
  end if;

  -- Only the first paid order counts; a later one never qualifies.
  if exists (
    select 1 from public.book_orders
    where user_id = v_user
      and id <> p_order_id
      and paid_at is not null
      and paid_at <= v_paid
  ) then
    return 0;
  end if;

  select attribution into v_profile_attr from public.profiles where id = v_user;
  v_code := upper(trim(coalesce(
    v_profile_attr -> 'first' ->> 'ref',
    v_profile_attr -> 'last' ->> 'ref',
    v_order_attr -> 'first' ->> 'ref',
    v_order_attr -> 'last' ->> 'ref'
  )));
  if v_code is null or v_code = '' then
    return 0;
  end if;

  select id into v_referrer from public.profiles where referral_code = v_code;
  if v_referrer is null or v_referrer = v_user then
    return 0;
  end if;

  select referral_credit_cents into v_amount from public.promo_settings where id;
  v_amount := coalesce(v_amount, 0);

  insert into public.referral_credits (referred_user_id, referrer_id, order_id, amount_cents)
  values (v_user, v_referrer, p_order_id, v_amount)
  on conflict (referred_user_id) do nothing;
  if not found then
    return 0;
  end if;

  if v_amount > 0 then
    perform public.add_promo_credit(
      v_user, v_amount, 'referral_credit', 'Referral credit: thanks for joining through a friend''s link');
    perform public.add_promo_credit(
      v_referrer, v_amount, 'referral_credit', 'Referral credit: a friend you invited placed their first order');
  end if;

  return v_amount;
end;
$$;

revoke all on function public.grant_referral_credit(uuid)
  from public, anon, authenticated;
grant execute on function public.grant_referral_credit(uuid) to service_role;

create or replace function public.handle_book_order_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A failed credit must never block a payment.
  begin
    perform public.grant_referral_credit(new.id);
  exception when others then
    raise warning 'referral credit failed for order %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.handle_book_order_paid()
  from public, anon, authenticated;

-- Granting is idempotent (referral_credits primary key), so firing on any paid_at write is safe.
drop trigger if exists book_orders_referral_credit on public.book_orders;
create trigger book_orders_referral_credit
  after insert or update of paid_at on public.book_orders
  for each row
  when (new.paid_at is not null)
  execute function public.handle_book_order_paid();
