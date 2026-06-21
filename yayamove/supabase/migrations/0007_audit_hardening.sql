-- ════════════════════════════════════════════════════════════════════════════
--  YAYAMOVE — POST-AUDIT HARDENING  (0007)
--  Run after 0006. Idempotent. Addresses the security audit findings H2, H3,
--  M1, M3, M4, L1, L2.
-- ════════════════════════════════════════════════════════════════════════════

-- ── H2: messages are immutable except `read_at` ─────────────────────────────
-- The update policy was scoped to participants but not to columns, so either
-- party could rewrite the other's `body`. Freeze every column but read_at for
-- non-service_role callers.
create or replace function public.guard_message_immutable()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() is distinct from 'service_role' then
    new.body            := old.body;
    new.sender_id       := old.sender_id;
    new.conversation_id := old.conversation_id;
    new.created_at      := old.created_at;
  end if;
  return new;
end $$;

drop trigger if exists trg_message_immutable on public.messages;
create trigger trg_message_immutable
  before update on public.messages
  for each row execute function public.guard_message_immutable();

-- ── H3: only the seeker (or admin/service_role) can complete a booking ──────
-- Providers could flip their own booking to 'completed' and pump jobs_completed.
create or replace function public.guard_booking_completion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed'
     and old.status is distinct from 'completed'
     and auth.role() is distinct from 'service_role'
     and not public.is_admin()
     and auth.uid() is distinct from old.seeker_id then
    -- a provider cannot self-complete; revert the change
    new.status := old.status;
  end if;
  return new;
end $$;

drop trigger if exists trg_booking_completion on public.bookings;
create trigger trg_booking_completion
  before update on public.bookings
  for each row execute function public.guard_booking_completion();

-- ── M4: a review requires a real completed booking with that provider ───────
drop policy if exists "reviews insert own" on public.reviews;
create policy "reviews insert own" on public.reviews for insert
  with check (
    reviewer_id = auth.uid()
    and exists (
      select 1 from public.bookings b
      where b.provider_id = provider_id
        and b.seeker_id = auth.uid()
        and b.status = 'completed'
    )
  );

-- ── M1: enforce size + content-type on sensitive buckets ────────────────────
update storage.buckets
   set file_size_limit = 10485760, -- 10 MB
       allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf']
 where id in ('nbi-clearances', 'certificates');

-- ── L1: rename colliding storage policy names (were identical to the
--        public.nbi_clearances policy names — confusing, though harmless) ────
drop policy if exists "nbi owner read"  on storage.objects;
drop policy if exists "nbi owner write" on storage.objects;
create policy "storage nbi owner read" on storage.objects
  for select using (
    bucket_id = 'nbi-clearances' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "storage nbi owner write" on storage.objects
  for insert with check (
    bucket_id = 'nbi-clearances' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── M3: stop exposing provider_profiles.user_id (the auth UUID) to the
--        public anon/authenticated SELECT. RLS still gates rows; this gates
--        COLUMNS. Owner-row policies use user_id inside the policy (server-side),
--        which is unaffected by column grants. The app never selects user_id.
-- ────────────────────────────────────────────────────────────────────────────
revoke select on public.provider_profiles from anon, authenticated;
grant select (
  id, display_name, headline, bio, primary_category, hourly_rate, service_area,
  city, barangay, lat, lng, years_experience, verification_status,
  rating_avg, rating_count, jobs_completed, created_at
) on public.provider_profiles to anon, authenticated;

-- Note (L2): certificates.file_path is still public-readable. The file itself is
-- in a private bucket (owner-only), so the path string grants no access. A
-- public VIEW excluding file_path is the clean fix when convenient; tracked in
-- SECURITY.md rather than risking the owner's own read here.
