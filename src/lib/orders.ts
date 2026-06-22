// ──────────────────────────────────────────────────────────────────────────
// Orders — customer-side order creation.
//
// When a logged-in user places an order, we take a FROZEN snapshot of their
// latest saved album and insert it into the `orders` table. The insert runs
// under the customer's session, so RLS ("auth.uid() = user_id") authorizes it.
// The operator/fulfillment side reads these later via the backend (service_role).
// ──────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase';

export interface ShippingDetails {
  name: string;
  phone: string;
  address: string;
}

export interface OrderSpecs {
  material: string;
  cover: string;
  size: string;
}

export interface CreatedOrder {
  id: string;
  order_number: string;
  status: string;
}

const ALBUM_COLS = 'id, title, album_type, album_size, selected_template, photos_per_page, pages, photos, cover_photo';

/**
 * Create an order for the given user by snapshotting an album.
 *
 * Which album gets ordered, in priority order:
 *   1. `albumId` — the specific album the customer was viewing in the builder.
 *      Prevents the "ordered the wrong (latest-updated) album" bug when a user
 *      has built more than one album in a session.
 *   2. Otherwise, their most-recently-updated cloud album (legacy behavior).
 *   3. `albumSnapshot` — a local (not-yet-synced) album passed straight from the
 *      builder. Lets a customer who built BEFORE signing in still place an order
 *      (the order carries the frozen snapshot; album_id is left null, which the
 *      schema allows). Without this, "build first, log in at checkout" → lost.
 *
 * Throws a friendly Error only when there is genuinely nothing to order.
 */
export async function createOrderFromLatestAlbum(opts: {
  userId: string;
  specs: OrderSpecs;
  shipping: ShippingDetails;
  amount: number;
  albumId?: string;
  albumSnapshot?: Record<string, unknown> | null;
}): Promise<CreatedOrder> {
  // 1. Resolve which album to freeze into the order.
  let album: Record<string, unknown> | null = null;

  if (opts.albumId) {
    // Order the exact album the customer was viewing. The user_id filter keeps
    // RLS honest — you can only order an album you own.
    const { data, error: albErr } = await supabase
      .from('albums')
      .select(ALBUM_COLS)
      .eq('id', opts.albumId)
      .eq('user_id', opts.userId)
      .single();
    if (albErr) throw new Error(`Could not load your album: ${albErr.message}`);
    album = (data as Record<string, unknown> | null) ?? null;
  } else {
    const { data: albums, error: albErr } = await supabase
      .from('albums')
      .select(ALBUM_COLS)
      .eq('user_id', opts.userId)
      .order('updated_at', { ascending: false })
      .limit(1);
    if (albErr) throw new Error(`Could not load your album: ${albErr.message}`);
    album = ((albums as Record<string, unknown>[] | null)?.[0]) ?? null;
  }

  // 2. Fall back to a local snapshot for an album that never reached the cloud.
  let albumIdForInsert: string | null = (album?.id as string) ?? null;
  if (!album && opts.albumSnapshot) {
    album = opts.albumSnapshot;
    albumIdForInsert = null; // no real albums row to back-link to
  }

  if (!album) {
    throw new Error('No saved album found to order. Build and save an album first, then place your order.');
  }

  const pageCount = Array.isArray(album.pages) ? (album.pages as unknown[]).length : 0;

  // 2. Insert the order as an UNPAID quote. order_number + status come from DB
  //    defaults. We deliberately do NOT send `amount` or `status` here: price is
  //    set server-side by the operator (service_role) at the "mark as paid" step,
  //    and the RLS insert policy now rejects any client-supplied price/status —
  //    so a customer can't place a $1 or pre-"paid" order. (opts.amount is kept
  //    for the UI's running total only; it is never trusted as the real price.)
  const { data, error } = await supabase
    .from('orders')
    .insert({
      user_id: opts.userId,
      album_id: albumIdForInsert,
      album_snapshot: album, // frozen copy
      album_size: opts.specs.size,
      material: opts.specs.material,
      cover: opts.specs.cover,
      page_count: pageCount,
      ship_name: opts.shipping.name,
      ship_phone: opts.shipping.phone,
      ship_address: opts.shipping.address,
      status_history: [{ status: 'pending_payment', at: new Date().toISOString() }],
    })
    .select('id, order_number, status')
    .single();

  if (error) throw new Error(`Could not place your order: ${error.message}`);
  return data as CreatedOrder;
}
