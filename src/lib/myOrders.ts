import { supabase } from './supabase';

/* The signed-in customer's own orders (Your orders, and the thank-you
   screen's tracker). RLS lets a customer read only their own — but an
   operator's session can read every order, so the list asks for the user's
   own by id, never "everything I can see". */

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
}

const COLUMNS = 'id, order_number, status, amount, created_at, payment_submitted_at, album_size, page_count, tracking, album_title:album_snapshot->>title, album_id';

/** Newest first. */
export async function listMyOrders(userId: string): Promise<MyOrder[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as MyOrder[];
}

/** This album's order that is still waiting for payment (the newest), or
   *  null. Ordering the same album again used to place a second unpaid order
   *  without a word (1-star testers round 2, Q1): checkout now says there is
   *  one and asks before a second. */
export async function openOrderForAlbum(userId: string, albumId: string): Promise<MyOrder | null> {
  const { data, error } = await supabase
    .from('orders')
    .select(COLUMNS)
    .eq('user_id', userId)
    .eq('album_id', albumId)
    .eq('status', 'pending_payment')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as MyOrder | null) ?? null;
}

/** The finish this album was last ordered with (not a cancelled order), or
 *  null. A second copy opened on Matte + Softcover — a different book from the
 *  one being copied (1-star testers round 2, RC-1). */
export interface LastFinish { order_number: string; material: string; cover: string; status?: string }
export async function lastOrderForAlbum(userId: string, albumId: string): Promise<LastFinish | null> {
  const { data, error } = await supabase
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

export async function getMyOrder(userId: string, orderId: string): Promise<MyOrder | null> {
  const { data, error } = await supabase
    .from('orders')
    .select(COLUMNS)
    .eq('user_id', userId)
    .eq('id', orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as MyOrder | null) ?? null;
}

/** Cancel one of my orders that's still waiting for payment (0042). Only
 *  before "I've sent ₱X": after that, money may be on its way and the shop
 *  decides. False when the order is no longer cancellable (paid, sent, or
 *  already closed). */
export async function cancelMyUnpaidOrder(orderId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('cancel_my_unpaid_order', { p_order_id: orderId });
  if (error) throw new Error(error.message);
  return data === true;
}
