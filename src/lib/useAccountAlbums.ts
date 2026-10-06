/* ══════════════════════════════════════════════════════════════════════════
   The account's albums, for the lists that show them (Home's Your Projects,
   Profile) — and whether they could be loaded at all.

   Offline, the list failed to load and the page said "No projects yet. Create
   your first photo album", and it never asked again when the connection came
   back (1-star testers round 3, the Connection Drop; confirmed by the
   checker). A returning customer would think the album was deleted and start
   over. Now a failed load is said as one, with "Try again", and it tries
   again by itself when the browser is back online, and every 20 seconds
   while it can't. It stays "couldn't load" until a load works: never a flash
   of "No projects yet" in between.
   ══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import { listAccountAlbums, type AlbumData } from './useAlbumSync';

export const ALBUMS_RETRY_MS = 20_000;

export interface AccountAlbums {
  albums: AlbumData[];
  /** The first load for this account is on its way. */
  loading: boolean;
  /** The list could not be loaded (it is NOT "no albums"). */
  failed: boolean;
  /** Failed, and trying again right now. */
  retrying: boolean;
  retry: () => void;
}

interface Result { userId: string; attempt: number; albums: AlbumData[]; failed: boolean }

export function useAccountAlbums(userId: string | undefined): AccountAlbums {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    listAccountAlbums(userId)
      .then((albums) => { if (alive) setResult({ userId, attempt, albums, failed: false }); })
      .catch(() => { if (alive) setResult((r) => ({ userId, attempt, albums: r?.userId === userId ? r.albums : [], failed: true })); });
    return () => { alive = false; };
  }, [userId, attempt]);

  // Only this account's result counts (another account's list never shows).
  const mine = result && result.userId === userId ? result : null;
  // Failed: again as soon as the browser is back online, and every so often
  // (a dead Wi-Fi the browser still calls "online" never fires that event).
  // Re-armed by every failed result.
  useEffect(() => {
    if (!mine?.failed) return;
    const again = () => setAttempt((a) => a + 1);
    window.addEventListener('online', again);
    const t = setTimeout(again, ALBUMS_RETRY_MS);
    return () => { window.removeEventListener('online', again); clearTimeout(t); };
  }, [mine]);

  return {
    albums: mine?.albums ?? [],
    loading: !!userId && !mine,
    failed: !!mine?.failed,
    retrying: !!mine?.failed && mine.attempt !== attempt,
    retry: () => setAttempt((a) => a + 1),
  };
}
