insert into public.print_products (id, name, pod_package_id, min_pages, max_pages)
values (
  'coloring-book-saddle-bw-85x11',
  'Custom coloring book — saddle stitch (8.5×11, B&W)',
  '0850X1100.BW.STD.SS.060UW444.MXX',
  4,
  48
)
on conflict (id) do update set
  name = excluded.name,
  pod_package_id = excluded.pod_package_id,
  min_pages = excluded.min_pages,
  max_pages = excluded.max_pages;
