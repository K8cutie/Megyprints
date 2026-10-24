-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — SECURITY REGRESSION GUARD
--
--  Re-asserts the security controls that the red team confirmed, so they can
--  never be silently reverted again (the orders pricing lock WAS silently
--  reverted by a "safe to re-run" migration — this guard catches that class of
--  bug). Read-only: only SELECTs + RAISE. Safe to run anytime.
--
--  HOW TO RUN
--    • Manually: paste into Supabase SQL Editor and Run. A failed check raises an
--      exception (red error) naming the regression; all-pass prints NOTICEs.
--    • As a Guardian loop: run this after every migration / before every deploy
--      (CI step or scheduled job). Treat any exception as a blocking failure.
--
--  Each check maps to a confirmed finding so the guard is self-documenting.
-- ════════════════════════════════════════════════════════════════════════════

-- ── GUARD 1: every public table has RLS enabled ─────────────────────────────
-- (The anon key ships in the frontend bundle; an RLS-off table = open door.)
do $$
declare bad text;
begin
  select string_agg(tablename, ', ') into bad
  from pg_tables
  where schemaname = 'public' and rowsecurity = false;

  if bad is not null then
    raise exception 'REGRESSION (RLS): public table(s) have RLS DISABLED -> %', bad;
  end if;
  raise notice 'PASS: RLS enabled on all public tables';
end $$;

-- ── GUARD 2: orders INSERT pricing/state lock intact ────────────────────────
-- Finding (critical): a customer could self-create paid/priced orders if the
-- INSERT policy's WITH CHECK drops the status/amount/tracking pins. The last
-- applied policy is the effective one — this verifies it still has all pins.
do $$
declare chk text;
begin
  select with_check into chk
  from pg_policies
  where schemaname = 'public' and tablename = 'orders'
    and policyname = 'Users can create own orders';

  if chk is null then
    raise exception 'REGRESSION (orders): INSERT policy "Users can create own orders" is MISSING';
  elsif chk not ilike '%amount%'
     or  chk not ilike '%tracking%'
     or  chk not ilike '%pending_payment%'
     or  chk not ilike '%unpaid%' then
    raise exception 'REGRESSION (orders): pricing/state lock WEAKENED. with_check = %', chk;
  end if;
  raise notice 'PASS: orders INSERT pricing/state lock intact';
end $$;

-- ── GUARD 3: set_order_status is still a paid-gated, ranked state machine ────
-- Findings (0019-A / 0020-B, HIGH): a financials-walled `fulfillment` operator
-- could once drive ANY order to paid/delivered/cancelled with no payment or
-- transition check. The fix made it forward-only, adjacent-step, and paid-gated.
-- This guard fails if a later migration reverts set_order_status to a body that
-- no longer consults the payment gate or the lifecycle rank (the same silent-
-- revert class GUARD 2 catches for the pricing lock).
do $$
declare src text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'set_order_status';

  if src is null then
    raise exception 'REGRESSION (set_order_status): function is MISSING';
  elsif src not ilike '%payment_status%' or src not ilike '%order_status_rank%' then
    raise exception 'REGRESSION (set_order_status): payment-gate and/or lifecycle-rank check REMOVED from the state machine';
  end if;
  raise notice 'PASS: set_order_status payment-gated state machine intact';
end $$;

-- ── GUARD 4: every storage policy is pinned to a bucket ─────────────────────
-- Finding (0034, HIGH): dashboard-made "own photos" policies had no bucket_id
-- filter, so any signed-in user could write "<uid>/<anything>" into EVERY
-- bucket, including the PUBLIC memory-clips bucket (free file hosting). A policy
-- made in the dashboard never passes through a migration, so this is the only
-- place that would notice a new one.
do $$
declare bad text;
begin
  select string_agg(policyname || ' (' || cmd || ')', ', ') into bad
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and coalesce(qual, '') || coalesce(with_check, '') not like '%bucket_id%';

  if bad is not null then
    raise exception 'REGRESSION (storage): policy/policies with NO bucket_id filter -> %', bad;
  end if;
  raise notice 'PASS: every storage.objects policy names its bucket';
end $$;

-- ── GUARD 5: memory-clips owners can see their own rows ─────────────────────
-- Finding (0034): with no owner SELECT policy, "Change video" (an upsert, whose
-- conflict check + RETURNING need read access) failed for every customer, and
-- the 200-clips cap counted 0 under the customer's RLS, so it never triggered.
do $$
declare q text;
begin
  select qual into q
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname = 'Owners read own memory clips' and cmd = 'SELECT';

  if q is null then
    raise exception 'REGRESSION (memory-clips): owner SELECT policy "Owners read own memory clips" is MISSING (clip replace + 200 cap break)';
  elsif q not like '%memory-clips%' or q not like '%owner_id%' then
    raise exception 'REGRESSION (memory-clips): owner SELECT policy is no longer scoped to the uploader. qual = %', q;
  end if;
  raise notice 'PASS: memory-clips owner read policy intact';
end $$;

-- ── GUARD 6: account deletion still verifies the photos AND videos are gone ──
-- Finding (0035): 0027 predated the PUBLIC memory-clips bucket, so deleting an
-- account left the customer's videos playable by anyone with the link.
-- delete_own_account() must refuse while any print PDF or clip of the caller is
-- still in storage, and both buckets must keep versioning off: with it on, a
-- Storage delete keeps an archived copy, so "deleted" would not mean deleted.
do $$
declare src text; bad text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'delete_own_account';

  if src is null then
    raise exception 'REGRESSION (account deletion): delete_own_account() is MISSING';
  elsif src not like '%''print-pdfs''%' or src not like '%''memory-clips''%' then
    raise exception 'REGRESSION (account deletion): delete_own_account() no longer checks print-pdfs AND memory-clips are empty for the caller';
  elsif src not like '%-cover.pdf%' or src not like '%''payment-proofs''%' then
    raise exception 'REGRESSION (account deletion): delete_own_account() no longer checks the cover wrap PDFs AND payment receipts are gone (0039)';
  elsif to_regprocedure('public.my_memory_clip_names()') is null then
    raise exception 'REGRESSION (account deletion): my_memory_clip_names() is MISSING, so the endpoint cannot find the videos to remove';
  elsif has_function_privilege('anon', 'public.my_memory_clip_names()', 'EXECUTE') then
    raise exception 'REGRESSION (account deletion): anon can call my_memory_clip_names()';
  end if;

  select string_agg(b.id, ', ') into bad
  from storage.buckets b
  where b.id in ('memory-clips', 'print-pdfs', 'payment-proofs')
    and coalesce(to_jsonb(b) ->> 'versioning_status', 'DISABLED') <> 'DISABLED';
  if bad is not null then
    raise exception 'REGRESSION (account deletion): versioning is ON for % — deleted files would be kept as archived copies', bad;
  end if;
  raise notice 'PASS: account deletion removes and verifies print PDFs, cover wraps, receipts and memory videos';
end $$;

-- ── GUARD 7: event bookings stay owner-priced and host-read-only (0043) ─────
-- A host may read their own booking and send a request; every change goes
-- through the functions. The cost to make (the margin) is never readable by a
-- host. The deposit floor and account deletion must still know bookings.
do $$
declare src text;
begin
  -- Missing is a failure, not a skip: the app ships Events, so a database
  -- without 0043 is a migration that was declared but never run.
  if to_regclass('public.event_bookings') is null then
    raise exception 'REGRESSION (event bookings): public.event_bookings is missing: 0043 was never applied here';
  end if;
  if has_table_privilege('authenticated', 'public.event_bookings', 'UPDATE')
     or has_table_privilege('authenticated', 'public.event_bookings', 'DELETE')
     or has_table_privilege('anon', 'public.event_bookings', 'SELECT')
     or has_table_privilege('anon', 'public.event_bookings', 'INSERT') then
    raise exception 'REGRESSION (event bookings): a customer or anon can change bookings directly, or anon can read them';
  end if;
  if has_column_privilege('authenticated', 'public.event_bookings', 'deal_cost', 'SELECT') then
    raise exception 'REGRESSION (event bookings): hosts can read deal_cost (the cost to make)';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'event_bookings_deal_money_chk'
                 and pg_get_constraintdef(oid) like '%deal_deposit > deal_cost%') then
    raise exception 'REGRESSION (event bookings): the deposit no longer has to be more than the cost to make';
  end if;
  select pg_get_functiondef('public.delete_own_account()'::regprocedure) into src;
  if src not like '%booking_proof_names%' or src not like '%event_bookings%' then
    raise exception 'REGRESSION (event bookings): delete_own_account() no longer removes-and-checks booking receipts or bookings in flight';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and policyname = 'payment_proofs_select_operators' and qual like '%booking-%') then
    raise exception 'REGRESSION (event bookings): non-owner operators can read booking receipts again';
  end if;
  if has_function_privilege('anon', 'public.settle_booking_money(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.booking_proof_names(uuid, text)', 'EXECUTE') then
    raise exception 'REGRESSION (event bookings): anon can run an owner or host booking function';
  end if;
  if src not like '%booking_money_to_settle%' then
    raise exception 'REGRESSION (event bookings): account deletion no longer waits for a closed booking''s money to be settled';
  end if;
  raise notice 'PASS: event bookings are owner-priced, host-read-only, and go with the account';
end $$;

-- ── GUARD 8: the guest camera and the event album (0044, 0045) ─────────────
-- Guests have no account: everything they do goes through (code, token)
-- functions, the files go only where event_media_begin() named them, the
-- print masters stay private, a "thumbnail" can't be 50 MB, the hosts'
-- functions aren't anon's, and a booking pays for one album.
do $$
declare f text;
begin
  if to_regclass('public.event_media') is null or to_regclass('public.event_guests') is null then
    raise exception 'REGRESSION (guest camera): event_media / event_guests are missing: 0044 was never applied here';
  end if;
  if has_table_privilege('anon', 'public.event_media', 'SELECT') or has_table_privilege('authenticated', 'public.event_media', 'SELECT')
     or has_table_privilege('anon', 'public.event_guests', 'SELECT') or has_table_privilege('authenticated', 'public.event_guests', 'SELECT') then
    raise exception 'REGRESSION (guest camera): customers can read event_media / event_guests (token hashes) directly';
  end if;
  if (select count(*) from storage.buckets where
        (id = 'event-originals' and not public and file_size_limit = 20971520)
     or (id = 'event-media' and public and file_size_limit <= 4194304 and allowed_mime_types = array['image/jpeg'])
     or (id = 'event-videos' and public and file_size_limit <= 52428800)) <> 3 then
    raise exception 'REGRESSION (guest camera): an event bucket is missing, public when it should be private, or lost its size/type limit';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd = 'SELECT'
             and (coalesce(qual, '') like '%event-media%' or coalesce(qual, '') like '%event-videos%')) then
    raise exception 'REGRESSION (guest camera): the public event buckets became listable (a SELECT policy names them)';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and policyname = 'event_uploads_named_by_begin' and with_check like '%event_upload_allowed%') then
    raise exception 'REGRESSION (guest camera): guest uploads are no longer limited to the names event_media_begin() gave';
  end if;
  foreach f in array array['public.my_event(uuid)', 'public.my_event_media(uuid)', 'public.set_event_media(uuid, boolean, boolean)',
                           'public.remove_event_guest(uuid)', 'public.set_event_screen(uuid, boolean)',
                           'public.cover_order_with_booking(uuid, uuid)', 'public.place_event_copy_order(text, jsonb)',
                           'public.event_media_files_to_purge(integer)', 'public.event_retention_sweep()'] loop
    if has_function_privilege('anon', f, 'EXECUTE') then
      raise exception 'REGRESSION (guest camera): anon can run %', f;
    end if;
  end loop;
  if has_function_privilege('authenticated', 'public.event_media_files_to_purge(integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.event_retention_sweep()', 'EXECUTE') then
    raise exception 'REGRESSION (guest camera): a signed-in customer can run the service-only cleanup';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'orders_event_columns_guard_trg')
     or not exists (select 1 from pg_trigger where tgname = 'orders_event_follow_trg') then
    raise exception 'REGRESSION (event album): customers can point an order at a booking, or a reopened order can be a second free album';
  end if;
  if pg_get_functiondef('public.event_copy_offer(text)'::regprocedure) not like '%customer_deleted_at is null%' then
    raise exception 'REGRESSION (event album): copies of a deleted host''s album are on offer again';
  end if;
  raise notice 'PASS: the guest camera is limited, its files private or unlistable, and a booking pays for one album';
end $$;

-- ── GUARD: covers the press can't print stay refused (0046) ─────────────────
-- The shop's 12.5 × 19 in sheet can't hold a 9x9 hardbound cover (≈20.2 in),
-- an 8.5x11 hardbound one or any 11.5x8 one; a direct REST insert must not get
-- past checkout's check. The pages-per-sheet must stay what the press fits.
do $$
declare s jsonb;
begin
  if not exists (select 1 from pg_trigger where tgname = 'orders_press_fit_trg' and tgrelid = 'public.orders'::regclass and tgenabled <> 'D')
     or not exists (select 1 from pg_trigger where tgname = 'event_bookings_press_fit_trg' and tgrelid = 'public.event_bookings'::regclass and tgenabled <> 'D')
     or not public.press_cover_never_fits('9x9', 'hard')
     or not public.press_cover_never_fits(' 9X9"', 'hard') then
    raise exception 'REGRESSION (press sheet): a 9x9 hardbound order or deal is no longer refused';
  end if;
  select sizes into s from public.pricing_model where id = 1;
  if (s->'6x6'->>'pps')::int <> 6 or (s->'6x4'->>'pps')::int <> 12 or (s->'8x6'->>'pps')::int <> 6 or (s->'6x8'->>'pps')::int <> 6 then
    raise exception 'REGRESSION (press sheet): pages per sheet no longer match the press (printSheet.ts): %', s;
  end if;
  raise notice 'PASS: covers the press can''t print are refused, and pages per sheet match the press';
end $$;

-- ── GUARD 9: photo-quote limits are server-only (0049) ──────────────────────
-- "Write a line for this photo" spends money per tap; its daily limits are the
-- bill's ceiling. Only the server (service_role) may take a tap, and nobody
-- else may read or change the counts (red team 2026-10-21).
do $$
begin
  if to_regprocedure('public.take_photo_quote(uuid, text, integer, integer, integer)') is null then
    raise exception 'REGRESSION (photo quotes): take_photo_quote() is missing: 0049 was never applied here';
  end if;
  if has_function_privilege('anon', 'public.take_photo_quote(uuid, text, integer, integer, integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.take_photo_quote(uuid, text, integer, integer, integer)', 'EXECUTE') then
    raise exception 'REGRESSION (photo quotes): a customer or anon can take photo-quote taps directly';
  end if;
  if has_table_privilege('anon', 'public.photo_quote_usage', 'SELECT')
     or has_table_privilege('authenticated', 'public.photo_quote_usage', 'SELECT')
     or has_table_privilege('authenticated', 'public.photo_quote_usage', 'UPDATE')
     or has_table_privilege('authenticated', 'public.photo_quote_ip_usage', 'SELECT')
     or has_table_privilege('authenticated', 'public.photo_quote_ip_usage', 'UPDATE') then
    raise exception 'REGRESSION (photo quotes): customers can read or change the photo-quote counts';
  end if;
  raise notice 'PASS: photo-quote limits are taken only by the server, and the counts are private';
end $$;

-- ── GUARD 10: one account per Gmail (0054) ─────────────────────────────────
-- The "Before User Created" hook refuses a second account for the same Gmail
-- (dots moved, googlemail.com). Only the auth server may run it, and a "+tag"
-- stays its own account (the owner's test accounts).
do $$
begin
  if to_regprocedure('public.hook_one_account_per_gmail(jsonb)') is null then
    raise exception 'REGRESSION (one account): hook_one_account_per_gmail() is missing: 0054 was never applied here';
  end if;
  if has_function_privilege('anon', 'public.hook_one_account_per_gmail(jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.hook_one_account_per_gmail(jsonb)', 'EXECUTE')
     or not has_function_privilege('supabase_auth_admin', 'public.hook_one_account_per_gmail(jsonb)', 'EXECUTE') then
    raise exception 'REGRESSION (one account): the hook can be run by customers, or not by the auth server';
  end if;
  if public.gmail_inbox('Marian.Reyes@GoogleMail.com') is distinct from 'marianreyes@gmail.com'
     or public.gmail_inbox('a.b+test@gmail.com') is distinct from 'ab+test@gmail.com'
     or public.gmail_inbox('bubbly.chic@yahoo.com') is not null then
    raise exception 'REGRESSION (one account): gmail_inbox() no longer matches one Gmail inbox';
  end if;
  raise notice 'PASS: a Gmail can have only one account, and only the auth server runs the check';
end $$;

-- ── ALL CLEAR ───────────────────────────────────────────────────────────────
do $$ begin raise notice '✅ Megy Prints security regression guard: ALL CHECKS PASSED'; end $$;
