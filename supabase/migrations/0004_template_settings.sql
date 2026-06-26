-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0004_template_settings.sql  (idempotent; safe to re-run)
--
--  Operator-curated page-template overrides. Every template defaults to ACTIVE
--  (no row needed). A row exists only when the operator has HIDDEN or soft-DELETED
--  a template, so album generation skips it.
--
--  RLS model (the anon/publishable key is PUBLIC, so RLS is the only guard):
--    • SELECT  — anyone (every client needs the active list to build albums)
--    • INSERT/UPDATE/DELETE — only the operator account (gated by email in the JWT)
--
--  The admin email is pinned here server-side; the client-side /admin gate is
--  only UX. Change ADMIN_EMAIL below if the operator account ever changes.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.template_settings (
  template_id text primary key,
  hidden      boolean     not null default false,
  deleted     boolean     not null default false,
  updated_at  timestamptz not null default now()
);

alter table public.template_settings enable row level security;

-- ── Public read ─────────────────────────────────────────────────────────────
drop policy if exists "Anyone can read template settings" on public.template_settings;
create policy "Anyone can read template settings"
  on public.template_settings for select using (true);

-- ── Admin-only write (gated by email claim) ─────────────────────────────────
drop policy if exists "Admin can write template settings" on public.template_settings;
create policy "Admin can write template settings"
  on public.template_settings for all
  using      ((auth.jwt() ->> 'email') = 'archgarcia@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'archgarcia@gmail.com');

-- ── Verify ──────────────────────────────────────────────────────────────────
select
  t.tablename,
  t.rowsecurity        as rls_enabled,
  count(p.policyname)  as policy_count
from pg_tables t
left join pg_policies p
  on p.schemaname = t.schemaname and p.tablename = t.tablename
where t.schemaname = 'public' and t.tablename = 'template_settings'
group by t.tablename, t.rowsecurity;
