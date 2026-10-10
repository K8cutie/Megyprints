-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0042_unpaid_order_expiry.sql  (idempotent; safe to re-run)
--
--  WHY: Place order uploads the print PDF, the cover PDF and the memory videos
--  BEFORE the payment QR shows. That order is deliberate: the photos live only
--  on the customer's phone, so a paid order must never be missing its print
--  file. But nothing ever expired an unpaid order or removed its files, and
--  one account could place any number of them. On 2026-10-09 six unpaid
--  orders (the oldest 97 days) held 58.7 MB of the 92 MB in print-pdfs.
--
--  What this adds:
--    1. A limit: at most unpaid_order_limit() (3) unpaid orders per account.
--       The 4th is refused with a plain sentence (SQLSTATE MP001). A customer
--       can cancel their own unpaid order (cancel_my_unpaid_order) to free a
--       place.
--    2. expire_unpaid_orders(): an order still unpaid after
--       unpaid_order_days() (7) days, where the customer never tapped
--       "I've sent ₱X", is cancelled. An order whose customer says they paid
--       is NEVER cancelled by this; the owner checks GoTyme and decides.
--    3. Cleanup of the cloud files of CANCELLED orders, cancelled_files_keep_days()
--       (3) days after the cancel, so a weekend's late payment or a misclick
--       in the admin dropdown can still be undone with nothing lost.
--       api/expire-orders.mjs does the removing (SQL cannot delete Storage
--       files, see api/delete-account.mjs). Removed: <id>.pdf, <id>-cover.pdf,
--       the order's memory videos and their memory rows, and videos uploaded
--       early (when /order opened) for a checkout that never finished. Kept:
--       the order row (marked Cancelled), the album, the receipt, and
--       everything on the customer's phone.
--    4. Once an order's cleanup has started it can't be reopened or marked
--       paid (MP002): there would be nothing to print. A cancelled order takes
--       no new print files or receipts, and "I've sent" on it is refused with
--       what to do instead (MP003).
--
--  A memory video is only removed when ALL of these hold, because a printed
--  QR must never point at nothing:
--    • it was uploaded after this migration (clip_purge_since()). Before it,
--      checkout deleted the phone's copy right after upload, so the cloud copy
--      of an older video may be the only one;
--    • no order that isn't cleaned up yet (anyone's) carries the code in
--      memory_codes (every "code" key anywhere in its album copy, kept by a
--      trigger, so a false match only ever KEEPS a file);
--    • the uploader has no paid-or-later order placed after (or within a day
--      before) the upload, and the order's album has none either. An album
--      copy can lag the print job by a throttled save (orders.ts), so a paid
--      order near the upload is assumed to have printed it;
--    • nobody has ever scanned it, and its memory row (if any) is the
--      uploader's own clip.
--
--  All of the expiry and cleanup functions are service_role only.
-- ════════════════════════════════════════════════════════════════════════════

-- ══════ 0. The numbers, in one place ══════
-- The checkout copy mirrors the first two (src/lib/orderExpiry.ts); a spec
-- reads this file and fails if they drift.
create or replace function public.unpaid_order_days()
returns integer language sql immutable set search_path = '' as $$ select 7 $$;

create or replace function public.unpaid_order_limit()
returns integer language sql immutable set search_path = '' as $$ select 3 $$;

create or replace function public.cancelled_files_keep_days()
returns integer language sql immutable set search_path = '' as $$ select 3 $$;

revoke all on function public.unpaid_order_days() from public;
revoke all on function public.unpaid_order_limit() from public;
revoke all on function public.cancelled_files_keep_days() from public;
grant execute on function public.unpaid_order_days() to anon, authenticated, service_role;
grant execute on function public.unpaid_order_limit() to anon, authenticated, service_role;
grant execute on function public.cancelled_files_keep_days() to service_role;

-- When this migration first ran. Videos uploaded before it are never removed
-- (see the header). Created once; a re-run keeps the first time.
do $$
begin
  if to_regprocedure('public.clip_purge_since()') is null then
    execute format(
      'create function public.clip_purge_since() returns timestamptz language sql stable set search_path = '''' as %L',
      format('select %L::timestamptz', now()::text));
  end if;
end $$;
revoke all on function public.clip_purge_since() from public, anon, authenticated;
grant execute on function public.clip_purge_since() to service_role;

-- ══════ 1. Bookkeeping columns ══════
-- All of them are written by the database only (orders_lifecycle_guard and the
-- functions below); a client value is ignored on insert and pinned on update.
alter table public.orders add column if not exists cancelled_at timestamptz;
alter table public.orders add column if not exists cancelled_by text;
alter table public.orders add column if not exists reopened_at timestamptz;
alter table public.orders add column if not exists purge_started_at timestamptz;
alter table public.orders add column if not exists files_purged_at timestamptz;
alter table public.orders add column if not exists memory_codes text[] not null default '{}';
create index if not exists orders_memory_codes_gin on public.orders using gin (memory_codes);

-- ══════ 2. The memory codes on an album copy ══════
-- Every string under a key named "code", anywhere in the copy, that is
-- code-shaped: both QR homes (qrFills, textSlotQr), the cover, anything a later
-- build adds. Wider than apply_order_hosting_term's reading (0030) on purpose:
-- here a wrong match can only keep a file.
create or replace function public.order_memory_codes(p_snapshot jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(distinct v #>> '{}'), '{}'::text[])
    from jsonb_path_query(coalesce(p_snapshot, '{}'::jsonb), 'lax $.**.code') v
   where jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^[a-z2-9]{4,32}$';
$$;
revoke all on function public.order_memory_codes(jsonb) from public, anon, authenticated;
grant execute on function public.order_memory_codes(jsonb) to service_role;

-- Kept by the database from the album copy, never by a client. Security
-- definer because it runs on a customer's insert and order_memory_codes is
-- not granted to customers.
create or replace function public.orders_set_memory_codes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.memory_codes := public.order_memory_codes(new.album_snapshot);
  return new;
end;
$$;
revoke all on function public.orders_set_memory_codes() from public, anon, authenticated;

-- On insert here; on every update orders_lifecycle_guard recomputes it, so
-- no writer (the owner's account included) can set it by hand.
drop trigger if exists orders_memory_codes_trg on public.orders;
create trigger orders_memory_codes_trg
  before insert on public.orders
  for each row execute function public.orders_set_memory_codes();

-- ══════ 4. At most 3 unpaid orders per account ══════
-- A trigger, not the RLS insert policy: a policy refusal reads "new row
-- violates row-level security policy", and the customer deserves a sentence.
-- The advisory lock makes orders placed at the same instant count each other
-- (proved: 8 at once placed 8 without it, 3 with it).
create or replace function public.orders_unpaid_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_open integer;
begin
  -- A new order has no cleanup or payment history. Whatever a client sends
  -- here would hide its files from the cleanup, or make it look "sent"
  -- (never expiring, pointing the console at someone else's receipt).
  new.cancelled_at := null;
  new.cancelled_by := null;
  new.reopened_at := null;
  new.purge_started_at := null;
  new.files_purged_at := null;
  new.payment_submitted_at := null;
  new.payment_proof_path := null;
  new.payment_reference := null;

  if new.status = 'pending_payment' and new.user_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('orders_unpaid_cap:' || new.user_id::text, 0));
    select count(*) into v_open
      from public.orders o
     where o.user_id = new.user_id
       and o.status = 'pending_payment'
       and o.payment_status = 'unpaid';
    if v_open >= public.unpaid_order_limit() then
      raise exception 'You already have % orders waiting for payment. Pay for one of them first, or cancel one in Your orders. An unpaid order closes by itself after % days.',
        v_open, public.unpaid_order_days()
        using errcode = 'MP001';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.orders_unpaid_cap() from public, anon, authenticated;

drop trigger if exists orders_unpaid_cap_trg on public.orders;
create trigger orders_unpaid_cap_trg
  before insert on public.orders
  for each row execute function public.orders_unpaid_cap();

-- ══════ 5. Cancelling, reopening, paying: what the cleanup depends on ══════
-- Every UPDATE, every writer (the owner's account through the API included):
--   • the cleanup columns only move forward (set once, never cleared), and
--     memory_codes always matches the album copy;
--   • cancelled_at / cancelled_by / reopened_at are stamped here, from the
--     status change, and pinned otherwise. cancelled_by says whose cancel it
--     was ('customer', 'auto-expire', else 'owner'); a function sets it in the
--     same UPDATE as the status;
--   • once the cleanup has started, the order can't be reopened or marked
--     paid (MP002): there would be nothing to print.
create or replace function public.orders_lifecycle_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gone boolean := old.purge_started_at is not null or old.files_purged_at is not null;
  v_by   text := case when new.cancelled_by is distinct from old.cancelled_by then new.cancelled_by end;
begin
  new.purge_started_at := coalesce(old.purge_started_at, new.purge_started_at);
  new.files_purged_at  := coalesce(old.files_purged_at, new.files_purged_at);
  new.memory_codes     := public.order_memory_codes(new.album_snapshot);
  new.cancelled_at     := old.cancelled_at;
  new.cancelled_by     := old.cancelled_by;
  new.reopened_at      := old.reopened_at;

  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    new.cancelled_at := now();
    new.cancelled_by := coalesce(v_by, 'owner');
  elsif old.status = 'cancelled' and new.status is distinct from 'cancelled' then
    if v_gone then
      raise exception 'This order''s print files were removed after it closed unpaid, so it can''t be reopened or printed. Ask the customer to order the album again from their phone: the album and photos are still there.'
        using errcode = 'MP002';
    end if;
    new.cancelled_at := null;
    new.cancelled_by := null;
    -- Its 7 days start again from here, or tonight's run would close it again.
    new.reopened_at := now();
  end if;
  if new.payment_status = 'paid' and old.payment_status is distinct from 'paid' and v_gone then
    raise exception 'This order''s print files were removed after it closed unpaid, so it can''t be marked paid. Ask the customer to order the album again from their phone, and apply the payment to the new order.'
      using errcode = 'MP002';
  end if;
  return new;
end;
$$;
revoke all on function public.orders_lifecycle_guard() from public, anon, authenticated;

drop trigger if exists orders_lifecycle_guard_trg on public.orders;
create trigger orders_lifecycle_guard_trg
  before update on public.orders
  for each row execute function public.orders_lifecycle_guard();

-- ══════ 5b. Backfill existing orders ══════
-- Without touching their updated_at (on_order_updated) and past the guard
-- (which pins these columns), so a re-run is safe too.
alter table public.orders disable trigger on_order_updated;
alter table public.orders disable trigger orders_lifecycle_guard_trg;
update public.orders o
   set memory_codes = public.order_memory_codes(o.album_snapshot)
 where o.memory_codes is distinct from public.order_memory_codes(o.album_snapshot);
update public.orders o
   set cancelled_at = coalesce(
         (select (h ->> 'at')::timestamptz
            from jsonb_array_elements(case when jsonb_typeof(o.status_history) = 'array'
                                           then o.status_history else '[]'::jsonb end) with ordinality e(h, i)
           where h ->> 'status' = 'cancelled'
             and (h ->> 'at') ~ '^\d{4}-\d{2}-\d{2}'
           order by i desc limit 1),
         o.updated_at),
       cancelled_by = coalesce(o.cancelled_by, 'owner')
 where o.status = 'cancelled' and o.cancelled_at is null;
alter table public.orders enable trigger orders_lifecycle_guard_trg;
alter table public.orders enable trigger on_order_updated;

-- ══════ 6. Cancel what was never paid ══════
create or replace function public.expire_unpaid_orders()
returns table (order_id uuid, order_number text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  return query
  update public.orders o
     set status = 'cancelled',
         cancelled_by = 'auto-expire',
         status_history = coalesce(o.status_history, '[]'::jsonb)
           || jsonb_build_object('status', 'cancelled', 'at', now(), 'by', 'auto-expire')
   where o.status = 'pending_payment'
     and o.payment_status = 'unpaid'
     and o.payment_submitted_at is null
     -- An order the owner reopened gets its 7 days again from the reopen.
     and greatest(o.created_at, coalesce(o.reopened_at, o.created_at))
         < now() - make_interval(days => public.unpaid_order_days())
  returning o.id, o.order_number;
end;
$$;
revoke all on function public.expire_unpaid_orders() from public, anon, authenticated;
grant execute on function public.expire_unpaid_orders() to service_role;

-- ══════ 7. The customer cancels their own unpaid order ══════
-- Only before they've said they paid: after "I've sent", money may be on its
-- way and the owner decides. Its files go on the next nightly run (the two-tap
-- confirm is the misclick guard). At most self_cancel_daily_limit() (3) a day,
-- so place → upload → cancel can't be looped to park files: together with the
-- 3-order limit an account adds at most 6 orders' files a day, and the
-- customer-cancelled ones go the next night.
create or replace function public.self_cancel_daily_limit()
returns integer language sql immutable set search_path = '' as $$ select 3 $$;
revoke all on function public.self_cancel_daily_limit() from public;
grant execute on function public.self_cancel_daily_limit() to authenticated, service_role;

create or replace function public.cancel_my_unpaid_order(p_order_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to cancel an order.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('orders_unpaid_cap:' || auth.uid()::text, 0));
  if (select count(*) from public.orders o
       where o.user_id = auth.uid()
         and o.cancelled_by = 'customer'
         and o.cancelled_at > now() - interval '1 day') >= public.self_cancel_daily_limit() then
    raise exception 'You''ve cancelled % orders today. This one closes by itself after % days if it isn''t paid.',
      public.self_cancel_daily_limit(), public.unpaid_order_days()
      using errcode = 'MP004';
  end if;
  update public.orders o
     set status = 'cancelled',
         cancelled_by = 'customer',
         status_history = coalesce(o.status_history, '[]'::jsonb)
           || jsonb_build_object('status', 'cancelled', 'at', now(), 'by', 'customer')
   where o.id = p_order_id
     and o.user_id = auth.uid()
     and o.status = 'pending_payment'
     and o.payment_status = 'unpaid'
     and o.payment_submitted_at is null;
  return found;
end;
$$;
revoke all on function public.cancel_my_unpaid_order(uuid) from public, anon;
grant execute on function public.cancel_my_unpaid_order(uuid) to authenticated;

-- ══════ 8. "I've sent ₱X" only on an order that is still open ══════
-- Same as 0033, plus: a cancelled order is refused with what to do.
create or replace function public.submit_payment_proof(
  p_order_id uuid,
  p_reference text default null,
  p_proof_path text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Sign in to submit a payment.';
  end if;
  if p_proof_path is not null
     and p_proof_path !~ ('^' || p_order_id::text || '\.(jpg|png|webp|pdf)$') then
    raise exception 'Receipt path does not belong to this order.';
  end if;

  update public.orders
     set payment_reference    = nullif(left(regexp_replace(coalesce(p_reference, ''), '[^A-Za-z0-9 _./-]', '', 'g'), 64), ''),
         payment_proof_path   = coalesce(p_proof_path, payment_proof_path),
         payment_submitted_at = now()
   where id = p_order_id
     and user_id = auth.uid()
     and payment_status = 'unpaid'
     and status = 'pending_payment';

  if not found then
    select o.status::text into v_status from public.orders o where o.id = p_order_id and o.user_id = auth.uid();
    if v_status = 'cancelled' then
      raise exception 'This order closed because it wasn''t paid within % days. If you already sent the money, message us with your receipt and we''ll sort it out. Your album is still saved, so you can also order it again.',
        public.unpaid_order_days()
        using errcode = 'MP003';
    end if;
    raise exception 'Order not found, or it is already paid.';
  end if;
end;
$$;
revoke all on function public.submit_payment_proof(uuid, text, text) from public;
revoke execute on function public.submit_payment_proof(uuid, text, text) from anon;
grant execute on function public.submit_payment_proof(uuid, text, text) to authenticated;

-- ══════ 9. No new files on a closed order ══════
-- 0017's print-file policies and 0033's receipt policies, plus "the order is
-- not closed". Without this a customer could put files back after the cleanup
-- and keep them forever. A print file can still be ADDED to a paid order (a
-- checkout whose upload failed, retried after the owner marked it paid);
-- replacing one, and receipts, stay pending-only.
drop policy if exists "print_pdfs_insert_own_order" on storage.objects;
create policy "print_pdfs_insert_own_order"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'print-pdfs'
    and exists (
      select 1 from public.orders o
      where storage.objects.name in (o.id::text || '.pdf', o.id::text || '-cover.pdf')
        and o.user_id = auth.uid()
        and o.status <> 'cancelled'
        and o.purge_started_at is null
    )
  );

drop policy if exists "print_pdfs_update_own_order" on storage.objects;
create policy "print_pdfs_update_own_order"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'print-pdfs'
    and exists (
      select 1 from public.orders o
      where storage.objects.name in (o.id::text || '.pdf', o.id::text || '-cover.pdf')
        and o.user_id = auth.uid()
        and o.status = 'pending_payment'
        and o.purge_started_at is null
    )
  );

drop policy if exists "payment_proofs_insert_own_order" on storage.objects;
create policy "payment_proofs_insert_own_order"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'payment-proofs'
    and exists (
      select 1 from public.orders o
      where storage.objects.name in (o.id::text || '.jpg', o.id::text || '.png', o.id::text || '.webp', o.id::text || '.pdf')
        and o.user_id = auth.uid()
        and o.payment_status = 'unpaid'
        and o.status = 'pending_payment'
    )
  );

drop policy if exists "payment_proofs_update_own_order" on storage.objects;
create policy "payment_proofs_update_own_order"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'payment-proofs'
    and exists (
      select 1 from public.orders o
      where storage.objects.name in (o.id::text || '.jpg', o.id::text || '.png', o.id::text || '.webp', o.id::text || '.pdf')
        and o.user_id = auth.uid()
        and o.payment_status = 'unpaid'
        and o.status = 'pending_payment'
    )
  );

-- ══════ 10. Which cancelled orders are due ══════
-- Only UNPAID cancelled orders: a paid order the owner cancels (a refund, a
-- misclick in the dropdown) keeps its files, since its photos live only on the
-- customer's phone. Due cancelled_files_keep_days() after the cancel (a
-- weekend's late payment can still be matched), the night after for one the
-- customer cancelled themselves, or at once if a run already started on it.
create or replace function public.order_files_due(o public.orders)
returns boolean
language sql
stable
set search_path = ''
as $$
  select o.status = 'cancelled'
     and o.payment_status = 'unpaid'
     and o.files_purged_at is null
     and (o.purge_started_at is not null
          or coalesce(o.cancelled_at, o.updated_at)
             <= now() - case when o.cancelled_by = 'customer' then interval '0 days'
                            else make_interval(days => public.cancelled_files_keep_days()) end);
$$;
revoke all on function public.order_files_due(public.orders) from public, anon, authenticated;
grant execute on function public.order_files_due(public.orders) to service_role;

create or replace function public.orders_due_for_file_purge(p_limit integer default 50)
returns table (order_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id
    from public.orders o
   where o.status = 'cancelled'
     and public.order_files_due(o)
   order by coalesce(o.cancelled_at, o.updated_at)
   limit greatest(1, least(coalesce(p_limit, 50), 500));
$$;
revoke all on function public.orders_due_for_file_purge(integer) from public, anon, authenticated;
grant execute on function public.orders_due_for_file_purge(integer) to service_role;

-- Claim an order before any file is removed. From here on it can't be
-- reopened or marked paid (orders_lifecycle_guard), so the removal can never
-- race the owner reopening it.
create or replace function public.claim_order_file_purge(p_order_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.orders o
     set purge_started_at = coalesce(o.purge_started_at, now())
   where o.id = p_order_id
     and public.order_files_due(o);
  return found;
end;
$$;
revoke all on function public.claim_order_file_purge(uuid) from public, anon, authenticated;
grant execute on function public.claim_order_file_purge(uuid) to service_role;

-- ══════ 11. Could anything still need this video? ══════
create or replace function public.clip_still_needed(p_code text, p_owner uuid, p_uploaded timestamptz, p_except_order uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_owner is null
      or p_uploaded is null
      or p_uploaded < public.clip_purge_since()
      or exists (select 1 from public.qr_memories m
                  where m.code = p_code
                    and (m.kind <> 'clip' or m.user_id <> p_owner or coalesce(m.scan_count, 0) > 0))
      or exists (select 1 from public.orders x
                  where x.memory_codes @> array[p_code]
                    and x.id is distinct from p_except_order
                    and x.files_purged_at is null
                    and x.purge_started_at is null)
      or exists (select 1 from public.orders x
                  where x.user_id = p_owner
                    and (x.payment_status = 'paid' or x.status not in ('pending_payment', 'cancelled'))
                    and x.created_at >= p_uploaded - interval '1 day');
$$;
revoke all on function public.clip_still_needed(text, uuid, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.clip_still_needed(text, uuid, timestamptz, uuid) to service_role;

-- ══════ 12. A claimed order's videos that may go ══════
-- Read right before the endpoint removes them, so a reorder placed since the
-- list was read still protects its videos.
create or replace function public.order_clip_files_to_purge(p_order_id uuid)
returns table (code text, object_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  o public.orders%rowtype;
begin
  select * into o from public.orders where id = p_order_id;
  if not found or o.status <> 'cancelled' or o.purge_started_at is null or o.user_id is null then
    return;
  end if;
  if o.album_id is not null and exists (
       select 1 from public.orders x
        where x.album_id = o.album_id
          and (x.payment_status = 'paid' or x.status not in ('pending_payment', 'cancelled'))) then
    return;
  end if;

  return query
  select c.code, so.name
    from unnest(o.memory_codes) as c(code)
    join storage.objects so
      on so.bucket_id = 'memory-clips'
     and split_part(so.name, '.', 1) = c.code
     and coalesce(so.owner_id, so.owner::text) = o.user_id::text
   where not public.clip_still_needed(c.code, o.user_id, so.created_at, o.id);
end;
$$;
revoke all on function public.order_clip_files_to_purge(uuid) from public, anon, authenticated;
grant execute on function public.order_clip_files_to_purge(uuid) to service_role;

-- ══════ 13. Videos uploaded for a checkout that never finished ══════
-- Opening /order uploads the videos at once (Order.tsx, early upload). If the
-- customer leaves, those files belong to no order and have no memory row. The
-- phone keeps its copy until the order is paid, so a later checkout uploads
-- them again.
create or replace function public.orphan_clip_files(p_limit integer default 200)
returns table (code text, object_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select split_part(so.name, '.', 1), so.name
    from storage.objects so
   where so.bucket_id = 'memory-clips'
     and so.created_at < now() - make_interval(days => public.unpaid_order_days())
     and split_part(so.name, '.', 1) ~ '^[a-z2-9]{4,32}$'
     and not exists (select 1 from public.qr_memories m where m.code = split_part(so.name, '.', 1))
     and not public.clip_still_needed(
           split_part(so.name, '.', 1),
           case when coalesce(so.owner_id, so.owner::text) ~ '^[0-9a-f-]{36}$'
                then coalesce(so.owner_id, so.owner::text)::uuid end,
           so.created_at, null)
   order by so.created_at
   limit greatest(1, least(coalesce(p_limit, 200), 1000));
$$;
revoke all on function public.orphan_clip_files(integer) from public, anon, authenticated;
grant execute on function public.orphan_clip_files(integer) to service_role;

-- ══════ 14. Record the cleanup ══════
-- A memory row goes only when its file is really gone, so a failed removal
-- never leaves a row pointing at nothing.
create or replace function public.finish_order_file_purge(p_order_id uuid, p_codes text[])
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  o public.orders%rowtype;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found or o.status <> 'cancelled' or o.purge_started_at is null then
    return false;
  end if;

  delete from public.qr_memories m
   where m.user_id = o.user_id
     and m.kind = 'clip'
     and coalesce(m.scan_count, 0) = 0
     and m.code = any(coalesce(p_codes, '{}'::text[]))
     and not exists (
           select 1 from storage.objects so
            where so.bucket_id = 'memory-clips'
              and split_part(so.name, '.', 1) = m.code);

  update public.orders set files_purged_at = now() where id = p_order_id;
  return true;
end;
$$;
revoke all on function public.finish_order_file_purge(uuid, text[]) from public, anon, authenticated;
grant execute on function public.finish_order_file_purge(uuid, text[]) to service_role;

-- ══════ 15. The app: which of my kept video copies are on a paid order ══════
-- The phone keeps its copy of each video until the order is paid. The phone
-- also checks the file is really in the cloud before freeing its copy.
create or replace function public.my_paid_memory_codes(p_codes text[])
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct c.code), '{}'::text[])
    from public.orders o,
         unnest(o.memory_codes) as c(code)
   where auth.uid() is not null
     and o.user_id = auth.uid()
     and o.status <> 'cancelled'
     and o.purge_started_at is null
     and o.files_purged_at is null
     and (o.payment_status = 'paid' or o.status not in ('pending_payment', 'cancelled'))
     and coalesce(cardinality(p_codes), 0) between 1 and 500
     and c.code = any(p_codes);
$$;
revoke all on function public.my_paid_memory_codes(text[]) from public, anon;
grant execute on function public.my_paid_memory_codes(text[]) to authenticated;

-- ══════ Verify ══════
select 'orders bookkeeping columns exist' as check,
  ((select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'orders'
       and column_name in ('cancelled_at', 'purge_started_at', 'files_purged_at', 'memory_codes')) = 4)::text as result
union all
select 'cap, codes and lifecycle triggers are on orders',
  ((select count(*) from pg_trigger t
     where t.tgrelid = 'public.orders'::regclass and not t.tgisinternal
       and t.tgname in ('orders_unpaid_cap_trg', 'orders_memory_codes_trg', 'orders_lifecycle_guard_trg')) = 3)::text
union all
select 'every order with a code-shaped snapshot has its memory_codes',
  (not exists (select 1 from public.orders o
                where o.memory_codes <> public.order_memory_codes(o.album_snapshot)))::text
union all
select 'customers cannot run the expiry or the cleanup',
  (not has_function_privilege('authenticated', 'public.expire_unpaid_orders()', 'EXECUTE')
   and not has_function_privilege('anon', 'public.expire_unpaid_orders()', 'EXECUTE')
   and not has_function_privilege('authenticated', 'public.orders_due_for_file_purge(integer)', 'EXECUTE')
   and not has_function_privilege('authenticated', 'public.claim_order_file_purge(uuid)', 'EXECUTE')
   and not has_function_privilege('authenticated', 'public.order_clip_files_to_purge(uuid)', 'EXECUTE')
   and not has_function_privilege('authenticated', 'public.orphan_clip_files(integer)', 'EXECUTE')
   and not has_function_privilege('authenticated', 'public.finish_order_file_purge(uuid, text[])', 'EXECUTE')
   and not has_function_privilege('anon', 'public.finish_order_file_purge(uuid, text[])', 'EXECUTE'))::text
union all
select 'the service role can run them',
  (has_function_privilege('service_role', 'public.expire_unpaid_orders()', 'EXECUTE')
   and has_function_privilege('service_role', 'public.orders_due_for_file_purge(integer)', 'EXECUTE')
   and has_function_privilege('service_role', 'public.claim_order_file_purge(uuid)', 'EXECUTE')
   and has_function_privilege('service_role', 'public.order_clip_files_to_purge(uuid)', 'EXECUTE')
   and has_function_privilege('service_role', 'public.orphan_clip_files(integer)', 'EXECUTE')
   and has_function_privilege('service_role', 'public.finish_order_file_purge(uuid, text[])', 'EXECUTE'))::text
union all
select 'a signed-in customer can cancel their own unpaid order and ask about their codes; anon cannot',
  (has_function_privilege('authenticated', 'public.cancel_my_unpaid_order(uuid)', 'EXECUTE')
   and not has_function_privilege('anon', 'public.cancel_my_unpaid_order(uuid)', 'EXECUTE')
   and has_function_privilege('authenticated', 'public.my_paid_memory_codes(text[])', 'EXECUTE')
   and not has_function_privilege('anon', 'public.my_paid_memory_codes(text[])', 'EXECUTE'))::text
union all
select 'clip_purge_since is set',
  (public.clip_purge_since() is not null)::text;
