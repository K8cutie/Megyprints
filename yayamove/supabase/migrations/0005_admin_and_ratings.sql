-- ════════════════════════════════════════════════════════════════════════════
--  YAYAMOVE — ADMIN VERIFICATION + SERVER-SIDE RATINGS  (0005)
--  Run after 0004. Idempotent.
--
--  Adds a trusted "admin" role so the verification team can approve NBI
--  clearances FROM THE APP (not only via service_role), while normal users stay
--  frozen out. Also moves rating math server-side (a trigger), so ratings can
--  never be set by the client — only computed from real reviews.
-- ════════════════════════════════════════════════════════════════════════════

-- ── admins allowlist ────────────────────────────────────────────────────────
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
-- Locked down: nobody can read/write this from the client. Membership is granted
-- manually in the SQL editor:  insert into public.admins (user_id) values ('<uid>');
alter table public.admins enable row level security;
-- (no policies = no client access; service_role bypasses RLS)

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.admins where user_id = auth.uid()) $$;

-- ── Let admins (and service_role) change the frozen fields ──────────────────
create or replace function public.guard_provider_server_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() is distinct from 'service_role' and not public.is_admin() then
    new.verification_status := old.verification_status;
    new.rating_avg          := old.rating_avg;
    new.rating_count        := old.rating_count;
    new.jobs_completed      := old.jobs_completed;
  end if;
  return new;
end $$;

create or replace function public.guard_nbi_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() is distinct from 'service_role' and not public.is_admin() then
    new.status      := old.status;
    new.reviewed_at := old.reviewed_at;
  end if;
  return new;
end $$;

-- ── Admin RLS: read every NBI clearance + update review status ──────────────
drop policy if exists "nbi admin read"   on public.nbi_clearances;
drop policy if exists "nbi admin update" on public.nbi_clearances;
create policy "nbi admin read"   on public.nbi_clearances for select using (public.is_admin());
create policy "nbi admin update" on public.nbi_clearances for update using (public.is_admin()) with check (public.is_admin());

-- Admins may flip a provider's verification badge (the guard trigger now allows it).
drop policy if exists "providers admin update" on public.provider_profiles;
create policy "providers admin update" on public.provider_profiles for update
  using (public.is_admin()) with check (public.is_admin());

-- ── Server-side rating recompute (never trust the client) ───────────────────
create or replace function public.recompute_provider_rating()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  pid uuid := coalesce(new.provider_id, old.provider_id);
begin
  update public.provider_profiles p
     set rating_avg = coalesce((select round(avg(rating)::numeric, 2) from public.reviews where provider_id = pid), 0),
         rating_count = (select count(*) from public.reviews where provider_id = pid)
   where p.id = pid;
  return null;
end $$;

drop trigger if exists trg_recompute_rating on public.reviews;
create trigger trg_recompute_rating
  after insert or update or delete on public.reviews
  for each row execute function public.recompute_provider_rating();

-- ── Bump jobs_completed when a booking is marked completed ──────────────────
create or replace function public.bump_jobs_completed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    update public.provider_profiles
       set jobs_completed = jobs_completed + 1
     where id = new.provider_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_bump_jobs on public.bookings;
create trigger trg_bump_jobs
  after update on public.bookings
  for each row execute function public.bump_jobs_completed();
