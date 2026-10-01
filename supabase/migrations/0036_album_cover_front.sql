-- ══════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0036_album_cover_front.sql  (idempotent; safe to re-run)
--
--  The album's FRONT COVER is saved with the album. Until now it lived only in
--  the draft on the device (localStorage), so opening a saved album from Your
--  Projects — or through "resume where you left off?" — showed whatever cover
--  that device's draft had, its photo slots pointing into ANOTHER album's
--  photo list.
--
--    1. albums.cover_front jsonb — the cover page, the same shape as one entry
--       of albums.pages (the builder's AlbumPage). NULL = saved without one
--       (every row before this migration); the builder starts a fresh cover.
--    2. Shape + size cap: a JSON object, same 15 MB ceiling as albums.pages
--       (0019-C). Every existing row is NULL, so it validates instantly.
--    3. GRANT restated. It is table-level, so it already covers the new
--       column; it is here so the chain says so (see 0026).
--
--  The app tolerates this column being absent (a deploy can land before
--  db:push): a save the database refuses over cover_front is sent again
--  without it, and reads use select('*'), which simply has no cover.
-- ══════════════════════════════════════════════════════════════════════════

alter table public.albums add column if not exists cover_front jsonb;

alter table public.albums drop constraint if exists albums_cover_front_chk;
alter table public.albums
  add constraint albums_cover_front_chk
  check (
    cover_front is null
    or (jsonb_typeof(cover_front) = 'object'
        and octet_length(cover_front::text) <= 15 * 1024 * 1024)
  );

-- albums: fully owned by the creating user (RLS still governs rows).
grant select, insert, update, delete on public.albums to authenticated;

-- PostgREST caches the schema; have it pick up the new column now instead of
-- refusing saves that carry it until its next reload.
notify pgrst, 'reload schema';
