-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0025_store_settings_lock_read.sql  (idempotent; safe to re-run)
--
--  The CONTRACT half of the 0024 expand/contract pair. Closes the last hole:
--  0014 made store_settings world-readable to anon, so price_multiple — the
--  store's margin — could be read straight off production by anyone holding the
--  bundled publishable key. Verified live on 2026-08-03: an unauthenticated GET
--  returned {"price_multiple": 4}.
--
--  ‼ DO NOT APPLY UNTIL THE NEW CLIENT IS DEPLOYED AND CONFIRMED LIVE.
--
--  It is staged HERE rather than in supabase/migrations/ on purpose: `supabase
--  db push` applies every pending migration at once, with no way to stop at a
--  version, so leaving it in the chain would drag it along with 0024 and cause
--  exactly the undercharge described below.
--
--  TO APPLY, once the new client is serving:
--    git mv supabase/security/PENDING_store_settings_lock_read.sql \
--           supabase/migrations/0025_store_settings_lock_read.sql
--    npx supabase db push
--
--  Ordering matters because the two clients read different things:
--    • OLD client — reads store_settings directly and fails OPEN to a built-in
--      DEFAULT_MULTIPLE of 3. With production at 4, applying this while the old
--      bundle is still being served silently prices every album at 3x: a 25%
--      undercharge, no error, no signal.
--    • NEW client — reads public_price_schedule() (0024) and fails CLOSED, so it
--      is unaffected by this policy and refuses to quote rather than guess.
--
--  Residual risk after applying: a browser still running a cached OLD bundle
--  (service worker) would undercharge until it picks up the new shell. Check the
--  orders table for amounts priced at 3x in the hours after applying, and treat
--  any as the straggler window rather than a pricing-model bug.
--
--  Owner access is unaffected — the "Owners write store settings" policy from
--  0014 is FOR ALL, which already covers owner SELECT, so the admin panel keeps
--  reading the row. disabled_sizes, the one field customers genuinely need, is
--  served by public_price_schedule() instead.
-- ════════════════════════════════════════════════════════════════════════════

drop policy if exists "Anyone can read store settings" on public.store_settings;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- Expect: public_read_removed = true, owner_policy_present = true.
select
  not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'store_settings'
      and policyname = 'Anyone can read store settings'
  ) as public_read_removed,
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'store_settings'
      and policyname = 'Owners write store settings'
  ) as owner_policy_present;
