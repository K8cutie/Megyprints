/* ══════════════════════════════════════════════════════════════════════════
   photoKeeping — which photos a thrown-away draft may take with it.

   Photo bytes live ONLY in this browser's IndexedDB (useIndexedDBPhotos), and
   every album on the device shares that one store. A saved album in the cloud
   holds just its photos' ids. Starting a new album used to wipe the whole
   store, so every "Start Creating" left every saved album on the device blank.
   ══════════════════════════════════════════════════════════════════════════ */

/** The draft being thrown away. */
export interface DiscardedDraft {
  photoIds: string[];
  /** The account the draft was worked on under, if it ever was. A signed-in
   *  draft is (or is about to be) a saved album in that account. */
  accountId?: string | null;
}

/** Photo ids that can be deleted when a draft is thrown away (new album /
 *  restart).
 *
 *  Only a draft that never touched an account is truly gone: nothing else can
 *  reach its photos. Anything signed in is (or is about to be) a saved album,
 *  so its photos stay. When unsure, keep — an orphan costs a little disk; a
 *  wrongly deleted photo is a blank page in someone's saved album. */
export function photosToForget(draft: DiscardedDraft | null, signedIn: boolean): string[] {
  if (!draft || signedIn || draft.accountId) return [];
  return [...new Set(draft.photoIds)];
}
