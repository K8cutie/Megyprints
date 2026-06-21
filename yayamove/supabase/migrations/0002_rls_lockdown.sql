-- ════════════════════════════════════════════════════════════════════════════
--  YAYAMOVE — RLS LOCKDOWN  (0002_rls_lockdown.sql)
--
--  The anon/publishable key is PUBLIC (it ships in the frontend bundle), so the
--  ONLY thing protecting data is Row-Level Security. Any table without correct
--  RLS is readable/writable by anyone on the internet via the REST API.
--
--  Idempotent: safe to re-run. Every policy below has a USING clause (which rows
--  you can see/act on) and, for writes, a WITH CHECK clause (which rows you may
--  create/modify) so nobody can read OR re-assign another account's data.
--
--  Run the VERIFICATION query at the bottom — every public table must show
--  rls_enabled = true with at least one policy.
-- ════════════════════════════════════════════════════════════════════════════

-- Helper: the provider_profile id owned by the current user.
create or replace function public.my_provider_id()
returns uuid
language sql stable security definer set search_path = public
as $$ select id from public.provider_profiles where user_id = auth.uid() $$;

-- ── profiles (owner = id) ───────────────────────────────────────────────────
alter table public.profiles enable row level security;
drop policy if exists "profiles read own"   on public.profiles;
drop policy if exists "profiles insert own" on public.profiles;
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles read own"   on public.profiles for select using (auth.uid() = id);
create policy "profiles insert own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles update own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- ── provider_profiles ───────────────────────────────────────────────────────
--  Public can READ provider profiles (it's a marketplace listing), but only the
--  owner may insert/update their own row. Server-only columns are additionally
--  frozen by the guard trigger in 0001.
alter table public.provider_profiles enable row level security;
drop policy if exists "providers public read" on public.provider_profiles;
drop policy if exists "providers insert own"  on public.provider_profiles;
drop policy if exists "providers update own"  on public.provider_profiles;
create policy "providers public read" on public.provider_profiles for select using (true);
create policy "providers insert own"  on public.provider_profiles for insert with check (auth.uid() = user_id);
create policy "providers update own"  on public.provider_profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── provider_skills (public read, owner write) ──────────────────────────────
alter table public.provider_skills enable row level security;
drop policy if exists "skills public read" on public.provider_skills;
drop policy if exists "skills owner write" on public.provider_skills;
drop policy if exists "skills owner mod"   on public.provider_skills;
drop policy if exists "skills owner del"   on public.provider_skills;
create policy "skills public read" on public.provider_skills for select using (true);
create policy "skills owner write" on public.provider_skills for insert with check (provider_id = public.my_provider_id());
create policy "skills owner mod"   on public.provider_skills for update using (provider_id = public.my_provider_id()) with check (provider_id = public.my_provider_id());
create policy "skills owner del"   on public.provider_skills for delete using (provider_id = public.my_provider_id());

-- ── work_experience (public read, owner write) ──────────────────────────────
alter table public.work_experience enable row level security;
drop policy if exists "exp public read" on public.work_experience;
drop policy if exists "exp owner write" on public.work_experience;
drop policy if exists "exp owner mod"   on public.work_experience;
drop policy if exists "exp owner del"   on public.work_experience;
create policy "exp public read" on public.work_experience for select using (true);
create policy "exp owner write" on public.work_experience for insert with check (provider_id = public.my_provider_id());
create policy "exp owner mod"   on public.work_experience for update using (provider_id = public.my_provider_id()) with check (provider_id = public.my_provider_id());
create policy "exp owner del"   on public.work_experience for delete using (provider_id = public.my_provider_id());

-- ── certificates ────────────────────────────────────────────────────────────
--  Metadata is public (title/issuer), but the FILE itself is private storage.
alter table public.certificates enable row level security;
drop policy if exists "cert public read" on public.certificates;
drop policy if exists "cert owner write" on public.certificates;
drop policy if exists "cert owner mod"   on public.certificates;
drop policy if exists "cert owner del"   on public.certificates;
create policy "cert public read" on public.certificates for select using (true);
create policy "cert owner write" on public.certificates for insert with check (provider_id = public.my_provider_id());
create policy "cert owner mod"   on public.certificates for update using (provider_id = public.my_provider_id()) with check (provider_id = public.my_provider_id());
create policy "cert owner del"   on public.certificates for delete using (provider_id = public.my_provider_id());

-- ── nbi_clearances (PRIVATE — owner-only; status frozen by guard trigger) ───
--  NEVER public. Only the owning provider (and service_role) may read it.
alter table public.nbi_clearances enable row level security;
drop policy if exists "nbi owner read"   on public.nbi_clearances;
drop policy if exists "nbi owner write"  on public.nbi_clearances;
drop policy if exists "nbi owner update" on public.nbi_clearances;
create policy "nbi owner read"   on public.nbi_clearances for select using (provider_id = public.my_provider_id());
create policy "nbi owner write"  on public.nbi_clearances for insert with check (provider_id = public.my_provider_id() and consent_given = true);
create policy "nbi owner update" on public.nbi_clearances for update using (provider_id = public.my_provider_id()) with check (provider_id = public.my_provider_id());

-- ── jobs (owner = seeker; public can read OPEN jobs to quote on) ────────────
alter table public.jobs enable row level security;
drop policy if exists "jobs read open or own" on public.jobs;
drop policy if exists "jobs insert own"       on public.jobs;
drop policy if exists "jobs update own"       on public.jobs;
drop policy if exists "jobs delete own"       on public.jobs;
create policy "jobs read open or own" on public.jobs for select using (status = 'open' or seeker_id = auth.uid());
create policy "jobs insert own"       on public.jobs for insert with check (seeker_id = auth.uid());
create policy "jobs update own"       on public.jobs for update using (seeker_id = auth.uid()) with check (seeker_id = auth.uid());
create policy "jobs delete own"       on public.jobs for delete using (seeker_id = auth.uid());

-- ── quotes ──────────────────────────────────────────────────────────────────
--  Visible to the quoting provider and to the seeker who owns the job.
alter table public.quotes enable row level security;
drop policy if exists "quotes read involved" on public.quotes;
drop policy if exists "quotes provider write" on public.quotes;
drop policy if exists "quotes provider mod"   on public.quotes;
create policy "quotes read involved" on public.quotes for select using (
  provider_id = public.my_provider_id()
  or exists (select 1 from public.jobs j where j.id = job_id and j.seeker_id = auth.uid())
);
create policy "quotes provider write" on public.quotes for insert with check (provider_id = public.my_provider_id());
create policy "quotes provider mod"   on public.quotes for update using (provider_id = public.my_provider_id()) with check (provider_id = public.my_provider_id());

-- ── reviews (public read, reviewer writes own) ──────────────────────────────
alter table public.reviews enable row level security;
drop policy if exists "reviews public read"  on public.reviews;
drop policy if exists "reviews insert own"    on public.reviews;
drop policy if exists "reviews update own"    on public.reviews;
drop policy if exists "reviews delete own"    on public.reviews;
create policy "reviews public read" on public.reviews for select using (true);
create policy "reviews insert own"  on public.reviews for insert with check (reviewer_id = auth.uid());
create policy "reviews update own"  on public.reviews for update using (reviewer_id = auth.uid()) with check (reviewer_id = auth.uid());
create policy "reviews delete own"  on public.reviews for delete using (reviewer_id = auth.uid());

-- ════════════════════════════════════════════════════════════════════════════
--  VERIFICATION — every public table must show rls_enabled = true.
--  Any row with rls_enabled = false is an OPEN DOOR.
-- ════════════════════════════════════════════════════════════════════════════
select
  t.tablename,
  t.rowsecurity                       as rls_enabled,
  count(p.policyname)                  as policy_count
from pg_tables t
left join pg_policies p
  on p.schemaname = t.schemaname and p.tablename = t.tablename
where t.schemaname = 'public'
group by t.tablename, t.rowsecurity
order by t.rowsecurity asc, t.tablename;
