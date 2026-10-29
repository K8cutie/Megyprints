/* ══════════════════════════════════════════════════════════════════════════
   accountDeletionRules — what deleting an account would touch, what blocks
   it, and the call that asks the server to do it. The pure half of
   accountDeletion.ts (see there for why there are two calls, preflight and
   delete, and why the delete goes through /api/delete-account).

   Shared with the 2.0 app (src/shared/sharedModules.ts): the app's Delete
   account screen reads the same preflight, names the same blocking orders
   and reads the server's answer the same way. Everything that reaches out
   is handed in: the Supabase client for the preflight, and the endpoint's
   address, the sign-in token and fetch for the delete. The website passes
   its own client and '/api/delete-account'; the app passes its own client
   and the website's endpoint by its full address (the app has no site of
   its own). Wiping what the device remembers stays with each side.
   ══════════════════════════════════════════════════════════════════════════ */

import type { SupabaseClient } from '@supabase/supabase-js';

/** What a deletion would touch. `blocking` is non-empty when the account has an
 *  order that is paid but not yet delivered, or an event booking whose deposit
 *  or balance is confirmed and not finished (0043, kind 'booking'): the cases
 *  we refuse. A booking's number rides in `order_number`. */
export interface DeletionPreflight {
  albums: number;
  memories: number;
  orders: number;
  /** Memory videos in the public bucket that go with the account (0035). */
  videos: number;
  /** Latest hosting end date still ahead among those videos, ISO; null if none. */
  videos_hosted_until: string | null;
  blocking: { order_number: string; status: string; kind?: 'order' | 'booking' }[];
}

/** The dialog's sentence for what blocks deletion, naming orders and event
 *  bookings for what they are. */
export function blockingSentence(blocking: DeletionPreflight['blocking']): { lead: string; numbers: string } {
  const orders = blocking.filter((b) => b.kind !== 'booking');
  const bookings = blocking.filter((b) => b.kind === 'booking');
  const lead = orders.length && bookings.length
    ? 'You have an order and an event booking that are paid and not finished yet'
    : bookings.length
      ? 'You have an event booking that’s paid and not finished yet'
      : 'You have an order that’s paid and not delivered yet';
  return { lead, numbers: blocking.map((b) => b.order_number).join(', ') };
}

export interface DeletionResult {
  deleted_albums: number;
  deleted_memories: number;
  anonymized_orders: number;
  deleted_videos: number;
}

/** The preflight RPC's answer, with every count there (0 when missing). */
export function readPreflight(data: unknown): DeletionPreflight {
  const raw = (data ?? {}) as Partial<DeletionPreflight>;
  return {
    albums: raw.albums ?? 0,
    memories: raw.memories ?? 0,
    orders: raw.orders ?? 0,
    videos: raw.videos ?? 0,
    videos_hosted_until: raw.videos_hosted_until ?? null,
    blocking: Array.isArray(raw.blocking) ? raw.blocking : [],
  };
}

/** The endpoint's answer to a deletion that went through. */
export function readDeletionResult(payload: unknown): DeletionResult {
  const raw = (payload ?? {}) as Partial<DeletionResult>;
  return {
    deleted_albums: raw.deleted_albums ?? 0,
    deleted_memories: raw.deleted_memories ?? 0,
    anonymized_orders: raw.anonymized_orders ?? 0,
    deleted_videos: raw.deleted_videos ?? 0,
  };
}

/** What deletion would touch, read before anything is deleted (0027). */
export async function preflightAccountDeletionWith(client: Pick<SupabaseClient, 'rpc'>): Promise<DeletionPreflight> {
  const { data, error } = await client.rpc('account_deletion_preflight');
  if (error) throw new Error(error.message);
  return readPreflight(data);
}

/** Said when the server's answer carries no message of its own. */
export const DELETION_FAILED = 'Deletion failed. Please try again.';

/** The part of fetch the delete needs (the browser's, React Native's, or a test's). */
export type DeletionFetch = (
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/**
 * Asks the endpoint (api/delete-account.mjs) to delete the account the token
 * belongs to. The body is never read there: who is deleted comes from the
 * token. Throws with a message meant to be shown verbatim (the server writes
 * them for a customer to read, e.g. naming the order that is still in
 * production).
 */
export async function requestAccountDeletion(endpoint: string, token: string, fetchFn: DeletionFetch): Promise<DeletionResult> {
  const res = await fetchFn(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: '{}',
  });

  const payload = (await res.json().catch(() => ({}))) as { error?: string } | null;
  if (!res.ok) {
    // The server's messages are written for a customer to read (they name the
    // order that is still in production), so show them as-is.
    throw new Error(payload?.error || DELETION_FAILED);
  }
  return readDeletionResult(payload);
}
