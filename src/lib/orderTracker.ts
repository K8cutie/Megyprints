/* ══════════════════════════════════════════════════════════════════════════
   orderTracker — where a customer's order is, in their words, from the
   order's REAL status. The one source for the thank-you screen and Your
   orders. The thank-you tracker was a fixed picture (it sat at "Payment sent"
   whatever the shop did), and once its tab was gone the order could not be
   found again (1-star testers, 2026-10-04, the Quitter).
   ══════════════════════════════════════════════════════════════════════════ */

/** The journey, one line per step, in order. */
export const TRACK_STAGES = [
  "Payment sent — we're confirming it",
  'Payment confirmed',
  'Printing your album',
  'Printed and checked',
  'On its way to you',
  'Delivered',
] as const;

/** The first step while the customer hasn't said they've paid. */
export const AWAITING_PAYMENT_STAGE = 'Waiting for your payment';

const RANK: Record<string, number> = { pending_payment: 0, paid: 1, in_production: 2, printed: 3, shipped: 4, delivered: 5 };
const HEADLINES = [
  "Payment sent — we're confirming it",
  'Payment confirmed — printing soon',
  'Printing your album',
  'Printed — packing it for you',
  'On its way to you',
  'Delivered',
];

export interface OrderTrack {
  /** Index into TRACK_STAGES: where the order is now. */
  stage: number;
  /** Delivered: the journey is done. */
  finished: boolean;
  cancelled: boolean;
  /** Placed, and the customer hasn't said they've paid yet. */
  awaitingPayment: boolean;
  /** What is happening now, in one line. */
  headline: string;
  /** The step labels to draw (the first reads "Waiting for your payment" until they pay). */
  labels: string[];
}

export function trackOf(order: { status: string; payment_submitted_at?: string | null }): OrderTrack {
  const labels: string[] = [...TRACK_STAGES];
  if (order.status === 'cancelled') {
    return { stage: 0, finished: false, cancelled: true, awaitingPayment: false, headline: 'Cancelled', labels };
  }
  const stage = RANK[order.status] ?? 0;
  const awaitingPayment = stage === 0 && !order.payment_submitted_at;
  if (awaitingPayment) labels[0] = AWAITING_PAYMENT_STAGE;
  return {
    stage,
    finished: stage === TRACK_STAGES.length - 1,
    cancelled: false,
    awaitingPayment,
    headline: awaitingPayment ? AWAITING_PAYMENT_STAGE : HEADLINES[stage],
    labels,
  };
}
