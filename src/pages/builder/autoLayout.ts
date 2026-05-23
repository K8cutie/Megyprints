import type { UploadedPhoto, AlbumPage, TemplateType, LayoutStyle, CanvasPhoto } from './types';
import { DEFAULT_FILTERS, getThemedBackground, getThemedPhotoBorder } from './types';
import { getCanvasDimensions, getCanvasMargin, TEMPLATE_LAYOUT_PREFERENCES, TEMPLATE_SURPRISE_LAYOUTS } from './layouts';

/* ───────── ID generator ───────── */
let pageIdCounter = 0;
let photoIdCounter = 0;
export function resetPageIdCounter(): void { pageIdCounter = 0; photoIdCounter = 0; }
function newPageId(): string { pageIdCounter += 1; return `page-${pageIdCounter}`; }
function newPhotoId(): string { photoIdCounter += 1; return `photo-${photoIdCounter}`; }

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/* ───────── Place photos freely on the canvas — no containers ───────── */
function placePhotosFreely(
  _photos: UploadedPhoto[],
  photoIndices: number[],
  template: TemplateType,
  canvasW: number,
  canvasH: number
): CanvasPhoto[] {
  const margin = getCanvasMargin(canvasW, canvasH);
  const border = getThemedPhotoBorder(template);
  const availableW = canvasW - margin * 2;
  const availableH = canvasH - margin * 2;

  return photoIndices.map((photoIndex, i) => {
    // Default photo size — portrait-friendly, ~30-40% of available space
    const baseSize = Math.min(availableW, availableH) * (0.3 + Math.random() * 0.15);
    const width = baseSize;
    const height = baseSize * 1.2; // slightly taller (portrait bias)

    // Spread photos across the canvas with some randomness
    // Use a grid-based distribution to avoid excessive overlap
    const cols = Math.ceil(Math.sqrt(photoIndices.length));
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cellW = availableW / cols;
    const cellH = availableH / Math.ceil(photoIndices.length / cols);

    // Position within the cell with random offset
    const x = margin + col * cellW + (cellW - width) * (0.2 + Math.random() * 0.6);
    const y = margin + row * cellH + (cellH - height) * (0.2 + Math.random() * 0.6);

    // Clamp to canvas bounds
    const clampedX = Math.max(margin, Math.min(canvasW - margin - width, x));
    const clampedY = Math.max(margin, Math.min(canvasH - margin - height, y));

    return {
      id: newPhotoId(), photoIndex,
      x: clampedX, y: clampedY, width, height,
      scaleX: 1, scaleY: 1, rotation: 0,
      filters: { ...DEFAULT_FILTERS },
      offsetX: 0, offsetY: 0,
      zIndex: i, borderWidth: border.width, borderColor: border.color,
      borderRadius: 0, shadowBlur: 0,
      shadowColor: 'rgba(0,0,0,0.3)', shadowOffsetX: 0, shadowOffsetY: 0,
    };
  });
}

/* ───────── Main layout engine ───────── */
export function generateAlbum(photos: UploadedPhoto[], template: TemplateType, size: string = '8x10'): AlbumPage[] {
  resetPageIdCounter();
  if (photos.length === 0) return [];

  const preferences = [...TEMPLATE_LAYOUT_PREFERENCES[template]];
  const surprisePool = [...TEMPLATE_SURPRISE_LAYOUTS[template]];
  const dims = getCanvasDimensions(size as any);

  const pages: AlbumPage[] = [];
  let photoIdx = 0;
  let layoutIdx = 0;
  let layoutPool = shuffle([...preferences]);

  // Photos per page — varies by layout preference
  function getPhotosPerPage(layout: LayoutStyle, remaining: number): number {
    switch (layout) {
      case 'fullBleed': return 1;
      case 'portraitSingle': return 1;
      case 'duoPortrait': return Math.min(2, remaining);
      case 'duoLandscape': return Math.min(2, remaining);
      case 'asymDuo': return Math.min(2, remaining);
      case 'fourGrid': return Math.min(4, remaining);
      case 'heroSupporting': return Math.min(3, remaining);
      case 'trio': return Math.min(3, remaining);
      case 'collage3': return Math.min(3, remaining);
      case 'collage': return Math.min(5, remaining);
      case 'panorama': return 1;
      default: return Math.min(3, remaining);
    }
  }

  while (photoIdx < photos.length) {
    const remaining = photos.length - photoIdx;

    let layout: LayoutStyle;
    if (pages.length > 0 && pages.length % 6 === 0 && surprisePool.length > 0 && remaining >= 2) {
      layout = pick(surprisePool);
    } else {
      layout = layoutPool[layoutIdx % layoutPool.length];
      layoutIdx++;
    }

    const count = getPhotosPerPage(layout, remaining);
    const indices = Array.from({ length: count }, (_, i) => photoIdx + i);

    // Place photos freely on the canvas — spread out, no containers
    const canvasPhotos = placePhotosFreely(photos, indices, template, dims.width, dims.height);

    pages.push({
      id: newPageId(), layout,
      background: getThemedBackground(template, pages.length),
      photos: canvasPhotos, textElements: [], size: size as any,
    });

    photoIdx += count;
  }

  return pages;
}

export function regenerateAlbum(photos: UploadedPhoto[], template: TemplateType, size: string = '8x10'): AlbumPage[] {
  return generateAlbum(photos, template, size);
}

export function createEmptyPage(layout: LayoutStyle, template: TemplateType, size: string = '8x10'): AlbumPage {
  pageIdCounter += 1;
  return {
    id: `page-${pageIdCounter}`, layout,
    background: getThemedBackground(template, 0),
    photos: [], textElements: [], size: size as any,
  };
}
