-- PostgREST roles need explicit table grants. service_role bypasses RLS but must have GRANT.

grant select, insert, update, delete on table public.profiles to service_role;
grant select, insert, update, delete on table public.profiles to postgres;
grant select, update on table public.profiles to authenticated;

grant select, insert, update, delete on table public.coloring_sessions to service_role;
grant select, insert, update, delete on table public.generated_sheets to service_role;
grant select, insert, update on table public.coloring_sessions to authenticated;
grant select, insert on table public.generated_sheets to authenticated;
