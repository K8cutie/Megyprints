/* ══════════════════════════════════════════════════════════════════════════
   THE 40-PHOTO MINIMUM — a hard gate (owner, 2026-10-04: "can we do a hard
   gate if there isnt a minimum of 40 images for the album"). An album is 40
   pages, and fewer photos than pages printed blank pages. So:
     • the album can't be MADE (Generate, Surprise, Megy's "generate") until
       40 photos are going in — left-out ones don't count;
     • the album can't be ORDERED with fewer than 40 photos on its pages
       (old drafts, or photos deleted after generating).
   At 40+ the generator always fills all 40 pages, whatever photos-per-page is
   picked (a chosen density is a ceiling: see FILL MODE in generateAlbum), so
   this floor is exactly what stops blank pages.
   ══════════════════════════════════════════════════════════════════════════ */

import { MIN_ALBUM_PAGES } from './densities';
import type { AlbumPage } from './types';
import { isMiniSize, minPhotosFor, maxPhotosFor, MINI_NAME } from '../../lib/megyMini';

/** One photo for every page of the shortest album. */
export const MIN_ALBUM_PHOTOS = MIN_ALBUM_PAGES;

/** The photos that go into the album: Megy's photo check can leave some out. */
export function photosGoingIn(photos: readonly { leftOut?: boolean }[]): number {
  return photos.filter((p) => !p.leftOut).length;
}

/** How many more photos the book needs (0 = enough). Pass the size for a
 *  Megy Mini (16); left out = an album (40). */
export function photosShortBy(count: number, size?: string | null): number {
  return Math.max(0, minPhotosFor(size ?? '') - count);
}

/** How many photos too many (0 = fine). Only a Megy Mini has a ceiling (40). */
export function photosOverBy(count: number, size?: string | null): number {
  const max = maxPhotosFor(size ?? '');
  return Number.isFinite(max) ? Math.max(0, count - max) : 0;
}

/** Distinct photos on the album's pages: photo slots, photos that took a
 *  text box's place, and free-placed photos. */
export function albumPhotoCount(pages: readonly AlbumPage[]): number {
  const used = new Set<number>();
  for (const p of pages) {
    for (const f of p.slotFills ?? []) if (f != null) used.add(f);
    for (const f of p.textSlotFills ?? []) if (f != null) used.add(f);
    for (const ph of p.photos ?? []) if (ph?.photoIndex != null) used.add(ph.photoIndex);
  }
  return used.size;
}

/** "photo" / "photos". */
export const photoWord = (n: number) => (n === 1 ? 'photo' : 'photos');

/** The upload step's way on while short: "Add 26 more photos". */
export function addMoreLabel(short: number): string {
  return `Add ${short} more ${photoWord(short)}`;
}

/** Megy's answer to "generate" (and Surprise) while short. */
export function tooFewToMakeMessage(have: number, size?: string | null): string {
  const short = photosShortBy(have, size);
  if (isMiniSize(size)) {
    return `A ${MINI_NAME} needs at least ${minPhotosFor(size)} photos, one for every page. You have ${have}: add ${short} more and I'll make it.`;
  }
  return `Albums need at least ${MIN_ALBUM_PHOTOS} photos, one for every page. You have ${have}: add ${short} more and I'll make your album.`;
}

/** Why the album can't be ordered yet. */
export function tooFewToOrderMessage(have: number, size?: string | null): string {
  const short = photosShortBy(have, size);
  if (isMiniSize(size)) {
    return `Your ${MINI_NAME} has ${have} ${photoWord(have)}. It needs at least ${minPhotosFor(size)} to print, so add ${short} more before you order.`;
  }
  return `Your album has ${have} ${photoWord(have)}. Albums need at least ${MIN_ALBUM_PHOTOS} to print, so add ${short} more before you order.`;
}

/** Thrown by checkout when the album being ordered is short. Not a fault to
 *  report: the customer just needs to add photos. */
export class TooFewPhotosError extends Error {
  constructor(have: number, size?: string | null) {
    super(tooFewToOrderMessage(have, size));
    this.name = 'TooFewPhotosError';
  }
}
