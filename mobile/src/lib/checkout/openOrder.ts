/* ══════════════════════════════════════════════════════════════════════════
   "THIS ALBUM ALREADY HAS AN ORDER": the album's order still waiting for
   payment, said at the top of checkout, and a second order asked, never
   placed silently (1-star testers round 2, Q1).

   Read only: the same query as the website's openOrderForAlbum
   (src/lib/myOrders.ts), this account's orders only, by id, plus the
   order's quoted_amount (the total its customer was asked to pay, for its
   payment step). The words are the website's (src/pages/Order.tsx).
   ══════════════════════════════════════════════════════════════════════════ */
import type { SupabaseClient } from '@supabase/supabase-js';
import { UNPAID_ORDER_DAYS } from '@web/lib/orderExpiry';

export interface OpenOrder {
  id: string;
  order_number: string;
  status: string;
  /** Set by the shop when it confirms the payment. NULL on every order still
   *  waiting for payment: the insert policy pins it NULL (0002/0003). */
  amount?: number | null;
  /** The total the customer was asked to pay, worked out by the database as
   *  the order was placed (0055). NULL on orders placed before 0055. */
  quoted_amount?: number | null;
  created_at: string;
  payment_submitted_at: string | null;
  tester_code?: string | null;
}

export const OPEN_ORDER_COLUMNS = 'id, order_number, status, amount, quoted_amount, created_at, payment_submitted_at, album_size, page_count, tracking, album_title:album_snapshot->>title, album_id, tester_code';

export async function openOrderForAlbum(client: Pick<SupabaseClient, 'from'>, userId: string, albumId: string): Promise<OpenOrder | null> {
  const { data, error } = await client
    .from('orders')
    .select(OPEN_ORDER_COLUMNS)
    .eq('user_id', userId)
    .eq('album_id', albumId)
    .eq('status', 'pending_payment')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as OpenOrder | null) ?? null;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "October 26", in Manila time, as the website's toLocaleDateString('en-PH',
 *  { day: 'numeric', month: 'long' }) says it on a phone in the Philippines
 *  (the English of the Philippines puts the month first). Written out here
 *  so the phone says the same whatever date data its JavaScript has. */
export function placedOn(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const d = new Date(t + 8 * 3_600_000);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** The last day to pay an order placed at `iso`: "November 1, 2026", in
 *  Manila time, as the website's Orders page says it on a phone in the
 *  Philippines (shared payByDate: the order's own date + UNPAID_ORDER_DAYS,
 *  toLocaleDateString('en-PH', { day, month: 'long', year })). Written out
 *  like placedOn, so the phone says the same whatever date data its
 *  JavaScript has. '' when the date can't be read. */
export function payByOn(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const d = new Date(t + UNPAID_ORDER_DAYS * 86_400_000 + 8 * 3_600_000);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** The line under the QR on an order already placed: the website's Orders
 *  page words (src/pages/MyOrders.tsx), with that order's own last day. */
export function payByLine(iso: string): string {
  const day = payByOn(iso);
  return `${day ? `Please pay by ${day}.` : `Please pay within ${UNPAID_ORDER_DAYS} days.`} After that this order closes by itself, and your album stays saved.`;
}

/** The box at the top of checkout. */
export function openOrderWords(o: OpenOrder): { headline: string; body: string; button: string } {
  return {
    headline: `This album already has an order ${o.payment_submitted_at ? "— you sent the payment and we're confirming it" : 'waiting for payment'}: ${o.order_number}, placed ${placedOn(o.created_at)}.`,
    body: `${o.payment_submitted_at ? "You don't need a new one." : "To finish it, pay that order. You don't need a new one."} Changed the album since? Place a new order below and we'll print the new one.`,
    button: `Open order ${o.order_number}`,
  };
}

/** What to ask this order's customer to send: the total the database saved
 *  as the order was placed (quoted_amount, 0055), else the shop's amount.
 *  null when neither is a peso amount above 0 (an order placed before 0055:
 *  prices may have changed since, so no total is made up for it). */
export function askedToPay(o: Pick<OpenOrder, 'amount' | 'quoted_amount'>): number | null {
  for (const v of [o.quoted_amount, o.amount]) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  }
  return null;
}

/** Where "Open order MP-…" goes, in the app. The website's button opens its
 *  Orders page (/orders?order=<id>); the app has no Orders screen until
 *  Phase 6, and the phone's browser is not signed in (the website sends a
 *  signed-out visitor from /orders to its home page, so the order would be
 *  lost). So the app opens that order itself: its payment step while nobody
 *  has paid it (the QR, its number, its last day, and its total when the
 *  order has one), else where it is (payment sent, or a tester-code order). */
export function openOrderView(o: OpenOrder): 'pay' | 'status' {
  const waiting = o.status === 'pending_payment' && !o.payment_submitted_at && !o.tester_code;
  return waiting ? 'pay' : 'status';
}

/** The question under Place order before a second order. */
export function secondOrderQuestion(o: OpenOrder): string {
  return `This album already has order ${o.order_number} ${o.payment_submitted_at ? 'with its payment sent' : 'waiting for payment'}. Place a second order for it?`;
}
