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
                  directly, for ONE reason: the print-ready PDFs are the only
                  place the customer's PHOTOS live on our side, and the
                  customer's own session cannot remove them. The Storage API
                  looks an object up before deleting it, and migration 0008
                  deliberately denies customers SELECT on print-pdfs so a paid
                  album can't be downloaded and taken to another printer — so
                  the delete 403s before the delete rule is ever consulted.
                  The endpoint does that one step with a service key and then
                  calls delete_own_account() with the CUSTOMER's token, so the
                  database still decides everything else. See api/delete-account.mjs.

   Then, locally: wipe IndexedDB drafts and every megy* key — a cloud deletion
   that leaves the last album sitting in the browser is not a deletion the
   customer would recognize — and sign out, since the JWT still parses for its
   remaining lifetime even though the user row is gone.
   ══════════════════════════════════════════════════════════════════════════ */

import { supabase, supabaseConfigured } from './supabase';

/** What a deletion would touch. `blocking` is non-empty when the account has an
 *  order that is paid but not yet delivered — the one case we refuse. */
export interface DeletionPreflight {
  albums: number;
  memories: number;
  orders: number;
  blocking: { order_number: string; status: string }[];
}

export interface DeletionResult {
  deleted_albums: number;
  deleted_memories: number;
  anonymized_orders: number;
}

/** IndexedDB database holding the in-progress album's photos (useIndexedDBPhotos). */
const PHOTO_DB = 'megy-photos';

export async function preflightAccountDeletion(): Promise<DeletionPreflight> {
  if (!supabaseConfigured) throw new Error('Account deletion is unavailable right now.');

  const { data, error } = await supabase.rpc('account_deletion_preflight');
  if (error) throw new Error(error.message);

  const raw = (data ?? {}) as Partial<DeletionPreflight>;
  return {
    albums: raw.albums ?? 0,
    memories: raw.memories ?? 0,
    orders: raw.orders ?? 0,
    blocking: Array.isArray(raw.blocking) ? raw.blocking : [],
  };
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

  const res = await fetch('/api/delete-account', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: '{}',
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    // The server's messages are written for a customer to read (they name the
    // order that is still in production), so show them as-is.
    throw new Error(payload?.error || 'Deletion failed. Please try again.');
  }

  await wipeLocalData();
  await supabase.auth.signOut();

  const raw = payload as Partial<DeletionResult>;
  return {
    deleted_albums: raw.deleted_albums ?? 0,
    deleted_memories: raw.deleted_memories ?? 0,
    anonymized_orders: raw.anonymized_orders ?? 0,
  };
}
