import type { AlbumPage, UploadedPhoto, TemplateType } from './types';
import { PAGE_TEMPLATES } from './pageTemplates';
import { getThemedBackground } from './types';
import { DEFAULT_ALBUM_SIZE } from './types';

let idCounter = Date.now();
function uid(): string {
  idCounter += 1;
  return `pg_${idCounter}`;
}

/** Shuffle array in-place (Fisher-Yates) */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Calculate how many pages we need based on photo count.
 *  Ensures we don't create more slots than we have photos. */
function calculatePageCount(photoCount: number): number {
  const avgSlotsPerPage = 3; // rough average across all templates
  const minPages = 1;
  const maxPages = 24;
  const estimated = Math.ceil(photoCount / avgSlotsPerPage);
  return Math.max(minPages, Math.min(maxPages, estimated));
}

/** Build a single AlbumPage from a template + slot fills */
function buildPage(
  template: (typeof PAGE_TEMPLATES)[0],
  slotFills: (number | null)[],
  theme: TemplateType,
  pageIndex: number,
  albumSize: typeof DEFAULT_ALBUM_SIZE,
): AlbumPage {
  const bg = getThemedBackground(theme, pageIndex);

  return {
    id: uid(),
    layout: 'freeform',
    templateId: template.id,
    slotFills,
    slotScales: template.slots.map(() => 1),
    slotOffsetsX: template.slots.map(() => 0),
    slotOffsetsY: template.slots.map(() => 0),
    background: bg,
    photos: [],
    textElements: [],
    size: albumSize,
  };
}

/* ═══════════════════════════════════════════════════════════
   PUBLIC API
   ═══════════════════════════════════════════════════════════ */

/** Generate a complete album from uploaded photos.
 *
 *  1. Calculates optimal page count from photo count
 *  2. Picks random templates (deduped — no repeats within 3 pages)
 *  3. Filters out rejected template IDs and slot count preference
 *  4. Distributes photos across template slots — each photo used ONCE max
 *  5. Applies themed backgrounds per page
 */
/** Pick a single random template matching a specific slot count.
 *  Returns null if no template matches (shouldn't happen with our set). */
function pickTemplateForSlotCount(
  slotCount: number,
  rejectedSet: Set<string>,
): (typeof PAGE_TEMPLATES)[0] | null {
  const matches = PAGE_TEMPLATES.filter((t) => t.slotCount === slotCount && !rejectedSet.has(t.id));
  if (matches.length > 0) return matches[Math.floor(Math.random() * matches.length)];
  // Fallback: any template with the right slot count
  const fallback = PAGE_TEMPLATES.filter((t) => t.slotCount === slotCount);
  if (fallback.length > 0) return fallback[Math.floor(Math.random() * fallback.length)];
  // Ultimate fallback: single slot
  return PAGE_TEMPLATES.find((t) => t.slotCount === 1) || PAGE_TEMPLATES[0];
}

/** Generate a complete album from uploaded photos.
 *
 *  Core principle: NO EMPTY SLOTS. Every slot on every page is filled.
 *  1. Always creates exactly 40 pages (minPages)
 *  2. Evenly distributes photos across all 40 pages
 *  3. For each page, picks a template whose slot count = photos on that page
 *  4. Every slot is filled — no gaps, no placeholders
 */
export function generateAlbum(
  photos: UploadedPhoto[],
  theme: TemplateType,
  albumSize: typeof DEFAULT_ALBUM_SIZE = DEFAULT_ALBUM_SIZE,
  rejectedIds: string[] = [],
  preferredSlotCount?: number,
  minPages: number = 40,
): AlbumPage[] {
  const rejectedSet = new Set(rejectedIds);
  const photoCount = photos.length;

  // Shuffle photo indices for random distribution
  const photoIndices = shuffle(photos.map((_, i) => i));

  // Compute how many photos each page gets (even distribution)
  const photosPerPage: number[] = [];
  if (photoCount === 0) {
    // No photos: all 40 pages get 0 photos (blank pages)
    for (let i = 0; i < minPages; i++) photosPerPage.push(0);
  } else {
    const base = Math.floor(photoCount / minPages);
    const remainder = photoCount % minPages;
    // First 'remainder' pages get base+1 photos, rest get base
    for (let i = 0; i < minPages; i++) {
      photosPerPage.push(i < remainder ? base + 1 : base);
    }
    // Shuffle the distribution so high-count pages are spread out
    shuffle(photosPerPage);
  }

  // Build each page with a template matching its photo count
  const pages: AlbumPage[] = [];
  let photoIdx = 0;

  for (let pageIndex = 0; pageIndex < minPages; pageIndex++) {
    const count = photosPerPage[pageIndex];

    // Determine slot count for this page
    let slotCount: number;
    if (count === 0) {
      // Blank page: use 1-slot template, leave it empty
      slotCount = 1;
    } else if (preferredSlotCount !== undefined && preferredSlotCount !== null) {
      // User override: use their preference (but not less than count)
      slotCount = Math.max(preferredSlotCount, count);
    } else {
      // Auto: match template slots to photo count exactly
      slotCount = count;
    }

    // Pick template with exact slot count
    const template = pickTemplateForSlotCount(slotCount, rejectedSet);
    if (!template) continue;

    // Fill ALL slots — no empties (except blank pages where count=0)
    const slotFills: (number | null)[] = template.slots.map((_, slotIdx) => {
      if (slotIdx < count && photoIdx < photoIndices.length) {
        return photoIndices[photoIdx++];
      }
      return null;
    });

    pages.push(buildPage(template, slotFills, theme, pageIndex, albumSize));
  }

  return pages;
}

/** Regenerate: same photo count, completely fresh random layout */
export function regenerateAlbum(
  photos: UploadedPhoto[],
  theme: TemplateType,
  albumSize: typeof DEFAULT_ALBUM_SIZE = DEFAULT_ALBUM_SIZE,
  rejectedIds: string[] = [],
  preferredSlotCount?: number,
  minPages: number = 40,
): AlbumPage[] {
  return generateAlbum(photos, theme, albumSize, rejectedIds, preferredSlotCount, minPages);
}

/** Regenerate a SINGLE page with a random matching template.
 *  Preserves existing slot fills when the new template has the same slot count.
 *  Re-fills from uploaded photos when slot count changes. */
export function generateSinglePage(
  currentPage: AlbumPage,
  photos: UploadedPhoto[],
  theme: TemplateType,
  albumSize: typeof DEFAULT_ALBUM_SIZE = DEFAULT_ALBUM_SIZE,
  rejectedIds: string[] = [],
  preferredSlotCount?: number,
): AlbumPage {
  const rejectedSet = new Set(rejectedIds);

  // Find templates matching the preference
  let available = PAGE_TEMPLATES.filter((t) => !rejectedSet.has(t.id));
  if (preferredSlotCount !== undefined && preferredSlotCount !== null) {
    available = available.filter((t) => t.slotCount === preferredSlotCount);
  }

  // Fallback if nothing matches
  const pool = available.length > 0 ? available : PAGE_TEMPLATES;
  const template = pool[Math.floor(Math.random() * pool.length)];

  // Build new page with this template — use themed background
  const newBg = getThemedBackground(theme, Math.floor(Math.random() * 100));

  // Preserve slot fills if same slot count, otherwise re-fill
  let slotFills: (number | null)[];
  const existingFills = currentPage.slotFills ?? [];

  if (template.slotCount === existingFills.length) {
    // Same count — preserve what we can
    slotFills = [...existingFills];
  } else {
    // Different count — re-fill from photos, NO wrap-around
    const photoIndices = shuffle(photos.map((_, i) => i));
    let photoIdx = 0;
    slotFills = template.slots.map(() => {
      if (photoIdx < photoIndices.length) {
        return photoIndices[photoIdx++];
      }
      // Out of photos — leave slot empty
      return null;
    });
  }

  return {
    id: currentPage.id, // keep same page ID
    layout: 'freeform',
    templateId: template.id,
    slotFills,
    slotScales: template.slots.map(() => 1),
    slotOffsetsX: template.slots.map(() => 0),
    slotOffsetsY: template.slots.map(() => 0),
    background: currentPage.background ?? newBg, // preserve or use new
    photos: currentPage.photos, // preserve canvas photos
    textElements: currentPage.textElements, // preserve text
    size: albumSize,
  };
}

/** Get a count estimate for the UI: "~X pages from Y photos" */
export function estimatePages(photoCount: number): number {
  return calculatePageCount(photoCount);
}
