-- The address a customer chose to keep for future book orders. The order
-- wizard prefills its address form from it; null until they tick "Save this
-- address", and cleared again if they untick it on a later order.

alter table public.profiles
  add column if not exists saved_address jsonb;

comment on column public.profiles.saved_address is
  'Address the customer saved for future book orders (ShippingAddress shape), or null.';
