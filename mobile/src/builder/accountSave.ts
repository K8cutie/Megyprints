/* When the Preview sends the album to the account itself.

   The builder saves to the account on its own once the album goes quiet,
   and only what changed: re-saving an album nobody changed is how a phone
   that only LOOKED at an album pushed its old copy over the laptop's newer
   one (useBuilderState flushCloud). Opening the Preview changes nothing, so
   it must not save every time it opens. It saves once for each album made
   (the pages' madeAt, stamped by generateAlbum), so a new album is in the
   account at once, and once more when the customer signs in later. */
import type { KeyValueStore } from '@web/shared/platform';

export const ACCOUNT_SAVED_KEY = 'megy-2.0-account-saved';

const mark = (albumId: string | undefined, madeAt: number) => `${albumId ?? ''}|${madeAt}`;

/** This album, as made at `madeAt`, has not gone to the account from here yet. */
export function accountSaveDue(store: KeyValueStore, albumId: string | undefined, madeAt: number): boolean {
  if (!albumId || !madeAt) return false;
  try { return store.getItem(ACCOUNT_SAVED_KEY) !== mark(albumId, madeAt); } catch { return true; }
}

export function markAccountSaved(store: KeyValueStore, albumId: string | undefined, madeAt: number): void {
  try { store.setItem(ACCOUNT_SAVED_KEY, mark(albumId, madeAt)); } catch { /* saved again next time: harmless */ }
}
