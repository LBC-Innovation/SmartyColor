-- Vision API usage and failures, persisted so costs survive serverless restarts.
-- Written only by the server (service role); no end-user access.

create table if not exists public.vision_usage_events (
  id              uuid primary key default gen_random_uuid(),
  at              timestamptz not null default now(),
  user_id         uuid references auth.users (id) on delete set null,
  operation       text not null,
  model_id        text not null,
  input_tokens    integer not null default 0,
  output_tokens   integer not null default 0,
  image_output_tokens integer not null default 0,
  text_output_tokens  integer not null default 0,
  has_image_output boolean not null default false,
  input_cost_usd  numeric(12,6) not null default 0,
  output_cost_usd numeric(12,6) not null default 0,
  total_cost_usd  numeric(12,6) not null default 0,
  rate_source     text,
  instance_id     text
);

create table if not exists public.vision_error_events (
  id          uuid primary key default gen_random_uuid(),
  at          timestamptz not null default now(),
  user_id     uuid references auth.users (id) on delete set null,
  operation   text not null,
  model_id    text not null,
  kind        text not null,
  http_status integer,
  message     text not null,
  instance_id text
);

create index if not exists vision_usage_events_at_idx on public.vision_usage_events (at desc);
create index if not exists vision_usage_events_user_idx on public.vision_usage_events (user_id, at desc);
create index if not exists vision_error_events_at_idx on public.vision_error_events (at desc);

alter table public.vision_usage_events enable row level security;
alter table public.vision_error_events enable row level security;
-- No policies on purpose: only the service role (which bypasses RLS) reads/writes.

grant select, insert on table public.vision_usage_events to service_role;
grant select, insert on table public.vision_error_events to service_role;
