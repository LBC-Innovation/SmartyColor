-- Blank backs: each coloring page prints on its own sheet with the back left
-- blank, so markers can't bleed through onto the next picture. On by default
-- at checkout; the customer can turn it off to print both sides and pay less.
--
-- The printer has no one-sided option, so the blank backs are real pages in
-- print_pages ({"kind":"blank","back":true}) and page_count counts them, as
-- Lulu does. blank_backs keeps the choice beside them so order pages, emails,
-- support and reports can say "24 pages, blank backs" without parsing the list.

alter table public.book_orders
  add column if not exists blank_backs boolean not null default false;

comment on column public.book_orders.blank_backs is
  'Every page is followed by a blank back (one page per sheet); page_count is twice the pages the customer made.';
