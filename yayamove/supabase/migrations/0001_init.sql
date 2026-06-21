-- ════════════════════════════════════════════════════════════════════════════
--  YAYAMOVE — SCHEMA  (0001_init.sql)
--  Run order: 0001_init → 0002_rls_lockdown → 0003_storage → seed.sql
--
--  Server-trust model (Megyprints audit lesson "never trust the client"):
--  verification_status, rating_avg, rating_count, jobs_completed are set by the
--  backend ONLY. A guard trigger (below) freezes those columns for normal users
--  so a provider can never self-mark themselves "NBI Verified".
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ── Enums ───────────────────────────────────────────────────────────────────
do $$ begin
  create type verification_status as enum ('unverified','pending','verified','rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type job_status as enum ('open','matched','in_progress','completed','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type quote_status as enum ('sent','accepted','declined','withdrawn');
exception when duplicate_object then null; end $$;

do $$ begin
  create type category_slug as enum
    ('maid','carpentry','plumbing','computer-technician','aircon-service');
exception when duplicate_object then null; end $$;

-- ── profiles (1:1 with auth.users) ──────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  phone       text,
  avatar_url  text,
  city        text,
  province    text,
  is_provider boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ── provider_profiles ───────────────────────────────────────────────────────
create table if not exists public.provider_profiles (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null unique references auth.users(id) on delete cascade,
  headline            text not null default '',
  bio                 text,
  primary_category    category_slug not null,
  hourly_rate         numeric(10,2),
  service_area        text,
  years_experience    int,
  -- server-controlled fields ↓ (frozen by guard trigger for non-service_role)
  verification_status verification_status not null default 'unverified',
  rating_avg          numeric(3,2) not null default 0,
  rating_count        int not null default 0,
  jobs_completed      int not null default 0,
  created_at          timestamptz not null default now()
);
create index if not exists idx_provider_category on public.provider_profiles(primary_category);
create index if not exists idx_provider_verif on public.provider_profiles(verification_status);

-- ── provider_skills ─────────────────────────────────────────────────────────
create table if not exists public.provider_skills (
  id          uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_profiles(id) on delete cascade,
  category    category_slug not null,
  skill       text not null
);
create index if not exists idx_skills_provider on public.provider_skills(provider_id);

-- ── work_experience ─────────────────────────────────────────────────────────
create table if not exists public.work_experience (
  id          uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_profiles(id) on delete cascade,
  title       text not null,
  employer    text,
  start_year  int,
  end_year    int,
  description text
);
create index if not exists idx_exp_provider on public.work_experience(provider_id);

-- ── certificates (file lives in PRIVATE storage; only the path is stored) ────
create table if not exists public.certificates (
  id          uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_profiles(id) on delete cascade,
  title       text not null,
  issuer      text,
  year        int,
  file_path   text
);
create index if not exists idx_cert_provider on public.certificates(provider_id);

-- ── nbi_clearances (HIGHLY SENSITIVE PII — private storage only) ────────────
create table if not exists public.nbi_clearances (
  id            uuid primary key default gen_random_uuid(),
  provider_id   uuid not null references public.provider_profiles(id) on delete cascade,
  file_path     text not null,                 -- object in private 'nbi-clearances' bucket
  status        verification_status not null default 'pending', -- server-controlled
  consent_given boolean not null default false,
  uploaded_at   timestamptz not null default now(),
  reviewed_at   timestamptz
);
create index if not exists idx_nbi_provider on public.nbi_clearances(provider_id);

-- ── jobs ────────────────────────────────────────────────────────────────────
create table if not exists public.jobs (
  id          uuid primary key default gen_random_uuid(),
  seeker_id   uuid not null references auth.users(id) on delete cascade,
  category    category_slug not null,
  title       text not null,
  description text not null,
  city        text,
  budget_min  numeric(10,2),
  budget_max  numeric(10,2),
  status      job_status not null default 'open',
  created_at  timestamptz not null default now()
);
create index if not exists idx_jobs_category on public.jobs(category);
create index if not exists idx_jobs_status on public.jobs(status);

-- ── quotes ──────────────────────────────────────────────────────────────────
create table if not exists public.quotes (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.jobs(id) on delete cascade,
  provider_id uuid not null references public.provider_profiles(id) on delete cascade,
  amount      numeric(10,2) not null,
  message     text,
  status      quote_status not null default 'sent',
  created_at  timestamptz not null default now(),
  unique (job_id, provider_id)
);
create index if not exists idx_quotes_job on public.quotes(job_id);

-- ── reviews ─────────────────────────────────────────────────────────────────
create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_profiles(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id) on delete cascade,
  job_id      uuid references public.jobs(id) on delete set null,
  rating      int not null check (rating between 1 and 5),
  comment     text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_reviews_provider on public.reviews(provider_id);

-- ════════════════════════════════════════════════════════════════════════════
--  TRIGGERS
-- ════════════════════════════════════════════════════════════════════════════

-- Auto-create a profile row when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, is_provider)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce((new.raw_user_meta_data->>'is_provider')::boolean, false)
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Freeze server-controlled columns on provider_profiles for normal users.
-- Only the service_role (backend) may change verification/ratings.
create or replace function public.guard_provider_server_fields()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    new.verification_status := old.verification_status;
    new.rating_avg          := old.rating_avg;
    new.rating_count        := old.rating_count;
    new.jobs_completed      := old.jobs_completed;
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_provider on public.provider_profiles;
create trigger trg_guard_provider
  before update on public.provider_profiles
  for each row execute function public.guard_provider_server_fields();

-- Freeze NBI clearance review status for normal users (only backend approves).
create or replace function public.guard_nbi_status()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    new.status      := old.status;
    new.reviewed_at := old.reviewed_at;
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_nbi on public.nbi_clearances;
create trigger trg_guard_nbi
  before update on public.nbi_clearances
  for each row execute function public.guard_nbi_status();
