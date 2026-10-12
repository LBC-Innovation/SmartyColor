-- Promotional credits, set from the admin panel.
--
-- Welcome credit: every account is gifted a starter credit the first time its
-- email address is confirmed. The amount is read at that moment, so changing it
-- only affects accounts confirmed afterwards.

create table if not exists public.promo_settings (
  id                   boolean primary key default true check (id), -- single row
  welcome_credit_cents integer not null default 500
    check (welcome_credit_cents between 0 and 50000),               -- USD cents; 0 turns the gift off
  updated_at           timestamptz not null default now(),
  updated_by           uuid references auth.users (id) on delete set null
);

comment on table public.promo_settings is
  'Single-row promotional credit settings, edited in the admin panel.';

insert into public.promo_settings (id) values (true)
on conflict (id) do nothing;

drop trigger if exists promo_settings_set_updated_at on public.promo_settings;
create trigger promo_settings_set_updated_at
  before update on public.promo_settings
  for each row
  execute function public.set_updated_at();

-- Server-only table: every read/write goes through the API with the service role.
alter table public.promo_settings enable row level security;
grant select, update on table public.promo_settings to service_role;

-- Set once the welcome credit has been decided for an account, whether or not
-- anything was granted. Keeps an unverify/re-verify from gifting twice.
alter table public.profiles
  add column if not exists welcome_credit_settled_at timestamptz;

-- Accounts confirmed before this feature existed are not new users.
update public.profiles p
set welcome_credit_settled_at = now()
from auth.users u
where u.id = p.id
  and u.email_confirmed_at is not null
  and p.welcome_credit_settled_at is null;

create or replace function public.grant_welcome_credit(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_settled timestamptz;
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

  select welcome_credit_cents into v_amount
  from public.promo_settings
  where id;
  v_amount := coalesce(v_amount, 0);

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
      '“Welcome To Colorful Memories” starter credit'
    );
  end if;

  return v_amount;
end;
$$;

revoke all on function public.grant_welcome_credit(uuid)
  from public, anon, authenticated;
grant execute on function public.grant_welcome_credit(uuid) to service_role;

create or replace function public.handle_user_email_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A failed gift must never block sign-up or email confirmation.
  begin
    perform public.grant_welcome_credit(new.id);
  exception when others then
    raise warning 'welcome credit failed for user %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.handle_user_email_confirmed()
  from public, anon, authenticated;

-- Two triggers because an insert trigger's WHEN clause cannot reference OLD.
-- Accounts that are confirmed on creation (admin-created, OAuth) take the insert
-- path; it sorts after on_auth_user_created, so the profile row already exists.
drop trigger if exists on_auth_user_inserted_confirmed on auth.users;
create trigger on_auth_user_inserted_confirmed
  after insert on auth.users
  for each row
  when (new.email_confirmed_at is not null)
  execute function public.handle_user_email_confirmed();

drop trigger if exists on_auth_user_email_confirmed on auth.users;
create trigger on_auth_user_email_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.handle_user_email_confirmed();
