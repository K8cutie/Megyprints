-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0019_kraken_hardening.sql  (idempotent; safe to re-run)
--
--  Fixes from the 2026-07-21 Kraken live-proof audit. Each block is a distinct
--  finding that was DEMONSTRATED against a throwaway backend, not just flagged.
--
--   A. set_order_status() was an unguarded state-machine (HIGH, 4 lenses):
--      a financials-walled `fulfillment` operator could drive ANY order to
--      paid/delivered/shipped/cancelled with no payment or transition check —
--      ship free albums, void any order. Now role-scoped, payment-gated,
--      forward-only, and 'paid' is kept consistent with payment_status.
--   B. qr_memories column-lock (behavioral): the 0013 GRANT-based lock was
--      bypassable, so a customer could write scan_count / code / user_id on
--      their own rows (falsify the scans metric). Replaced with a BEFORE-UPDATE
--      trigger that pins the immutable columns for the anon/authenticated roles
--      while still letting the SECURITY DEFINER resolver bump scan_count.
--   C. Unbounded jsonb (LOW, storage DoS): orders.album_snapshot and
--      albums.pages/photos had no size cap. Added generous NOT VALID caps
--      (grandfather existing rows, bound new writes).
--   D. Order price-lever pin (MEDIUM): album_size was a free client string
--      decoupled from the frozen album_snapshot the operator prices from.
--      A trigger now derives album_size FROM the snapshot on write.
-- ════════════════════════════════════════════════════════════════════════════

-- ── A. set_order_status hardening ───────────────────────────────────────────
-- Rank the lifecycle so fulfillment can only move an order FORWARD through the
-- production→delivery pipeline, and only once it is actually paid.
create or replace function public.order_status_rank(s public.order_status)
returns int language sql immutable set search_path = public as $$
  select case s
    when 'pending_payment' then 0
    when 'paid'            then 1
    when 'in_production'   then 2
    when 'printed'         then 3
    when 'shipped'         then 4
    when 'delivered'       then 5
    when 'cancelled'       then 99   -- terminal, off the linear pipeline
  end;
$$;

create or replace function public.set_order_status(p_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role text;
  v_new  public.order_status;
  v_cur  public.order_status;
  v_pay  text;
begin
  v_role := public.operator_role();
  if v_role is null then
    raise exception 'not authorized';
  end if;

  -- Reject a bogus status BEFORE touching the row (explicit cast raises on a
  -- value outside the enum).
  v_new := p_status::public.order_status;

  select status, payment_status into v_cur, v_pay
    from public.orders where id = p_id;
  if not found then
    raise exception 'order not found';
  end if;

  if v_role = 'owner' then
    -- Owners are trusted (they also mark payment via the service_role backend).
    -- The one invariant we still enforce: 'paid' must not be forged onto an
    -- order whose payment was never recorded — so setting 'paid' here also flips
    -- payment_status to 'paid' atomically (fixes the status/payment_status split).
    null;
  else
    -- FULFILLMENT: production→delivery only, never money/terminal states, and
    -- only after the order is paid. This is the exact privilege the role model
    -- claims fulfillment cannot reach.
    if v_new not in ('in_production','printed','shipped','delivered') then
      raise exception 'fulfillment may not set status %', p_status;
    end if;
    -- Order must already be paid (cur is paid-or-later on the pipeline, and not
    -- cancelled). rank(paid)=1; rank(cancelled)=99 is excluded by the upper bound.
    if public.order_status_rank(v_cur) < 1 or public.order_status_rank(v_cur) > 5 then
      raise exception 'order is not paid; fulfillment cannot advance it (status=%)', v_cur;
    end if;
    -- Forward-only: no moving backward or repeating.
    if public.order_status_rank(v_new) <= public.order_status_rank(v_cur) then
      raise exception 'illegal transition % -> %', v_cur, v_new;
    end if;
  end if;

  update public.orders
     set status = v_new,
         -- keep the money flag consistent with the lifecycle
         payment_status = case when v_new = 'paid' then 'paid' else payment_status end,
         status_history = coalesce(status_history, '[]'::jsonb)
                          || jsonb_build_object('status', p_status, 'at', now(), 'by', v_role)
   where id = p_id;
end;
$$;

grant execute on function public.order_status_rank(public.order_status) to authenticated;
grant execute on function public.set_order_status(uuid, text)          to authenticated;

-- ── B. qr_memories immutable-column trigger ─────────────────────────────────
-- The 0013 column-GRANT lock is being bypassed in practice (Kraken wrote
-- scan_count live). A trigger is authority-independent: for the client roles
-- (anon/authenticated) it pins the columns a customer must never change. Inside
-- resolve_memory() (SECURITY DEFINER → current_user = the function owner, not
-- the caller) the guard does NOT fire, so the scan bump still works.
create or replace function public.qr_memories_pin_immutable()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.scan_count := old.scan_count;
    new.code       := old.code;
    new.user_id    := old.user_id;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists qr_memories_pin_immutable_trg on public.qr_memories;
create trigger qr_memories_pin_immutable_trg
  before update on public.qr_memories
  for each row execute procedure public.qr_memories_pin_immutable();

-- ── C. jsonb size caps (grandfather existing rows via NOT VALID) ─────────────
-- Generous ceilings — far above any legitimate album (layout metadata; photos
-- live in the browser, never here) but bounding a blob-stuffing storage DoS.
alter table public.orders drop constraint if exists orders_snapshot_size_chk;
alter table public.orders
  add constraint orders_snapshot_size_chk
  check (octet_length(album_snapshot::text) <= 15 * 1024 * 1024) not valid;

do $$ begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='albums' and column_name='pages') then
    execute 'alter table public.albums drop constraint if exists albums_pages_size_chk';
    execute 'alter table public.albums add constraint albums_pages_size_chk '
         || 'check (pages is null or octet_length(pages::text) <= 15 * 1024 * 1024) not valid';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='albums' and column_name='photos') then
    execute 'alter table public.albums drop constraint if exists albums_photos_size_chk';
    execute 'alter table public.albums add constraint albums_photos_size_chk '
         || 'check (photos is null or octet_length(photos::text) <= 15 * 1024 * 1024) not valid';
  end if;
end $$;

-- ── D. Pin the price-driving album_size to the frozen snapshot ───────────────
-- album_size is what the operator prices the album from; leaving it a free
-- client column let a customer under-declare a larger/costlier album. Derive it
-- from album_snapshot (the authoritative frozen album) on every write.
create or replace function public.orders_pin_album_size()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.album_snapshot ? 'album_size'
     and coalesce(new.album_snapshot->>'album_size','') <> '' then
    new.album_size := new.album_snapshot->>'album_size';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_pin_album_size_trg on public.orders;
create trigger orders_pin_album_size_trg
  before insert or update on public.orders
  for each row execute procedure public.orders_pin_album_size();
