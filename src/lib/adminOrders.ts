/* ══════════════════════════════════════════════════════════════════════════
   Admin orders — operator-side reads/updates for the fulfillment console.
   Authorized by the admin-email RLS policies in migration 0005 (the operator
   sees every order; customers still see only their own).
   ══════════════════════════════════════════════════════════════════════════ */

import { supabase } from './supabase';
import { peso } from './eventBookings';
import { packageLabel } from './pricing';

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
  /** Memory-hosting term the customer bought (0030); null on older orders. */
  hosting_years?: number | null;
  /** HD (1080p) memory upgrade bought (0032). */
  hd_memories?: boolean | null;
  ship_name: string | null;
  ship_phone: string | null;
  ship_address: string | null;
  tracking: string | null;
  /** Manual transfer (0033): what the customer attached after paying. */
  payment_reference?: string | null;
  payment_proof_path?: string | null;
  payment_submitted_at?: string | null;
  created_at: string;
  updated_at: string;
  /** A guest's copy of an event album prints from this order's files (0045). */
  copy_of_order_id?: string | null;
  copy_of_order_number?: string | null;
  /** The event booking that paid for this album (0045). */
  event_booking_number?: string | null;
  /** What the customer was asked to pay, worked out by the database as the
   *  order was placed (0055); owner only. Null on orders placed before it. */
  quoted_amount?: number | null;
  quote?: OrderQuote | null;
}

/** The checkout's total in its parts, as order_quote() (0055) saves it. */
export interface OrderQuote {
  total: number;
  /** The album with the included pages. */
  album: number;
  extra_pages: number;
  extra_pages_fee: number;
  qr: number;
  extra_qr: number;
  qr_fee: number;
  /** The video packages charged for (0056), largest first; absent before. */
  packages?: number[];
  /** The memory term the order was placed with; null when it has no QR memories. */
  years: number | null;
  term_fee: number;
  hd_fee: number;
}

/** "album ₱890 + 2 extra QR ₱40 + 10 years ₱99 + HD ₱49": the parts the
 *  total is made of, the free ones left out. */
export function quoteParts(q: OrderQuote): string {
  const parts = [`album ${peso(q.album)}`];
  if (q.extra_pages_fee > 0) parts.push(`${q.extra_pages} extra ${q.extra_pages === 1 ? 'page' : 'pages'} ${peso(q.extra_pages_fee)}`);
  if (q.qr_fee > 0) parts.push(q.packages?.length ? `${packageLabel(q.packages)} ${peso(q.qr_fee)}` : `${q.extra_qr} extra QR ${peso(q.qr_fee)}`);
  if (q.term_fee > 0) parts.push(`${q.years} years ${peso(q.term_fee)}`);
  if (q.hd_fee > 0) parts.push(`HD ${peso(q.hd_fee)}`);
  return parts.join(' + ');
}

/** The order whose print files this order prints from: its own, or for a
 *  guest's copy of an event album, the hosts' order (0045). */
export const printFilesOf = (o: Pick<AdminOrder, 'id' | 'copy_of_order_id'>) => o.copy_of_order_id ?? o.id;

/** Default page size for the console. Measured on a 10,000-order database:
 *  returning every order cost 2,018 kB and a full scan + 3.9 MB sort PER LOAD,
 *  per operator. A page costs 20 kB off an index. */
export const ORDERS_PAGE_SIZE = 100;

/** One PAGE of the orders the caller may see, newest first. Goes through the
 *  role-aware operator_orders() function — owners get the peso amount,
 *  fulfillment gets it NULLed. Fulfillment has no direct orders access; this is
 *  their only read. The function clamps the limit server-side, so a caller
 *  cannot ask for the whole table back. */
export async function fetchAllOrders(
  limit: number = ORDERS_PAGE_SIZE,
  offset = 0,
): Promise<AdminOrder[]> {
  const { data, error } = await supabase.rpc('operator_orders', { p_limit: limit, p_offset: offset });
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminOrder[];
}

/** How many orders exist in total, so the console can say what it is NOT
 *  showing. A paginated list that hides the total is its own bug. */
export async function fetchOrdersCount(): Promise<number> {
  const { data, error } = await supabase.rpc('operator_orders_count');
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

/** Advance status (owner OR fulfillment) via the status-only DB function — the
 *  safe write path that cannot touch financials. */
export async function setOrderStatus(id: string, status: OrderStatus): Promise<string | null> {
  const { error } = await supabase.rpc('set_order_status', { p_id: id, p_status: status });
  return error ? error.message : null;
}

export type OrderPatch = Partial<Pick<AdminOrder, 'status' | 'amount' | 'payment_status' | 'tracking'>>;

/** Update an order (operator only — enforced by RLS). Returns an error message
 *  on failure, or null on success. */
export async function updateOrder(id: string, patch: OrderPatch): Promise<string | null> {
  const { error } = await supabase.from('orders').update(patch).eq('id', id);
  if (error) return error.message;
  // Paid → the customer's chosen memory-hosting term takes effect (0030). The
  // client could only stamp the included term; this extends each clip on the
  // order's album to hosting_years. Owner-gated in SQL; best-effort here so a
  // hiccup never un-marks a paid order (the panel shows the failure).
  if (patch.payment_status === 'paid') {
    const { error: termErr } = await supabase.rpc('apply_order_hosting_term', { p_order_id: id });
    if (termErr) {
      console.error('apply_order_hosting_term failed:', termErr.message);
      return `Marked paid, but the memory hosting term could not be applied (${termErr.message}). Re-run Mark paid or apply it in SQL.`;
    }
  }
  return null;
}

/** "Mark paid" (owner): the payment and the order both become paid, then the
 *  memory years the customer bought take effect (updateOrder). The status
 *  dropdown's "Paid" calls this too, so the two can never differ: through
 *  set_order_status alone the order was paid but kept the included term. */
export const markOrderPaid = (id: string): Promise<string | null> => updateOrder(id, { payment_status: 'paid', status: 'paid' });
