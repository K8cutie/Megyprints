/* ══════════════════════════════════════════════════════════════════════════
   resumeOffer — which albums "pick up where you left off?" offers.

   Owner (2026-10-11): show the customer's last 3 albums, newest first, and
   the newest one is chosen to start with.

   Where the customer left off is the album they changed LAST:
     • the draft on this device, when it is theirs (or was never signed in)
       and changed at least as recently as their latest saved album — it can
       be newer than its cloud copy, which is only refreshed every 10 minutes
       or on leaving;
     • otherwise their latest saved album (e.g. they last worked on another
       phone or computer).
   The same album is never listed twice: the draft on this device and its
   saved copy are one album, offered from whichever changed later.
   ══════════════════════════════════════════════════════════════════════════ */

import type { LocalDraftSummary } from './localDraft';
import { cleanAlbumName, isDefaultAlbumName } from './albumName';

export interface SavedAlbumSummary {
  id: string;
  title?: string;
  updatedAt?: string;
  /** Photos in the saved album, when known. */
  photoCount?: number;
  /** The album's small first-page picture, when the account has one. */
  coverPhoto?: string | null;
}

/** An album nobody put anything into — opening the builder and leaving used to
 *  save one of these every time. Never worth offering. */
function isEmptyLeftover(a: SavedAlbumSummary): boolean {
  return a.photoCount === 0 && isDefaultAlbumName(a.title);
}

export type ResumeOffer =
  | { kind: 'device'; id: 'device'; title: string; photoCount: number; coverPhoto?: string | null }
  | { kind: 'saved'; id: string; albumId: string; title: string; updatedAt?: string; coverPhoto?: string | null };

/** How many albums the prompt lists (owner: "the last 3 albums"). */
export const RESUME_LIST_MAX = 3;

const time = (iso?: string) => (iso ? Date.parse(iso) || 0 : 0);

/** The albums to offer, newest first, at most `max`. */
export function chooseResumeOffers(
  local: LocalDraftSummary | null,
  saved: SavedAlbumSummary[],
  userId: string,
  max = RESUME_LIST_MAX,
): ResumeOffer[] {
  // Another account's draft on a shared device is not this customer's work.
  const mine = local && (!local.accountId || local.accountId === userId) ? local : null;
  const twin = mine?.albumId ? saved.find((a) => a.id === mine.albumId) : undefined;
  // The copy here wins a tie with its saved copy, as with any saved album.
  const deviceWins = !!mine && (!twin || mine.editedAt >= time(twin.updatedAt));

  const listed: { at: number; device: boolean; offer: ResumeOffer }[] = saved
    .filter((a) => !isEmptyLeftover(a))
    .filter((a) => !(deviceWins && a.id === twin?.id))
    .map((a) => ({
      at: time(a.updatedAt),
      device: false,
      offer: { kind: 'saved', id: a.id, albumId: a.id, title: cleanAlbumName(a.title), updatedAt: a.updatedAt, coverPhoto: a.coverPhoto },
    }));
  if (mine && deviceWins) {
    listed.push({
      at: mine.editedAt,
      device: true,
      offer: {
        kind: 'device',
        id: 'device',
        title: cleanAlbumName(mine.title) || cleanAlbumName(twin?.title),
        photoCount: mine.photoCount,
        coverPhoto: twin?.coverPhoto,
      },
    });
  }
  return listed
    // Newest first; the draft here wins a tie (it can be newer than any save).
    .sort((a, b) => b.at - a.at || Number(b.device) - Number(a.device))
    .slice(0, Math.max(0, max))
    .map((l) => l.offer);
}

/** The one album where they left off (the first of the list). */
export function chooseResumeOffer(
  local: LocalDraftSummary | null,
  saved: SavedAlbumSummary[],
  userId: string,
): ResumeOffer | null {
  return chooseResumeOffers(local, saved, userId, 1)[0] ?? null;
}
