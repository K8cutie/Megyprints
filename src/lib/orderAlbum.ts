/* ══════════════════════════════════════════════════════════════════════════
   orderAlbum — WHICH album an order freezes.

   Checkout used to snapshot "the customer's most recently updated album". Since
   albums have names (PR #33) a customer keeps several, and putting one away
   ("Start a new album", opening another) saves it, which makes IT the latest.
   So "latest" could be a different album than the one on screen, and a paid
   order would carry the wrong pages.

   The order now names its album: the id the builder minted for the draft
   (useBuilderState albumIdRef), handed over with the print job, or, when a
   reload wiped that, read from the draft on this device. "Latest" is only the
   fallback for a device that knows no id at all.

   Order creation (orders.ts) and the print-job rebuild (printJobRebuild.ts)
   both read through selectOrderAlbum, so the order and its PDF are always
   built from the SAME row.
   ══════════════════════════════════════════════════════════════════════════ */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrderHandoff } from './printQueue';

/** The album being ordered isn't in the customer's account, or not as it left
 *  the builder. Checkout stops and sends them back to the album: opening it
 *  signed in and tapping Order saves it on the way. */
export class AlbumNotSavedError extends Error {
  constructor() {
    super("This album isn't saved to your account yet, so we can't order it. Open it in the builder and tap Order again. It saves on the way.");
    this.name = 'AlbumNotSavedError';
  }
}

/** The album to order: the one handed over with the print job, else the draft
 *  on this device. Undefined only when neither knows one. */
export function resolveOrderAlbumId(
  job: { albumId?: string } | null | undefined,
  draft: { albumId?: string } | null | undefined,
): string | undefined {
  return job?.albumId || draft?.albumId || undefined;
}

/** Stop an order for an album that left the builder unsaved: a guest who signed
 *  in at checkout. The account then holds no copy of it, or an older one. */
export function assertAlbumSavedForOrder(handoff: OrderHandoff | null, albumId: string | undefined): void {
  if (albumId && handoff?.albumId === albumId && !handoff.saved) throw new AlbumNotSavedError();
}

/**
 * Load the album row an order freezes.
 *  • albumId known → exactly that row. Missing → AlbumNotSavedError; it never
 *    falls back to another album.
 *  • no albumId   → the most recently updated album (drafts from before album
 *    ids), or null when the account has none.
 * Throws on a query error.
 */
export async function selectOrderAlbum<Row>(
  client: Pick<SupabaseClient, 'from'>,
  opts: { userId: string; albumId?: string; columns: string },
): Promise<Row | null> {
  let query = client.from('albums').select(opts.columns).eq('user_id', opts.userId);
  query = opts.albumId
    ? query.eq('id', opts.albumId)
    : query.order('updated_at', { ascending: false }).limit(1);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`Could not load your album: ${error.message}`);
  if (!data) {
    if (opts.albumId) throw new AlbumNotSavedError();
    return null;
  }
  return data as Row;
}
