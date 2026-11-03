/* ══════════════════════════════════════════════════════════════════════════
   WHAT YOUR ORDERS SAYS: the website's words (src/pages/MyOrders.tsx) for
   each order, and where it is from its REAL status (the shared
   orderTracker: the same headline and steps as the website's tracker).

   test/orderWords.test.ts holds every sentence here against the website's
   source, and the dates against the website's own date line in Manila time.
   ══════════════════════════════════════════════════════════════════════════ */
import { cleanAlbumName, isDefaultAlbumName } from '@web/lib/albumName';
import { trackOf, type OrderTrack } from '@web/lib/orderTracker';
import { ALBUM_SIZES } from '@web/pages/builder/types';
import { payByLine, placedOn } from '../checkout/openOrder';
import { peso } from '../checkout/price';
import type { AppOrder } from './myOrders';

/** Under the title of Your orders. */
export const ORDERS_LEAD = 'Where each album is now. We text you at each big step too.';
/** A list that couldn't be read: the website's words, then the reason. */
export const ORDERS_LOAD_FAILED = "We couldn't load your orders";
export const NO_ORDERS = 'No orders yet.';

/** A cancelled order (the website's line; "message us" is a button here). */
export const CANCELLED_NOTE = "This order was cancelled. Your album is still saved, so you can order it again. If that's a surprise, message us.";
/** A cancel the shop's database refused: paid, sent, or already closed. */
export const CANCEL_GONE = 'This order can no longer be cancelled here. If you already sent the money, message us.';
export const CANCEL_FAILED = 'Could not cancel the order. Please try again.';
export const CANCEL_ASK = 'Cancel this order';
export const KEEP_IT = 'Keep it';
export const cancelYes = (orderNumber: string): string => `Yes, cancel order ${orderNumber}`;

/** A tester-code order: nothing is charged, printed or sent. */
export const testOrderNote = (code: string): string => `You used the tester code ${code}, so nothing is charged. Thank you for testing Megy Prints!`;

/** The box on an order waiting for payment (the website's "Send ₱X by bank transfer to finish"). */
export function payHeadline(total: number | null): string {
  return total !== null ? `Send ${peso(total)} by bank transfer to finish` : 'Pay by bank transfer to finish';
}
/** The button that opens the payment step (the QR, the steps, the receipt). */
export function payButton(total: number | null): string {
  return total !== null ? `Pay ${peso(total)} by bank transfer` : 'Pay by bank transfer';
}

export const trackingLine = (tracking: string): string => `Courier tracking number: ${tracking}`;

/** The album's size as the website's Orders page names it ('8×8" Square'). */
export function orderSizeName(albumSize: string | null | undefined): string {
  return ALBUM_SIZES.find((s) => s.preset === albumSize)?.name ?? albumSize ?? '';
}

/** The album's own name, or '' when it never got one ("My Album"). */
export function orderAlbumName(title: string | null | undefined): string {
  return isDefaultAlbumName(title) ? '' : cleanAlbumName(title);
}

/** "October 26, 2026" in Manila time, as the website's Orders page says it
 *  on a phone in the Philippines (toLocaleDateString('en-PH', { day,
 *  month: 'long', year })). Written out (see placedOn), so the phone says
 *  the same whatever date data its JavaScript has. */
export function placedOnFull(iso: string): string {
  const day = placedOn(iso);
  if (!day) return '';
  return `${day}, ${new Date(new Date(iso).getTime() + 8 * 3_600_000).getUTCFullYear()}`;
}

/** "Placed October 26, 2026 · 8×8" Square · 40 pages". */
export function placedLine(o: Pick<AppOrder, 'created_at' | 'album_size' | 'page_count'>): string {
  const size = orderSizeName(o.album_size);
  return `Placed ${placedOnFull(o.created_at)}${size ? ` · ${size}` : ''}${o.page_count ? ` · ${o.page_count} pages` : ''}`;
}

const money = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** The price shown on the order: the shop's confirmed amount, as the website
 *  shows it; while that is not set yet (every order waiting for payment),
 *  the total the customer was asked to pay (0055), the same number the
 *  payment step asks for. A cancelled order shows only a confirmed amount.
 *  The website's Orders page shows only `amount`, so it shows no price on an
 *  order waiting for payment (a website gap, after Nov 9). */
export function orderPrice(o: Pick<AppOrder, 'amount' | 'quoted_amount' | 'status'>): number | null {
  const confirmed = money(o.amount);
  if (confirmed !== null) return confirmed;
  if (o.status === 'cancelled') return null;
  return money(o.quoted_amount);
}

/** Everything one order says, from its real status. */
export interface OrderView {
  track: OrderTrack;
  albumName: string;
  numberLine: string;
  placed: string;
  price: string;
  /** The last day to pay, while it waits for payment. */
  payBy: string | null;
}

export function orderView(o: AppOrder): OrderView {
  const track = trackOf(o);
  const price = orderPrice(o);
  return {
    track,
    albumName: orderAlbumName(o.album_title),
    numberLine: `Order ${o.order_number}`,
    placed: placedLine(o),
    price: price !== null ? peso(price) : '',
    payBy: track.awaitingPayment ? payByLine(o.created_at) : null,
  };
}
