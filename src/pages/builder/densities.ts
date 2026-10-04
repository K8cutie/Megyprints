/**
 * densities.ts
 * ============================================================================
 * SINGLE SOURCE OF TRUTH for "how many photos per page look good at each album
 * size." Both Megy assistants (builder + home) and the wizard's size step read
 * from here, so the size guidance and the density options can never drift apart.
 */

import type { AlbumSizePreset } from './types';

/** Photos-per-page options offered for each album-size preset. Max per size
 *  MATCHES the densest layout its deck actually deals (the per-size authored
 *  files for 6×4/squares/8×6/6×8, the tiled generator for 11.5×8/8.5×11) — the
 *  print 2" floor is why small albums cap lower. Keep these two in lockstep so
 *  the manual picker never offers a density the generator won't actually
 *  produce for that size. */
// Keyed by AlbumSizePreset so tsc FAILS here when a new size is added (this
// was a tsc-invisible size surface before the structural audit).
export const DENSITY_BY_SIZE: Record<AlbumSizePreset, number[]> = {
  '6x4': [1, 2],
  // The three SQUARE sizes share one authored layout set (squareTemplates.ts).
  // Since 2026-09-12 it deals box-free 4-up pages: a 2×2 grid on every square
  // size, plus hero + three on 8x8/9x9. 4 is the deck max, so the picker may
  // offer it (a density the deck can't deal would be silently dealt lower and
  // throw off the pre-generation page estimate).
  '6x6': [1, 2, 3, 4],
  '8x8': [1, 2, 3, 4],
  '9x9': [1, 2, 3, 4],
  // 8×6 / 6×8 are authored per-size (rectTemplates.ts); their densest layout is
  // the box-free 2×2 quad-grid, so the picker caps at 4. Offering a density the
  // deck can't deal would silently deal fewer and throw off the pre-generation
  // page estimate — re-widen only alongside a denser authored layout.
  '8x6': [1, 2, 3, 4],
  '6x8': [1, 2, 3, 4],
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
  // Loose-string read ON PURPOSE: callers pass free-form size strings and the
  // fallback keeps them crash-proof. The table itself stays Record<AlbumSizePreset>
  // so tsc still forces an entry for every real size.
  const opts = (DENSITY_BY_SIZE as Record<string, number[] | undefined>)[sizePreset] ?? DEFAULT_DENSITY;
  if (opts.length === 0) return '';
  const lo = opts[0];
  const hi = opts[opts.length - 1];
  return lo === hi ? `${lo}` : `${lo}-${hi}`;
}

/** The page count an album is built/padded to. (Mirrors MIN_PAGES in
 *  generateAlbum, which imports this so the two never drift.) */
export const MIN_ALBUM_PAGES = 40;

/** Photos an album needs for every page to carry `perPage`. With fewer,
 *  generation gives pages fewer photos so all MIN_ALBUM_PAGES pages fill
 *  (FILL MODE in generateAlbum) — the upload card says so (1-star testers,
 *  2026-10-04: "the one about how many photos go on a page" was ignored with
 *  no word why). */
export function photosForPerPage(perPage: number): number {
  return MIN_ALBUM_PAGES * perPage;
}

/** The upload card's note when the chosen photos-per-page can't be met, or null. */
export function perPageNote(photos: number, perPage: number | undefined): string | null {
  if (!perPage || perPage <= 1 || photos < MIN_ALBUM_PAGES) return null;
  const needed = photosForPerPage(perPage);
  if (photos >= needed) return null;
  return `With ${photos} photos, most pages get fewer than ${perPage} so all ${MIN_ALBUM_PAGES} pages are filled. ${perPage} per page needs about ${needed} photos.`;
}

/** Typical photos-per-page on AUTO (no explicit density) — the "natural" look
 *  when there are plenty of photos. ~2 (3 for the large landscape/portrait sizes). */
const NATURAL_BY_SIZE: Record<AlbumSizePreset, number> = {
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
  // fill mode ask for a density the deck cannot deal.
  // 8x6/6x8 deal up to 4 (quad-grid) but their natural stays 3: the 4-up is the
  // opt-in "Collage" density, and a natural of 4 would move the fill-mode
  // threshold to 160 photos — spreading today's 120-159-photo albums to 1/page.
  '6x4': 2,
  '8x6': 3, '6x8': 3, '6x6': 3, '8x8': 3, '9x9': 3, '11.5x8': 3, '8.5x11': 3,
};
export function naturalPerPage(albumSize: string): number {
  // Loose-string read on purpose (see densityRangeLabel) — table stays strict.
  return (NATURAL_BY_SIZE as Record<string, number | undefined>)[albumSize] ?? 2;
}

