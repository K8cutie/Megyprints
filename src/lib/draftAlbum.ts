/* ══════════════════════════════════════════════════════════════════════════
   The device draft as an album row — ONE shape for every place that saves a
   draft to an account without the builder running (the builder's own
   serializeAlbum is the same shape, built from live state).

   Used by checkout (1-star testers, 2026-10-04): a guest who signs up at
   checkout was refused — "This album isn't saved to your account yet" — and
   sent back to the builder to tap Order again, which wiped their address.
   Checkout now saves the draft to the new account itself, on the spot.

   Only a draft that belongs to NOBODY (a guest's) or to THIS account is ever
   saved: another person's album left on a shared device stays theirs.
   ══════════════════════════════════════════════════════════════════════════ */

import type { AlbumData } from './useAlbumSync';
import { DRAFT_STORAGE_KEY } from './localDraft';
import { readAlbumTheme } from './albumTheme';
import { albumDataFromDraft, type StoredDraft } from './draftAlbumRow';

// The draft as an album row lives in draftAlbumRow.ts, which the 2.0 app
// shares; it is offered here as before.
export { albumDataFromDraft, type StoredDraft };

/** This device's draft of `albumId`, ready to save to `userId`'s account —
 *  or null when there is no such draft, it has no pages, or it belongs to
 *  someone else. */
export function draftAlbumForAccount(userId: string, albumId: string | undefined): AlbumData | null {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as StoredDraft;
    if (!d.albumId || (albumId && d.albumId !== albumId)) return null;
    if (d.accountId && d.accountId !== userId) return null;
    if (!Array.isArray(d.albumPages) || d.albumPages.length === 0) return null;
    return albumDataFromDraft(d, readAlbumTheme());
  } catch {
    return null;
  }
}
