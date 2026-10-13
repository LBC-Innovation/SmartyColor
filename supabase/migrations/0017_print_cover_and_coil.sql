-- Printed books: spiral (coil) binding, a customer-designed cover, the page
-- arrangement, a required proof check, and the print-ready files for the printer.

insert into public.print_products (id, name, pod_package_id, min_pages, max_pages)
values (
  'coloring-book-coil-bw-85x11',
  'Custom coloring book — spiral bound (8.5×11, B&W)',
  '0850X1100.BW.STD.CO.060UW444.MXX',
  2,
  470
)
on conflict (id) do update set
  name = excluded.name,
  pod_package_id = excluded.pod_package_id,
  min_pages = excluded.min_pages,
  max_pages = excluded.max_pages;

alter table public.book_orders
  add column if not exists print_pages jsonb,
  add column if not exists cover_design jsonb,
  add column if not exists billing_address jsonb,
  add column if not exists proof_confirmed_at timestamptz,
  add column if not exists interior_pdf_path text,
  add column if not exists cover_pdf_path text;

comment on column public.book_orders.print_pages is
  'Print orders: ordered page manifest (revision ids, rotation, mirror, blank/lined pages), padding included.';
comment on column public.book_orders.cover_design is
  'Print orders: the cover the customer designed (layout, text, colors, overlay).';
comment on column public.book_orders.billing_address is
  'Billing address; the shipping address is separate when the customer ships elsewhere.';
comment on column public.book_orders.proof_confirmed_at is
  'When the customer flipped through the whole book and confirmed it is as expected.';
comment on column public.book_orders.interior_pdf_path is
  'Print orders: print-ready interior PDF in the library bucket.';
comment on column public.book_orders.cover_pdf_path is
  'Print orders: print-ready cover spread PDF in the library bucket.';
