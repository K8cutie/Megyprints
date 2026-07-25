/** ══════════════════════════════════════════════════════════════════════════
    PHOTO ANALYZER — Aspect Ratio Detection & Grouping
    Analyzes uploaded photos, classifies by standard aspect ratio,
    returns dominant ratio + photo index groups.
    ══════════════════════════════════════════════════════════════════════════ */

import type { UploadedPhoto, AlbumSizePreset } from './types';

/** Standard photo aspect ratios we support */
export type PhotoRatio = '4:3' | '3:4' | '3:2' | '2:3' | '1:1' | '16:9' | '9:16';

/** Numeric values for each ratio (width / height) */
const RATIO_VALUES: Record<PhotoRatio, number> = {
  '4:3':  4 / 3,   // 1.333 — Phone landscape (most common)
  '3:4':  3 / 4,   // 0.750 — Phone portrait (most common)
  '3:2':  3 / 2,   // 1.500 — DSLR landscape
  '2:3':  2 / 3,   // 0.667 — DSLR portrait
  '1:1':  1 / 1,   // 1.000 — Square
  '16:9': 16 / 9,  // 1.778 — Panoramic
  '9:16': 9 / 16,  // 0.563 — Portrait panoramic
};

/** Result of photo analysis */
export interface PhotoAnalysis {
  /** The dominant ratio across all photos */
  dominantRatio: PhotoRatio;
  /** All photos grouped by their detected ratio */
  groups: Record<PhotoRatio, number[]>;
  /** Per-photo ratio assignments (index → ratio) */
  assignments: Record<number, PhotoRatio>;
  /** Total photos analyzed */
  total: number;
}

/** Detect the closest standard ratio for a given w/h value.
 *  Compares against exact ratio values — NO inverse check.
 *  A portrait photo (0.75) matches '3:4', NOT '4:3'.
 *  A landscape photo (1.333) matches '4:3', NOT '3:4'. */
function detectRatio(width: number, height: number): PhotoRatio {
  const raw = width / height;

  let bestRatio: PhotoRatio = '4:3';
  let bestDiff = Infinity;

  for (const [name, value] of Object.entries(RATIO_VALUES) as [PhotoRatio, number][]) {
    const diff = Math.abs(raw - value) / value;
    if (diff < bestDiff) {
      bestDiff = diff;
      bestRatio = name;
    }
  }

  return bestRatio;
}

/** Analyze a batch of uploaded photos and group by aspect ratio */
export function analyzePhotos(photos: UploadedPhoto[]): PhotoAnalysis {
  const groups: Record<PhotoRatio, number[]> = {
    '4:3': [], '3:4': [], '3:2': [], '2:3': [], '1:1': [], '16:9': [], '9:16': [],
  };
  const assignments: Record<number, PhotoRatio> = {};

  photos.forEach((photo, idx) => {
    // An UNMEASURED photo (width/height still 0) used to be guessed at
    // 1200×1600 — i.e. asserted to be PORTRAIT. That guess is applied with the
    // full force of a real measurement: it picks the template, and a real
    // landscape photo then lands in a portrait frame and loses its sides.
    // Generation now waits for measurements (see useBuilderState), so this path
    // only survives for a photo that genuinely could not be decoded. Call it
    // SQUARE: 1:1 is the least-wrong shape to guess, cropping a modest amount
    // in either orientation instead of half of one of them.
    const measured = photo.width > 0 && photo.height > 0;
    const w = measured ? photo.width : 1;
    const h = measured ? photo.height : 1;
    const ratio = detectRatio(w, h);
    groups[ratio].push(idx);
    assignments[idx] = ratio;
  });

  // Find dominant ratio
  let dominantRatio: PhotoRatio = '4:3';
  let maxCount = 0;
  for (const [ratio, indices] of Object.entries(groups) as [PhotoRatio, number[]][]) {
    if (indices.length > maxCount) {
      maxCount = indices.length;
      dominantRatio = ratio;
    }
  }

  return { dominantRatio, groups, assignments, total: photos.length };
}

/** Get the numeric aspect ratio value for a named ratio */
export function getRatioValue(ratio: PhotoRatio): number {
  return RATIO_VALUES[ratio];
}

/** Check if a photo's ratio is landscape (w > h) */
export function isLandscape(ratio: PhotoRatio): boolean {
  return RATIO_VALUES[ratio] >= 1;
}

/** Get the inverse ratio (landscape ↔ portrait) */
export function inverseRatio(ratio: PhotoRatio): PhotoRatio {
  const map: Record<PhotoRatio, PhotoRatio> = {
    '4:3': '3:4', '3:4': '4:3',
    '3:2': '2:3', '2:3': '3:2',
    '1:1': '1:1',
    '16:9': '9:16', '9:16': '16:9',
  };
  return map[ratio];
}

/** Recommend the best album size for a dominant photo ratio.
 *  Portrait photos → portrait album, landscape → landscape, square → square. */
export function recommendSizeForRatio(ratio: PhotoRatio): AlbumSizePreset {
  switch (ratio) {
    case '3:4': case '2:3': case '9:16': return '8.5x11'; // portrait
    case '4:3': case '3:2': case '16:9': return '11.5x8'; // landscape
    case '1:1':                          return '8x8';    // square
    default:                             return '8x8';
  }
}

/** Human-friendly label for a ratio (for Megy's guidance copy). */
export function ratioLabel(ratio: PhotoRatio): string {
  const map: Record<PhotoRatio, string> = {
    '4:3': 'phone landscape (4:3)',
    '3:4': 'phone portrait (3:4)',
    '3:2': 'camera landscape (3:2)',
    '2:3': 'camera portrait (2:3)',
    '1:1': 'square (1:1)',
    '16:9': 'panoramic (16:9)',
    '9:16': 'tall panoramic (9:16)',
  };
  return map[ratio];
}

/** Get the ratio that best fits a given album size */
export function getPreferredRatioForAlbum(albumSize: string): PhotoRatio {
  switch (albumSize) {
    case '6x4':    return '4:3';   // landscape → 4:3
    case '8x6':    return '4:3';   // landscape → 4:3
    case '6x8':    return '3:4';   // portrait → 3:4
    case '6x6':    return '1:1';   // square → 1:1
    case '8x8':    return '1:1';   // square → 1:1
    case '11.5x8': return '4:3';   // landscape → 4:3
    case '8.5x11': return '3:4';   // portrait → 3:4
    default:       return '4:3';
  }
}
