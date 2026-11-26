/* ═══════════════════════════════════════════════════════════════════════════
   MEGY MINI: the A4 booklet with staples, sold next to the albums, at 16 or
   24 pages (owner, 2026-11-23: "24 pages at 449", "an additional a second
   staple offering": one product, "Megy Mini, 16 or 24 pages"; 2026-11-27:
   "lets make megy mini as an a4 and price it at 450 and 550 respectively.
   Plus shipping." It was A5 until then.)

   Owner, 2026-11-16: "Megy Mini along side the regular albums", "as an item
   not part of a package 350+shipping", "2 QR videos free for megy mini".
   The print shop calls the format a "catalogue": A4 pages, 180gsm glossy
   inside, a 260gsm cover, folded and stapled (saddle-stitched), no spine.

   One place for what makes a book a Megy Mini, read by the website and the
   app alike (it is in src/shared/sharedModules.ts). The price list
   (public_price_schedule().mini, migration 0062) carries its price, shipping
   fee and free videos; it is there only while the owner has Megy Mini on.

   A Mini is an album row like any other, told apart by its size: A4 is
   '8.3x11.7' (a "WxH" name, because several places read the width off the
   name) and is never offered as an album size (sizeOffer). Its cover is
   'staple'. The database refuses anything else (0062: MP020, MP021, MP022).

   THE A5 MINI (2026-11-16 to 11-27) was '5.8x8.3'. A5 and A4 are the same
   shape (a sheet halved keeps its shape), so a Mini made at A5 opens as A4
   with the same layouts, photos and words, only bigger (retiredSizes
   MOVED_SIZES). The price list says which size is on sale (mini.size), and an
   app offers the Mini only when that is its own size (miniOfferOf), so an
   older A5 app hides it once A4 is on sale instead of selling A5 at A4's
   price. A5 orders placed before still print as A5.

   ITS PAGES: 16 (4 folded sheets) or 24 (6). A stapled booklet's pages come
   in fours; an open A4 spread takes a whole side of a press sheet, so a press
   sheet carries 4 pages (it carried 8 at A5). The price list names the page counts on sale
   (mini.options); one without them (before 0070) sells 16 only. Before the
   Mini is made, the customer's choice is kept on the phone (MINI_PAGES_KEY,
   like the occasion); once made, its pages say it (miniPagesOfAlbum).
   ═══════════════════════════════════════════════════════════════════════════ */

import type { AlbumSizePreset, CoverType } from '../pages/builder/types';
import { MIN_ALBUM_PAGES } from '../pages/builder/densities';
import type { KeyValueStore } from '../shared/platform';

export const MINI_NAME = 'Megy Mini';
/** A4 portrait, 210 × 297 mm. */
export const MINI_SIZE: AlbumSizePreset = '8.3x11.7';
/** The A5 Mini's size (148 × 210 mm), sold until 2026-11-27: its albums open
 *  as A4 (retiredSizes), and its orders still print as A5. */
export const OLD_MINI_SIZE: AlbumSizePreset = '5.8x8.3';
/** "A4", for the Mini's own words. */
export const MINI_PAPER = 'A4';
export const MINI_COVER: CoverType = 'staple';
/** The page counts a Mini is made at: 4 or 6 sheets folded in half and stapled. */
export const MINI_PAGE_OPTIONS = [16, 24] as const;
export type MiniPages = (typeof MINI_PAGE_OPTIONS)[number];
/** The Mini's first and usual page count (the only one before 0070). */
export const MINI_PAGES: MiniPages = 16;
/** The most photos a Mini page holds on average without getting crowded:
 *  16 pages hold 40, 24 pages 60. */
export const MINI_PHOTOS_PER_PAGE_MAX = 2.5;
/** One photo a page at the least, so no page is ever left empty. */
export const MINI_MIN_PHOTOS = MINI_PAGES;
/** The most photos 16 Mini pages hold without a page getting crowded. */
export const MINI_MAX_PHOTOS = 40;
/** Full pages set aside for video memories (the 2 free ones). */
export const MINI_MEMORY_PAGES = 2;
/** Full pages at the start (an album has 3). */
export const MINI_OPENING_PAGES = 1;
/** The free videos when the price list doesn't say. */
export const MINI_FREE_QR = 2;

/** One page count on sale and its prices. */
export interface MiniOption {
  pages: MiniPages;
  price: number;
  package_price: number;
}

/** What public_price_schedule().mini carries while Megy Mini is on sale.
 *  pages / price / package_price are the 16-page Mini's (what 2.1.5 and
 *  before read); `options` is every page count on sale, 16 first. */
export interface MiniOffer {
  size: AlbumSizePreset;
  cover: CoverType;
  pages: number;
  price: number;
  package_price: number;
  shipping_fee: number;
  free_qr: number;
  options: MiniOption[];
}

/** A Megy Mini's size: A4, or the A5 it was before (old albums and orders). */
export function isMiniSize(size: unknown): boolean {
  return size === MINI_SIZE || size === OLD_MINI_SIZE;
}

export function isMiniCover(cover: unknown): boolean {
  return cover === MINI_COVER;
}

/** A page count a Mini is made at (16 or 24). */
export function isMiniPages(n: unknown): n is MiniPages {
  return (MINI_PAGE_OPTIONS as readonly unknown[]).includes(n);
}

/** A Mini's page count: `pages` when it is one, else 16. */
export function miniPagesOf(pages: unknown): MiniPages {
  return isMiniPages(pages) ? pages : MINI_PAGES;
}

/** The photos a Mini of `pages` pages takes: one a page at the least, 2.5 a
 *  page at the most (16 pages: 16 to 40; 24 pages: 24 to 60). */
export function miniPhotoRange(pages: unknown = MINI_PAGES): { min: number; max: number } {
  const n = miniPagesOf(pages);
  return { min: n, max: Math.floor(n * MINI_PHOTOS_PER_PAGE_MAX) };
}

/** "16–40" / "24–60", for the Mini's own words. */
export function miniPhotoRangeLabel(pages: unknown = MINI_PAGES): string {
  const { min, max } = miniPhotoRange(pages);
  return `${min}–${max}`;
}

/** The pages a book is made with: a Mini's 16 or 24 (`miniPages`), the
 *  album minimum otherwise. */
export function bookPagesFor(size: unknown, miniPages?: unknown): number {
  return isMiniSize(size) ? miniPagesOf(miniPages) : MIN_ALBUM_PAGES;
}

/** The fewest photos a book can be made from. */
export function minPhotosFor(size: unknown, miniPages?: unknown): number {
  return isMiniSize(size) ? miniPhotoRange(miniPages).min : MIN_ALBUM_PAGES;
}

/** The most photos a book takes (albums: no limit). */
export function maxPhotosFor(size: unknown, miniPages?: unknown): number {
  return isMiniSize(size) ? miniPhotoRange(miniPages).max : Infinity;
}

/** The most pages a book may have (albums: no limit). */
export function maxPagesFor(size: unknown, miniPages?: unknown): number {
  return isMiniSize(size) ? miniPagesOf(miniPages) : Infinity;
}

/** A Mini's pages are never added or deleted by hand: its 16 or 24 change
 *  only by making it again at the other count. */
export function pagesAreFixed(size: unknown): boolean {
  return isMiniSize(size);
}

/** The customer's page choice for a Mini not made yet, kept on the phone. */
export const MINI_PAGES_KEY = 'megy-mini-pages';

export function readMiniPagesFrom(store: Pick<KeyValueStore, 'getItem'>): MiniPages {
  try { return miniPagesOf(Number(store.getItem(MINI_PAGES_KEY))); } catch { return MINI_PAGES; }
}

export function writeMiniPagesTo(store: Pick<KeyValueStore, 'setItem' | 'removeItem'>, pages: unknown): void {
  try {
    if (isMiniPages(pages) && pages !== MINI_PAGES) store.setItem(MINI_PAGES_KEY, String(pages));
    else store.removeItem(MINI_PAGES_KEY);
  } catch { /* full: the Mini is made at 16 */ }
}

/** A Mini's page count: its own pages once it is made (16 or 24 of them),
 *  the customer's choice before. */
export function miniPagesOfAlbum(
  pages: readonly { slotFills?: readonly (number | null | undefined)[] }[],
  chosen: unknown,
): MiniPages {
  const made = pages.some((p) => (p.slotFills ?? []).some((f) => f != null));
  return made && isMiniPages(pages.length) ? pages.length : miniPagesOf(chosen);
}

const whole = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

/** The Mini offer from a price list, or null when Megy Mini isn't on sale
 *  (off, no shipping fee, an older database, or anything malformed). */
export function miniOfferOf(schedule: { mini?: unknown } | null | undefined): MiniOffer | null {
  const m = schedule?.mini;
  if (!m || typeof m !== 'object') return null;
  const o = m as Record<string, unknown>;
  if (o.size !== MINI_SIZE || o.cover !== MINI_COVER) return null;
  const pages = whole(o.pages);
  const price = whole(o.price);
  const packagePrice = whole(o.package_price);
  const ship = whole(o.shipping_fee);
  const free = whole(o.free_qr);
  if (pages !== MINI_PAGES || price == null || price < 1 || ship == null) return null;
  const options: MiniOption[] = [{ pages: MINI_PAGES, price, package_price: packagePrice ?? price }];
  // The other page counts on sale (0070). A malformed one is left off: the
  // 16-page Mini still sells.
  if (Array.isArray(o.options)) {
    for (const raw of o.options) {
      if (!raw || typeof raw !== 'object') continue;
      const r = raw as Record<string, unknown>;
      const n = whole(r.pages);
      const p = whole(r.price);
      if (!isMiniPages(n) || n === MINI_PAGES || p == null || p < 1 || options.some((x) => x.pages === n)) continue;
      options.push({ pages: n, price: p, package_price: whole(r.package_price) ?? p });
    }
    options.sort((a, b) => a.pages - b.pages);
  }
  return {
    size: MINI_SIZE,
    cover: MINI_COVER,
    pages,
    price,
    package_price: packagePrice ?? price,
    shipping_fee: ship,
    free_qr: free ?? MINI_FREE_QR,
    options,
  };
}

/** The page counts on sale, 16 first ([] when Megy Mini isn't). */
export function miniPagesOnSale(offer: MiniOffer | null | undefined): MiniPages[] {
  return offer ? offer.options.map((o) => o.pages) : [];
}

/** The offer for a Mini of `pages` pages, its own price in place of the
 *  16-page one's; null when that page count isn't on sale. */
export function miniOfferFor(offer: MiniOffer | null | undefined, pages: unknown): MiniOffer | null {
  const o = offer?.options.find((x) => x.pages === miniPagesOf(pages));
  return offer && o ? { ...offer, pages: o.pages, price: o.price, package_price: o.package_price } : null;
}

/** "16–40" for the 16-page Mini's own words. */
export const MINI_PHOTO_RANGE = miniPhotoRangeLabel(MINI_PAGES);

/** An ALBUM short of its 40 photos, while Megy Mini is on sale: the Mini is
 *  offered instead (owner, 2026-11-16: "if they have less than 40 pictures we
 *  will recommend megy mini"). The button, and the line after "add N more". */
export const MINI_INSTEAD = 'Make a Megy Mini instead';
/** The page count a Mini of `count` photos is best made at, of those on
 *  sale: the fewest pages the photos fit (16 to 40 photos: 16 pages; 41 to
 *  60: 24), or null when they fit none. */
export function miniPagesForPhotos(count: number, onSale: readonly number[] = [MINI_PAGES]): MiniPages | null {
  for (const n of MINI_PAGE_OPTIONS) {
    if (!onSale.includes(n)) continue;
    const { min, max } = miniPhotoRange(n);
    if (count >= min && count <= max) return n;
  }
  return null;
}

export function miniSuggestion(count: number, onSale: readonly number[] = [MINI_PAGES]): string {
  const fits = miniPagesForPhotos(count, onSale);
  if (fits != null) {
    return `Or make a ${MINI_NAME}: ${fits} ${MINI_PAPER} pages, and your ${count} photos fit.`;
  }
  return `Or make a ${MINI_NAME}: it needs only ${MINI_MIN_PHOTOS} photos for its ${MINI_PAGES} ${MINI_PAPER} pages.`;
}

/** A Mini named with its page count past the usual 16: "24-page Megy Mini". */
function miniNamed(pages: unknown): string {
  const n = miniPagesOf(pages);
  return n === MINI_PAGES ? MINI_NAME : `${n}-page ${MINI_NAME}`;
}

/** Why a Mini of `pages` pages can't be made from this many photos, or null when it can. */
export function miniPhotoProblem(count: number, pages: unknown = MINI_PAGES): string | null {
  const { min, max } = miniPhotoRange(pages);
  if (count < min) {
    return `A ${miniNamed(pages)} needs at least ${min} photos. Add ${min - count} more.`;
  }
  if (count > max) {
    return `A ${miniNamed(pages)} holds up to ${max} photos. Remove ${count - max}, or make an album instead.`;
  }
  return null;
}
