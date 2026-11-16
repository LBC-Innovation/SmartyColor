-- Lined backs: with blank backs on, the customer can have the back of each
-- page ruled for journaling or notes instead of left empty. Same sheets, same
-- price. The ruled backs are already in print_pages
-- ({"kind":"blank","variant":"lined","back":true}); lined_backs keeps the
-- choice beside them so order pages, emails and admin can say "lined backs"
-- without parsing the list.

alter table public.book_orders
  add column if not exists lined_backs boolean not null default false;

comment on column public.book_orders.lined_backs is
  'With blank_backs, every back is a ruled writing page rather than empty.';
