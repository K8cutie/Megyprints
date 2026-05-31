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

/** Pick templates with dedup — same template won't appear within `window` pages.
 *  Filters out rejected template IDs and optionally by slot count. */
function pickTemplates(count: number, rejectedIds: Set<string> = new Set(), window = 3, slotCount?: number): typeof PAGE_TEMPLATES {
  // Filter out rejected templates
  let available = PAGE_TEMPLATES.filter((t) => !rejectedIds.has(t.id));

  // Filter by slot count if specified
  if (slotCount !== undefined) {
    available = available.filter((t) => t.slotCount === slotCount);
  }

  // If all templates are rejected or no slot-match, fall back to full set
  const poolSource = available.length > 0 ? available : PAGE_TEMPLATES;
  const pool = shuffle(poolSource);
  const picked: typeof PAGE_TEMPLATES = [];

  for (let i = 0; i < count; i++) {
    const recentIds = new Set(picked.slice(-window).map((t) => t.id));
    let candidate = pool.find((t) => !recentIds.has(t.id));

    if (!candidate) {
      candidate = pool[Math.floor(Math.random() * pool.length)];
    }

    picked.push(candidate);
  }

  return picked;
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
export function generateAlbum(
  photos: UploadedPhoto[],
  theme: TemplateType,
  albumSize: typeof DEFAULT_ALBUM_SIZE = DEFAULT_ALBUM_SIZE,
  rejectedIds: string[] = [],
  preferredSlotCount?: number,
): AlbumPage[] {
  if (photos.length === 0) return [];

  const pageCount = calculatePageCount(photos.length);
  const rejectedSet = new Set(rejectedIds);
  const templates = pickTemplates(pageCount, rejectedSet, 3, preferredSlotCount);

  // Shuffle photo indices so distribution is random
  const photoIndices = shuffle(photos.map((_, i) => i));

  const pages: AlbumPage[] = [];
  let photoIdx = 0;

  for (let pageIndex = 0; pageIndex < templates.length; pageIndex++) {
    const template = templates[pageIndex];

    // Fill slots from shuffled photos — NO wrap-around, each photo used once max
    const slotFills: (number | null)[] = template.slots.map(() => {
      if (photoIdx < photoIndices.length) {
        return photoIndices[photoIdx++];
      }
      // Out of photos — leave slot empty
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
): AlbumPage[] {
  return generateAlbum(photos, theme, albumSize, rejectedIds, preferredSlotCount);
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
