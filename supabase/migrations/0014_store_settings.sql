-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0014_store_settings.sql  (idempotent; safe to re-run)
--
--  Store-wide settings — currently just the price multiple (cost → customer
--  price). Singleton row (id = 1).
--
--  RLS model (the anon/publishable key is PUBLIC, so RLS is the only guard):
--    • SELECT — anyone (checkout reads the multiple under the customer session)
--    • ALL    — owner accounts only (gated by email in the JWT; mirrors 0007)
--
--  The multiplier alone is NOT sensitive: production cost lives only in client
--  code, and the customer only ever sees final marked-up amounts. Public read is
--  required so checkout can price the album.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.store_settings (
  id             integer primary key default 1,
  price_multiple numeric not null default 3 check (price_multiple > 0),
  updated_at     timestamptz not null default now(),
  constraint store_settings_singleton check (id = 1)
);

insert into public.store_settings (id, price_multiple) values (1, 3)
  on conflict (id) do nothing;

alter table public.store_settings enable row level security;

-- ── Public read ─────────────────────────────────────────────────────────────
drop policy if exists "Anyone can read store settings" on public.store_settings;
create policy "Anyone can read store settings"
  on public.store_settings for select using (true);

-- ── Owner-only write (gated by email claim) ─────────────────────────────────
drop policy if exists "Owners write store settings" on public.store_settings;
create policy "Owners write store settings"
  on public.store_settings for all
  using      ((auth.jwt() ->> 'email') in ('archgarcia@gmail.com', 'megyprints@gmail.com'))
  with check ((auth.jwt() ->> 'email') in ('archgarcia@gmail.com', 'megyprints@gmail.com'));

-- ── Verify ──────────────────────────────────────────────────────────────────
select
  t.tablename,
  t.rowsecurity        as rls_enabled,
  count(p.policyname)  as policy_count
from pg_tables t
left join pg_policies p
  on p.schemaname = t.schemaname and p.tablename = t.tablename
where t.schemaname = 'public' and t.tablename = 'store_settings'
group by t.tablename, t.rowsecurity;
