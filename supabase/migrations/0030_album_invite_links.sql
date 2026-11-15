-- Album invite links: an owner can invite someone by text message (or any other app) with a
-- link instead of an email address. A link invite is a share row with no email; the first
-- signed-in person to open the link claims it, and the row then takes their account and email.
-- Each link is single-use, so a forwarded text can't let a stranger in after it's been claimed.

alter table public.library_project_shares
  alter column email drop not null;

-- (project_id, email) stays unique for email invites; Postgres treats NULLs as distinct, so an
-- album can have several unclaimed links at once.

-- How the invite went out. A claimed link row gets the joiner's email, so this is what keeps the
-- public invite preview from showing that address to anyone else holding the link.
alter table public.library_project_shares
  add column if not exists invited_via text not null default 'email'
    check (invited_via in ('email', 'link'));

alter table public.library_project_shares
  drop constraint if exists library_project_shares_email_or_link;
alter table public.library_project_shares
  add constraint library_project_shares_email_or_link
    check (email is not null or invited_via = 'link');
