-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0040_albums_insert_time.sql  (idempotent; safe to re-run)
--
--  WHY: albums.updated_at is the album's VERSION. Two devices decide which copy
--  is newer by it (albumSyncRecord), and Your Projects and checkout order by
--  it. 0001 stamps it on UPDATE only, so a NEW row kept whatever the device
--  sent, and the app sent its own clock. A phone a few hours fast wrote a
--  first save "from the future", and from then on it sorted first and looked
--  newer than every save after it (Kraken, 2026-10-05).
--
--  The app no longer sends updated_at at all (useAlbumSync.serializeAlbum).
--  This makes the database the only clock, on insert as on update: whatever a
--  client sends for updated_at is replaced with the server's time.
-- ════════════════════════════════════════════════════════════════════════════

drop trigger if exists on_album_inserted on public.albums;
create trigger on_album_inserted
  before insert on public.albums
  for each row execute procedure public.handle_updated_at();

-- ══════ Verify ══════
select 'albums.updated_at is stamped by the server on insert AND update' as check,
  (exists (select 1 from pg_trigger t
            where t.tgrelid = 'public.albums'::regclass and t.tgname = 'on_album_inserted' and not t.tgisinternal)
   and exists (select 1 from pg_trigger t
                where t.tgrelid = 'public.albums'::regclass and t.tgname = 'on_album_updated' and not t.tgisinternal))::text as result;
