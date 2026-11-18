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
  miniPriceBreakdown,
  priceBreakdown,
  priceOf,
  FREE_QR_MEMORIES,
  type Binding,
  type HostingTier,
  type PriceBreakdown,
  type PriceSchedule,
} from '@web/lib/pricing';
import type { AlbumSizePreset, CoverType } from '@web/pages/builder/types';
import { isMiniSize, miniOfferOf } from '@web/lib/megyMini';
import { checkoutPayTotal, type AffiliateCode } from '@web/lib/orderCodes';
import type { TesterCode } from './testerCode';

/** Cover choice → binding: anything but softcover (and the Megy Mini's soft,
 *  stapled cover) is hardbound. */
export function bindingOf(cover: CoverType): Binding {
  return cover === 'softcover' || cover === 'staple' ? 'soft' : 'hard';
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
  /** An affiliate code the database said works (0061): its discount off. */
  affiliate?: AffiliateCode | null;
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
  /** A Megy Mini (lib/megyMini): its own price, shipping on top. */
  mini: boolean;
  /** A Megy Mini that isn't on sale now (the price list has no "mini"). */
  miniOff: boolean;
  /** Shipping paid on top (a Megy Mini); null = shipping is free (albums). */
  shipping: number | null;
  /** The video memories included: 7 on an album, the Mini's own (2). */
  freeVideos: number;
}

export function checkoutPrice(schedule: PriceSchedule | null, input: PriceInput): CheckoutPrice {
  const binding = bindingOf(input.cover);
  const tiers = schedule ? hostingTiersOf(schedule) : [];
  const includedYears = schedule ? includedHostingYears(schedule) : null;
  const effectiveYears = input.qrCount > 0 ? (input.hostingYears ?? includedYears) : null;
  const hdPrice = schedule ? hdMemoriesPriceOf(schedule) : 0;
  if (isMiniSize(input.albumSize)) {
    // MEGY MINI (0062): a set price + shipping on top; never a "was" price.
    const offer = schedule ? miniOfferOf(schedule) : null;
    const breakdown = schedule && offer
      ? miniPriceBreakdown(schedule, offer, input.qrCount, effectiveYears, input.hdMemories)
      : { items: [], total: 0 };
    return {
      ready: schedule !== null && offer !== null,
      breakdown,
      total: breakdown.total,
      // A Megy Mini takes no affiliate discount (0065); the affiliate still earns.
      payTotal: checkoutPayTotal(breakdown.total, input.tester, input.affiliate ?? null, true),
      wasTotal: null,
      freeShippingValue: 0,
      includedYears,
      effectiveYears,
      tiers,
      hdPrice,
      mini: true,
      miniOff: schedule !== null && offer === null,
      shipping: offer ? offer.shipping_fee : null,
      freeVideos: offer ? offer.free_qr : 0,
    };
  }
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
    payTotal: checkoutPayTotal(total, input.tester, input.affiliate ?? null),
    wasTotal,
    freeShippingValue: schedule ? freeShippingValueOf(schedule) : 0,
    includedYears,
    effectiveYears,
    tiers,
    hdPrice,
    mini: false,
    miniOff: false,
    shipping: null,
    freeVideos: FREE_QR_MEMORIES,
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
export function placeOrderLabel(p: { ready: boolean; loading: boolean; retrying: boolean; tester: boolean; total: number; miniOff?: boolean }): string {
  // A Megy Mini the owner took off sale: the tap checks the prices again.
  if (p.miniOff && !p.loading && !p.retrying) return "Megy Mini isn't on sale right now — tap to check again";
  if (p.ready && p.tester) return 'Place order · free with tester code';
  if (p.ready) return `Place order · pay ${peso(p.total)} by bank transfer`;
  if (p.loading || p.retrying) return 'Loading price…';
  return "Prices didn't load — tap to try again";
}
