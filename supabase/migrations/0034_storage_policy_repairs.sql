-- ══════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0034_storage_policy_repairs.sql  (idempotent; safe to re-run)
--
--  Three storage.objects problems, each proven live on 2026-09-29 as a real
--  non-operator customer (rolled-back `set local role authenticated` + JWT
--  claims, running the exact SQL Supabase Storage runs):
--
--    1. "Change video" on My Memories never worked for customers. It uploads
--       with upsert, and Storage checks an upsert by running
--       `INSERT … ON CONFLICT … DO UPDATE … RETURNING *` as the customer.
--       Both the conflict check and RETURNING need a SELECT policy that
--       matches the row, and 0030 gave memory-clips none, so every replace
--       failed with "new row violates row-level security policy".
--    2. The 200-clips-per-account cap in "Customers upload memory clips"
--       never triggered. Its `select count(*) from storage.objects` runs
--       under the customer's own RLS; with no SELECT policy the customer
--       always counted 0, so the 201st, 2000th… clip was accepted.
--    3. Four dashboard-made policies ("Users can … own photos lswg4f_*")
--       have NO bucket_id filter. Any signed-in user could write
--       "<own uid>/<anything>" into EVERY bucket, including the public
--       memory-clips bucket (free public file hosting that skips the clip
--       name rule and the cap) and the private print-pdfs / payment-proofs.
--       They were meant for the old `album-photos` bucket. Photos are
--       local-only now (useCloudPhotos is a no-op over IndexedDB), no code
--       in src/ or api/ touches album-photos, and the bucket is empty.
--       There were no stray "<uid>/…" objects in any bucket on 2026-09-29.
--
--  THE FIX
--    1+2. One SELECT policy: a signed-in customer sees ONLY the memory-clips
--         rows they uploaded (owner_id = their uid). The bucket is already
--         PUBLIC, so the bytes were always reachable by URL. This adds no new
--         way to read, and nobody can list anyone else's clips. It also makes
--         the 0030 delete/update policies reachable through the Storage API,
--         which looks the object up before it acts.
--    3.   Drop the bucket-less legacy policies, and also 0001's album-photos
--         policies (not live on prod, but a fresh environment built from
--         migrations would still have them). Nothing writes to album-photos.
--
--  No functions or tables are created, so there is nothing to GRANT. Each
--  policy names its role (`to authenticated`), and the Verify block checks
--  that authenticated still holds the storage.objects privileges Supabase
--  manages.
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1 + 2. memory-clips: an uploader can see their own clips ────────────────
drop policy if exists "Owners read own memory clips" on storage.objects;
create policy "Owners read own memory clips"
  on storage.objects for select to authenticated
  using (bucket_id = 'memory-clips' and owner_id = auth.uid()::text);

-- ── 3. Bucket-less legacy "own photos" policies (dashboard-made) ────────────
drop policy if exists "Users can upload own photos lswg4f_0" on storage.objects;
drop policy if exists "Users can view own photos lswg4f_0"   on storage.objects;
drop policy if exists "Users can delete own photos lswg4f_0" on storage.objects;
drop policy if exists "Users can delete own photos lswg4f_1" on storage.objects;

-- 0001's album-photos policies (never on prod; would exist on a fresh stack).
drop policy if exists "Users can view own photos"   on storage.objects;
drop policy if exists "Users can upload own photos" on storage.objects;
drop policy if exists "Users can update own photos" on storage.objects;
drop policy if exists "Users can delete own photos" on storage.objects;

-- ── Verify ──────────────────────────────────────────────────────────────────
select
  'every storage.objects policy names a bucket' as check,
  (not exists (
     select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and coalesce(qual, '') || coalesce(with_check, '') not like '%bucket_id%'))::text as result
union all
select 'no policy touches album-photos',
  (not exists (
     select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and coalesce(qual, '') || coalesce(with_check, '') like '%album-photos%'))::text
union all
select 'memory-clips owner read policy exists',
  (exists (
     select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname = 'Owners read own memory clips' and cmd = 'SELECT'
        and roles = '{authenticated}'))::text
union all
select 'memory-clips is still public',
  (coalesce((select public from storage.buckets where id = 'memory-clips'), false))::text
union all
select 'authenticated holds select/insert/update on storage.objects',
  (has_table_privilege('authenticated', 'storage.objects', 'SELECT')
   and has_table_privilege('authenticated', 'storage.objects', 'INSERT')
   and has_table_privilege('authenticated', 'storage.objects', 'UPDATE'))::text;
