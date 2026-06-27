/**
 * densities.ts
 * ============================================================================
 * SINGLE SOURCE OF TRUTH for "how many photos per page look good at each album
 * size." Both Megy assistants (builder + home) and the wizard's size step read
 * from here, so the size guidance and the density options can never drift apart.
 */

/** Photos-per-page options offered for each album-size preset. */
export const DENSITY_BY_SIZE: Record<string, number[]> = {
  '6x4': [1, 2],
  '6x6': [1, 2],
  '8x8': [1, 2, 3, 4],
  '9x9': [1, 2, 3, 4],
  '11.5x8': [1, 2, 3, 4, 5],
  '8.5x11': [1, 2, 3, 4, 5],
};

/** Friendly name for each density count. */
export const DENSITY_LABELS: Record<number, string> = {
  1: 'Big & bold',
  2: 'Dynamic pair',
  3: 'Nice balance',
  4: 'Collage',
  5: 'Packed',
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

/** Typical photos-per-page on AUTO (no explicit density chosen) — used ONLY for
 *  the upload-time fill estimate, not for generation. Auto leans toward fewer,
 *  bigger photos, so ~2 (3 for the large landscape/portrait sizes). */
const AUTO_PER_PAGE: Record<string, number> = {
  '6x4': 2, '6x6': 2, '8x8': 2, '9x9': 2, '11.5x8': 3, '8.5x11': 3,
};

export interface FillEstimate {
  perPage: number;
  estimatedPages: number;  // pages the uploaded photos roughly fill
  fillsAlbum: boolean;     // enough to fill all MIN_ALBUM_PAGES
  photosForFull: number;   // photos needed to fill the album
  shortBy: number;         // suggested extra photos (0 if already enough)
}

/** Estimate how much of a full {MIN_ALBUM_PAGES}-page album the uploaded photos
 *  will fill, so we can nudge the user to add more BEFORE generating (avoids
 *  surprise blank pages). Uses the chosen density, or an auto typical. */
export function estimateAlbumFill(
  photoCount: number, albumSize: string, photosPerPage?: number,
): FillEstimate {
  const perPage = photosPerPage && photosPerPage > 0
    ? photosPerPage
    : (AUTO_PER_PAGE[albumSize] ?? 2);
  const photosForFull = MIN_ALBUM_PAGES * perPage;
  return {
    perPage,
    estimatedPages: Math.max(0, Math.round(photoCount / perPage)),
    fillsAlbum: photoCount >= photosForFull,
    photosForFull,
    shortBy: Math.max(0, photosForFull - photoCount),
  };
}
