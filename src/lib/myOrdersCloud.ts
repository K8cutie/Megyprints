/* ══════════════════════════════════════════════════════════════════════════
   myOrdersCloud — the signed-in customer's own orders (Supabase table
   "orders"), read and changed through a Supabase client the caller hands in.

   Shared with the 2.0 app (src/shared/sharedModules.ts), so the app's Your
   orders, order screen and Profile read an order exactly the way the website
   does. The website's myOrders.ts hands in its own client (lib/supabase) and
   offers the same functions without it, exactly as before; the app hands in
   its own client (its sign-in kept on the phone). Moved here unchanged from
   myOrders.ts apart from that client parameter, and the columns, which the
   app may widen (it also reads quoted_amount, the total the customer was
   asked to pay, for the payment step).

   RLS lets a customer read only their own orders, but an operator's session
   can read every order, so every read asks for the user's own by id, never
   "everything I can see".
   ══════════════════════════════════════════════════════════════════════════ */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface MyOrder {
  id: string;
  order_number: string;
  status: string;
  amount: number | null;
  created_at: string;
  payment_submitted_at: string | null;
  album_size: string | null;
  page_count: number | null;
  /** The courier's tracking number, once shipped. */
  tracking: string | null;
  /** The ordered album's name, from the order's frozen copy of it. Two orders
   *  of a 9×9, 41 pages said nothing about which album each was (round 2). */
  album_title?: string | null;
  /** The album this order printed — "Order this album again" opens it. */
  album_id?: string | null;
  /** Placed with a tester code (0057): a test order, never printed or sent. */
  tester_code?: string | null;
}

/** The columns Your orders reads (the website's list). */
export const MY_ORDER_COLUMNS = 'id, order_number, status, amount, created_at, payment_submitted_at, album_size, page_count, tracking, album_title:album_snapshot->>title, album_id, tester_code';

/** What a reader needs of a Supabase client. */
export type OrdersReader = Pick<SupabaseClient, 'from'>;
/** What cancelling needs of a Supabase client. */
export type OrdersCaller = Pick<SupabaseClient, 'rpc'>;

/** Newest first. */
export async function listMyOrdersWith(client: OrdersReader, userId: string, columns: string = MY_ORDER_COLUMNS): Promise<MyOrder[]> {
  const { data, error } = await client
    .from('orders')
    .select(columns)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as MyOrder[];
}

/** This album's order that is still waiting for payment (the newest), or
 *  null. Ordering the same album again used to place a second unpaid order
 *  without a word (1-star testers round 2, Q1): checkout now says there is
 *  one and asks before a second. */
export async function openOrderForAlbumWith(client: OrdersReader, userId: string, albumId: string, columns: string = MY_ORDER_COLUMNS): Promise<MyOrder | null> {
  const { data, error } = await client
    .from('orders')
    .select(columns)
    .eq('user_id', userId)
    .eq('album_id', albumId)
    .eq('status', 'pending_payment')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as MyOrder | null) ?? null;
}

/** The finish this album was last ordered with (not a cancelled order), or
 *  null. A second copy opened on Matte + Softcover — a different book from the
 *  one being copied (1-star testers round 2, RC-1). */
export interface LastFinish { order_number: string; material: string; cover: string; status?: string }
export async function lastOrderForAlbumWith(client: OrdersReader, userId: string, albumId: string): Promise<LastFinish | null> {
  const { data, error } = await client
    .from('orders')
    .select('order_number, material, cover, status')
    .eq('user_id', userId)
    .eq('album_id', albumId)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const d = data as LastFinish & { status: string };
  return { order_number: d.order_number, material: d.material, cover: d.cover, status: d.status };
}

export async function getMyOrderWith(client: OrdersReader, userId: string, orderId: string, columns: string = MY_ORDER_COLUMNS): Promise<MyOrder | null> {
  const { data, error } = await client
    .from('orders')
    .select(columns)
    .eq('user_id', userId)
    .eq('id', orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as MyOrder | null) ?? null;
}

/** Cancel one of my orders that's still waiting for payment (0042). Only
 *  before "I've sent ₱X": after that, money may be on its way and the shop
 *  decides. False when the order is no longer cancellable (paid, sent, or
 *  already closed). */
export async function cancelMyUnpaidOrderWith(client: OrdersCaller, orderId: string): Promise<boolean> {
  const { data, error } = await client.rpc('cancel_my_unpaid_order', { p_order_id: orderId });
  if (error) throw new Error(error.message);
  return data === true;
}

/** The delivery details the customer typed on their newest order: what the
 *  app's Profile shows as their phone and address. The order row holds them
 *  as checkout tidied them (ship_phone as +639…, the address as one line). */
export interface LastShipping {
  order_number: string;
  created_at: string;
  ship_name: string | null;
  ship_phone: string | null;
  ship_address: string | null;
}

/** The newest of my orders that has delivery details, or null. */
export async function lastShippingWith(client: OrdersReader, userId: string): Promise<LastShipping | null> {
  const { data, error } = await client
    .from('orders')
    .select('order_number, created_at, ship_name, ship_phone, ship_address')
    .eq('user_id', userId)
    .not('ship_phone', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as LastShipping | null) ?? null;
}
