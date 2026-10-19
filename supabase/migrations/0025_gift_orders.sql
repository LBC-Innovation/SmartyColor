-- Gift orders: the book ships to someone else, optionally with a short note.
--
-- The printer's API has no gift-message field, so the note prints as the first
-- page of the book (it is also in print_pages); gift_note keeps a copy for
-- support and reporting. is_gift is sent with the checkout_started and
-- purchase analytics events.

alter table public.book_orders
  add column if not exists is_gift boolean not null default false,
  add column if not exists gift_note text;

alter table public.book_orders
  drop constraint if exists book_orders_gift_note_length;
alter table public.book_orders
  add constraint book_orders_gift_note_length check (gift_note is null or char_length(gift_note) <= 200);

comment on column public.book_orders.is_gift is
  'The customer marked this order as a gift (shipped to someone else).';
comment on column public.book_orders.gift_note is
  'Gift note printed as the first page of the book, at most 200 characters.';
