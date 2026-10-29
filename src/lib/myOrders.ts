import { supabase } from './supabase';
import {
  cancelMyUnpaidOrderWith,
  getMyOrderWith,
  lastOrderForAlbumWith,
  listMyOrdersWith,
  openOrderForAlbumWith,
  type LastFinish,
  type MyOrder,
} from './myOrdersCloud';

/* The signed-in customer's own orders (Your orders, and the thank-you
   screen's tracker). RLS lets a customer read only their own — but an
   operator's session can read every order, so the list asks for the user's
   own by id, never "everything I can see".

   The reads and the cancel live in myOrdersCloud.ts (shared with the 2.0
   app, which hands in its own Supabase client); these are the same
   functions with the website's client. */

export type { MyOrder, LastFinish };

/** Newest first. */
export async function listMyOrders(userId: string): Promise<MyOrder[]> {
  return listMyOrdersWith(supabase, userId);
}

/** This album's order that is still waiting for payment (the newest), or
   *  null. Ordering the same album again used to place a second unpaid order
   *  without a word (1-star testers round 2, Q1): checkout now says there is
   *  one and asks before a second. */
export async function openOrderForAlbum(userId: string, albumId: string): Promise<MyOrder | null> {
  return openOrderForAlbumWith(supabase, userId, albumId);
}

/** The finish this album was last ordered with (not a cancelled order), or
 *  null. A second copy opened on Matte + Softcover — a different book from the
 *  one being copied (1-star testers round 2, RC-1). */
export async function lastOrderForAlbum(userId: string, albumId: string): Promise<LastFinish | null> {
  return lastOrderForAlbumWith(supabase, userId, albumId);
}

export async function getMyOrder(userId: string, orderId: string): Promise<MyOrder | null> {
  return getMyOrderWith(supabase, userId, orderId);
}

/** Cancel one of my orders that's still waiting for payment (0042). Only
 *  before "I've sent ₱X": after that, money may be on its way and the shop
 *  decides. False when the order is no longer cancellable (paid, sent, or
 *  already closed). */
export async function cancelMyUnpaidOrder(orderId: string): Promise<boolean> {
  return cancelMyUnpaidOrderWith(supabase, orderId);
}
