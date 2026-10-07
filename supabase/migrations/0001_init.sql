-- SmartyColor core schema
-- Guest sessions are not stored. Signed-in users can save and reopen sheets.

create table if not exists public.coloring_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  idea text not null,
  print_prefs jsonb not null default '{}'::jsonb,
  likes jsonb not null default '[]'::jsonb,
  last_feedback jsonb,
  status text not null default 'refine',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.generated_sheets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.coloring_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  image_path text not null,
  created_at timestamptz not null default now()
);

alter table public.coloring_sessions enable row level security;
alter table public.generated_sheets enable row level security;

create policy "Users read own sessions"
  on public.coloring_sessions for select
  using (auth.uid() = user_id);

create policy "Users insert own sessions"
  on public.coloring_sessions for insert
  with check (auth.uid() = user_id);

create policy "Users update own sessions"
  on public.coloring_sessions for update
  using (auth.uid() = user_id);

create policy "Users read own sheets"
  on public.generated_sheets for select
  using (auth.uid() = user_id);

create policy "Users insert own sheets"
  on public.generated_sheets for insert
  with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('sheets', 'sheets', false)
on conflict (id) do nothing;

create policy "Users read own sheet files"
  on storage.objects for select
  using (bucket_id = 'sheets' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users upload own sheet files"
  on storage.objects for insert
  with check (bucket_id = 'sheets' and auth.uid()::text = (storage.foldername(name))[1]);
