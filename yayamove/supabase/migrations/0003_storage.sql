-- ════════════════════════════════════════════════════════════════════════════
--  YAYAMOVE — STORAGE BUCKETS & POLICIES  (0003_storage.sql)
--
--  Megyprints audit lesson: a storage bucket left PUBLIC, with policies as
--  "manual dashboard clicks", is an open door. Here buckets are codified in SQL
--  and the sensitive ones are PRIVATE with owner-scoped, path-prefixed policies.
--
--  Convention: every object is stored under a folder named after the owner's
--  user id, e.g.  nbi-clearances/<auth.uid()>/clearance.jpg
--  Policies check that the first path segment == auth.uid().
-- ════════════════════════════════════════════════════════════════════════════

-- ── Buckets ─────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values
  ('avatars',        'avatars',        true),   -- profile photos (public read)
  ('portfolio',      'portfolio',      true),   -- work photos (public read)
  ('certificates',   'certificates',   false),  -- PRIVATE
  ('nbi-clearances', 'nbi-clearances', false)   -- PRIVATE — sensitive PII
on conflict (id) do update set public = excluded.public;

-- ── Public-read buckets: anyone reads, owner writes own folder ──────────────
drop policy if exists "avatars public read"  on storage.objects;
drop policy if exists "avatars owner write"  on storage.objects;
drop policy if exists "portfolio public read" on storage.objects;
drop policy if exists "portfolio owner write" on storage.objects;

create policy "avatars public read" on storage.objects
  for select using (bucket_id = 'avatars');
create policy "avatars owner write" on storage.objects
  for insert with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "portfolio public read" on storage.objects
  for select using (bucket_id = 'portfolio');
create policy "portfolio owner write" on storage.objects
  for insert with check (
    bucket_id = 'portfolio' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── certificates (PRIVATE): owner reads/writes own folder only ──────────────
drop policy if exists "certs owner read"  on storage.objects;
drop policy if exists "certs owner write" on storage.objects;
create policy "certs owner read" on storage.objects
  for select using (
    bucket_id = 'certificates' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "certs owner write" on storage.objects
  for insert with check (
    bucket_id = 'certificates' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── nbi-clearances (PRIVATE, sensitive): owner reads/writes own folder only ─
--  No public policy whatsoever. Access for end users is ONLY via short-lived
--  signed URLs the owner generates; the verification team reads via service_role.
drop policy if exists "nbi owner read"  on storage.objects;
drop policy if exists "nbi owner write" on storage.objects;
create policy "nbi owner read" on storage.objects
  for select using (
    bucket_id = 'nbi-clearances' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "nbi owner write" on storage.objects
  for insert with check (
    bucket_id = 'nbi-clearances' and (storage.foldername(name))[1] = auth.uid()::text
  );
