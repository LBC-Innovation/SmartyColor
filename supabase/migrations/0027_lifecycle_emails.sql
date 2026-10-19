-- Lifecycle emails (welcome, unfinished book, holiday deadline, order confirmed
-- and shipped, "How did it go?"), the marketing opt-out they honor, and the
-- customer stories the review email collects.

-- One row per email per trigger. The unique key is what makes every email fire
-- once: a send first claims its (kind, ref_key) row, and a second claim fails.
create table if not exists public.email_sends (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users (id) on delete set null,
  kind       text not null,
  -- What the email is about: the user, cart or order id, plus the stage for
  -- emails with several (e.g. 'holiday:2026-12-07:5d:<user id>').
  ref_key    text not null,
  to_email   text not null,
  status     text not null default 'sending' check (status in ('sending', 'sent')),
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  unique (kind, ref_key)
);

comment on table public.email_sends is
  'Lifecycle emails sent (or being sent). The (kind, ref_key) key keeps each email to one send per trigger.';

create index if not exists email_sends_user_idx on public.email_sends (user_id, created_at desc);

alter table public.email_sends enable row level security;
grant select, insert, update, delete on table public.email_sends to service_role;

-- Marketing opt-out. Set from the unsubscribe link; every marketing send checks
-- it. Order and shipping emails ignore it.
alter table public.profiles
  add column if not exists marketing_emails_opt_out_at timestamptz;

-- Stories sent back from the "How did it go?" email. Nothing here shows on the
-- site by itself: an admin approves an entry, then adds it to
-- src/content/testimonials.ts.
create table if not exists public.testimonial_submissions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  order_id    uuid references public.book_orders (id) on delete set null,
  quote       text not null check (char_length(quote) between 1 and 500),
  first_name  text not null check (char_length(first_name) between 1 and 60),
  relation    text not null default '' check (char_length(relation) <= 60),
  -- Storage path in the private "library" bucket, when a photo was sent.
  photo_path  text,
  -- The customer ticked "You may use my quote and photo on the site".
  consent     boolean not null default false,
  consent_at  timestamptz,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

comment on table public.testimonial_submissions is
  'Customer quotes and photos from the review email. Approved entries are copied into src/content/testimonials.ts.';

create index if not exists testimonial_submissions_status_idx
  on public.testimonial_submissions (status, created_at desc);

alter table public.testimonial_submissions enable row level security;
grant select, insert, update, delete on table public.testimonial_submissions to service_role;
