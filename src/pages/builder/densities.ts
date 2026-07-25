/**
 * densities.ts
 * ============================================================================
 * SINGLE SOURCE OF TRUTH for "how many photos per page look good at each album
 * size." Both Megy assistants (builder + home) and the wizard's size step read
 * from here, so the size guidance and the density options can never drift apart.
 */

/** Photos-per-page options offered for each album-size preset. Max per size
 *  MATCHES the generator's tiled-template cap (2 / 4 / 6 / 6 for 6×4 / 6×6 /
 *  8×8·9×9 / landscape·portrait) — the print 2" floor is why small albums cap
 *  lower. Keep these two in lockstep so the manual picker never offers a density
 *  the generator won't actually produce for that size. */
export const DENSITY_BY_SIZE: Record<string, number[]> = {
  '6x4': [1, 2],
  // The three SQUARE sizes share one authored layout set (squareTemplates.ts)
  // that caps at 3 photos/page — there is no 4-up square layout yet. Offering a
  // higher density would let the customer pick one the deck silently deals as 3,
  // and the pre-gen estimate would then under-count pages / over-ask for photos.
  // 8x8/9x9 CAN print 4-6 photos above the floor; re-widen these once dense
  // layouts are authored in templates8x8.ts / templates9x9.ts.
  '6x6': [1, 2, 3],
  '8x8': [1, 2, 3],
  '9x9': [1, 2, 3],
  // 8×6 / 6×8 are authored per-size (rectTemplates.ts) and their deck currently
  // caps at 3 photos/page, so the picker must cap there too — offering a density
  // the generator can't deal would silently deal fewer and throw off the
  // pre-generation page estimate. Re-widen as denser layouts are authored.
  '8x6': [1, 2, 3],
  '6x8': [1, 2, 3],
  '11.5x8': [1, 2, 3, 4, 5, 6],
  '8.5x11': [1, 2, 3, 4, 5, 6],
};

/** Friendly name for each density count. */
export const DENSITY_LABELS: Record<number, string> = {
  1: 'Big & bold',
  2: 'Dynamic pair',
  3: 'Nice balance',
  4: 'Collage',
  5: 'Packed',
  6: 'Photo grid',
};

/** Fallback when a size isn't in the map (keeps callers crash-proof). */
export const DEFAULT_DENSITY: number[] = [1, 2, 3, 4];

/** Render the per-page range for a size as a label, e.g. "1-2" or "1-4". */
export function densityRangeLabel(sizePreset: string): string {
  const opts = DENSITY_BY_SIZE[sizePreset] ?? DEFAULT_DENSITY;
  if (opts.length === 0) return '';
  const lo = opts[0];
  const hi = opts[opts.length - 1];
  return lo === hi ? `${lo}` : `${lo}-${hi}`;
}

/** The page count an album is built/padded to. (Mirrors MIN_PAGES in
 *  generateAlbum, which imports this so the two never drift.) */
export const MIN_ALBUM_PAGES = 40;

/** Typical photos-per-page on AUTO (no explicit density) — the "natural" look
 *  when there are plenty of photos. ~2 (3 for the large landscape/portrait sizes). */
const NATURAL_BY_SIZE: Record<string, number> = {
  // The three square sizes share one layout set that deals at ~2.7 photos/page,
  // so their natural is 3: a natural of 2 put the fill-mode threshold at 80
  // photos (MIN_ALBUM_PAGES x 2) while the deck could not fill 40 pages until
  // ~110, leaving 80–109-photo albums padded with blanks. A natural of 3 moves
  // the threshold to 120 so fill mode covers that band and spreads the photos.
  // 6x4 is 3 for the same reason as the squares: its authored deck (whose
  // densest layout is the 3-up square hero) padded 80-119-photo albums with
  // blanks at natural=2 because the deck deals fewer pages than that threshold
  // assumes. 6x4 stays capped at 3 photos/page — its page is only 4" tall.
  // 6x4 is 2 (not 3) since its hero trios were retired: a 3-up needs 2+2+1mm =
  // 4.04" of stacking on a 4.00"-tall page once the 1mm gutter is mandatory, so
  // the deck now caps at 2 photos/page. A natural ABOVE the deck's max makes
  // autoDensity ask for a density the deck cannot deal.
  '6x4': 2,
  '8x6': 3, '6x8': 3, '6x6': 3, '8x8': 3, '9x9': 3, '11.5x8': 3, '8.5x11': 3,
};
export function naturalPerPage(albumSize: string): number {
  return NATURAL_BY_SIZE[albumSize] ?? 2;
}

/** The density generation will actually use for the AUTO case: the natural look
 *  when there are enough photos for it, otherwise drop toward 1/page so the album
 *  still fills MIN_ALBUM_PAGES without blanks (the lowest density that fills). */
export function autoDensity(photoCount: number, albumSize: string): number {
  const natural = naturalPerPage(albumSize);
  if (photoCount >= MIN_ALBUM_PAGES * natural) return natural;
  return Math.max(1, Math.floor(photoCount / MIN_ALBUM_PAGES)); // 1/page for < natural-fill
}

export interface FillEstimate {
  perPage: number;
  estimatedPages: number;  // pages the uploaded photos roughly fill
  fillsAlbum: boolean;     // enough to fill all MIN_ALBUM_PAGES (no blanks)
  photosForFull: number;   // photos needed to fill the album
  shortBy: number;         // suggested extra photos (0 if already enough)
}

/** Estimate how much of a full {MIN_ALBUM_PAGES}-page album the uploaded photos
 *  will fill — matching what generation does — so we can nudge the user to add
 *  more BEFORE generating (avoids surprise blank pages). On AUTO the floor to
 *  fill is MIN_ALBUM_PAGES photos (1 per page); an explicit density needs more. */
export function estimateAlbumFill(
  photoCount: number, albumSize: string, photosPerPage?: number,
): FillEstimate {
  if (photosPerPage && photosPerPage > 0) {
    const photosForFull = MIN_ALBUM_PAGES * photosPerPage;
    return {
      perPage: photosPerPage,
      estimatedPages: Math.max(0, Math.round(photoCount / photosPerPage)),
      fillsAlbum: photoCount >= photosForFull,
      photosForFull,
      shortBy: Math.max(0, photosForFull - photoCount),
    };
  }
  const perPage = autoDensity(photoCount, albumSize);
  return {
    perPage,
    estimatedPages: Math.max(0, Math.round(photoCount / perPage)),
    fillsAlbum: photoCount >= MIN_ALBUM_PAGES,
    photosForFull: MIN_ALBUM_PAGES,
    shortBy: Math.max(0, MIN_ALBUM_PAGES - photoCount),
  };
}
