-- Account activity: one row per thing a user did (uploads, sheets, albums, orders)
-- or that happened to their wallet. Descriptions are written when the event happens,
-- so they still read correctly after the photo or album they name is deleted.
--
-- credit_ledger stays the source of truth for money. Every ledger entry is mirrored
-- here by a trigger; everything else is written by the API (src/server/activityService.ts).

create table if not exists public.account_activity (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  category      text not null check (category in ('photos', 'sheets', 'albums', 'orders', 'wallet')),
  type          text not null,
  description   text not null,
  amount_cents  integer,                    -- wallet change in USD cents; null when the wallet was not touched
  balance_after_cents integer,
  ledger_id     uuid unique references public.credit_ledger (id) on delete cascade,
  stripe_checkout_session_id text,          -- set for card top-ups; used to fetch the Stripe receipt
  reference_type text,
  reference_id  uuid,
  metadata      jsonb not null default '{}'::jsonb,
  occurred_at   timestamptz not null default now()
);

create index if not exists account_activity_user_occurred_idx
  on public.account_activity (user_id, occurred_at desc, id desc);
create index if not exists account_activity_user_category_idx
  on public.account_activity (user_id, category, occurred_at desc);

-- Server-only table: every read/write goes through the API with the service role.
alter table public.account_activity enable row level security;
grant select, insert on table public.account_activity to service_role;

-- Mirror one ledger entry into the activity log.
create or replace function public.record_ledger_activity(p_entry public.credit_ledger)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_category text := 'wallet';
  v_type text;
  v_description text;
  v_name text;
  v_note text := nullif(trim(p_entry.note), '');
begin
  case p_entry.reason
    when 'stripe_purchase' then
      v_type := 'funds_added';
      v_description := 'Added funds by card';
    when 'order_payment' then
      select nullif(trim(project_title), '') into v_name
      from public.book_orders
      where id = p_entry.reference_id;
      v_category := 'orders';
      v_type := 'book_ordered';
      v_description := case
        when v_name is null then 'Ordered a printed book'
        else format('Ordered printed book “%s”', v_name)
      end;
    when 'sheet_generation', 'sheet_edit' then
      select nullif(trim(file_name), '') into v_name
      from public.library_photos
      where id = p_entry.reference_id;
      v_category := 'sheets';
      if p_entry.reason = 'sheet_edit' then
        v_type := 'sheet_edited';
        v_description := case
          when v_name is null then 'Edited a coloring sheet'
          else format('Edited the coloring sheet for “%s”', v_name)
        end;
      else
        v_type := 'sheet_generated';
        v_description := case
          when v_name is null then 'Generated a coloring sheet'
          else format('Generated a coloring sheet from “%s”', v_name)
        end;
      end if;
    when 'usage_refund' then
      v_type := 'refund';
      v_description := case when v_note is null then 'Refund' else 'Refund: ' || v_note end;
    else
      if p_entry.delta >= 0 then
        v_type := 'credit_granted';
        v_description := coalesce(v_note, 'Credit added by Colorful Memories');
      else
        v_type := 'credit_removed';
        v_description := coalesce(v_note, 'Credit adjustment by Colorful Memories');
      end if;
  end case;

  insert into public.account_activity (
    user_id,
    category,
    type,
    description,
    amount_cents,
    balance_after_cents,
    ledger_id,
    reference_type,
    reference_id,
    occurred_at
  )
  values (
    p_entry.user_id,
    v_category,
    v_type,
    v_description,
    p_entry.delta,
    p_entry.balance_after,
    p_entry.id,
    p_entry.reference_type,
    p_entry.reference_id,
    p_entry.created_at
  )
  on conflict (ledger_id) do nothing;
end;
$$;

create or replace function public.credit_ledger_record_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.record_ledger_activity(new);
  return new;
end;
$$;

revoke all on function public.record_ledger_activity(public.credit_ledger)
  from public, anon, authenticated;
revoke all on function public.credit_ledger_record_activity()
  from public, anon, authenticated;

drop trigger if exists credit_ledger_record_activity on public.credit_ledger;
create trigger credit_ledger_record_activity
  after insert on public.credit_ledger
  for each row
  execute function public.credit_ledger_record_activity();

-- Same as 0009, plus: remember which Stripe checkout paid for the top-up so the
-- user can pull its receipt from their history.
create or replace function public.grant_purchased_credits(
  p_user_id uuid,
  p_delta integer,
  p_stripe_session_id text,
  p_note text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_ledger_id uuid;
begin
  if p_delta <= 0 then
    raise exception 'delta must be positive';
  end if;

  if exists (
    select 1 from public.credit_stripe_sessions
    where stripe_checkout_session_id = p_stripe_session_id
  ) then
    select credits_balance into v_balance
    from public.profiles
    where id = p_user_id;
    return coalesce(v_balance, 0);
  end if;

  select credits_balance into v_balance
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'profile not found';
  end if;

  v_balance := v_balance + p_delta;

  update public.profiles
  set credits_balance = v_balance
  where id = p_user_id;

  insert into public.credit_ledger (
    user_id,
    delta,
    balance_after,
    reason,
    note
  )
  values (
    p_user_id,
    p_delta,
    v_balance,
    'stripe_purchase',
    coalesce(nullif(trim(p_note), ''), p_stripe_session_id)
  )
  returning id into v_ledger_id;

  update public.account_activity
  set stripe_checkout_session_id = p_stripe_session_id
  where ledger_id = v_ledger_id;

  insert into public.credit_stripe_sessions (
    stripe_checkout_session_id,
    user_id,
    amount_cents
  )
  values (p_stripe_session_id, p_user_id, p_delta);

  return v_balance;
end;
$$;

revoke all on function public.grant_purchased_credits(uuid, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.grant_purchased_credits(uuid, integer, text, text)
  to service_role;

-- ---------------------------------------------------------------- backfill

-- Wallet history.
select public.record_ledger_activity(l)
from public.credit_ledger l
order by l.created_at;

-- Past top-ups: the ledger entry and the session row were written in one
-- transaction, so they share a timestamp.
update public.account_activity a
set stripe_checkout_session_id = s.stripe_checkout_session_id
from public.credit_stripe_sessions s
where a.type = 'funds_added'
  and a.stripe_checkout_session_id is null
  and s.user_id = a.user_id
  and s.amount_cents = a.amount_cents
  and s.credited_at = a.occurred_at;

-- Albums and photos that still exist. Anything deleted before this migration is gone.
insert into public.account_activity (user_id, category, type, description, reference_type, reference_id, occurred_at)
select
  p.user_id,
  'albums',
  'album_created',
  format('Created album “%s”', p.name),
  'library_project',
  p.id,
  p.created_at
from public.library_projects p
where not exists (
  select 1 from public.account_activity a
  where a.type = 'album_created' and a.reference_id = p.id
);

insert into public.account_activity (user_id, category, type, description, reference_type, reference_id, occurred_at)
select
  coalesce(ph.uploaded_by, ph.user_id),
  'photos',
  'photo_uploaded',
  case
    when nullif(trim(ph.file_name), '') is null then format('Uploaded a photo to “%s”', pr.name)
    else format('Uploaded “%s” to “%s”', trim(ph.file_name), pr.name)
  end,
  'library_photo',
  ph.id,
  ph.created_at
from public.library_photos ph
join public.library_projects pr on pr.id = ph.project_id
where not exists (
  select 1 from public.account_activity a
  where a.type = 'photo_uploaded' and a.reference_id = ph.id
);

-- Sheets that were never charged (made before metering, or free edits): a charged
-- sheet already has its ledger entry, written just before the revision was stored.
insert into public.account_activity (user_id, category, type, description, reference_type, reference_id, occurred_at)
select
  coalesce(r.created_by, r.user_id),
  'sheets',
  case when r.seq = 1 then 'sheet_generated' else 'sheet_edited' end,
  case
    when r.seq = 1 and r.file_name is null then 'Generated a coloring sheet'
    when r.seq = 1 then format('Generated a coloring sheet from “%s”', r.file_name)
    when r.file_name is null then 'Edited a coloring sheet'
    else format('Edited the coloring sheet for “%s”', r.file_name)
  end,
  'library_photo',
  r.photo_id,
  r.created_at
from (
  select
    rev.*,
    nullif(trim(ph.file_name), '') as file_name,
    row_number() over (partition by rev.photo_id order by rev.created_at, rev.id) as seq
  from public.library_sheet_revisions rev
  join public.library_photos ph on ph.id = rev.photo_id
) r
where not exists (
  select 1 from public.credit_ledger l
  where l.reference_id = r.photo_id
    and l.reason in ('sheet_generation', 'sheet_edit')
    and l.created_at between r.created_at - interval '30 seconds' and r.created_at
)
and not exists (
  select 1 from public.account_activity a
  where a.category = 'sheets'
    and a.reference_id = r.photo_id
    and a.occurred_at = r.created_at
);
