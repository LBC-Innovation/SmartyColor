-- PostgREST: service_role must have GRANT (RLS policies alone are not enough).

grant select, insert, update, delete on table public.print_products to service_role;
grant select, insert, update, delete on table public.book_orders to service_role;
grant select, insert, update, delete on table public.book_order_events to service_role;
grant select, insert, update, delete on table public.credit_ledger to service_role;

grant select on table public.print_products to authenticated;
grant select on table public.book_orders to authenticated;
grant select on table public.book_order_events to authenticated;
grant select on table public.credit_ledger to authenticated;

grant usage on type public.book_order_status to service_role, authenticated;
grant usage on type public.book_payment_method to service_role, authenticated;
