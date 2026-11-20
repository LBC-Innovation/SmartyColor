-- Share with a friend: credit both people when the friend signs up, not when they first order.
--
-- The sharer's link (and QR code) lands on /friend/<CODE>?ref=<CODE>&utm_campaign=share_with_a_friend.
-- The cm_attr cookie carries those tags through sign-up onto profiles.attribution (0024). Once the
-- new account has both that attribution and a confirmed email, grant_friend_signup_credit gives the
-- new account referral_friend_credit_cents and the sharer referral_sharer_credit_cents, once
-- (referral_credits' primary key is the referred account). The two orders it can happen in
-- (attribution saved, then email confirmed; or confirmed on creation, then attribution saved) each
-- have a trigger. Only links tagged with the campaign count: page shares, album invites and family
-- emails still carry the ref code for reporting but no longer earn credit.
--
-- The first-order referral credit from 0026 is retired (its trigger is dropped; no credit had ever
-- been granted through it). referral_credit_cents stays for history but is no longer read.

alter table public.promo_settings
  add column if not exists referral_friend_credit_cents integer not null default 500
    check (referral_friend_credit_cents between 0 and 50000), -- USD cents, to the new account; 0 turns it off
  add column if not exists referral_sharer_credit_cents integer not null default 500
    check (referral_sharer_credit_cents between 0 and 50000); -- USD cents, to the account that shared

-- Start from whatever the old single amount was set to.
update public.promo_settings
set referral_friend_credit_cents = referral_credit_cents,
    referral_sharer_credit_cents = referral_credit_cents
where id;

-- amount_cents is what the sharer got (reports and the "you earned" email read it);
-- friend_amount_cents is what the new account got.
alter table public.referral_credits
  add column if not exists friend_amount_cents integer not null default 0,
  add column if not exists via text not null default 'first_order'
    check (via in ('first_order', 'signup'));
alter table public.referral_credits alter column via set default 'signup';

comment on column public.referral_credits.amount_cents is 'Credit given to the sharer (referrer_id), USD cents.';
comment on column public.referral_credits.friend_amount_cents is 'Credit given to the new account (referred_user_id), USD cents.';

-- The first-order credit is replaced by the sign-up credit.
drop trigger if exists book_orders_referral_credit on public.book_orders;

-- The sharer's code from a Share with a friend touch (first touch wins), or null.
create or replace function public.friend_referral_code(p_attribution jsonb)
returns text
language sql
immutable
set search_path = public
as $$
  select upper(trim(t ->> 'ref'))
  from (values (1, p_attribution -> 'first'), (2, p_attribution -> 'last')) as touches(n, t)
  where t ->> 'utm_campaign' = 'share_with_a_friend'
    and coalesce(trim(t ->> 'ref'), '') <> ''
  order by n
  limit 1;
$$;

create or replace function public.grant_friend_signup_credit(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_confirmed timestamptz;
  v_attr jsonb;
  v_code text;
  v_referrer uuid;
  v_friend integer;
  v_sharer integer;
begin
  select email_confirmed_at into v_confirmed from auth.users where id = p_user_id;
  if v_confirmed is null then
    return 0;
  end if;

  select attribution into v_attr from public.profiles where id = p_user_id;
  v_code := public.friend_referral_code(v_attr);
  if v_code is null then
    return 0;
  end if;

  select id into v_referrer from public.profiles where referral_code = v_code;
  if v_referrer is null or v_referrer = p_user_id then
    return 0;
  end if;

  select referral_friend_credit_cents, referral_sharer_credit_cents
  into v_friend, v_sharer
  from public.promo_settings where id;
  v_friend := coalesce(v_friend, 0);
  v_sharer := coalesce(v_sharer, 0);

  insert into public.referral_credits (referred_user_id, referrer_id, amount_cents, friend_amount_cents, via)
  values (p_user_id, v_referrer, v_sharer, v_friend, 'signup')
  on conflict (referred_user_id) do nothing;
  if not found then
    return 0;
  end if;

  if v_friend > 0 then
    perform public.add_promo_credit(
      p_user_id, v_friend, 'referral_credit', 'Friend credit: thanks for joining through a friend''s link');
  end if;
  if v_sharer > 0 then
    perform public.add_promo_credit(
      v_referrer, v_sharer, 'referral_credit', 'Friend credit: a friend you shared with signed up');
  end if;

  return v_friend + v_sharer;
end;
$$;

revoke all on function public.grant_friend_signup_credit(uuid) from public, anon, authenticated;
grant execute on function public.grant_friend_signup_credit(uuid) to service_role;

-- Email confirmed (on creation or later): welcome credit, then the friend credit.
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
  begin
    perform public.grant_friend_signup_credit(new.id);
  exception when others then
    raise warning 'friend credit failed for user %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.handle_user_email_confirmed() from public, anon, authenticated;

-- Attribution saved after the email was already confirmed (accounts confirmed on creation).
create or replace function public.handle_profile_attribution_set()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public.grant_friend_signup_credit(new.id);
  exception when others then
    raise warning 'friend credit failed for user %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.handle_profile_attribution_set() from public, anon, authenticated;

drop trigger if exists profiles_friend_signup_credit on public.profiles;
create trigger profiles_friend_signup_credit
  after update of attribution on public.profiles
  for each row
  when (old.attribution is null and new.attribution is not null)
  execute function public.handle_profile_attribution_set();
