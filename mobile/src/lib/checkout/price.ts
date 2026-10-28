/* ══════════════════════════════════════════════════════════════════════════
   THE PRICE AT CHECKOUT, worked out exactly as the website's Order page does
   (src/pages/Order.tsx, "Cheap arithmetic"): the SHARED pricing code
   (src/lib/pricing.ts: priceBreakdown, compareAtPriceOf, …) on the live
   price schedule (public_price_schedule(), read-only, see priceSchedule.ts).

   No schedule, no price: checkout shows "Loading price…" or "Prices didn't
   load — tap to try again" and never a guessed number (the website's rule:
   a wrong price on a money path is worse than a blocked one).
   ══════════════════════════════════════════════════════════════════════════ */
import {
  compareAtPriceOf,
  freeShippingValueOf,
  hdMemoriesPriceOf,
  hostingTiersOf,
  includedHostingYears,
  priceBreakdown,
  priceOf,
  type Binding,
  type HostingTier,
  type PriceBreakdown,
  type PriceSchedule,
} from '@web/lib/pricing';
import type { AlbumSizePreset, CoverType } from '@web/pages/builder/types';
import { amountToPay, type TesterCode } from './testerCode';

/** Cover choice → binding: anything but softcover is hardbound. */
export function bindingOf(cover: CoverType): Binding {
  return cover === 'softcover' ? 'soft' : 'hard';
}

export interface PriceInput {
  albumSize: AlbumSizePreset;
  cover: CoverType;
  pageCount: number;
  /** QR memories on the album (countQrMemories). */
  qrCount: number;
  /** The memory-hosting term picked; null = the included one. */
  hostingYears: number | null;
  hdMemories: boolean;
  tester: TesterCode | null;
  /** Manila date for the "was" price (tests); default today. */
  today?: string;
}

export interface CheckoutPrice {
  /** A schedule is here: the numbers below are real. */
  ready: boolean;
  breakdown: PriceBreakdown;
  /** The album's real total. */
  total: number;
  /** What the customer pays: the total, or ₱0 with a tester code. */
  payTotal: number;
  /** The crossed-out "was" total, while the price drop shows; else null. */
  wasTotal: number | null;
  freeShippingValue: number;
  includedYears: number | null;
  /** The term the order stores (hosting_years): only with QR memories. */
  effectiveYears: number | null;
  tiers: HostingTier[];
  hdPrice: number;
}

export function checkoutPrice(schedule: PriceSchedule | null, input: PriceInput): CheckoutPrice {
  const binding = bindingOf(input.cover);
  const tiers = schedule ? hostingTiersOf(schedule) : [];
  const includedYears = schedule ? includedHostingYears(schedule) : null;
  const effectiveYears = input.qrCount > 0 ? (input.hostingYears ?? includedYears) : null;
  const hdPrice = schedule ? hdMemoriesPriceOf(schedule) : 0;
  const breakdown = schedule
    ? priceBreakdown(schedule, input.albumSize, binding, input.pageCount, input.qrCount, effectiveYears, input.hdMemories)
    : { items: [], total: 0 };
  const total = breakdown.total;
  const wasPrint = schedule
    ? (input.today === undefined
      ? compareAtPriceOf(schedule, input.albumSize, binding, input.pageCount)
      : compareAtPriceOf(schedule, input.albumSize, binding, input.pageCount, input.today))
    : null;
  const wasTotal = schedule && wasPrint !== null ? wasPrint + (total - priceOf(schedule, input.albumSize, binding, input.pageCount)) : null;
  return {
    ready: schedule !== null,
    breakdown,
    total,
    payTotal: amountToPay(total, input.tester),
    wasTotal,
    freeShippingValue: schedule ? freeShippingValueOf(schedule) : 0,
    includedYears,
    effectiveYears,
    tiers,
    hdPrice,
  };
}

/** ₱1,710: the website writes `₱${n.toLocaleString('en-PH')}`. Written out
 *  here so the phone shows the same text whatever locale data it has. */
export function peso(n: number): string {
  const sign = n < 0 ? '-' : '';
  const [whole, frac] = Math.abs(n).toString().split('.');
  return `${sign}₱${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${frac ? `.${frac.slice(0, 3)}` : ''}`;
}

/** The Place order button, in the website's words. */
export function placeOrderLabel(p: { ready: boolean; loading: boolean; retrying: boolean; tester: boolean; total: number }): string {
  if (p.ready && p.tester) return 'Place order · free with tester code';
  if (p.ready) return `Place order · pay ${peso(p.total)} by bank transfer`;
  if (p.loading || p.retrying) return 'Loading price…';
  return "Prices didn't load — tap to try again";
}
