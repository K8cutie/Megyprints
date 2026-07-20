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
import { PER_SIZE_AUTHORED } from './templateKit';

const MIN_FRAME_INCHES = 2;
const GAP_MM = 5; // physical gutter between adjacent frames, for visual distinction
const MARGIN: TemplateMargin = { top: 0.04, bottom: 0.04, left: 0.04, right: 0.04 };
const ZERO_MARGIN: TemplateMargin = { top: 0, bottom: 0, left: 0, right: 0 };

/** The GAP_MM gutter as a fraction of the safe area, per axis. */
function gapFracs(safeWin: number, safeHin: number) {
  const gIn = GAP_MM / 25.4;
  return { gx: gIn / safeWin, gy: gIn / safeHin };
}
/** Shrink a region by half the gap on every side → adjacent regions end up a
 *  FULL gap apart; outer edges get a half-gap breathing margin. */
function inset(x: number, y: number, w: number, h: number, gx: number, gy: number) {
  return { x: x + gx / 2, y: y + gy / 2, w: w - gx, h: h - gy };
}

/** Physical album dimensions (inches). */
const INCHES: Record<AlbumSizePreset, { w: number; h: number }> = {
  '6x4':    { w: 6,    h: 4  },
  '6x6':    { w: 6,    h: 6  },
  '8x8':    { w: 8,    h: 8  },
  '9x9':    { w: 9,    h: 9  },
  '11.5x8': { w: 11.5, h: 8  },
  '8.5x11': { w: 8.5,  h: 11 },
};

/** Square albums this generator serves. Sizes authored per-size own their whole
 *  layout set (see PER_SIZE_AUTHORED), so nothing is generated underneath them. */
const SQUARE_SIZES: AlbumSizePreset[] = (['6x6', '8x8', '9x9'] as AlbumSizePreset[])
  .filter((s) => !PER_SIZE_AUTHORED.has(s));

/** A photo region inside a recipe — 0–1 of the safe area, tagged with its ratio.
 *  For SQUARE pages the safe area is ~square, so width/height ≈ ratio value. */
interface PhotoRegion { x: number; y: number; w: number; h: number; ratio: PhotoRatio; }

interface Recipe {
  key: string;
  name: string;
  category: PageTemplate['category'];
  photos: PhotoRegion[];
  texts?: TextSlot[];
  fullBleed?: boolean; // single full-page photo → run to all four edges
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
  const { gx, gy } = r.fullBleed ? { gx: 0, gy: 0 } : gapFracs(safeWin, safeHin);

  for (const p of r.photos) {
    // Check the PRINTED frame size after the gap inset, not the raw region.
    const shortest = Math.min((p.w - gx) * safeWin, (p.h - gy) * safeHin);
    if (shortest < MIN_FRAME_INCHES) return null; // too small to print — drop it
  }

  const slots: TemplateSlot[] = r.photos.map((p, i) => {
    const b = inset(p.x, p.y, p.w, p.h, gx, gy);
    return { id: `${r.key}-${size}-s${i}`, x: b.x, y: b.y, width: b.w, height: b.h, ratio: p.ratio };
  });
  const textSlots: TextSlot[] | undefined = r.texts?.map((t) => {
    const b = inset(t.x, t.y, t.width, t.height, gx, gy);
    return { ...t, x: b.x, y: b.y, width: b.w, height: b.h };
  });

  return {
    id: `tile-${r.key}-${size}`,
    name: r.name,
    category: r.category,
    slotCount: slots.length,
    margin: r.fullBleed ? ZERO_MARGIN : MARGIN,
    orientation,
    targetRatio: r.photos[0]?.ratio ?? '1:1',
    albumSizes: [size],
    slots,
    textSlots,
    fullBleed: r.fullBleed,
  };
}

const cap = (x: number, y: number, w: number, h: number): TextSlot =>
  ({ id: 'cap', x, y, width: w, height: h, align: 'center', placeholder: 'Tap to add text' });

/* ── SQUARE recipes (safe area ≈ square, so region w/h ≈ ratio) ───────────────
   Phone-native ratios only: 1:1, 4:3, 3:4. Every recipe tiles [0,1]² fully. */
const SQUARE_RECIPES: Recipe[] = [
  // 1 photo — true full-bleed (photo to all four edges, no border)
  { key: 'full', name: 'Full bleed', category: 'single', fullBleed: true,
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
  // ── VARIETY additions: widen the thin phone-portrait (3:4) / landscape (4:3)
  //    square pools so templateTracker(5) has distinct layouts to rotate. ──
  // Two portraits with the caption on TOP (distinct from the bottom-cap pair).
  { key: 'twin-port-topcap', name: 'Caption + portrait pair', category: 'duo',
    photos: [{ x: 0, y: 0.3333, w: 0.5, h: 0.6667, ratio: '3:4' }, { x: 0.5, y: 0.3333, w: 0.5, h: 0.6667, ratio: '3:4' }],
    texts: [cap(0, 0, 1, 0.3333)] },
  // One 3:4 hero centered with a caption band beneath — a new single-photo 3:4
  // arrangement distinct from the side-caption portraits.
  { key: 'portrait-capC', name: 'Portrait + caption below', category: 'single',
    photos: [{ x: 0.25, y: 0, w: 0.5, h: 0.6667, ratio: '3:4' }], texts: [cap(0, 0.6667, 1, 0.3333)] },
  // Big 4:3 hero with a thin caption band ABOVE and BELOW — new single 4:3 look.
  { key: 'land-hero-splitcap', name: 'Landscape hero + captions', category: 'single',
    photos: [{ x: 0, y: 0.15, w: 1, h: 0.75, ratio: '4:3' }], texts: [cap(0, 0, 1, 0.15), cap(0, 0.9, 1, 0.1)] },
  // (A 2-up 4:3 "twin landscape" recipe was dropped: two 4:3 frames are too
  // wide/short to tile a SQUARE page without a large empty band — 4:3 photos get
  // single-hero layouts instead, which also spread across more pages.)
  // L-frame: one big square + two small squares (auto-drops on 6×6 via floor).
  // L-frame: one big square + two small squares. The leftover bottom band
  // (y 0.6667..1 across the full width) is absorbed by a caption, so the layout
  // still tiles edge-to-edge per the header invariant.
  { key: 'l-frame-1x1', name: 'L-frame squares', category: 'trio',
    photos: [
      { x: 0, y: 0, w: 0.6667, h: 0.6667, ratio: '1:1' },
      { x: 0.6667, y: 0, w: 0.3333, h: 0.3333, ratio: '1:1' },
      { x: 0.6667, y: 0.3333, w: 0.3333, h: 0.3333, ratio: '1:1' },
    ], texts: [cap(0, 0.6667, 1, 0.3333)] },

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

  // dense (6-up) — only valid on the larger square albums (8×8, 9×9); 6×6 drops it
  // automatically because each frame would print under 2". A 9-up "Nine squares"
  // recipe was intentionally removed: per-size MAX photos/page is capped at
  // 2 / 4 / 6 / 6 for 6×4 / 6×6 / 8×8·9×9 / landscape·portrait respectively.
  { key: 'six-sq-text', name: 'Six squares + caption', category: 'sextet',
    photos: Array.from({ length: 6 }, (_v, i) => ({
      x: (i % 3) / 3, y: Math.floor(i / 3) / 3, w: 1 / 3, h: 1 / 3, ratio: '1:1' as PhotoRatio,
    })), texts: [cap(0, 0.6667, 1, 0.3333)] },
];

/* ── LANDSCAPE / PORTRAIT via uniform grids ──────────────────────────────────
   Non-square pages don't share square recipes (a region's TRUE ratio is
   (w/h) × pageAspect, which changes with the page shape). So we tile them with
   uniform R×C grids — grids always tile perfectly — and compute each cell's real
   ratio per size, tagging the nearest standard ratio. Cells that land near a
   phone-native ratio (e.g. 6×4 → 1×2 gives exact 3:4 portraits) crop barely or
   not at all. The 2" floor drops any grid whose cells print too small. */

// PHONE-NATIVE + square only. Grid cells are tagged with the nearest of these so
// the generator actually SELECTS them for real customer photos (the matcher picks
// templates by tagged ratio). A cell whose true shape isn't exactly one of these
// fills via object-cover with a small crop — the cost of a tight landscape page.
const PHONE_RATIOS: { r: PhotoRatio; v: number }[] = [
  { r: '3:4', v: 3 / 4 }, { r: '1:1', v: 1 }, { r: '4:3', v: 4 / 3 },
];
function nearestRatio(v: number): PhotoRatio {
  let best = PHONE_RATIOS[0], bd = Infinity;
  for (const s of PHONE_RATIOS) {
    const d = Math.abs(Math.log(s.v) - Math.log(v)); // log distance = perceptual ratio nearness
    if (d < bd) { bd = d; best = s; }
  }
  return best.r;
}
/** Log-distance from a true cell ratio to the phone ratio it would be tagged with.
 *  Used to auto-reject grid cells too far from any phone-native shape (they'd force
 *  a heavy object-cover crop on matched photos). Baseline grids all sit ≤ ~0.15. */
function ratioMismatch(v: number): number {
  let bd = Infinity;
  for (const s of PHONE_RATIOS) bd = Math.min(bd, Math.abs(Math.log(s.v) - Math.log(v)));
  return bd;
}
// Max log-distance a grid cell may sit from its nearest phone ratio before we drop
// the whole grid. Baseline grids top out ~0.148 (6×4 2×1 landscape cells); 0.2 keeps
// every real grid while rejecting sliver cells (1×3 → 0.448, 3×1 → 0.553) that would
// cover-crop 36–42% off a matched phone photo.
const MAX_CELL_RATIO_MISMATCH = 0.2;
const CATEGORY: PageTemplate['category'][] = ['single', 'single', 'duo', 'trio', 'quad', 'quint', 'sextet'];
const catFor = (n: number): PageTemplate['category'] => CATEGORY[Math.min(n, 6)];
const orientFor = (a: number): PageTemplate['orientation'] => (a > 1.05 ? 'landscape' : a < 0.95 ? 'portrait' : 'square');

interface GridSpec { size: AlbumSizePreset; rows: number; cols: number; caption?: boolean; name: string; }

function gridTemplate(spec: GridSpec): PageTemplate | null {
  const { size, rows, cols, caption, name } = spec;
  const { w: iw, h: ih } = INCHES[size];
  const A = iw / ih;
  const safeWin = iw * (1 - MARGIN.left - MARGIN.right);
  const safeHin = ih * (1 - MARGIN.top - MARGIN.bottom);
  const photoRows = caption ? rows - 1 : rows;
  if (photoRows < 1) return null;
  const fullBleed = photoRows === 1 && cols === 1 && !caption; // single full-page photo
  const { gx, gy } = fullBleed ? { gx: 0, gy: 0 } : gapFracs(safeWin, safeHin);

  const cw = 1 / cols, ch = 1 / rows;
  if (Math.min((cw - gx) * safeWin, (ch - gy) * safeHin) < MIN_FRAME_INCHES) return null; // print floor
  const realCellRatio = (cw / ch) * A;
  // Reject cells too far from any phone-native ratio: a matched photo would be
  // heavily object-cover cropped (mirrors how the 2" floor auto-rejects tiny cells).
  if (ratioMismatch(realCellRatio) > MAX_CELL_RATIO_MISMATCH) return null;
  const ratio = nearestRatio(realCellRatio);

  const slots: TemplateSlot[] = [];
  let n = 0;
  for (let r = 0; r < photoRows; r++) {
    for (let c = 0; c < cols; c++) {
      const b = inset(c * cw, r * ch, cw, ch, gx, gy);
      slots.push({ id: `grid-${size}-${rows}x${cols}-s${n++}`, x: b.x, y: b.y, width: b.w, height: b.h, ratio });
    }
  }
  const cb = inset(0, photoRows * ch, 1, 1 - photoRows * ch, gx, gy);
  const texts = caption ? [cap(cb.x, cb.y, cb.w, cb.h)] : undefined;

  return {
    id: `tile-grid-${rows}x${cols}${caption ? '-cap' : ''}-${size}`,
    name,
    category: catFor(slots.length),
    slotCount: slots.length,
    margin: fullBleed ? ZERO_MARGIN : MARGIN,
    orientation: orientFor(A),
    targetRatio: ratio,
    albumSizes: [size],
    slots,
    textSlots: texts,
    fullBleed,
  };
}

// Liberal spec list — gridTemplate() returns null for any that breaks the 2"
// floor, so small albums (6×4) keep only the coarse grids automatically.
const GRID_SPECS: GridSpec[] = [
  // 6×4 landscape (A = 1.50)
  { size: '6x4', rows: 1, cols: 1, name: 'Full landscape' },
  { size: '6x4', rows: 1, cols: 2, name: 'Two portraits' },
  { size: '6x4', rows: 2, cols: 2, name: 'Four frames' },
  // 11.5×8 landscape (A = 1.44)
  { size: '11.5x8', rows: 1, cols: 1, name: 'Full landscape' },
  { size: '11.5x8', rows: 1, cols: 2, name: 'Two portraits' },
  { size: '11.5x8', rows: 2, cols: 2, name: 'Four frames' },
  { size: '11.5x8', rows: 2, cols: 3, name: 'Six frames' },
  { size: '11.5x8', rows: 2, cols: 2, caption: true, name: 'Two + caption' },
  { size: '11.5x8', rows: 3, cols: 3, caption: true, name: 'Six + caption' },
  // (Dropped VARIETY 11.5×8 1×3 'Three portraits': its cells are ~1:2 slivers, log-
  //  distance 0.448 from the 3:4 they'd be tagged — 36% cover-crop on a matched
  //  photo, well past MAX_CELL_RATIO_MISMATCH. gridTemplate() would reject it anyway.)
  // 8.5×11 portrait (A = 0.77)
  { size: '8.5x11', rows: 1, cols: 1, name: 'Full portrait' },
  { size: '8.5x11', rows: 2, cols: 1, name: 'Two stacked' },
  { size: '8.5x11', rows: 2, cols: 2, name: 'Four frames' },
  { size: '8.5x11', rows: 3, cols: 2, name: 'Six frames' },
  { size: '8.5x11', rows: 2, cols: 2, caption: true, name: 'Two + caption' },
  { size: '8.5x11', rows: 3, cols: 2, caption: true, name: 'Four + caption' },
  // (Dropped VARIETY 8.5×11 3×1 'Three stacked' / 'Two stacked + caption': their
  //  cells are ~2.3:1 letterboxes, log-distance 0.553 from the 4:3 they'd be tagged
  //  — 42% cover-crop on a matched photo, past MAX_CELL_RATIO_MISMATCH. Rejected by
  //  gridTemplate() regardless. Widen the 4:3 pool with cells that land near 4:3.)
];

/* ── CUSTOM explicit-region templates (any size) ─────────────────────────────
   For layouts the uniform grids can't express — e.g. a TEXT BOX beside the photo.
   Each photo region's true ratio = (w/h) × pageAspect, tagged to nearest
   phone-native; the 5mm gap + 2" floor apply just like the others. */
interface RegionSpec { x: number; y: number; w: number; h: number; }
interface CustomSpec {
  size: AlbumSizePreset;
  key: string;
  name: string;
  category: PageTemplate['category'];
  photos: RegionSpec[];
  texts: RegionSpec[];
}

function customTemplate(spec: CustomSpec): PageTemplate | null {
  const { size, key, name, category, photos, texts } = spec;
  const { w: iw, h: ih } = INCHES[size];
  const A = iw / ih;
  const safeWin = iw * (1 - MARGIN.left - MARGIN.right);
  const safeHin = ih * (1 - MARGIN.top - MARGIN.bottom);
  const { gx, gy } = gapFracs(safeWin, safeHin);

  const slots: TemplateSlot[] = [];
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    const b = inset(p.x, p.y, p.w, p.h, gx, gy);
    if (Math.min(b.w * safeWin, b.h * safeHin) < MIN_FRAME_INCHES) return null; // print floor
    slots.push({ id: `${key}-${size}-s${i}`, x: b.x, y: b.y, width: b.w, height: b.h, ratio: nearestRatio((p.w / p.h) * A) });
  }
  const textSlots: TextSlot[] = texts.map((t, i) => {
    const b = inset(t.x, t.y, t.w, t.h, gx, gy);
    return { id: i === 0 ? 'cap' : `cap${i}`, x: b.x, y: b.y, width: b.w, height: b.h, align: 'center', placeholder: 'Tap to add text' };
  });

  return {
    id: `tile-${key}-${size}`,
    name,
    category,
    slotCount: slots.length,
    margin: MARGIN,
    orientation: orientFor(A),
    targetRatio: slots[0]?.ratio ?? '1:1',
    albumSizes: [size],
    slots,
    textSlots,
  };
}

const CUSTOM_TEXT_SPECS: CustomSpec[] = [
  // 6×4 — text BESIDE the photo. A caption band below would force a panorama-wide
  // photo on this short (4") album, so the caption goes in a side column instead.
  { size: '6x4', key: 'portrait-capR', name: 'Portrait + caption', category: 'single',
    photos: [{ x: 0, y: 0, w: 0.5, h: 1 }], texts: [{ x: 0.5, y: 0, w: 0.5, h: 1 }] },
  { size: '6x4', key: 'portrait-capL', name: 'Caption + portrait', category: 'single',
    photos: [{ x: 0.5, y: 0, w: 0.5, h: 1 }], texts: [{ x: 0, y: 0, w: 0.5, h: 1 }] },
  { size: '6x4', key: 'square-capR', name: 'Square + caption', category: 'single',
    photos: [{ x: 0, y: 0, w: 0.62, h: 1 }], texts: [{ x: 0.62, y: 0, w: 0.38, h: 1 }] },
];

/** All generated tiled templates: square recipes + non-square grids + custom. */
export const TILED_TEMPLATES: PageTemplate[] = [
  ...SQUARE_SIZES.flatMap((size) =>
    SQUARE_RECIPES.map((r) => buildForSize(r, size, 'square')).filter((t): t is PageTemplate => t !== null)),
  ...GRID_SPECS.map(gridTemplate).filter((t): t is PageTemplate => t !== null),
  ...CUSTOM_TEXT_SPECS.map(customTemplate).filter((t): t is PageTemplate => t !== null),
];
