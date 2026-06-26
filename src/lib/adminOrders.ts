/* ══════════════════════════════════════════════════════════════════════════
   Admin orders — operator-side reads/updates for the fulfillment console.
   Authorized by the admin-email RLS policies in migration 0005 (the operator
   sees every order; customers still see only their own).
   ══════════════════════════════════════════════════════════════════════════ */

import { supabase } from './supabase';

export const ORDER_STATUSES = [
  'pending_payment', 'paid', 'in_production', 'printed', 'shipped', 'delivered', 'cancelled',
] as const;
export type OrderStatus = typeof ORDER_STATUSES[number];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: 'Pending payment',
  paid: 'Paid',
  in_production: 'In production',
  printed: 'Printed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export interface AdminOrder {
  id: string;
  order_number: string;
  status: OrderStatus;
  payment_status: string;
  amount: number | null;
  currency: string;
  album_size: string | null;
  material: string | null;
  cover: string | null;
  page_count: number;
  ship_name: string | null;
  ship_phone: string | null;
  ship_address: string | null;
  tracking: string | null;
  created_at: string;
  updated_at: string;
}

const COLUMNS =
  'id, order_number, status, payment_status, amount, currency, album_size, material, cover, page_count, ship_name, ship_phone, ship_address, tracking, created_at, updated_at';

/** Every order, newest first (operator view). */
export async function fetchAllOrders(): Promise<AdminOrder[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(COLUMNS)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminOrder[];
}

export type OrderPatch = Partial<Pick<AdminOrder, 'status' | 'amount' | 'payment_status' | 'tracking'>>;

/** Update an order (operator only — enforced by RLS). Returns an error message
 *  on failure, or null on success. */
export async function updateOrder(id: string, patch: OrderPatch): Promise<string | null> {
  const { error } = await supabase.from('orders').update(patch).eq('id', id);
  return error ? error.message : null;
}
