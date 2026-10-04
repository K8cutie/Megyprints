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
}

const COLUMNS = 'id, order_number, status, amount, created_at, payment_submitted_at, album_size, page_count, tracking';

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
