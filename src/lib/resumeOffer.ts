/* ══════════════════════════════════════════════════════════════════════════
   resumeOffer — which album "pick up where you left off?" offers.

   Where the customer left off is the album they changed LAST:
     • the draft on this device, when it is theirs (or was never signed in)
       and changed at least as recently as their latest saved album — it can
       be newer than its cloud copy, which is only refreshed every 10 minutes
       or on leaving;
     • otherwise their latest saved album (e.g. they last worked on another
       phone or computer).
   ══════════════════════════════════════════════════════════════════════════ */

import type { LocalDraftSummary } from './localDraft';
import { cleanAlbumName, UNNAMED_ALBUM } from './albumName';

export interface SavedAlbumSummary {
  id: string;
  title?: string;
  updatedAt?: string;
  /** Photos in the saved album, when known. */
  photoCount?: number;
}

/** Titles an album got without the customer naming it. */
const DEFAULT_TITLES = new Set([UNNAMED_ALBUM, 'Untitled Album', '']);

/** An album nobody put anything into — opening the builder and leaving used to
 *  save one of these every time. Never worth offering. */
function isEmptyLeftover(a: SavedAlbumSummary): boolean {
  return a.photoCount === 0 && DEFAULT_TITLES.has(cleanAlbumName(a.title));
}

export type ResumeOffer =
  | { kind: 'device'; title: string; photoCount: number }
  | { kind: 'saved'; albumId: string; title: string; updatedAt?: string };

const time = (iso?: string) => (iso ? Date.parse(iso) || 0 : 0);

export function chooseResumeOffer(
  local: LocalDraftSummary | null,
  saved: SavedAlbumSummary[],
  userId: string,
): ResumeOffer | null {
  const latest = saved
    .filter((a) => !isEmptyLeftover(a))
    .sort((a, b) => time(b.updatedAt) - time(a.updatedAt))[0];
  // Another account's draft on a shared device is not this customer's work.
  const mine = local && (!local.accountId || local.accountId === userId) ? local : null;

  if (mine && (!latest || mine.editedAt >= time(latest.updatedAt))) {
    const twin = mine.albumId ? saved.find((a) => a.id === mine.albumId) : undefined;
    return {
      kind: 'device',
      title: cleanAlbumName(mine.title) || cleanAlbumName(twin?.title),
      photoCount: mine.photoCount,
    };
  }
  if (latest) {
    return { kind: 'saved', albumId: latest.id, title: cleanAlbumName(latest.title), updatedAt: latest.updatedAt };
  }
  return null;
}
