/* ══════════════════════════════════════════════════════════════════════════
   Account deletion — the client half of migration 0027.

   Google Play requires an in-app deletion path for any app that creates
   accounts. This module is that path; `public/delete-account.html` is the
   public web route the same policy also demands.

   Two calls, and the split is not arbitrary:

     preflight  — a plain RPC. Read-only, so it runs straight from the browser
                  and the confirm dialog can show real numbers and name a
                  blocking order BEFORE the customer commits.

     delete     — POSTed to /api/delete-account instead of calling the RPC
                  directly, for ONE reason: the customer's PHOTOS (print-ready
                  PDFs) and VIDEOS (memory clips, in a PUBLIC bucket) have to
                  go too, and the customer's own session cannot remove them.
                  The Storage API looks an object up before deleting it, and
                  customers have no SELECT on those buckets (0008 keeps a paid
                  album from being downloaded and taken to another printer) —
                  so the delete 403s before the delete rule is ever consulted.
                  The endpoint removes them with a service key and then calls
                  delete_own_account() with the CUSTOMER's token, so the
                  database still decides everything else, and refuses if any
                  file is still there. See api/delete-account.mjs.

   Then, locally: wipe IndexedDB drafts and every megy* key — a cloud deletion
   that leaves the last album sitting in the browser is not a deletion the
   customer would recognize — and sign out, since the JWT still parses for its
   remaining lifetime even though the user row is gone.
   ══════════════════════════════════════════════════════════════════════════ */

import { supabase, supabaseConfigured } from './supabase';
import {
  blockingSentence,
  preflightAccountDeletionWith,
  requestAccountDeletion,
  type DeletionPreflight,
  type DeletionResult,
} from './accountDeletionRules';

/* What a deletion touches, what blocks it, and the call to the endpoint are
   in accountDeletionRules.ts (shared with the 2.0 app); this file adds the
   website's client, its own endpoint, and wiping the browser. */
export { blockingSentence };
export type { DeletionPreflight, DeletionResult };

/** IndexedDB database holding the in-progress album's photos (useIndexedDBPhotos). */
const PHOTO_DB = 'megy-photos';

export async function preflightAccountDeletion(): Promise<DeletionPreflight> {
  if (!supabaseConfigured) throw new Error('Account deletion is unavailable right now.');
  return preflightAccountDeletionWith(supabase);
}

/** Everything this browser remembers about the account and the album in
 *  progress. Runs after the server call succeeds — wiping first would lose the
 *  customer's work if the deletion then failed. */
async function wipeLocalData(): Promise<void> {
  await new Promise<void>((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(PHOTO_DB);
      // `blocked` fires when another tab still holds the DB open. Nothing to be
      // done about that from here, so stop waiting rather than hang the flow.
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });

  for (const store of [localStorage, sessionStorage]) {
    try {
      Object.keys(store)
        .filter((k) => k.startsWith('megy'))
        .forEach((k) => store.removeItem(k));
    } catch {
      /* private mode / storage disabled — nothing to clear */
    }
  }
}

/**
 * Deletes the signed-in account and its data. Throws with a message meant to be
 * shown verbatim (the server writes them for a customer to read, e.g. naming the
 * order that is still in production).
 */
export async function deleteMyAccount(): Promise<DeletionResult> {
  if (!supabaseConfigured) throw new Error('Account deletion is unavailable right now.');

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('You are not signed in.');

  const result = await requestAccountDeletion('/api/delete-account', token, (url, init) => fetch(url, init));

  await wipeLocalData();
  await supabase.auth.signOut();

  return result;
}
