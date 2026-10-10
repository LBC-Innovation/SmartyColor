-- Soft delete + admin cancel metadata for book orders

alter table public.book_orders
  add column if not exists canceled_at timestamptz,
  add column if not exists canceled_by uuid references auth.users (id),
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users (id);

comment on column public.book_orders.deleted_at is
  'Soft delete — hidden from user/admin lists; stops Lulu sync and quote refresh.';
comment on column public.book_orders.canceled_at is
  'When the order was canceled (admin or system).';

create index if not exists book_orders_deleted_at_idx
  on public.book_orders (deleted_at)
  where deleted_at is not null;
