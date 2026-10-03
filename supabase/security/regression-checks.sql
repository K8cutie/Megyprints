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
  elsif to_regprocedure('public.my_memory_clip_names()') is null then
    raise exception 'REGRESSION (account deletion): my_memory_clip_names() is MISSING, so the endpoint cannot find the videos to remove';
  elsif has_function_privilege('anon', 'public.my_memory_clip_names()', 'EXECUTE') then
    raise exception 'REGRESSION (account deletion): anon can call my_memory_clip_names()';
  end if;

  select string_agg(b.id, ', ') into bad
  from storage.buckets b
  where b.id in ('memory-clips', 'print-pdfs')
    and coalesce(to_jsonb(b) ->> 'versioning_status', 'DISABLED') <> 'DISABLED';
  if bad is not null then
    raise exception 'REGRESSION (account deletion): versioning is ON for % — deleted files would be kept as archived copies', bad;
  end if;
  raise notice 'PASS: account deletion removes and verifies print PDFs and memory videos';
end $$;

-- ── ALL CLEAR ───────────────────────────────────────────────────────────────
do $$ begin raise notice '✅ Megy Prints security regression guard: ALL CHECKS PASSED'; end $$;
