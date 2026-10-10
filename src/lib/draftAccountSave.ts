/* ══════════════════════════════════════════════════════════════════════════
   Checkout saves a guest's draft to the account they just made (draftAlbum).
   Its own module so the builder, which only needs the draft's shape, does not
   import the save path.
   ══════════════════════════════════════════════════════════════════════════ */

import { saveAlbumRow, serializeAlbum } from './useAlbumSync';
import { DRAFT_STORAGE_KEY } from './localDraft';
import { draftAlbumForAccount, type StoredDraft } from './draftAlbum';
import { albumContentKey, draftSyncRecord, readSyncRecord, toDraftSync } from './albumSyncRecord';

/** What saving the draft to an account came to (saveDraftToAccount). */
export type DraftSaveOutcome =
  | 'saved'
  /** The account's copy was changed on another device since this draft's
   *  version: which to keep is the builder's question, not checkout's. */
  | 'conflict'
  /** No such draft for this account, or the save failed. */
  | 'failed';

/** Save this device's draft of `albumId` to `userId`'s account the way the
 *  builder saves (useAlbumSync.saveAlbumRow): on the draft's own version when
 *  it has one, else as a new album, never over a newer copy. Then the draft is
 *  stamped with the account and the version, so the builder carries on from
 *  it: checkout used to upsert blindly and leave the draft "nobody's", and the
 *  next account to open the builder on this device took it over (Kraken,
 *  2026-10-05). */
export async function saveDraftToAccount(userId: string, albumId: string): Promise<DraftSaveOutcome> {
  const album = draftAlbumForAccount(userId, albumId);
  if (!album?.id) return 'failed';
  let stored: StoredDraft;
  try { stored = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) || '{}') as StoredDraft; } catch { return 'failed'; }
  const rec = draftSyncRecord(album.id, stored.sync) ?? readSyncRecord(album.id);
  let res;
  try {
    res = await saveAlbumRow(userId, album, { base: rec?.base ?? null });
  } catch {
    return 'failed';
  }
  if (res.conflict) return 'conflict';
  if (!res.success) return 'failed';
  try {
    const now = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) || 'null') as StoredDraft | null;
    if (now && now.albumId === album.id) {
      const sync = toDraftSync({ albumId: album.id, base: res.updatedAt ?? null, key: albumContentKey(serializeAlbum(album)) });
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ ...now, accountId: userId, sync }));
    }
  } catch { /* storage full: the account has the album either way */ }
  return 'saved';
}
