import type { AlbumPage, UploadedPhoto } from './types';
import { PAGE_TEMPLATES } from './pageTemplates';

/* ══════════════════════════════════════════════════════════════════════════
   generateAlbum — Dynamic page count + randomized template selection
   ══════════════════════════════════════════════════════════════════════════ */

const MIN_PAGES = 40;

function createEmptyPage(index: number): AlbumPage {
  return {
    id: `page-${Date.now()}-${index}`,
    templateId: '',
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
  _preferredSlotCount?: number | undefined,
): AlbumPage[] {
  const totalPhotos = photos.length;

  // If no photos, still create the minimum 40 empty pages
  if (totalPhotos === 0) {
    return Array.from({ length: MIN_PAGES }, (_, i) => createEmptyPage(i));
  }

  // Target photos per page (rounded). This drives PAGE COUNT only — not template selection.
  const photosPerPageTarget = Math.max(1, Math.round(totalPhotos / MIN_PAGES));

  // Pages needed = enough to fit all photos at the target density, but never below 40
  const pagesNeeded = Math.max(MIN_PAGES, Math.ceil(totalPhotos / photosPerPageTarget));

  const pages: AlbumPage[] = [];
  let photoIndex = 0;

  for (let pageIdx = 0; pageIdx < pagesNeeded; pageIdx++) {
    // ── Pick a random template from ALL templates (visual variety) ──
    const template = PAGE_TEMPLATES[Math.floor(Math.random() * PAGE_TEMPLATES.length)];
    const slotCount = template.slots.length;

    const page = createEmptyPage(pageIdx);
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
 * Regenerate a single page with a random template and fresh photo assignment.
 * Used when the user clicks "Regenerate" on the current page.
 */
export function regeneratePage(
  page: AlbumPage,
  photos: UploadedPhoto[],
  usedPhotoIndices: Set<number>,
): AlbumPage {
  // Pick a random template
  const template = PAGE_TEMPLATES[Math.floor(Math.random() * PAGE_TEMPLATES.length)];
  const slotCount = template.slots.length;

  const newPage = createEmptyPage(Date.now());
  newPage.id = page.id; // Preserve page ID
  newPage.templateId = template.id;
  newPage.background = page.background; // Preserve background
  newPage.textElements = page.textElements; // Preserve text

  newPage.slotFills = new Array(slotCount).fill(null);
  newPage.slotScales = new Array(slotCount).fill(1);
  newPage.slotOffsetsX = new Array(slotCount).fill(0);
  newPage.slotOffsetsY = new Array(slotCount).fill(0);

  // Fill slots, avoiding already-used photos when possible
  let slotIdx = 0;
  for (let i = 0; i < photos.length && slotIdx < slotCount; i++) {
    if (!usedPhotoIndices.has(i)) {
      newPage.slotFills[slotIdx] = i;
      usedPhotoIndices.add(i);
      slotIdx++;
    }
  }

  return newPage;
}

/**
 * Shuffle layout: pick a new random template for the current page
 * (different from current one) and re-fill slots.
 */
export function shufflePageLayout(
  page: AlbumPage,
  photos: UploadedPhoto[],
): AlbumPage {
  // Exclude the current template
  const otherTemplates = PAGE_TEMPLATES.filter((t) => t.id !== page.templateId);
  const pool = otherTemplates.length > 0 ? otherTemplates : PAGE_TEMPLATES;

  const template = pool[Math.floor(Math.random() * pool.length)];
  const slotCount = template.slots.length;

  const newPage = createEmptyPage(Date.now());
  newPage.id = page.id;
  newPage.templateId = template.id;
  newPage.background = page.background;
  newPage.textElements = page.textElements;

  newPage.slotFills = new Array(slotCount).fill(null);
  newPage.slotScales = new Array(slotCount).fill(1);
  newPage.slotOffsetsX = new Array(slotCount).fill(0);
  newPage.slotOffsetsY = new Array(slotCount).fill(0);

  // Re-fill with existing slot-fill photos (same indices, new slots)
  const existingFills = (page.slotFills ?? []).filter((f): f is number => f !== null);
  for (let i = 0; i < Math.min(existingFills.length, slotCount); i++) {
    newPage.slotFills[i] = existingFills[i];
  }

  return newPage;
}
