-- Self-service (own name, avatar, email, password, account) is now a right of every signed-in
-- account rather than the usermanage:selfmanage permission. Holding that permission made ordinary
-- customers show up as staff, so strip it from everyone who has it.

update auth.users
set raw_app_meta_data = jsonb_set(
  raw_app_meta_data,
  '{permissions}',
  coalesce(
    (
      select jsonb_agg(p)
      from jsonb_array_elements(raw_app_meta_data -> 'permissions') as p
      where p <> to_jsonb('usermanage:selfmanage'::text)
    ),
    '[]'::jsonb
  )
)
where raw_app_meta_data -> 'permissions' ? 'usermanage:selfmanage';
