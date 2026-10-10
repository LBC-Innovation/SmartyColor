-- ColorfulMemories user profiles + auth helpers (ShareList-aligned)

create type user_status as enum ('active', 'suspended');

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url   text,
  status       user_status not null default 'active',
  plan_tier    text not null default 'free',
  credits_balance integer not null default 0 check (credits_balance >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.profiles is
  'Application profile extending auth.users; permissions live in auth app_metadata.';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

alter table public.profiles enable row level security;

create policy "users: select own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "users: update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.has_permission(p_user_id uuid, p_permission text)
returns boolean
language sql
security definer
stable
as $$
  select coalesce(
    (raw_app_meta_data -> 'permissions') ? p_permission,
    false
  )
  from auth.users
  where id = p_user_id;
$$;

revoke execute on function public.has_permission(uuid, text) from public, anon, authenticated;
grant execute on function public.has_permission(uuid, text) to service_role;

create or replace function public.admin_unverify_user(p_user_id uuid)
returns void
language sql
security definer
as $$
  update auth.users
  set email_confirmed_at = null,
      updated_at = now()
  where id = p_user_id;
$$;

revoke execute on function public.admin_unverify_user(uuid) from public, anon, authenticated;
grant execute on function public.admin_unverify_user(uuid) to service_role;
