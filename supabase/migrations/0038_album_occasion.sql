-- ══════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0038_album_occasion.sql  (idempotent; safe to re-run)
--
--  The album's OCCASION ("Vacation", "Wedding", or anything typed — Step 1,
--  the seed of the album's quotes) is saved with the album. It lived in one
--  key per device, so resuming the album on a fresh browser had no occasion
--  and "Generate Album" bounced the customer back to Step 1 (1-star testers
--  round 2, N4); and on a shared device, another album inherited it.
--
--    1. albums.occasion text — NULL for every row before this (the builder
--       then keeps whatever the device has, as before). Capped at 80 chars
--       (the app caps it at 40).
--    2. photos_per_page already exists (0001) — the app now saves it too.
--    3. GRANT restated (table-level; it already covers the new column).
--
--  The app tolerates this column being absent (a deploy can land before
--  db:push): a save refused over occasion is sent again without it.
-- ══════════════════════════════════════════════════════════════════════════

alter table public.albums add column if not exists occasion text;

alter table public.albums drop constraint if exists albums_occasion_chk;
alter table public.albums
  add constraint albums_occasion_chk
  check (occasion is null or char_length(occasion) <= 80);

-- albums: fully owned by the creating user (RLS still governs rows).
grant select, insert, update, delete on public.albums to authenticated;

notify pgrst, 'reload schema';
