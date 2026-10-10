-- Book orders (Lulu fulfillment), credit ledger, and order timeline events

create table if not exists public.print_products (
  id text primary key,
  name text not null,
  pod_package_id text not null,
  min_pages int not null default 32,
  max_pages int not null default 800,
  active boolean not null default true
);

insert into public.print_products (id, name, pod_package_id, min_pages, max_pages)
values (
  'coloring-book-pb-bw-85x11',
  'Custom coloring book (8.5×11, B&W, perfect bound)',
  '0850X1100.BW.STD.PB.060UW444.MXX',
  32,
  800
)
on conflict (id) do nothing;

create type public.book_order_status as enum (
  'draft',
  'quoted',
  'awaiting_payment',
  'paid',
  'submitting_to_lulu',
  'submitted_to_lulu',
  'in_production',
  'shipped',
  'delivered',
  'failed',
  'canceled',
  'refunded'
);

create type public.book_payment_method as enum ('stripe', 'credits', 'mixed');

create table if not exists public.book_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  product_id text not null references public.print_products (id),
  project_title text,
  page_count int not null check (page_count > 0),
  status public.book_order_status not null default 'draft',
  payment_method public.book_payment_method,
  subtotal_cents int,
  shipping_cents int,
  tax_cents int,
  total_cents int,
  lulu_cost_cents int,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  credits_applied int not null default 0,
  lulu_print_job_id bigint,
  lulu_external_id text unique,
  lulu_status_name text,
  lulu_status_message text,
  lulu_status_changed_at timestamptz,
  shipping_level text not null default 'MAIL',
  shipping_address jsonb not null default '{}'::jsonb,
  contact_email text not null,
  interior_url text,
  interior_md5 text,
  cover_url text,
  cover_md5 text,
  carrier text,
  tracking_number text,
  tracking_urls jsonb not null default '[]'::jsonb,
  estimated_dispatch_min timestamptz,
  estimated_dispatch_max timestamptz,
  estimated_delivery_min timestamptz,
  estimated_delivery_max timestamptz,
  quote_expires_at timestamptz,
  paid_at timestamptz,
  submitted_to_lulu_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists book_orders_user_id_created_at_idx
  on public.book_orders (user_id, created_at desc);

create index if not exists book_orders_lulu_print_job_id_idx
  on public.book_orders (lulu_print_job_id)
  where lulu_print_job_id is not null;

create trigger book_orders_set_updated_at
  before update on public.book_orders
  for each row
  execute function public.set_updated_at();

create table if not exists public.book_order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.book_orders (id) on delete cascade,
  kind text not null,
  title text not null,
  detail text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists book_order_events_order_id_occurred_at_idx
  on public.book_order_events (order_id, occurred_at desc);

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  delta int not null,
  balance_after int not null,
  reason text not null,
  reference_type text,
  reference_id uuid,
  created_by uuid references auth.users (id),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists credit_ledger_user_id_created_at_idx
  on public.credit_ledger (user_id, created_at desc);

alter table public.book_orders enable row level security;
alter table public.book_order_events enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.print_products enable row level security;

create policy "users: read own book orders"
  on public.book_orders for select
  using (auth.uid() = user_id);

create policy "users: read own order events"
  on public.book_order_events for select
  using (
    exists (
      select 1 from public.book_orders o
      where o.id = order_id and o.user_id = auth.uid()
    )
  );

create policy "users: read own credit ledger"
  on public.credit_ledger for select
  using (auth.uid() = user_id);

create policy "anyone authenticated: read active print products"
  on public.print_products for select
  using (active = true);
