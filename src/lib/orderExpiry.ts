/* ── Unpaid orders close by themselves (0042) ───────────────────────────────
   An order still unpaid after UNPAID_ORDER_DAYS, where the customer never
   tapped "I've sent ₱X", is cancelled by the nightly job (api/expire-orders),
   and 3 days later its print files and memory videos are removed from the
   cloud (the night after, for one the customer cancelled themselves).
   Nothing on the customer's phone is touched, so the same album can be
   ordered again. An account may hold at most UNPAID_ORDER_LIMIT unpaid orders.

   The database owns these numbers (public.unpaid_order_days() and
   public.unpaid_order_limit()). These copies are only for the words on screen;
   orderExpiry.spec reads the migration and fails if they drift. */

export const UNPAID_ORDER_DAYS = 7;
export const UNPAID_ORDER_LIMIT = 3;

/** The SQLSTATE the orders insert trigger raises for the 4th unpaid order. */
export const UNPAID_LIMIT_SQLSTATE = 'MP001';

/** The 4th unpaid order on one account. The checkout shows an "Open my orders"
 *  button with this one. */
export class UnpaidLimitError extends Error {
  constructor() {
    super(`You already have ${UNPAID_ORDER_LIMIT} orders waiting for payment. Pay for one of them first, or cancel one in Your orders. An unpaid order closes by itself after ${UNPAID_ORDER_DAYS} days.`);
    this.name = 'UnpaidLimitError';
  }
}

export function isUnpaidLimitError(error: { code?: string | null } | null | undefined): boolean {
  return !!error && error.code === UNPAID_LIMIT_SQLSTATE;
}

/** The last day to pay an order placed at `createdAt` (ISO), as Your orders
 *  says it, or '' when the date can't be read. */
export function payByDate(createdAt: string): string {
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return '';
  return new Date(t + UNPAID_ORDER_DAYS * 86_400_000)
    .toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** The line under the payment QR. */
export const PAY_WITHIN_MESSAGE =
  `Please pay within ${UNPAID_ORDER_DAYS} days. After that this order closes by itself. Your album stays saved, and you can order it again.`;
