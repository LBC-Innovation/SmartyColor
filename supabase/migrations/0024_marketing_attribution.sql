-- Which ad or link produced a sign-up or an order.
--
-- The browser keeps the campaign tags it landed with (utm_*, fbclid, gclid, ref) in the
-- first-party cm_attr cookie for 30 days: the first tagged visit and the latest one. The
-- server copies that cookie onto the profile when the account is created and onto each
-- order when it is created. Shape: {"first": {...}, "last": {...}}, each touch holding
-- only campaign tags, the landing path and a timestamp.

alter table public.profiles
  add column if not exists attribution jsonb;

alter table public.book_orders
  add column if not exists attribution jsonb;

comment on column public.profiles.attribution is
  'First and last campaign touch (utm_*, fbclid, gclid, ref) when the account was created.';
comment on column public.book_orders.attribution is
  'First and last campaign touch (utm_*, fbclid, gclid, ref) when the order was created.';
