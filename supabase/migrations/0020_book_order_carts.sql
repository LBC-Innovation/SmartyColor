-- Books a customer started in the order wizard but hasn't ordered yet. The
-- wizard saves its whole state here so the book can be picked up later, on any
-- device, from the cart in the header. A cart is deleted once its order is placed.

create table if not exists public.book_order_carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'My coloring book',
  step text not null default 'book',
  binding_id text,
  page_count integer not null default 0,
  photo_count integer not null default 0,
  -- Library image shown on the cart row; checked for access when it is saved.
  thumb_path text,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.book_order_carts is
  'In-progress book orders: the order wizard''s saved state, until the book is ordered.';

create index if not exists book_order_carts_user_updated_idx
  on public.book_order_carts (user_id, updated_at desc);

alter table public.book_order_carts enable row level security;

create policy "book_order_carts owner" on public.book_order_carts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- PostgREST: service_role needs explicit grants (RLS alone is not enough).
grant select, insert, update, delete on table public.book_order_carts to service_role;
grant select, insert, update, delete on table public.book_order_carts to authenticated;
