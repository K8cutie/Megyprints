/* ══════════════════════════════════════════════════════════════════════════
   "STARTS AT ₱X" ON THE SIZE STEP (owner, 2026-11-19: "Starts at PXXXX"
   where the price is a 40-page soft bound album).

   The number is checkout's own total for that album, from the live price
   list (public_price_schedule): the smallest album the shop prints
   (MIN_PAGES), soft cover, no extra video memories, nothing else added.
   So it is always a price a customer can really pay, and it follows the
   price list by itself when the owner changes the markup or a size's rate.
   A size the list can't price says nothing (never a made-up number).
   ══════════════════════════════════════════════════════════════════════════ */
import { MIN_PAGES, type PriceSchedule } from '@web/lib/pricing';
import type { AlbumSizePreset } from '@web/pages/builder/types';
import { isMiniSize } from '@web/lib/megyMini';
import { checkoutPrice, peso } from './price';

/** Checkout's total for a MIN_PAGES-page soft-cover album of this size, or
 *  null (no price list yet, the Megy Mini, or a size the list can't price). */
export function startsAt(schedule: PriceSchedule | null, size: AlbumSizePreset): number | null {
  if (!schedule || isMiniSize(size)) return null;
  try {
    const p = checkoutPrice(schedule, { albumSize: size, cover: 'softcover', pageCount: MIN_PAGES, qrCount: 0, hostingYears: null, hdMemories: false, tester: null });
    return p.ready && Number.isFinite(p.total) && p.total > 0 ? p.total : null;
  } catch {
    return null;
  }
}

/** What the size card says. */
export function startsAtLine(total: number): string {
  return `Starts at ${peso(total)} for ${MIN_PAGES} pages, soft cover`;
}
