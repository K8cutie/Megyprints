/* ═══════════════════════════════════════════════════════════════════════════
   MEGY MINI: the 16-page A5 booklet with staples, sold next to the albums.

   Owner, 2026-11-16: "Megy Mini along side the regular albums", "as an item
   not part of a package 350+shipping", "2 QR videos free for megy mini".
   The print shop calls the format a "catalogue": A5 pages, 180gsm glossy
   inside, a 260gsm cover, folded and stapled (saddle-stitched), no spine.

   One place for what makes a book a Megy Mini, read by the website and the
   app alike (it is in src/shared/sharedModules.ts). The price list
   (public_price_schedule().mini, migration 0062) carries its price, shipping
   fee and free videos; it is there only while the owner has Megy Mini on.

   A Mini is an album row like any other, told apart by its size: A5 is
   '5.8x8.3' (a "WxH" name, because several places read the width off the
   name) and is never offered as an album size (sizeOffer). Its cover is
   'staple'. The database refuses anything else (0062: MP020, MP021, MP022).
   ═══════════════════════════════════════════════════════════════════════════ */

import type { AlbumSizePreset, CoverType } from '../pages/builder/types';
import { MIN_ALBUM_PAGES } from '../pages/builder/densities';

export const MINI_NAME = 'Megy Mini';
/** A5 portrait, 148 × 210 mm. */
export const MINI_SIZE: AlbumSizePreset = '5.8x8.3';
export const MINI_COVER: CoverType = 'staple';
/** Always exactly this many pages: 4 sheets folded in half and stapled. */
export const MINI_PAGES = 16;
/** One photo a page at the least, so no page is ever left empty. */
export const MINI_MIN_PHOTOS = MINI_PAGES;
/** The most photos 16 A5 pages hold without a page getting crowded. */
export const MINI_MAX_PHOTOS = 40;
/** Full pages set aside for video memories (the 2 free ones). */
export const MINI_MEMORY_PAGES = 2;
/** Full pages at the start (an album has 3). */
export const MINI_OPENING_PAGES = 1;
/** The free videos when the price list doesn't say. */
export const MINI_FREE_QR = 2;

/** What public_price_schedule().mini carries while Megy Mini is on sale. */
export interface MiniOffer {
  size: AlbumSizePreset;
  cover: CoverType;
  pages: number;
  price: number;
  package_price: number;
  shipping_fee: number;
  free_qr: number;
}

export function isMiniSize(size: unknown): boolean {
  return size === MINI_SIZE;
}

export function isMiniCover(cover: unknown): boolean {
  return cover === MINI_COVER;
}

/** The pages a book is made with: 16 for a Mini, the album minimum otherwise. */
export function bookPagesFor(size: unknown): number {
  return isMiniSize(size) ? MINI_PAGES : MIN_ALBUM_PAGES;
}

/** The fewest photos a book can be made from. */
export function minPhotosFor(size: unknown): number {
  return isMiniSize(size) ? MINI_MIN_PHOTOS : MIN_ALBUM_PAGES;
}

/** The most photos a book takes (albums: no limit). */
export function maxPhotosFor(size: unknown): number {
  return isMiniSize(size) ? MINI_MAX_PHOTOS : Infinity;
}

/** The most pages a book may have (albums: no limit). */
export function maxPagesFor(size: unknown): number {
  return isMiniSize(size) ? MINI_PAGES : Infinity;
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
  return {
    size: MINI_SIZE,
    cover: MINI_COVER,
    pages,
    price,
    package_price: packagePrice ?? price,
    shipping_fee: ship,
    free_qr: free ?? MINI_FREE_QR,
  };
}

/** "16–40 photos" for the Mini's own words. */
export const MINI_PHOTO_RANGE = `${MINI_MIN_PHOTOS}–${MINI_MAX_PHOTOS}`;

/** An ALBUM short of its 40 photos, while Megy Mini is on sale: the Mini is
 *  offered instead (owner, 2026-11-16: "if they have less than 40 pictures we
 *  will recommend megy mini"). The button, and the line after "add N more". */
export const MINI_INSTEAD = 'Make a Megy Mini instead';
export function miniSuggestion(count: number): string {
  if (count >= MINI_MIN_PHOTOS && count <= MINI_MAX_PHOTOS) {
    return `Or make a ${MINI_NAME}: ${MINI_PAGES} A5 pages, and your ${count} photos fit.`;
  }
  return `Or make a ${MINI_NAME}: it needs only ${MINI_MIN_PHOTOS} photos for its ${MINI_PAGES} A5 pages.`;
}

/** Why a Mini can't be made from this many photos, or null when it can. */
export function miniPhotoProblem(count: number): string | null {
  if (count < MINI_MIN_PHOTOS) {
    const more = MINI_MIN_PHOTOS - count;
    return `A ${MINI_NAME} needs at least ${MINI_MIN_PHOTOS} photos. Add ${more} more.`;
  }
  if (count > MINI_MAX_PHOTOS) {
    const fewer = count - MINI_MAX_PHOTOS;
    return `A ${MINI_NAME} holds up to ${MINI_MAX_PHOTOS} photos. Remove ${fewer}, or make an album instead.`;
  }
  return null;
}
