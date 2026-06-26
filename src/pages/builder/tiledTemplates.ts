/* ══════════════════════════════════════════════════════════════════════════
   TILED TEMPLATES — generated, tight-packed page layouts.

   Each layout TILES the safe area edge-to-edge: every region's shape ≈ a
   standard photo ratio (so the photo fills it, no whitespace), and textboxes
   absorb leftover regions. Built from PHONE-NATIVE ratios (4:3, 3:4, 1:1) — the
   shapes real customers actually shoot.

   PRINT FLOOR: no photo frame may print smaller than MIN_FRAME_INCHES on its
   shortest side. buildForSize() rejects any recipe that would violate this at a
   given album's physical size — so small albums (6×6) get fewer, bigger frames
   and large albums get more, automatically.
   ══════════════════════════════════════════════════════════════════════════ */

import type { PageTemplate, TemplateSlot, TextSlot, PhotoRatio, AlbumSizePreset, TemplateMargin } from './types';

const MIN_FRAME_INCHES = 2;
const MARGIN: TemplateMargin = { top: 0.04, bottom: 0.04, left: 0.04, right: 0.04 };

/** Physical album dimensions (inches). */
const INCHES: Record<AlbumSizePreset, { w: number; h: number }> = {
  '6x4':    { w: 6,    h: 4  },
  '6x6':    { w: 6,    h: 6  },
  '8x8':    { w: 8,    h: 8  },
  '9x9':    { w: 9,    h: 9  },
  '11.5x8': { w: 11.5, h: 8  },
  '8.5x11': { w: 8.5,  h: 11 },
};

const SQUARE_SIZES: AlbumSizePreset[] = ['6x6', '8x8', '9x9'];

/** A photo region inside a recipe — 0–1 of the safe area, tagged with its ratio.
 *  For SQUARE pages the safe area is ~square, so width/height ≈ ratio value. */
interface PhotoRegion { x: number; y: number; w: number; h: number; ratio: PhotoRatio; }

interface Recipe {
  key: string;
  name: string;
  category: PageTemplate['category'];
  photos: PhotoRegion[];
  texts?: TextSlot[];
}

/** Build a recipe into a real PageTemplate for one album size, or null if any
 *  photo frame would print under MIN_FRAME_INCHES on its shortest side. */
function buildForSize(
  r: Recipe,
  size: AlbumSizePreset,
  orientation: PageTemplate['orientation'],
): PageTemplate | null {
  const { w: iw, h: ih } = INCHES[size];
  const safeWin = iw * (1 - MARGIN.left - MARGIN.right);
  const safeHin = ih * (1 - MARGIN.top - MARGIN.bottom);

  for (const p of r.photos) {
    const shortest = Math.min(p.w * safeWin, p.h * safeHin);
    if (shortest < MIN_FRAME_INCHES) return null; // too small to print — drop it
  }

  const slots: TemplateSlot[] = r.photos.map((p, i) => ({
    id: `${r.key}-${size}-s${i}`,
    x: p.x, y: p.y, width: p.w, height: p.h, ratio: p.ratio,
  }));

  return {
    id: `tile-${r.key}-${size}`,
    name: r.name,
    category: r.category,
    slotCount: slots.length,
    margin: MARGIN,
    orientation,
    targetRatio: r.photos[0]?.ratio ?? '1:1',
    albumSizes: [size],
    slots,
    textSlots: r.texts,
  };
}

const cap = (x: number, y: number, w: number, h: number): TextSlot =>
  ({ id: 'cap', x, y, width: w, height: h, align: 'center', placeholder: 'Tap to add text' });

/* ── SQUARE recipes (safe area ≈ square, so region w/h ≈ ratio) ───────────────
   Phone-native ratios only: 1:1, 4:3, 3:4. Every recipe tiles [0,1]² fully. */
const SQUARE_RECIPES: Recipe[] = [
  // 1 photo
  { key: 'full', name: 'Full bleed', category: 'single',
    photos: [{ x: 0, y: 0, w: 1, h: 1, ratio: '1:1' }] },
  { key: 'banner-cap', name: 'Banner + caption', category: 'single',
    photos: [{ x: 0, y: 0, w: 1, h: 0.75, ratio: '4:3' }], texts: [cap(0, 0.75, 1, 0.25)] },
  { key: 'title-banner', name: 'Title + banner', category: 'single',
    photos: [{ x: 0, y: 0.25, w: 1, h: 0.75, ratio: '4:3' }], texts: [cap(0, 0, 1, 0.25)] },
  { key: 'portrait-capR', name: 'Portrait + side caption', category: 'single',
    photos: [{ x: 0, y: 0, w: 0.75, h: 1, ratio: '3:4' }], texts: [cap(0.75, 0, 0.25, 1)] },
  { key: 'portrait-capL', name: 'Side caption + portrait', category: 'single',
    photos: [{ x: 0.25, y: 0, w: 0.75, h: 1, ratio: '3:4' }], texts: [cap(0, 0, 0.25, 1)] },

  // 2 photos
  { key: 'two-sq-cap', name: 'Two squares + caption', category: 'duo',
    photos: [{ x: 0, y: 0, w: 0.5, h: 0.5, ratio: '1:1' }, { x: 0.5, y: 0, w: 0.5, h: 0.5, ratio: '1:1' }],
    texts: [cap(0, 0.5, 1, 0.5)] },
  { key: 'cap-two-sq', name: 'Caption + two squares', category: 'duo',
    photos: [{ x: 0, y: 0.5, w: 0.5, h: 0.5, ratio: '1:1' }, { x: 0.5, y: 0.5, w: 0.5, h: 0.5, ratio: '1:1' }],
    texts: [cap(0, 0, 1, 0.5)] },
  { key: 'portrait-pair-cap', name: 'Portrait pair + caption', category: 'duo',
    photos: [{ x: 0, y: 0, w: 0.5, h: 0.6667, ratio: '3:4' }, { x: 0.5, y: 0, w: 0.5, h: 0.6667, ratio: '3:4' }],
    texts: [cap(0, 0.6667, 1, 0.3333)] },

  // 3 photos
  { key: 'trio-text-br', name: 'Trio + textbox', category: 'trio',
    photos: [{ x: 0, y: 0, w: 0.5, h: 0.5, ratio: '1:1' }, { x: 0.5, y: 0, w: 0.5, h: 0.5, ratio: '1:1' }, { x: 0, y: 0.5, w: 0.5, h: 0.5, ratio: '1:1' }],
    texts: [cap(0.5, 0.5, 0.5, 0.5)] },
  { key: 'trio-text-tl', name: 'Textbox + trio', category: 'trio',
    photos: [{ x: 0.5, y: 0, w: 0.5, h: 0.5, ratio: '1:1' }, { x: 0, y: 0.5, w: 0.5, h: 0.5, ratio: '1:1' }, { x: 0.5, y: 0.5, w: 0.5, h: 0.5, ratio: '1:1' }],
    texts: [cap(0, 0, 0.5, 0.5)] },

  // 4 photos
  { key: 'quad-sq', name: 'Four squares', category: 'quad',
    photos: [
      { x: 0, y: 0, w: 0.5, h: 0.5, ratio: '1:1' }, { x: 0.5, y: 0, w: 0.5, h: 0.5, ratio: '1:1' },
      { x: 0, y: 0.5, w: 0.5, h: 0.5, ratio: '1:1' }, { x: 0.5, y: 0.5, w: 0.5, h: 0.5, ratio: '1:1' },
    ] },

  // dense — only valid on the larger square albums (8×8, 9×9); 6×6 drops these
  // automatically because each frame would print under 2".
  { key: 'nine-sq', name: 'Nine squares', category: 'sextet',
    photos: Array.from({ length: 9 }, (_v, i) => ({
      x: (i % 3) / 3, y: Math.floor(i / 3) / 3, w: 1 / 3, h: 1 / 3, ratio: '1:1' as PhotoRatio,
    })) },
  { key: 'six-sq-text', name: 'Six squares + caption', category: 'sextet',
    photos: Array.from({ length: 6 }, (_v, i) => ({
      x: (i % 3) / 3, y: Math.floor(i / 3) / 3, w: 1 / 3, h: 1 / 3, ratio: '1:1' as PhotoRatio,
    })), texts: [cap(0, 0.6667, 1, 0.3333)] },
];

/** All generated tiled templates (square albums first). */
export const TILED_TEMPLATES: PageTemplate[] = SQUARE_SIZES.flatMap((size) =>
  SQUARE_RECIPES.map((r) => buildForSize(r, size, 'square')).filter((t): t is PageTemplate => t !== null),
);
