/* The signed-in person's albums, and whether they could be loaded at all.
   Same behaviour as the website's useAccountAlbums: a failed load stays
   "couldn't load" (never a flash of "no albums"), with Try again, and it
   tries again by itself every 20 seconds and when the app comes back on
   screen. `savedAt` is the builder's last save to the account: when it
   moves, the list is read again, so an album saved after the list opened
   (signing in with an album on the phone) shows up on it. `remove` deletes
   an album with the website's own delete (albumCloud), and it leaves the list
   at once. */
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useAlbumSyncWith } from '@web/lib/albumCloud';
import { ALBUMS_RETRY_MS, listMyAlbums, type AlbumRow } from './albums';
import { supabase } from './supabase';

interface Result { userId: string; attempt: number; albums: AlbumRow[]; failed: boolean }

export interface MyAlbums {
  albums: AlbumRow[];
  loading: boolean;
  failed: boolean;
  retrying: boolean;
  retry: () => void;
  /** Deletes the album from the account. False: it could not be deleted. */
  remove: (albumId: string) => Promise<boolean>;
}

export function useMyAlbums(userId: string | undefined, savedAt = 0): MyAlbums {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  const { deleteAlbum } = useAlbumSyncWith(supabase);
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());
  const remove = useCallback(async (albumId: string) => {
    const { success } = await deleteAlbum(albumId);
    if (success) setGone((g) => new Set(g).add(albumId));
    return success;
  }, [deleteAlbum]);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    listMyAlbums(supabase, userId)
      .then((albums) => { if (alive) setResult({ userId, attempt, albums, failed: false }); })
      .catch(() => { if (alive) setResult((r) => ({ userId, attempt, albums: r?.userId === userId ? r.albums : [], failed: true })); });
    return () => { alive = false; };
  }, [userId, attempt, savedAt]);

  const mine = result && result.userId === userId ? result : null;

  useEffect(() => {
    if (!mine?.failed) return;
    const t = setTimeout(retry, ALBUMS_RETRY_MS);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') retry(); });
    return () => { clearTimeout(t); sub.remove(); };
  }, [mine, retry]);

  return {
    albums: (mine?.albums ?? []).filter((a) => !gone.has(a.id)),
    loading: !!userId && !mine,
    failed: !!mine?.failed,
    retrying: !!mine?.failed && mine.attempt !== attempt,
    retry,
    remove,
  };
}
