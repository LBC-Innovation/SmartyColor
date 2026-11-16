-- Customer acquisition: where people come from, what it costs, and the follow-up emails.
--
-- 1. Guests: their AI cost rows (vision_usage_events, guest_ip set) also carry the channel,
--    source and campaign from their cm_attr cookie, so /admin/acquisition can show what free
--    pages from each channel cost before anyone signs up.
-- 2. "How did you hear about us?": one optional answer per account, asked once after sign-up.
--    It catches word of mouth, podcasts and organic posts that links can't tag.
-- 3. marketing_spend: ad spend entered by hand per month and channel (and optionally source and
--    campaign), for cost per customer and return on ad spend.
-- 4. marketing_links: short campaign links (/go/<slug>) that redirect with UTM tags. Used for
--    QR codes, print, bios and creators; each visit counts a click.
-- 5. Lifecycle emails: a reminder for an unfinished book, and a review request after delivery.
--    lifecycle_emails makes each one go out at most once; profiles.marketing_emails_opt_out is
--    the unsubscribe switch.
--
-- Profiles and orders already carry attribution jsonb (0024). New touches also hold the referring
-- site's hostname and the channel; reports classify again from the raw fields, so rows written
-- before this migration are counted the same way.

-- 1 ---------------------------------------------------------------------------------------------

alter table public.vision_usage_events
  add column if not exists acq_channel  text,
  add column if not exists acq_source   text,
  add column if not exists acq_campaign text;

comment on column public.vision_usage_events.acq_channel is
  'Guest calls only: acquisition channel from the visitor''s cm_attr cookie (paid_social, share, …).';

-- 2 ---------------------------------------------------------------------------------------------

alter table public.profiles
  add column if not exists heard_from        text,
  add column if not exists heard_from_detail text,
  add column if not exists heard_from_at     timestamptz,
  add column if not exists marketing_emails_opt_out boolean not null default false;

alter table public.profiles
  drop constraint if exists profiles_heard_from_check;
alter table public.profiles
  add constraint profiles_heard_from_check check (
    heard_from is null or heard_from in (
      'friend_family', 'facebook_instagram', 'tiktok', 'pinterest', 'youtube', 'google_search',
      'school_group', 'podcast_blog', 'gift', 'ad_other', 'other', 'skipped'
    )
  );
alter table public.profiles
  drop constraint if exists profiles_heard_from_detail_len;
alter table public.profiles
  add constraint profiles_heard_from_detail_len check (heard_from_detail is null or char_length(heard_from_detail) <= 200);

comment on column public.profiles.heard_from is
  'Self-reported "How did you hear about us?" answer (fixed option id), or ''skipped''.';
comment on column public.profiles.marketing_emails_opt_out is
  'True once the person unsubscribed from reminder and review-request emails. Order emails still go out.';

-- 3 ---------------------------------------------------------------------------------------------

create table if not exists public.marketing_spend (
  id           uuid primary key default gen_random_uuid(),
  month        date not null check (extract(day from month) = 1),  -- first day of the month
  channel      text not null,                                       -- see src/lib/marketing/channel.ts
  source       text not null default '',                            -- google, meta, tiktok… ('' = all)
  campaign     text not null default '',                            -- utm_campaign ('' = all)
  amount_cents integer not null check (amount_cents between 0 and 100000000),
  note         text check (note is null or char_length(note) <= 300),
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (month, channel, source, campaign)
);

comment on table public.marketing_spend is
  'Ad and marketing spend per month, entered on /admin/acquisition. Service role only.';

alter table public.marketing_spend enable row level security;
grant select, insert, update, delete on table public.marketing_spend to service_role;

-- 4 ---------------------------------------------------------------------------------------------

create table if not exists public.marketing_links (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,47}$'),
  destination   text not null check (destination ~ '^/[^/]' or destination = '/'),  -- a path on this site
  utm_source    text not null check (char_length(utm_source) between 1 and 80),
  utm_medium    text not null check (char_length(utm_medium) between 1 and 80),
  utm_campaign  text not null check (char_length(utm_campaign) between 1 and 120),
  utm_content   text check (utm_content is null or char_length(utm_content) <= 120),
  promo_note    text check (promo_note is null or char_length(promo_note) <= 300),
  clicks        integer not null default 0,
  last_click_at timestamptz,
  archived_at   timestamptz,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);

comment on table public.marketing_links is
  'Short campaign links: /go/<slug> redirects to destination with the UTM tags. Service role only.';

alter table public.marketing_links enable row level security;
grant select, insert, update, delete on table public.marketing_links to service_role;

-- Count a click and return where to send the visitor, in one round trip. Null when unknown or archived.
create or replace function public.follow_marketing_link(p_slug text)
returns table (destination text, utm_source text, utm_medium text, utm_campaign text, utm_content text)
language sql
security definer
set search_path = public
as $$
  update public.marketing_links l
     set clicks = l.clicks + 1, last_click_at = now()
   where l.slug = lower(p_slug) and l.archived_at is null
  returning l.destination, l.utm_source, l.utm_medium, l.utm_campaign, l.utm_content;
$$;

revoke all on function public.follow_marketing_link(text) from public, anon, authenticated;
grant execute on function public.follow_marketing_link(text) to service_role;

-- 5 ---------------------------------------------------------------------------------------------

create table if not exists public.lifecycle_emails (
  user_id  uuid not null references auth.users (id) on delete cascade,
  kind     text not null check (kind in ('unfinished_book', 'review_request', 'referral_credit')),
  ref_id   uuid not null,          -- the order (or referred account) the email was about
  sent_at  timestamptz not null default now(),
  primary key (kind, ref_id)
);

create index if not exists lifecycle_emails_user_idx on public.lifecycle_emails (user_id, sent_at desc);

comment on table public.lifecycle_emails is
  'One row per reminder/review/referral email sent, so each goes out once. Service role only.';

alter table public.lifecycle_emails enable row level security;
grant select, insert, update, delete on table public.lifecycle_emails to service_role;
