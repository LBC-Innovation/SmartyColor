-- V2 library: projects, photos and generated sheet revisions live server-side,
-- with image bytes in the private "library" storage bucket.

create table if not exists public.library_projects (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  name          text not null default 'Untitled project',
  selected_photo_id uuid,
  studio_layout text not null default 'both',
  trip_narrative text not null default '',
  family_context text not null default '',
  generated_story jsonb,
  print_art_mode text,
  story_phase   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.library_photos (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.library_projects (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  position      integer not null default 0,
  storage_path  text not null,            -- library/{user}/{project}/{photo}/original.{ext}
  mime_type     text not null,
  width         integer,
  height        integer,
  orientation   text,
  aspect_ratio  text,
  file_name     text,
  captured_at   timestamptz,
  print_prefs   jsonb not null default '{}'::jsonb,
  user_caption  text not null default '',
  chat_messages jsonb not null default '[]'::jsonb,
  photo_summary text,
  crop          jsonb,
  active_revision_id uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.library_sheet_revisions (
  id            uuid primary key default gen_random_uuid(),
  photo_id      uuid not null references public.library_photos (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  storage_path  text not null,            -- library/{user}/{project}/{photo}/sheets/{revision}.png
  mime_type     text not null,
  title         text not null default '',
  created_at    timestamptz not null default now()
);

alter table public.library_photos
  add constraint library_photos_active_revision_fk
  foreign key (active_revision_id) references public.library_sheet_revisions (id) on delete set null;

create index if not exists library_projects_user_idx on public.library_projects (user_id, updated_at desc);
create index if not exists library_photos_project_idx on public.library_photos (project_id, position);
create index if not exists library_revisions_photo_idx on public.library_sheet_revisions (photo_id, created_at);

create trigger library_projects_set_updated_at
  before update on public.library_projects
  for each row execute function public.set_updated_at();
create trigger library_photos_set_updated_at
  before update on public.library_photos
  for each row execute function public.set_updated_at();

alter table public.library_projects enable row level security;
alter table public.library_photos enable row level security;
alter table public.library_sheet_revisions enable row level security;

create policy "library_projects owner" on public.library_projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "library_photos owner" on public.library_photos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "library_sheet_revisions owner" on public.library_sheet_revisions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- PostgREST: service_role needs explicit grants (RLS alone is not enough).
grant select, insert, update, delete on table public.library_projects to service_role;
grant select, insert, update, delete on table public.library_photos to service_role;
grant select, insert, update, delete on table public.library_sheet_revisions to service_role;
grant select, insert, update, delete on table public.library_projects to authenticated;
grant select, insert, update, delete on table public.library_photos to authenticated;
grant select, insert, update, delete on table public.library_sheet_revisions to authenticated;

-- Private bucket; objects live under {user_id}/... so the owner policy is a folder check.
insert into storage.buckets (id, name, public, file_size_limit)
values ('library', 'library', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = 26214400;

create policy "library owner read" on storage.objects for select
  using (bucket_id = 'library' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "library owner insert" on storage.objects for insert
  with check (bucket_id = 'library' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "library owner update" on storage.objects for update
  using (bucket_id = 'library' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "library owner delete" on storage.objects for delete
  using (bucket_id = 'library' and auth.uid()::text = (storage.foldername(name))[1]);
