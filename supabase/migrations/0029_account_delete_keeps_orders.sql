-- Deleting an account keeps its purchase records, unlinked from the person.
--
-- Before: book_orders.user_id was ON DELETE RESTRICT, so an account with any order could not be
-- deleted, and the "who did this" columns (canceled_by, deleted_by, credit_ledger.created_by) had no
-- ON DELETE rule, so an admin who ever cancelled an order or granted credit couldn't be deleted either.
-- Meanwhile credit_ledger and credit_stripe_sessions cascaded, so a deleted customer's payments would
-- vanish from finance reports.
--
-- After: all of these are set to null when the user goes. The app wipes the personal parts of the
-- orders (address, email, gift note, cover, page lists, file paths) before deleting the user, so
-- what remains is amounts, dates, status and Lulu/Stripe references.

alter table public.book_orders
  alter column user_id drop not null,
  alter column contact_email drop not null,
  alter column shipping_address drop not null;

alter table public.book_orders
  drop constraint book_orders_user_id_fkey,
  add constraint book_orders_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete set null,
  drop constraint book_orders_canceled_by_fkey,
  add constraint book_orders_canceled_by_fkey
    foreign key (canceled_by) references auth.users (id) on delete set null,
  drop constraint book_orders_deleted_by_fkey,
  add constraint book_orders_deleted_by_fkey
    foreign key (deleted_by) references auth.users (id) on delete set null;

alter table public.credit_ledger
  alter column user_id drop not null;

alter table public.credit_ledger
  drop constraint credit_ledger_user_id_fkey,
  add constraint credit_ledger_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete set null,
  drop constraint credit_ledger_created_by_fkey,
  add constraint credit_ledger_created_by_fkey
    foreign key (created_by) references auth.users (id) on delete set null;

alter table public.credit_stripe_sessions
  alter column user_id drop not null;

alter table public.credit_stripe_sessions
  drop constraint credit_stripe_sessions_user_id_fkey,
  add constraint credit_stripe_sessions_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete set null;
