-- Already live in production: applied by hand on 2026-10-13 as `profiles_revoke_client_update`
-- but never committed, so a database rebuilt from these files would still have the hole.
-- Every statement is idempotent, so running it again changes nothing.
--
-- Close a privilege escalation on public.profiles.
--
-- 0003 granted table-wide UPDATE to `authenticated`, and the "users: update own
-- profile" policy only checks row ownership. Together they let any signed-in user
-- PATCH their own row through PostgREST and set credits_balance, status,
-- plan_tier or welcome_credit_settled_at.
--
-- Every profile write in the app goes through the API with the service role
-- (which bypasses RLS), so the client needs no write access at all. Reads of the
-- user's own row stay as they are.

revoke update on table public.profiles from authenticated, anon;

drop policy if exists "users: update own profile" on public.profiles;

-- Supabase default privileges also hand these out; none are needed by API roles.
revoke insert, delete, truncate, references, trigger
  on table public.profiles from authenticated, anon;
