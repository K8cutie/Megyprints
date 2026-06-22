-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0003_rls_lockdown.sql  (idempotent; safe to re-run anytime)
--
--  Your anon/publishable key is PUBLIC (it ships in the frontend bundle), so the
--  ONLY thing protecting your data is Row-Level Security. Any table without
--  correct RLS is readable/writable by anyone on the internet via the REST API.
--
--  This migration (re)creates owner-scoped policies for the customer-facing
--  tables, each with BOTH a USING clause (which rows you can see/act on) and a
--  WITH CHECK clause (which rows you can create/modify) so nobody can read OR
--  re-assign another account's data. Re-run it any time you suspect drift.
--
--  After running, scroll to the VERIFICATION query at the bottom — every public
--  table should show rls_enabled = true and at least one policy.
--  (Migrated verbatim from the former root `security-rls-lockdown.sql`.)
-- ════════════════════════════════════════════════════════════════════════════

-- ── user_profiles (owner column = id) ──────────────────────────────────────
alter table if exists public.user_profiles enable row level security;

drop policy if exists "Users can view own profile"   on public.user_profiles;
drop policy if exists "Users can insert own profile"  on public.user_profiles;
drop policy if exists "Users can update own profile"  on public.user_profiles;

create policy "Users can view own profile"
  on public.user_profiles for select using (auth.uid() = id);
create policy "Users can insert own profile"
  on public.user_profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile"
  on public.user_profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- ── albums (owner column = user_id) ────────────────────────────────────────
alter table if exists public.albums enable row level security;

drop policy if exists "Users can view own albums"   on public.albums;
drop policy if exists "Users can create own albums" on public.albums;
drop policy if exists "Users can update own albums" on public.albums;
drop policy if exists "Users can delete own albums" on public.albums;

create policy "Users can view own albums"
  on public.albums for select using (auth.uid() = user_id);
create policy "Users can create own albums"
  on public.albums for insert with check (auth.uid() = user_id);
create policy "Users can update own albums"
  on public.albums for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own albums"
  on public.albums for delete using (auth.uid() = user_id);

-- ── orders (owner column = user_id) — only if the table exists ─────────────
-- Customers may read their own orders and create only UNPAID quotes; they can
-- never self-mark paid or set the price (the operator backend does that via
-- service_role). Full definition lives in 0002_orders.sql.
--
-- CRITICAL: this migration runs LAST, so whatever INSERT policy it creates is
-- the EFFECTIVE final state of the database. The WITH CHECK below MUST stay in
-- sync with the full pricing/state-machine lock in 0002_orders.sql — pinning
-- status / payment_status / amount / tracking. A weaker policy here silently
-- re-opens client-supplied price/status manipulation (a ₱1 / pre-"paid" order).
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'orders') then
    execute 'alter table public.orders enable row level security';

    execute 'drop policy if exists "Users can view own orders"   on public.orders';
    execute 'drop policy if exists "Users can create own orders" on public.orders';

    execute 'create policy "Users can view own orders" on public.orders
               for select using (auth.uid() = user_id)';
    -- A customer may only create a fresh, UNPAID, unpriced quote. status / amount
    -- / tracking are pinned so a hand-crafted REST insert can''t sneak
    -- status:''paid'' / amount:1 / tracking:''X'' past RLS. The operator backend
    -- (service_role, bypasses RLS) sets amount + flips status to ''paid''.
    execute 'create policy "Users can create own orders" on public.orders
               for insert with check (
                 auth.uid() = user_id
                 and status = ''pending_payment''
                 and payment_status = ''unpaid''
                 and amount is null
                 and tracking is null
               )';
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
--  VERIFICATION — every public table must show rls_enabled = true.
--  Any row with rls_enabled = false is an OPEN DOOR — add a policy for it.
-- ════════════════════════════════════════════════════════════════════════════
select
  t.tablename,
  t.rowsecurity                                  as rls_enabled,
  count(p.policyname)                             as policy_count
from pg_tables t
left join pg_policies p
  on p.schemaname = t.schemaname and p.tablename = t.tablename
where t.schemaname = 'public'
group by t.tablename, t.rowsecurity
order by t.rowsecurity asc, t.tablename;
