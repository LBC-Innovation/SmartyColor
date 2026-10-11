-- Album sharing: an album owner invites people by email to contribute photos.
--
-- library_photos.user_id / library_sheet_revisions.user_id keep meaning "album owner"
-- (it is also the first storage path segment), so the owner policies and paths from
-- 0010 are unchanged. Who actually added a row is tracked separately.

create table if not exists public.library_project_shares (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.library_projects (id) on delete cascade,
  email         text not null,              -- lowercased invitee address
  user_id       uuid references auth.users (id) on delete cascade, -- null until the invitee has an account
  status        text not null default 'pending' check (status in ('pending', 'active')),
  invited_by    uuid not null references auth.users (id) on delete cascade,
  -- Contributor's own view of the album; never touches the owner's arrangement.
  selected_photo_id uuid,
  studio_layout text,
  photo_order   jsonb,                      -- array of photo ids
  created_at    timestamptz not null default now(),
  accepted_at   timestamptz,
  last_emailed_at timestamptz
);

create unique index if not exists library_project_shares_project_email_idx
  on public.library_project_shares (project_id, email);
create index if not exists library_project_shares_user_idx
  on public.library_project_shares (user_id) where user_id is not null;
create index if not exists library_project_shares_pending_email_idx
  on public.library_project_shares (email) where status = 'pending';
create index if not exists library_project_shares_invited_by_idx
  on public.library_project_shares (invited_by, created_at desc);

alter table public.library_photos
  add column if not exists uploaded_by uuid references auth.users (id) on delete set null;
alter table public.library_sheet_revisions
  add column if not exists created_by uuid references auth.users (id) on delete set null;

update public.library_photos set uploaded_by = user_id where uploaded_by is null;
update public.library_sheet_revisions set created_by = user_id where created_by is null;

-- Server-only table: every read/write goes through the API with the service role.
alter table public.library_project_shares enable row level security;
grant select, insert, update, delete on table public.library_project_shares to service_role;

-- Resolve an invitee to an existing, email-verified account (auth.users is not exposed to PostgREST).
create or replace function public.verified_user_id_by_email(p_email text)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select id
  from auth.users
  where lower(email) = lower(p_email)
    and email_confirmed_at is not null
  limit 1;
$$;

revoke execute on function public.verified_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.verified_user_id_by_email(text) to service_role;
