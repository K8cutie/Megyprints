import type { AlbumPage, UploadedPhoto, AlbumSizePreset, LayoutStyle } from './types';
import { PAGE_TEMPLATES } from './pageTemplates';

/* ══════════════════════════════════════════════════════════════════════════
   generateAlbum — Dynamic page count + randomized template selection
   ══════════════════════════════════════════════════════════════════════════ */

const MIN_PAGES = 40;

function createEmptyPage(index: number, size: AlbumSizePreset): AlbumPage {
  return {
    id: `page-${Date.now()}-${index}`,
    layout: 'freeform' as LayoutStyle,
    size,
    templateId: undefined,
    slotFills: [],
    slotScales: [],
    slotOffsetsX: [],
    slotOffsetsY: [],
    slotGeometries: [],
    photos: [],
    textElements: [],
    background: { type: 'solid' as const, solid: '#FFFBF7' },
  };
}

/**
 * Generate album pages from uploaded photos.
 *
 * Logic:
 *   1. 40 pages = hard minimum floor
 *   2. Dynamically expands pages beyond 40 if needed to consume all photos
 *   3. Templates are randomly selected (mixed slot counts) for visual variety
 */
export function generateAlbum(
  photos: UploadedPhoto[],
  albumSize: AlbumSizePreset,
  _preferredSlotCount?: number | undefined,
): AlbumPage[] {
  const totalPhotos = photos.length;

  // If no photos, still create the minimum 40 empty pages
  if (totalPhotos === 0) {
    return Array.from({ length: MIN_PAGES }, (_, i) => createEmptyPage(i, albumSize));
  }

  // Target photos per page (rounded). This drives PAGE COUNT only.
  const photosPerPageTarget = Math.max(1, Math.round(totalPhotos / MIN_PAGES));

  // Pages needed = enough to fit all photos at the target density, but never below 40
  const pagesNeeded = Math.max(MIN_PAGES, Math.ceil(totalPhotos / photosPerPageTarget));

  const pages: AlbumPage[] = [];
  let photoIndex = 0;

  for (let pageIdx = 0; pageIdx < pagesNeeded; pageIdx++) {
    // ── Pick a random template from ALL templates (visual variety) ──
    const template = PAGE_TEMPLATES[Math.floor(Math.random() * PAGE_TEMPLATES.length)];
    const slotCount = template.slots.length;

    const page = createEmptyPage(pageIdx, albumSize);
    page.templateId = template.id;

    // Initialise slot arrays
    page.slotFills = new Array(slotCount).fill(null);
    page.slotScales = new Array(slotCount).fill(1);
    page.slotOffsetsX = new Array(slotCount).fill(0);
    page.slotOffsetsY = new Array(slotCount).fill(0);

    // Fill slots sequentially until we run out of photos
    for (let slotIdx = 0; slotIdx < slotCount; slotIdx++) {
      if (photoIndex < totalPhotos) {
        page.slotFills[slotIdx] = photoIndex;
        photoIndex++;
      }
    }

    pages.push(page);
  }

  return pages;
}

/**
 * Shuffle layout: pick a new random template for the current page
 * (different from current one) and preserve existing slot fills.
 */
export function shufflePageLayout(
  page: AlbumPage,
  _photos: UploadedPhoto[],
): AlbumPage {
  // Exclude the current template
  const otherTemplates = PAGE_TEMPLATES.filter((t) => t.id !== page.templateId);
  const pool = otherTemplates.length > 0 ? otherTemplates : PAGE_TEMPLATES;

  const template = pool[Math.floor(Math.random() * pool.length)];
  const slotCount = template.slots.length;

  const existingFills = (page.slotFills ?? []).filter((f): f is number => f !== null);

  const newPage: AlbumPage = {
    ...page,
    templateId: template.id,
    slotFills: new Array(slotCount).fill(null).map((_, i) => existingFills[i] ?? null),
    slotScales: new Array(slotCount).fill(1),
    slotOffsetsX: new Array(slotCount).fill(0),
    slotOffsetsY: new Array(slotCount).fill(0),
  };

  return newPage;
}
