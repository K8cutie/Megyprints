/* When the Preview sends the album to the account itself.

   The builder saves to the account on its own once the album goes quiet,
   and only what changed: re-saving an album nobody changed is how a phone
   that only LOOKED at an album pushed its old copy over the laptop's newer
   one (useBuilderState flushCloud). Opening the Preview changes nothing, so
   it must not save every time it opens. It saves once for each album made
   (the pages' madeAt, stamped by generateAlbum), so a new album is in the
   account at once, and once more when the customer signs in later, on any
   screen (useAccountSave runs for the whole app, BuilderProvider): signing in
   from Home used to go straight to My albums, where the album was missing
   until the Preview was opened again (beta round 2). */
import { useEffect, useRef } from 'react';
import type { BuilderActions } from '@web/pages/builder/useBuilderState';
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

/** Signed in, the album on the phone goes to the account once for each album
 *  made, and when the customer signs in. One save at a time; one that did not
 *  go through is tried again at the next sign-in or album made (the builder's
 *  own saves try again meanwhile). */
export function useAccountSave(builder: BuilderActions, store: KeyValueStore, signedIn: boolean): void {
  const madeAt = builder.albumPages[0]?.madeAt ?? 0;
  // The album this render shows. Another account signing in on this phone
  // gets a fresh album, made by the builder just before this hook's effect
  // runs (a new id); that effect still holds the other account's pages, and
  // saving them would put that album in this account. Not this time: the
  // fresh album comes in the next render.
  const shownId = builder.getAlbumId();
  const opening = builder.isLoadingCloud;
  // The album and its pages as the last render showed them.
  const seen = useRef({ id: shownId, madeAt });
  const sending = useRef<string | null>(null);
  useEffect(() => {
    const before = seen.current;
    if (!signedIn) return;
    // An album being opened (My albums: loadAlbum) puts its pages in first
    // and its id, title and photos only once the phone has found its photos:
    // a save then sent the opened album's pages into the album that was on
    // the phone (beta round 3). Opened, it is the account's own copy: there
    // is nothing to save, so pages that came with a new id are not saved.
    if (opening) return;
    const albumId = builder.getAlbumId();
    if (albumId !== shownId) return;
    if (madeAt !== before.madeAt && albumId !== before.id) return;
    if (!accountSaveDue(store, albumId, madeAt)) return;
    const key = mark(albumId, madeAt);
    if (sending.current === key) return;
    sending.current = key;
    void builder.manualSave()
      .then((ok) => { if (ok) markAccountSaved(store, albumId, madeAt); })
      .catch(() => {})
      .finally(() => { if (sending.current === key) sending.current = null; });
    // Once per album made (madeAt), and when the customer signs in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, madeAt]);
  // After the save above has looked at what the last render showed.
  useEffect(() => { seen.current = { id: shownId, madeAt }; });
}
