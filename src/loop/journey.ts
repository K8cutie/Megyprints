// ──────────────────────────────────────────────────────────────────────────
// Journey runner — drives one persona through the build→order funnel and
// reports the furthest step it reaches plus the first roadblock it hits.
//
// It replicates the two UI-level guards that live in Order.tsx `handleSubmit`
// (shipping-field validation, and the "must be signed in" gate) and then calls
// the REAL `createOrderFromLatestAlbum` from src/lib/orders.ts, which runs
// against the in-memory Supabase double. So the order-creation logic — album
// lookup, RLS, order_number generation — is exercised for real.
// ──────────────────────────────────────────────────────────────────────────

import { createOrderFromLatestAlbum } from '../lib/orders';
import type { Persona } from './personas';
import { resetWorld, setAuthUid, seedAlbum, getOrders } from './mockSupabase';

export type Step = 'SETUP' | 'DESIGN' | 'PREVIEW' | 'ORDER_FORM' | 'FULFILLMENT';

export type Roadblock =
  | 'VALIDATION' // blank shipping fields
  | 'AUTH_REQUIRED' // not signed in at checkout
  | 'NO_ALBUM' // no cloud album to snapshot
  | 'RLS_REJECTED' // DB rejected the insert
  | 'ORDER_ERROR'; // any other failure

export interface JourneyResult {
  persona: Persona;
  reached: Step;
  roadblock: Roadblock | null;
  detail: string;
  orderNumber: string | null;
  /** The album the persona intended to order vs. the one actually snapshotted. */
  viewedAlbumId: string | null;
  orderedAlbumId: string | null;
}

export async function runJourney(persona: Persona): Promise<JourneyResult> {
  resetWorld();
  const userId = `user_${persona.id}`;

  const result: JourneyResult = {
    persona,
    reached: 'SETUP',
    roadblock: null,
    detail: '',
    orderNumber: null,
    viewedAlbumId: null,
    orderedAlbumId: null,
  };

  // ── SETUP → DESIGN: pick a size, then build album(s) ──
  result.reached = 'DESIGN';
  // The local (browser) snapshot the builder now stashes for checkout. It exists
  // whenever the persona builds, regardless of whether they were signed in.
  let localSnapshot: Record<string, unknown> | null = null;
  if (persona.buildsAlbum) {
    for (let i = 0; i < persona.albumsBuilt; i++) {
      // Cloud-sync only happens when the user is authenticated during the build.
      // A signed-out builder's album lives only in the browser (IndexedDB) and
      // never reaches the `albums` table — but the stashed snapshot now carries it.
      if (persona.signedInDuringBuild) {
        const row = seedAlbum({ user_id: userId, title: `${persona.name}'s Album ${i + 1}` });
        // The persona "intends" to order the FIRST album they built (the one
        // they fell in love with); later builds make a different row "latest".
        if (result.viewedAlbumId === null) result.viewedAlbumId = row.id;
      }
    }
    localSnapshot = { title: `${persona.name}'s Album`, pages: [{}, {}, {}, {}] };
  }

  // ── PREVIEW → ORDER_FORM: they navigate to /order ──
  result.reached = 'PREVIEW';
  result.reached = 'ORDER_FORM';

  // ── handleSubmit() guards, in the same order Order.tsx checks them ──
  if (!persona.fillsShipping) {
    result.roadblock = 'VALIDATION';
    result.detail = 'Required shipping fields (name/phone/address) were blank.';
    return result;
  }

  if (!persona.signedInAtCheckout) {
    result.roadblock = 'AUTH_REQUIRED';
    result.detail = 'Not signed in — Order.tsx blocks submit with a "please sign in" message.';
    return result;
  }

  // Authenticated at checkout → the DB will see this uid.
  setAuthUid(userId);

  try {
    const order = await createOrderFromLatestAlbum({
      userId,
      specs: { material: 'matte', cover: 'softcover', size: '8x8' },
      shipping: { name: persona.name, phone: '0917-000-0000', address: '123 Test St' },
      amount: 500,
      albumId: result.viewedAlbumId ?? undefined, // order the album they viewed
      albumSnapshot: localSnapshot, // fallback for a never-synced (signed-out) build
    });
    result.reached = 'FULFILLMENT';
    result.orderNumber = order.order_number;
    const inserted = getOrders().find((o) => o.order_number === order.order_number);
    result.orderedAlbumId = (inserted?.album_id as string) ?? null;
    result.detail = `Order ${order.order_number} created (status: ${order.status}).`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.detail = msg;
    if (/no saved album/i.test(msg)) result.roadblock = 'NO_ALBUM';
    else if (/row-level security/i.test(msg)) result.roadblock = 'RLS_REJECTED';
    else result.roadblock = 'ORDER_ERROR';
  }

  return result;
}
