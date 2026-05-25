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
 *  Filters out rejected template IDs. */
function pickTemplates(count: number, rejectedIds: Set<string> = new Set(), window = 3): typeof PAGE_TEMPLATES {
  // Filter out rejected templates
  const available = PAGE_TEMPLATES.filter((t) => !rejectedIds.has(t.id));

  // If all templates are rejected, fall back to full set
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

/** Calculate how many pages we need based on photo count */
function calculatePageCount(photoCount: number): number {
  const avgSlotsPerPage = 3; // rough average across all templates
  const minPages = 5;
  const maxPages = 24;
  const estimated = Math.ceil(photoCount / avgSlotsPerPage);
  return Math.max(minPages, Math.min(maxPages, estimated + 2));
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
 *  3. Filters out rejected template IDs
 *  4. Distributes photos round-robin across template slots
 *  5. Applies themed backgrounds per page
 */
export function generateAlbum(
  photos: UploadedPhoto[],
  theme: TemplateType,
  albumSize: typeof DEFAULT_ALBUM_SIZE = DEFAULT_ALBUM_SIZE,
  rejectedIds: string[] = [],
): AlbumPage[] {
  if (photos.length === 0) return [];

  const pageCount = calculatePageCount(photos.length);
  const rejectedSet = new Set(rejectedIds);
  const templates = pickTemplates(pageCount, rejectedSet);

  // Shuffle photo indices so distribution is random
  const photoIndices = shuffle(photos.map((_, i) => i));

  const pages: AlbumPage[] = [];
  let photoIdx = 0;

  for (let pageIndex = 0; pageIndex < templates.length; pageIndex++) {
    const template = templates[pageIndex];

    // Fill slots from shuffled photos (wrap around if we run out)
    const slotFills: (number | null)[] = template.slots.map(() => {
      if (photoIdx < photoIndices.length) {
        return photoIndices[photoIdx++];
      }
      // Wrap around: reuse photos from the start
      const wrappedIdx = photoIdx % photoIndices.length;
      photoIdx++;
      return photoIndices[wrappedIdx];
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
): AlbumPage[] {
  return generateAlbum(photos, theme, albumSize, rejectedIds);
}

/** Get a count estimate for the UI: "~X pages from Y photos" */
export function estimatePages(photoCount: number): number {
  return calculatePageCount(photoCount);
}
