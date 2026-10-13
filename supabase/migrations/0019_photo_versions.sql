-- A photo's version rail can hold more than coloring sheets: an AI portrait
-- version of a landscape photo sits there too, and sheets can be drawn from it.

alter table public.library_sheet_revisions
  add column if not exists kind text not null default 'sheet'
    check (kind in ('sheet', 'photo')),
  add column if not exists orientation text
    check (orientation in ('portrait', 'landscape')),
  add column if not exists source_revision_id uuid
    references public.library_sheet_revisions (id) on delete set null;

comment on column public.library_sheet_revisions.kind is
  '''sheet'' is a coloring sheet; ''photo'' is an AI portrait version of the photo itself.';
comment on column public.library_sheet_revisions.orientation is
  'Shape of this version when it differs from the uploaded photo; null follows the photo.';
comment on column public.library_sheet_revisions.source_revision_id is
  'The photo version a sheet was drawn from; null means the uploaded photo.';
