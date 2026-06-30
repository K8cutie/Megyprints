import type { PageTemplate, TemplateSlot, TemplateMargin, AlbumSizePreset } from './types';
import type { PhotoRatio } from './photoAnalyzer';
import { TILED_TEMPLATES } from './tiledTemplates';

/** ══════════════════════════════════════════════════════════════════════════
 *  87 SMART TEMPLATES — Ratio-locked, album-size-aware, phone-first
 *
 *  Every slot in every template produces the SAME standard photo aspect ratio.
 *  Templates are organized by: Album Size → Photo Count → Target Ratio
 *
 *  Phone-first: 4:3 templates are the most numerous (phone cameras are 4:3).
 *  ══════════════════════════════════════════════════════════════════════════ */

let slotCounter = 0;

const STD: TemplateMargin = { top: 0.04, bottom: 0.04, left: 0.04, right: 0.04 };

/** Canvas dimensions for ratio calculations */
const CANVAS_DIMS: Record<AlbumSizePreset, { w: number; h: number }> = {
  '6x4':    { w: 1800, h: 1200 },
  '6x6':    { w: 1800, h: 1800 },
  '8x8':    { w: 2400, h: 2400 },
  '9x9':    { w: 2700, h: 2700 },
  '11.5x8': { w: 3450, h: 2400 },
  '8.5x11': { w: 2550, h: 3300 },
};

/** Standard photo aspect ratios (width / height) */
const RATIOS: Record<PhotoRatio, number> = {
  '4:3':  4 / 3,   // 1.333  ← phone landscape (primary)
  '3:4':  3 / 4,   // 0.750  ← phone portrait (primary)
  '3:2':  3 / 2,   // 1.500  ← DSLR landscape
  '2:3':  2 / 3,   // 0.667  ← DSLR portrait
  '1:1':  1 / 1,   // 1.000  ← square
  '16:9': 16 / 9,  // 1.778  ← panoramic
  '9:16': 9 / 16,  // 0.563  ← portrait panoramic
};

/** Compute slot proportions for a target photo ratio on a specific album size.
 *
 *  The safe area has aspect ratio: safeW/safeH = canvasW/canvasH
 *  We want: (slotW * safeW) / (slotH * safeH) = targetRatio
 *  So: slotW/slotH = targetRatio / canvasRatio
 *
 *  fill='height' → slot fills full safe area height (slotH=1), slotW computed
 *  fill='width'  → slot fills full safe area width  (slotW=1), slotH computed
 */
function rs(
  x: number,
  y: number,
  targetRatio: PhotoRatio,
  albumSize: AlbumSizePreset,
  fill: 'height' | 'width',
  opts: Partial<Omit<TemplateSlot, 'id' | 'x' | 'y' | 'width' | 'height'>> = {},
): TemplateSlot {
  slotCounter += 1;
  const { w: cw, h: ch } = CANVAS_DIMS[albumSize];
  const canvasRatio = cw / ch;
  const t = RATIOS[targetRatio];

  // slotW/slotH = targetRatio / canvasRatio
  const proportionRatio = t / canvasRatio;

  let sw: number, sh: number;
  if (fill === 'height') {
    sh = 1.0;
    sw = Math.min(1.0, proportionRatio);
  } else {
    sw = 1.0;
    sh = Math.min(1.0, 1.0 / proportionRatio);
  }

  // Center the slot if it doesn't fill the full dimension
  const cx = x + (1.0 - sw) / 2;
  const cy = y + (1.0 - sh) / 2;

  return {
    id: `s${slotCounter}`,
    x: Math.round(cx * 10000) / 10000,
    y: Math.round(cy * 10000) / 10000,
    width: Math.round(sw * 10000) / 10000,
    height: Math.round(sh * 10000) / 10000,
    ratio: targetRatio,
    ...opts,
  };
}

/** Create a slot with exact targetRatio, constrained to fit within a bounding box.
 *  The slot is centered within the bounding box (x,y = top-left of bounding box).
 *  The slot's pixel ratio matches the target photo ratio exactly.
 *
 *  On non-square canvases, the intrinsic width/height ratio is adjusted by
 *  canvasRatio so the rendered pixel ratio equals targetRatio:
 *    intrinsicRatio = targetRatio / canvasRatio
 */
function rsBox(
  x: number,
  y: number,
  targetRatio: PhotoRatio,
  maxW: number,
  maxH: number,
  albumSize: AlbumSizePreset,
  opts: Partial<Omit<TemplateSlot, 'id' | 'x' | 'y' | 'width' | 'height'>> = {},
): TemplateSlot {
  slotCounter += 1;
  const t = RATIOS[targetRatio];
  const { w: cw, h: ch } = CANVAS_DIMS[albumSize];
  const canvasRatio = cw / ch;

  // The intrinsic ratio so that when rendered: (slotW/slotH) * canvasRatio = targetRatio
  const intrinsicRatio = t / canvasRatio;

  const hAtMaxW = maxW / intrinsicRatio;
  const wAtMaxH = maxH * intrinsicRatio;

  let width: number, height: number;
  if (hAtMaxW <= maxH) {
    width = maxW;
    height = hAtMaxW;
  } else {
    width = wAtMaxH;
    height = maxH;
  }

  // Center within the bounding box
  const cx = x + (maxW - width) / 2;
  const cy = y + (maxH - height) / 2;

  return {
    id: `s${slotCounter}`,
    x: Math.round(cx * 10000) / 10000,
    y: Math.round(cy * 10000) / 10000,
    width: Math.round(width * 10000) / 10000,
    height: Math.round(height * 10000) / 10000,
    ratio: targetRatio,
    ...opts,
  };
}

/** Create a slot with exact targetRatio, placed at the top-left of the bounding box.
 *  x,y = top-left corner of the slot itself; maxW,maxH = maximum dimensions.
 *  The slot is NOT centered — it sits at the top-left of the bounding box.
 *  Use for creative overlapping layouts where precise positioning matters. */
function rsBoxExact(
  x: number,
  y: number,
  targetRatio: PhotoRatio,
  maxW: number,
  maxH: number,
  albumSize: AlbumSizePreset,
  opts: Partial<Omit<TemplateSlot, 'id' | 'x' | 'y' | 'width' | 'height'>> = {},
): TemplateSlot {
  slotCounter += 1;
  const t = RATIOS[targetRatio];
  const { w: cw, h: ch } = CANVAS_DIMS[albumSize];
  const canvasRatio = cw / ch;
  const intrinsicRatio = t / canvasRatio;

  const hAtMaxW = maxW / intrinsicRatio;
  const wAtMaxH = maxH * intrinsicRatio;

  let width: number, height: number;
  if (hAtMaxW <= maxH) {
    width = maxW;
    height = hAtMaxW;
  } else {
    width = wAtMaxH;
    height = maxH;
  }

  return {
    id: `s${slotCounter}`,
    x: Math.round(x * 10000) / 10000,
    y: Math.round(y * 10000) / 10000,
    width: Math.round(width * 10000) / 10000,
    height: Math.round(height * 10000) / 10000,
    ratio: targetRatio,
    ...opts,
  };
}

/** Exact-fill slot: the photo fills the region [x,y,w,h] of the safe area edge to
 *  edge (object-cover, no centering). Use for tightly TILED templates — pick
 *  region shapes whose aspect ≈ the standard `ratio` so the matched photo fills
 *  with no whitespace and negligible crop. Coords are 0–1 of the safe area. */
function fill(
  x: number, y: number, width: number, height: number, ratio: PhotoRatio,
  opts: Partial<Omit<TemplateSlot, 'id' | 'x' | 'y' | 'width' | 'height'>> = {},
): TemplateSlot {
  slotCounter += 1;
  return { id: `s${slotCounter}`, x, y, width, height, ratio, ...opts };
}

/** Helper: create a template */
function tmpl(
  id: string, name: string, category: PageTemplate['category'],
  margin: TemplateMargin, orientation: PageTemplate['orientation'],
  targetRatio: PhotoRatio, albumSizes: AlbumSizePreset[],
  slots: TemplateSlot[],
): PageTemplate {
  return { id, name, category, slotCount: slots.length, margin, orientation, targetRatio, albumSizes, slots };
}

/* ══════════════════════════════════════════════════════════════════════════
   6×4″ LANDSCAPE TEMPLATES (6 total) — 1-2 photos
   ══════════════════════════════════════════════════════════════════════════ */

const S64 = '6x4' as AlbumSizePreset;

// ── 1-Photo (3) ──
const T6x4_01 = tmpl('t6x4-01', 'Full Page 4:3', 'single', STD, 'landscape', '4:3', [S64], [
  rs(0, 0, '4:3', S64, 'height'),
]);
const T6x4_02 = tmpl('t6x4-02', 'Full Page 3:2', 'single', STD, 'landscape', '3:2', [S64], [
  rs(0, 0, '3:2', S64, 'height'),
]);
const T6x4_03 = tmpl('t6x4-03', 'Full Page Portrait', 'single', STD, 'landscape', '3:4', [S64], [
  rs(0, 0, '3:4', S64, 'height'),
]);

// ── 2-Photo (3) ──
const T6x4_04 = tmpl('t6x4-04', 'Duo 4:3', 'duo', STD, 'landscape', '4:3', [S64], [
  rsBox(0, 0, '4:3', 0.485, 1.0, S64),
  rsBox(0.515, 0, '4:3', 0.485, 1.0, S64),
]);
const T6x4_05 = tmpl('t6x4-05', 'Duo 3:2', 'duo', STD, 'landscape', '3:2', [S64], [
  rsBox(0, 0, '3:2', 0.485, 1.0, S64),
  rsBox(0.515, 0, '3:2', 0.485, 1.0, S64),
]);
const T6x4_06 = tmpl('t6x4-06', 'Stacked Portrait', 'duo', STD, 'landscape', '3:4', [S64], [
  rsBox(0, 0, '3:4', 1.0, 0.485, S64),
  rsBox(0, 0.515, '3:4', 1.0, 0.485, S64),
]);

// ── 3-Photo NEW (varied-ratio with/without caption) ──
// 3-photo: three 3:2 photos across the top + bottom caption band
const T6x4_07: PageTemplate = {
  ...tmpl('t6x4-07', 'Trio Strip + Caption', 'trio', STD, 'landscape', '3:2', [S64], [
    rsBox(0, 0, '3:2', 0.313, 0.78, S64),
    rsBox(0.343, 0, '3:2', 0.313, 0.78, S64),
    rsBox(0.686, 0, '3:2', 0.313, 0.78, S64),
  ]),
  textSlots: [{ id: 'cap', x: 0, y: 0.82, width: 1, height: 0.18, align: 'center', placeholder: 'Tap to add text' }],
};
// 3-photo: 4:3 hero left + two stacked 4:3 right (no caption — variety)
const T6x4_08 = tmpl('t6x4-08', 'Hero + Pair 4:3', 'trio', STD, 'landscape', '4:3', [S64], [
  rsBox(0, 0, '4:3', 0.63, 1.0, S64),
  rsBox(0.66, 0, '4:3', 0.34, 0.485, S64),
  rsBox(0.66, 0.515, '4:3', 0.34, 0.485, S64),
]);

/* ══════════════════════════════════════════════════════════════════════════
   6×6″ SQUARE TEMPLATES (19 total) — Ratio-matched, creative layouts
   ══════════════════════════════════════════════════════════════════════════ */

const S66 = '6x6' as AlbumSizePreset;

// ── 1-Photo (3) ──
const T6x6_01 = tmpl('t6x6-01', 'Full Page Square', 'single', STD, 'square', '1:1', [S66], [
  rsBox(0, 0, '1:1', 1.0, 1.0, S66),
]);
const T6x6_02 = tmpl('t6x6-02', 'Centered 4:3 Landscape', 'single', STD, 'square', '4:3', [S66], [
  rsBox(0, 0, '4:3', 1.0, 1.0, S66),
]);
const T6x6_03 = tmpl('t6x6-03', 'Centered 3:4 Portrait', 'single', STD, 'square', '3:4', [S66], [
  rsBox(0, 0, '3:4', 1.0, 1.0, S66),
]);

// ── 2-Photo (3 uniform + 2 creative) ──
const T6x6_04 = tmpl('t6x6-04', 'Duo Square', 'duo', STD, 'square', '1:1', [S66], [
  rsBox(0, 0, '1:1', 0.485, 1.0, S66),
  rsBox(0.515, 0, '1:1', 0.485, 1.0, S66),
]);
const T6x6_05 = tmpl('t6x6-05', 'Stacked 4:3', 'duo', STD, 'square', '4:3', [S66], [
  rsBox(0, 0, '4:3', 1.0, 0.485, S66),
  rsBox(0, 0.515, '4:3', 1.0, 0.485, S66),
]);
const T6x6_06 = tmpl('t6x6-06', 'Duo Portrait', 'duo', STD, 'square', '3:4', [S66], [
  rsBox(0, 0, '3:4', 0.485, 1.0, S66),
  rsBox(0.515, 0, '3:4', 0.485, 1.0, S66),
]);
const T6x6_07 = tmpl('t6x6-07', 'Overlap', 'duo', STD, 'square', '1:1', [S66], [
  rsBoxExact(0, 0, '1:1', 0.70, 0.70, S66),
  rsBoxExact(0.55, 0.55, '1:1', 0.35, 0.35, S66, { rotation: 15 }),
]);
const T6x6_08 = tmpl('t6x6-08', 'Golden Split', 'duo', STD, 'square', '1:1', [S66], [
  rsBox(0, 0, '1:1', 0.62, 0.62, S66),
  rsBox(0.64, 0, '3:4', 0.36, 1.0, S66),
]);

// ── 3-Photo (3 uniform + 3 creative) ──
const T6x6_09 = tmpl('t6x6-09', 'Triptych Landscape', 'trio', STD, 'square', '4:3', [S66], [
  rsBox(0, 0, '4:3', 1.0, 0.313, S66),
  rsBox(0, 0.343, '4:3', 1.0, 0.313, S66),
  rsBox(0, 0.686, '4:3', 1.0, 0.313, S66),
]);
const T6x6_10 = tmpl('t6x6-10', 'Triptych Portrait', 'trio', STD, 'square', '3:4', [S66], [
  rsBox(0, 0, '3:4', 0.313, 1.0, S66),
  rsBox(0.343, 0, '3:4', 0.313, 1.0, S66),
  rsBox(0.686, 0, '3:4', 0.313, 1.0, S66),
]);
const T6x6_11 = tmpl('t6x6-11', 'Hero Left', 'trio', STD, 'square', '1:1', [S66], [
  rsBox(0, 0, '1:1', 0.60, 1.0, S66),
  rsBox(0.625, 0, '1:1', 0.375, 0.485, S66),
  rsBox(0.625, 0.515, '1:1', 0.375, 0.485, S66),
]);
const T6x6_12 = tmpl('t6x6-12', 'Hero Top', 'trio', STD, 'square', '1:1', [S66], [
  rsBox(0, 0, '1:1', 1.0, 0.60, S66),
  rsBox(0, 0.625, '1:1', 0.485, 0.375, S66),
  rsBox(0.515, 0.625, '1:1', 0.485, 0.375, S66),
]);
const T6x6_13 = tmpl('t6x6-13', 'Cascade', 'trio', STD, 'square', '1:1', [S66], [
  rsBox(0, 0, '3:4', 0.40, 1.0, S66),
  rsBox(0.44, 0, '4:3', 0.56, 0.48, S66),
  rsBox(0.44, 0.52, '4:3', 0.56, 0.48, S66),
]);

// ── 4-Photo (3 uniform + 2 creative) ──
const T6x6_14 = tmpl('t6x6-14', 'Grid 2×2 Square', 'quad', STD, 'square', '1:1', [S66], [
  rsBox(0, 0, '1:1', 0.485, 0.485, S66),
  rsBox(0.515, 0, '1:1', 0.485, 0.485, S66),
  rsBox(0, 0.515, '1:1', 0.485, 0.485, S66),
  rsBox(0.515, 0.515, '1:1', 0.485, 0.485, S66),
]);
const T6x6_15 = tmpl('t6x6-15', 'Grid 2×2 4:3', 'quad', STD, 'square', '4:3', [S66], [
  rsBox(0, 0, '4:3', 0.485, 0.485, S66),
  rsBox(0.515, 0, '4:3', 0.485, 0.485, S66),
  rsBox(0, 0.515, '4:3', 0.485, 0.485, S66),
  rsBox(0.515, 0.515, '4:3', 0.485, 0.485, S66),
]);
const T6x6_16 = tmpl('t6x6-16', 'Grid 2×2 3:4', 'quad', STD, 'square', '3:4', [S66], [
  rsBox(0, 0, '3:4', 0.485, 0.485, S66),
  rsBox(0.515, 0, '3:4', 0.485, 0.485, S66),
  rsBox(0, 0.515, '3:4', 0.485, 0.485, S66),
  rsBox(0.515, 0.515, '3:4', 0.485, 0.485, S66),
]);
const T6x6_17 = tmpl('t6x6-17', 'Mosaic', 'quad', STD, 'square', '1:1', [S66], [
  rsBox(0, 0, '1:1', 0.62, 0.62, S66),
  rsBox(0.64, 0, '1:1', 0.36, 0.30, S66),
  rsBox(0.64, 0.32, '1:1', 0.36, 0.30, S66),
  rsBox(0, 0.64, '1:1', 0.62, 0.36, S66),
]);
const T6x6_18 = tmpl('t6x6-18', 'Circle Hero', 'duo', STD, 'square', '1:1', [S66], [
  rsBox(0.20, 0.20, '1:1', 0.60, 0.60, S66, { shape: 'circle' }),
  rsBox(0.65, 0.65, '1:1', 0.35, 0.35, S66),
]);

// ── 5-Photo (1 creative) ──
const T6x6_19 = tmpl('t6x6-19', 'Windowpane', 'quint', STD, 'square', '1:1', [S66], [
  rsBox(0, 0, '1:1', 0.485, 0.485, S66),
  rsBox(0.515, 0, '1:1', 0.485, 0.485, S66),
  rsBox(0, 0.515, '1:1', 0.485, 0.485, S66),
  rsBox(0.515, 0.515, '1:1', 0.485, 0.485, S66),
  rsBox(0.2575, 0.2575, '1:1', 0.485, 0.485, S66, { shape: 'circle' }),
]);

/* ══════════════════════════════════════════════════════════════════════════
   11.5×8″ LANDSCAPE TEMPLATES (12 total) — 1-5 photos
   ══════════════════════════════════════════════════════════════════════════ */

const S1158 = '11.5x8' as AlbumSizePreset;

// ── 1-Photo (2) ──
const T1158_01 = tmpl('t1158-01', 'Full 4:3', 'single', STD, 'landscape', '4:3', [S1158], [
  rs(0, 0, '4:3', S1158, 'height'),
]);
const T1158_02 = tmpl('t1158-02', 'Full 3:2', 'single', STD, 'landscape', '3:2', [S1158], [
  rs(0, 0, '3:2', S1158, 'height'),
]);

// ── 2-Photo (2) ──
const T1158_03 = tmpl('t1158-03', 'Duo 4:3', 'duo', STD, 'landscape', '4:3', [S1158], [
  rsBox(0, 0, '4:3', 0.485, 1.0, S1158),
  rsBox(0.515, 0, '4:3', 0.485, 1.0, S1158),
]);
const T1158_04 = tmpl('t1158-04', 'Duo 3:2', 'duo', STD, 'landscape', '3:2', [S1158], [
  rsBox(0, 0, '3:2', 0.485, 1.0, S1158),
  rsBox(0.515, 0, '3:2', 0.485, 1.0, S1158),
]);

// ── 3-Photo (3) ──
const T1158_05 = tmpl('t1158-05', 'Hero Left + Stack 4:3', 'trio', STD, 'landscape', '4:3', [S1158], [
  rsBox(0, 0, '4:3', 0.63, 1.0, S1158),
  rsBox(0.66, 0, '4:3', 0.34, 0.485, S1158),
  rsBox(0.66, 0.515, '4:3', 0.34, 0.485, S1158),
]);
const T1158_06 = tmpl('t1158-06', 'Wide Hero + Pair 4:3', 'trio', STD, 'landscape', '4:3', [S1158], [
  rsBox(0, 0, '4:3', 1.0, 0.63, S1158),
  rsBox(0, 0.66, '4:3', 0.485, 0.34, S1158),
  rsBox(0.515, 0.66, '4:3', 0.485, 0.34, S1158),
]);
const T1158_07 = tmpl('t1158-07', 'Triple 4:3', 'trio', STD, 'landscape', '4:3', [S1158], [
  rsBox(0, 0, '4:3', 0.313, 1.0, S1158),
  rsBox(0.343, 0, '4:3', 0.313, 1.0, S1158),
  rsBox(0.686, 0, '4:3', 0.313, 1.0, S1158),
]);

// ── 4-Photo (3) ──
const T1158_08 = tmpl('t1158-08', 'Grid 2×2 4:3', 'quad', STD, 'landscape', '4:3', [S1158], [
  rsBox(0, 0, '4:3', 0.485, 0.485, S1158),
  rsBox(0.515, 0, '4:3', 0.485, 0.485, S1158),
  rsBox(0, 0.515, '4:3', 0.485, 0.485, S1158),
  rsBox(0.515, 0.515, '4:3', 0.485, 0.485, S1158),
]);
const T1158_09 = tmpl('t1158-09', 'Hero + Trio 4:3', 'quad', STD, 'landscape', '4:3', [S1158], [
  rsBox(0, 0, '4:3', 0.63, 0.63, S1158),
  rsBox(0.66, 0, '4:3', 0.34, 0.313, S1158),
  rsBox(0.66, 0.343, '4:3', 0.34, 0.313, S1158),
  rsBox(0, 0.66, '4:3', 1.0, 0.34, S1158),
]);
const T1158_10 = tmpl('t1158-10', '2 Top + 2 Bottom 4:3', 'quad', STD, 'landscape', '4:3', [S1158], [
  rsBox(0, 0, '4:3', 0.485, 0.485, S1158),
  rsBox(0.515, 0, '4:3', 0.485, 0.485, S1158),
  rsBox(0, 0.515, '4:3', 0.485, 0.485, S1158),
  rsBox(0.515, 0.515, '4:3', 0.485, 0.485, S1158),
]);

// ── 5-Photo (2) ──
const T1158_11 = tmpl('t1158-11', '3 Top + 2 Bottom 4:3', 'quint', STD, 'landscape', '4:3', [S1158], [
  rsBox(0, 0, '4:3', 0.313, 0.46, S1158),
  rsBox(0.343, 0, '4:3', 0.313, 0.46, S1158),
  rsBox(0.686, 0, '4:3', 0.313, 0.46, S1158),
  rsBox(0, 0.49, '4:3', 0.485, 0.51, S1158),
  rsBox(0.515, 0.49, '4:3', 0.485, 0.51, S1158),
]);
const T1158_12 = tmpl('t1158-12', '2 Left + 3 Right 4:3', 'quint', STD, 'landscape', '4:3', [S1158], [
  rsBox(0, 0, '4:3', 0.485, 0.485, S1158),
  rsBox(0, 0.515, '4:3', 0.485, 0.485, S1158),
  rsBox(0.515, 0, '4:3', 0.485, 0.313, S1158),
  rsBox(0.515, 0.343, '4:3', 0.485, 0.313, S1158),
  rsBox(0.515, 0.686, '4:3', 0.485, 0.313, S1158),
]);

// ── NEW: varied-ratio 3/4/5-photo (3) ──
// 3-photo: pano 16:9 band on top + pair of 3:2 below
const T1158_13 = tmpl('t1158-13', 'Pano Top + Pair 3:2', 'trio', STD, 'landscape', '16:9', [S1158], [
  rsBox(0, 0, '16:9', 1.0, 0.55, S1158),
  rsBox(0, 0.58, '3:2', 0.485, 0.42, S1158),
  rsBox(0.515, 0.58, '3:2', 0.485, 0.42, S1158),
]);
// 4-photo: 3:2 hero right + stack of three 4:3 left
const T1158_14 = tmpl('t1158-14', 'Hero Right + Stack 4:3', 'quad', STD, 'landscape', '3:2', [S1158], [
  rsBox(0.37, 0, '3:2', 0.63, 1.0, S1158),
  rsBox(0, 0, '4:3', 0.34, 0.313, S1158),
  rsBox(0, 0.343, '4:3', 0.34, 0.313, S1158),
  rsBox(0, 0.686, '4:3', 0.34, 0.313, S1158),
]);
// 5-photo: filmstrip of five 3:2 columns
const T1158_15 = tmpl('t1158-15', 'Filmstrip Five 3:2', 'quint', STD, 'landscape', '3:2', [S1158], [
  rsBox(0, 0, '3:2', 0.188, 1.0, S1158),
  rsBox(0.203, 0, '3:2', 0.188, 1.0, S1158),
  rsBox(0.406, 0, '3:2', 0.188, 1.0, S1158),
  rsBox(0.609, 0, '3:2', 0.188, 1.0, S1158),
  rsBox(0.812, 0, '3:2', 0.188, 1.0, S1158),
]);
// 3-photo: three 4:3 stacked in the left two-thirds + side caption column on the right
const T1158_16: PageTemplate = {
  ...tmpl('t1158-16', 'Trio + Side Caption', 'trio', STD, 'landscape', '4:3', [S1158], [
    rsBox(0, 0, '4:3', 0.64, 0.31, S1158),
    rsBox(0, 0.345, '4:3', 0.64, 0.31, S1158),
    rsBox(0, 0.69, '4:3', 0.64, 0.31, S1158),
  ]),
  textSlots: [{ id: 'cap', x: 0.7, y: 0, width: 0.3, height: 1, align: 'center', placeholder: 'Tap to add text' }],
};

/* ══════════════════════════════════════════════════════════════════════════
   8.5×11″ PORTRAIT TEMPLATES (12 total) — 1-5 photos
   ══════════════════════════════════════════════════════════════════════════ */

const S8511 = '8.5x11' as AlbumSizePreset;

// ── 1-Photo (2) ──
const T8511_01 = tmpl('t8511-01', 'Full Portrait', 'single', STD, 'portrait', '3:4', [S8511], [
  rs(0, 0, '3:4', S8511, 'width'),
]);
const T8511_02 = tmpl('t8511-02', 'Full 4:3', 'single', STD, 'portrait', '4:3', [S8511], [
  rs(0, 0, '4:3', S8511, 'width'),
]);

// ── 2-Photo (2) ──
const T8511_03 = tmpl('t8511-03', 'Stacked Portrait', 'duo', STD, 'portrait', '3:4', [S8511], [
  rsBox(0, 0, '3:4', 1.0, 0.485, S8511),
  rsBox(0, 0.515, '3:4', 1.0, 0.485, S8511),
]);
const T8511_04 = tmpl('t8511-04', 'Stacked 4:3', 'duo', STD, 'portrait', '4:3', [S8511], [
  rsBox(0, 0, '4:3', 1.0, 0.485, S8511),
  rsBox(0, 0.515, '4:3', 1.0, 0.485, S8511),
]);

// ── 3-Photo (3) ──
const T8511_05 = tmpl('t8511-05', 'Hero + Pair Portrait', 'trio', STD, 'portrait', '3:4', [S8511], [
  rsBox(0, 0, '3:4', 1.0, 0.63, S8511),
  rsBox(0, 0.66, '3:4', 0.485, 0.34, S8511),
  rsBox(0.515, 0.66, '3:4', 0.485, 0.34, S8511),
]);
const T8511_06 = tmpl('t8511-06', 'Pair + Hero Portrait', 'trio', STD, 'portrait', '3:4', [S8511], [
  rsBox(0, 0, '3:4', 0.485, 0.485, S8511),
  rsBox(0.515, 0, '3:4', 0.485, 0.485, S8511),
  rsBox(0, 0.515, '3:4', 1.0, 0.485, S8511),
]);
const T8511_07 = tmpl('t8511-07', 'Triple Portrait', 'trio', STD, 'portrait', '3:4', [S8511], [
  rsBox(0, 0, '3:4', 1.0, 0.313, S8511),
  rsBox(0, 0.343, '3:4', 1.0, 0.313, S8511),
  rsBox(0, 0.686, '3:4', 1.0, 0.313, S8511),
]);

// ── 4-Photo (3) ──
const T8511_08 = tmpl('t8511-08', 'Grid 2×2 Portrait', 'quad', STD, 'portrait', '3:4', [S8511], [
  rsBox(0, 0, '3:4', 0.485, 0.485, S8511),
  rsBox(0.515, 0, '3:4', 0.485, 0.485, S8511),
  rsBox(0, 0.515, '3:4', 0.485, 0.485, S8511),
  rsBox(0.515, 0.515, '3:4', 0.485, 0.485, S8511),
]);
const T8511_09 = tmpl('t8511-09', 'Hero + Trio Portrait', 'quad', STD, 'portrait', '3:4', [S8511], [
  rsBox(0, 0, '3:4', 0.63, 0.63, S8511),
  rsBox(0.66, 0, '3:4', 0.34, 0.313, S8511),
  rsBox(0.66, 0.343, '3:4', 0.34, 0.313, S8511),
  rsBox(0, 0.66, '3:4', 1.0, 0.34, S8511),
]);
const T8511_10 = tmpl('t8511-10', '2 Top + 2 Bottom Portrait', 'quad', STD, 'portrait', '3:4', [S8511], [
  rsBox(0, 0, '3:4', 0.485, 0.485, S8511),
  rsBox(0.515, 0, '3:4', 0.485, 0.485, S8511),
  rsBox(0, 0.515, '3:4', 0.485, 0.485, S8511),
  rsBox(0.515, 0.515, '3:4', 0.485, 0.485, S8511),
]);

// ── 5-Photo (2) ──
const T8511_11 = tmpl('t8511-11', '2 Top + 3 Bottom Portrait', 'quint', STD, 'portrait', '3:4', [S8511], [
  rsBox(0, 0, '3:4', 0.485, 0.46, S8511),
  rsBox(0.515, 0, '3:4', 0.485, 0.46, S8511),
  rsBox(0, 0.49, '3:4', 0.313, 0.51, S8511),
  rsBox(0.343, 0.49, '3:4', 0.313, 0.51, S8511),
  rsBox(0.686, 0.49, '3:4', 0.313, 0.51, S8511),
]);
const T8511_12 = tmpl('t8511-12', '3 Left + 2 Right Portrait', 'quint', STD, 'portrait', '3:4', [S8511], [
  rsBox(0, 0, '3:4', 0.313, 0.485, S8511),
  rsBox(0, 0.515, '3:4', 0.313, 0.485, S8511),
  rsBox(0.343, 0, '3:4', 0.313, 0.485, S8511),
  rsBox(0.343, 0.515, '3:4', 0.313, 0.485, S8511),
  rsBox(0.686, 0, '3:4', 0.313, 1.0, S8511),
]);

// ── Increment 5: Portrait varied-ratio additions ──
// Pano Sandwich (quad): wide 16:9 top + two 3:4 mid + wide 16:9 bottom
const T8511_13 = tmpl('t8511-13', 'Pano Sandwich Portrait', 'quad', STD, 'portrait', '16:9', [S8511], [
  rsBox(0, 0, '16:9', 1.0, 0.30, S8511),
  rsBox(0, 0.33, '3:4', 0.485, 0.34, S8511),
  rsBox(0.515, 0.33, '3:4', 0.485, 0.34, S8511),
  rsBox(0, 0.69, '16:9', 1.0, 0.31, S8511),
]);
// Tall Column Trio 9:16 (trio): three full-height portrait columns + caption band
const T8511_14: PageTemplate = {
  ...tmpl('t8511-14', 'Tall Column Trio 9:16', 'trio', STD, 'portrait', '9:16', [S8511], [
    rsBox(0, 0, '9:16', 0.313, 0.85, S8511),
    rsBox(0.343, 0, '9:16', 0.313, 0.85, S8511),
    rsBox(0.686, 0, '9:16', 0.313, 0.85, S8511),
  ]),
  textSlots: [{ id: 'cap', x: 0, y: 0.87, width: 1, height: 0.13, align: 'center', placeholder: 'Tap to add text' }],
};
// Portrait Five 2:3 (quint): two on top + three on bottom
const T8511_15 = tmpl('t8511-15', 'Portrait Five 2:3', 'quint', STD, 'portrait', '2:3', [S8511], [
  rsBox(0, 0, '2:3', 0.485, 0.46, S8511),
  rsBox(0.515, 0, '2:3', 0.485, 0.46, S8511),
  rsBox(0, 0.49, '2:3', 0.313, 0.51, S8511),
  rsBox(0.343, 0.49, '2:3', 0.313, 0.51, S8511),
  rsBox(0.686, 0.49, '2:3', 0.313, 0.51, S8511),
]);

// ── Increment 6: portrait + square caption layouts ──
// Stack + Bottom Caption (quad): 2×2 grid of 3:4 in the upper region + caption band.
const T8511_16: PageTemplate = {
  ...tmpl('t8511-16', 'Stack + Bottom Caption', 'quad', STD, 'portrait', '3:4', [S8511], [
    rsBox(0, 0, '3:4', 0.485, 0.40, S8511),
    rsBox(0.515, 0, '3:4', 0.485, 0.40, S8511),
    rsBox(0, 0.42, '3:4', 0.485, 0.40, S8511),
    rsBox(0.515, 0.42, '3:4', 0.485, 0.40, S8511),
  ]),
  textSlots: [{ id: 'cap', x: 0, y: 0.85, width: 1, height: 0.15, align: 'center', placeholder: 'Tap to add text' }],
};
// Hero + Side Caption Portrait (trio): two 3:4 across the top + one 3:4 bottom-left + side caption column.
const T8511_17: PageTemplate = {
  ...tmpl('t8511-17', 'Hero + Side Caption Portrait', 'trio', STD, 'portrait', '3:4', [S8511], [
    rsBox(0, 0, '3:4', 0.485, 0.55, S8511),
    rsBox(0.515, 0, '3:4', 0.485, 0.55, S8511),
    rsBox(0, 0.58, '3:4', 0.46, 0.42, S8511),
  ]),
  textSlots: [{ id: 'cap', x: 0.5, y: 0.58, width: 0.5, height: 0.42, align: 'center', placeholder: 'Tap to add text' }],
};

/* ══════════════════════════════════════════════════════════════════════════
   8×8″ SQUARE TEMPLATES (19 total) — Ratio-matched, creative layouts
   ══════════════════════════════════════════════════════════════════════════ */

const S88 = '8x8' as AlbumSizePreset;

// ── 1-Photo (3) ──
const T8x8_01 = tmpl('t8x8-01', 'Full Page Square', 'single', STD, 'square', '1:1', [S88], [
  rsBox(0, 0, '1:1', 1.0, 1.0, S88),
]);
const T8x8_02 = tmpl('t8x8-02', 'Centered 4:3 Landscape', 'single', STD, 'square', '4:3', [S88], [
  rsBox(0, 0, '4:3', 1.0, 1.0, S88),
]);
const T8x8_03 = tmpl('t8x8-03', 'Centered 3:4 Portrait', 'single', STD, 'square', '3:4', [S88], [
  rsBox(0, 0, '3:4', 1.0, 1.0, S88),
]);

// ── 2-Photo (3 uniform + 2 creative) ──
const T8x8_04 = tmpl('t8x8-04', 'Duo Square', 'duo', STD, 'square', '1:1', [S88], [
  rsBox(0, 0, '1:1', 0.485, 1.0, S88),
  rsBox(0.515, 0, '1:1', 0.485, 1.0, S88),
]);
const T8x8_05 = tmpl('t8x8-05', 'Stacked 4:3', 'duo', STD, 'square', '4:3', [S88], [
  rsBox(0, 0, '4:3', 1.0, 0.485, S88),
  rsBox(0, 0.515, '4:3', 1.0, 0.485, S88),
]);
const T8x8_06 = tmpl('t8x8-06', 'Duo Portrait', 'duo', STD, 'square', '3:4', [S88], [
  rsBox(0, 0, '3:4', 0.485, 1.0, S88),
  rsBox(0.515, 0, '3:4', 0.485, 1.0, S88),
]);
const T8x8_07 = tmpl('t8x8-07', 'Overlap', 'duo', STD, 'square', '1:1', [S88], [
  rsBoxExact(0, 0, '1:1', 0.70, 0.70, S88),
  rsBoxExact(0.55, 0.55, '1:1', 0.35, 0.35, S88, { rotation: 15 }),
]);
const T8x8_08 = tmpl('t8x8-08', 'Golden Split', 'duo', STD, 'square', '1:1', [S88], [
  rsBox(0, 0, '1:1', 0.62, 0.62, S88),
  rsBox(0.64, 0, '3:4', 0.36, 1.0, S88),
]);

// ── 3-Photo (3 uniform + 3 creative) ──
const T8x8_09 = tmpl('t8x8-09', 'Triptych Landscape', 'trio', STD, 'square', '4:3', [S88], [
  rsBox(0, 0, '4:3', 1.0, 0.313, S88),
  rsBox(0, 0.343, '4:3', 1.0, 0.313, S88),
  rsBox(0, 0.686, '4:3', 1.0, 0.313, S88),
]);
const T8x8_10 = tmpl('t8x8-10', 'Triptych Portrait', 'trio', STD, 'square', '3:4', [S88], [
  rsBox(0, 0, '3:4', 0.313, 1.0, S88),
  rsBox(0.343, 0, '3:4', 0.313, 1.0, S88),
  rsBox(0.686, 0, '3:4', 0.313, 1.0, S88),
]);
const T8x8_11 = tmpl('t8x8-11', 'Hero Left', 'trio', STD, 'square', '1:1', [S88], [
  rsBox(0, 0, '1:1', 0.60, 1.0, S88),
  rsBox(0.625, 0, '1:1', 0.375, 0.485, S88),
  rsBox(0.625, 0.515, '1:1', 0.375, 0.485, S88),
]);
const T8x8_12 = tmpl('t8x8-12', 'Hero Top', 'trio', STD, 'square', '1:1', [S88], [
  rsBox(0, 0, '1:1', 1.0, 0.60, S88),
  rsBox(0, 0.625, '1:1', 0.485, 0.375, S88),
  rsBox(0.515, 0.625, '1:1', 0.485, 0.375, S88),
]);
const T8x8_13 = tmpl('t8x8-13', 'Cascade', 'trio', STD, 'square', '1:1', [S88], [
  rsBox(0, 0, '3:4', 0.40, 1.0, S88),
  rsBox(0.44, 0, '4:3', 0.56, 0.48, S88),
  rsBox(0.44, 0.52, '4:3', 0.56, 0.48, S88),
]);

// ── 4-Photo (3 uniform + 2 creative) ──
const T8x8_14 = tmpl('t8x8-14', 'Grid 2×2 Square', 'quad', STD, 'square', '1:1', [S88], [
  rsBox(0, 0, '1:1', 0.485, 0.485, S88),
  rsBox(0.515, 0, '1:1', 0.485, 0.485, S88),
  rsBox(0, 0.515, '1:1', 0.485, 0.485, S88),
  rsBox(0.515, 0.515, '1:1', 0.485, 0.485, S88),
]);
const T8x8_15 = tmpl('t8x8-15', 'Grid 2×2 4:3', 'quad', STD, 'square', '4:3', [S88], [
  rsBox(0, 0, '4:3', 0.485, 0.485, S88),
  rsBox(0.515, 0, '4:3', 0.485, 0.485, S88),
  rsBox(0, 0.515, '4:3', 0.485, 0.485, S88),
  rsBox(0.515, 0.515, '4:3', 0.485, 0.485, S88),
]);
const T8x8_16 = tmpl('t8x8-16', 'Grid 2×2 3:4', 'quad', STD, 'square', '3:4', [S88], [
  rsBox(0, 0, '3:4', 0.485, 0.485, S88),
  rsBox(0.515, 0, '3:4', 0.485, 0.485, S88),
  rsBox(0, 0.515, '3:4', 0.485, 0.485, S88),
  rsBox(0.515, 0.515, '3:4', 0.485, 0.485, S88),
]);
const T8x8_17 = tmpl('t8x8-17', 'Mosaic', 'quad', STD, 'square', '1:1', [S88], [
  rsBox(0, 0, '1:1', 0.62, 0.62, S88),
  rsBox(0.64, 0, '1:1', 0.36, 0.30, S88),
  rsBox(0.64, 0.32, '1:1', 0.36, 0.30, S88),
  rsBox(0, 0.64, '1:1', 0.62, 0.36, S88),
]);
const T8x8_18 = tmpl('t8x8-18', 'Circle Hero', 'duo', STD, 'square', '1:1', [S88], [
  rsBox(0.20, 0.20, '1:1', 0.60, 0.60, S88, { shape: 'circle' }),
  rsBox(0.65, 0.65, '1:1', 0.35, 0.35, S88),
]);

// ── 5-Photo (1 creative) ──
const T8x8_19 = tmpl('t8x8-19', 'Windowpane', 'quint', STD, 'square', '1:1', [S88], [
  rsBox(0, 0, '1:1', 0.485, 0.485, S88),
  rsBox(0.515, 0, '1:1', 0.485, 0.485, S88),
  rsBox(0, 0.515, '1:1', 0.485, 0.485, S88),
  rsBox(0.515, 0.515, '1:1', 0.485, 0.485, S88),
  rsBox(0.2575, 0.2575, '1:1', 0.485, 0.485, S88, { shape: 'circle' }),
]);

/* ══════════════════════════════════════════════════════════════════════════
   9×9″ SQUARE TEMPLATES (19 total) — Ratio-matched, creative layouts
   ══════════════════════════════════════════════════════════════════════════ */

const S99 = '9x9' as AlbumSizePreset;

// ── 1-Photo (3) ──
const T9x9_01 = tmpl('t9x9-01', 'Full Page Square', 'single', STD, 'square', '1:1', [S99], [
  rsBox(0, 0, '1:1', 1.0, 1.0, S99),
]);
const T9x9_02 = tmpl('t9x9-02', 'Centered 4:3 Landscape', 'single', STD, 'square', '4:3', [S99], [
  rsBox(0, 0, '4:3', 1.0, 1.0, S99),
]);
const T9x9_03 = tmpl('t9x9-03', 'Centered 3:4 Portrait', 'single', STD, 'square', '3:4', [S99], [
  rsBox(0, 0, '3:4', 1.0, 1.0, S99),
]);

// ── 2-Photo (3 uniform + 2 creative) ──
const T9x9_04 = tmpl('t9x9-04', 'Duo Square', 'duo', STD, 'square', '1:1', [S99], [
  rsBox(0, 0, '1:1', 0.485, 1.0, S99),
  rsBox(0.515, 0, '1:1', 0.485, 1.0, S99),
]);
const T9x9_05 = tmpl('t9x9-05', 'Stacked 4:3', 'duo', STD, 'square', '4:3', [S99], [
  rsBox(0, 0, '4:3', 1.0, 0.485, S99),
  rsBox(0, 0.515, '4:3', 1.0, 0.485, S99),
]);
const T9x9_06 = tmpl('t9x9-06', 'Duo Portrait', 'duo', STD, 'square', '3:4', [S99], [
  rsBox(0, 0, '3:4', 0.485, 1.0, S99),
  rsBox(0.515, 0, '3:4', 0.485, 1.0, S99),
]);
const T9x9_07 = tmpl('t9x9-07', 'Overlap', 'duo', STD, 'square', '1:1', [S99], [
  rsBoxExact(0, 0, '1:1', 0.70, 0.70, S99),
  rsBoxExact(0.55, 0.55, '1:1', 0.35, 0.35, S99, { rotation: 15 }),
]);
const T9x9_08 = tmpl('t9x9-08', 'Golden Split', 'duo', STD, 'square', '1:1', [S99], [
  rsBox(0, 0, '1:1', 0.62, 0.62, S99),
  rsBox(0.64, 0, '3:4', 0.36, 1.0, S99),
]);

// ── 3-Photo (3 uniform + 3 creative) ──
const T9x9_09 = tmpl('t9x9-09', 'Triptych Landscape', 'trio', STD, 'square', '4:3', [S99], [
  rsBox(0, 0, '4:3', 1.0, 0.313, S99),
  rsBox(0, 0.343, '4:3', 1.0, 0.313, S99),
  rsBox(0, 0.686, '4:3', 1.0, 0.313, S99),
]);
const T9x9_10 = tmpl('t9x9-10', 'Triptych Portrait', 'trio', STD, 'square', '3:4', [S99], [
  rsBox(0, 0, '3:4', 0.313, 1.0, S99),
  rsBox(0.343, 0, '3:4', 0.313, 1.0, S99),
  rsBox(0.686, 0, '3:4', 0.313, 1.0, S99),
]);
const T9x9_11 = tmpl('t9x9-11', 'Hero Left', 'trio', STD, 'square', '1:1', [S99], [
  rsBox(0, 0, '1:1', 0.60, 1.0, S99),
  rsBox(0.625, 0, '1:1', 0.375, 0.485, S99),
  rsBox(0.625, 0.515, '1:1', 0.375, 0.485, S99),
]);
const T9x9_12 = tmpl('t9x9-12', 'Hero Top', 'trio', STD, 'square', '1:1', [S99], [
  rsBox(0, 0, '1:1', 1.0, 0.60, S99),
  rsBox(0, 0.625, '1:1', 0.485, 0.375, S99),
  rsBox(0.515, 0.625, '1:1', 0.485, 0.375, S99),
]);
const T9x9_13 = tmpl('t9x9-13', 'Cascade', 'trio', STD, 'square', '1:1', [S99], [
  rsBox(0, 0, '3:4', 0.40, 1.0, S99),
  rsBox(0.44, 0, '4:3', 0.56, 0.48, S99),
  rsBox(0.44, 0.52, '4:3', 0.56, 0.48, S99),
]);

// ── 4-Photo (3 uniform + 2 creative) ──
const T9x9_14 = tmpl('t9x9-14', 'Grid 2×2 Square', 'quad', STD, 'square', '1:1', [S99], [
  rsBox(0, 0, '1:1', 0.485, 0.485, S99),
  rsBox(0.515, 0, '1:1', 0.485, 0.485, S99),
  rsBox(0, 0.515, '1:1', 0.485, 0.485, S99),
  rsBox(0.515, 0.515, '1:1', 0.485, 0.485, S99),
]);
const T9x9_15 = tmpl('t9x9-15', 'Grid 2×2 4:3', 'quad', STD, 'square', '4:3', [S99], [
  rsBox(0, 0, '4:3', 0.485, 0.485, S99),
  rsBox(0.515, 0, '4:3', 0.485, 0.485, S99),
  rsBox(0, 0.515, '4:3', 0.485, 0.485, S99),
  rsBox(0.515, 0.515, '4:3', 0.485, 0.485, S99),
]);
const T9x9_16 = tmpl('t9x9-16', 'Grid 2×2 3:4', 'quad', STD, 'square', '3:4', [S99], [
  rsBox(0, 0, '3:4', 0.485, 0.485, S99),
  rsBox(0.515, 0, '3:4', 0.485, 0.485, S99),
  rsBox(0, 0.515, '3:4', 0.485, 0.485, S99),
  rsBox(0.515, 0.515, '3:4', 0.485, 0.485, S99),
]);
const T9x9_17 = tmpl('t9x9-17', 'Mosaic', 'quad', STD, 'square', '1:1', [S99], [
  rsBox(0, 0, '1:1', 0.62, 0.62, S99),
  rsBox(0.64, 0, '1:1', 0.36, 0.30, S99),
  rsBox(0.64, 0.32, '1:1', 0.36, 0.30, S99),
  rsBox(0, 0.64, '1:1', 0.62, 0.36, S99),
]);
const T9x9_18 = tmpl('t9x9-18', 'Circle Hero', 'duo', STD, 'square', '1:1', [S99], [
  rsBox(0.20, 0.20, '1:1', 0.60, 0.60, S99, { shape: 'circle' }),
  rsBox(0.65, 0.65, '1:1', 0.35, 0.35, S99),
]);

// ── 5-Photo (1 creative) ──
const T9x9_19 = tmpl('t9x9-19', 'Windowpane', 'quint', STD, 'square', '1:1', [S99], [
  rsBox(0, 0, '1:1', 0.485, 0.485, S99),
  rsBox(0.515, 0, '1:1', 0.485, 0.485, S99),
  rsBox(0, 0.515, '1:1', 0.485, 0.485, S99),
  rsBox(0.515, 0.515, '1:1', 0.485, 0.485, S99),
  rsBox(0.2575, 0.2575, '1:1', 0.485, 0.485, S99, { shape: 'circle' }),
]);

/* ══════════════════════════════════════════════════════════════════════════
   6x6 / 8x8 / 9x9 NEW — square 4-photo mixed-ratio + caption band
   ══════════════════════════════════════════════════════════════════════════ */

// Frame Trio + Caption — 4 photos (top 4:3 pair, bottom 3:4 pair), caption band.
const T6x6_20: PageTemplate = {
  ...tmpl('t6x6-20', 'Frame Trio + Caption', 'quad', STD, 'square', '4:3', [S66], [
    rsBox(0, 0, '4:3', 0.485, 0.40, S66),
    rsBox(0.515, 0, '4:3', 0.485, 0.40, S66),
    rsBox(0, 0.43, '3:4', 0.485, 0.39, S66),
    rsBox(0.515, 0.43, '3:4', 0.485, 0.39, S66),
  ]),
  textSlots: [{ id: 'cap', x: 0, y: 0.85, width: 1, height: 0.15, align: 'center', placeholder: 'Tap to add text' }],
};
const T8x8_20: PageTemplate = {
  ...tmpl('t8x8-20', 'Frame Trio + Caption', 'quad', STD, 'square', '4:3', [S88], [
    rsBox(0, 0, '4:3', 0.485, 0.40, S88),
    rsBox(0.515, 0, '4:3', 0.485, 0.40, S88),
    rsBox(0, 0.43, '3:4', 0.485, 0.39, S88),
    rsBox(0.515, 0.43, '3:4', 0.485, 0.39, S88),
  ]),
  textSlots: [{ id: 'cap', x: 0, y: 0.85, width: 1, height: 0.15, align: 'center', placeholder: 'Tap to add text' }],
};
const T9x9_20: PageTemplate = {
  ...tmpl('t9x9-20', 'Frame Trio + Caption', 'quad', STD, 'square', '4:3', [S99], [
    rsBox(0, 0, '4:3', 0.485, 0.40, S99),
    rsBox(0.515, 0, '4:3', 0.485, 0.40, S99),
    rsBox(0, 0.43, '3:4', 0.485, 0.39, S99),
    rsBox(0.515, 0.43, '3:4', 0.485, 0.39, S99),
  ]),
  textSlots: [{ id: 'cap', x: 0, y: 0.85, width: 1, height: 0.15, align: 'center', placeholder: 'Tap to add text' }],
};

/* ══════════════════════════════════════════════════════════════════════════
   6x6 / 8x8 / 9x9 NEW — square 5-photo windowpane (no shapes) + 6-photo grid
   ══════════════════════════════════════════════════════════════════════════ */

// Pinwheel Five — 5 photos: tall 1:1 hero left, four 1:1 satellites stacked right.
const T6x6_21 = tmpl('t6x6-21', 'Pinwheel Five', 'quint', STD, 'square', '1:1', [S66], [
  rsBox(0, 0, '1:1', 0.62, 1.0, S66),
  rsBox(0.64, 0, '1:1', 0.36, 0.235, S66),
  rsBox(0.64, 0.255, '1:1', 0.36, 0.235, S66),
  rsBox(0.64, 0.51, '1:1', 0.36, 0.235, S66),
  rsBox(0.64, 0.765, '1:1', 0.36, 0.235, S66),
]);
const T8x8_21 = tmpl('t8x8-21', 'Pinwheel Five', 'quint', STD, 'square', '1:1', [S88], [
  rsBox(0, 0, '1:1', 0.62, 1.0, S88),
  rsBox(0.64, 0, '1:1', 0.36, 0.235, S88),
  rsBox(0.64, 0.255, '1:1', 0.36, 0.235, S88),
  rsBox(0.64, 0.51, '1:1', 0.36, 0.235, S88),
  rsBox(0.64, 0.765, '1:1', 0.36, 0.235, S88),
]);

// Sextet Grid 2×3 — 6 photos: two columns (x 0 / 0.515) by three rows (y 0 / 0.343 / 0.686).
const T9x9_21 = tmpl('t9x9-21', 'Sextet Grid 2×3', 'sextet', STD, 'square', '1:1', [S99], [
  rsBox(0, 0, '1:1', 0.485, 0.313, S99),
  rsBox(0.515, 0, '1:1', 0.485, 0.313, S99),
  rsBox(0, 0.343, '1:1', 0.485, 0.313, S99),
  rsBox(0.515, 0.343, '1:1', 0.485, 0.313, S99),
  rsBox(0, 0.686, '1:1', 0.485, 0.313, S99),
  rsBox(0.515, 0.686, '1:1', 0.485, 0.313, S99),
]);
// Increment 6: Wide Pair + Caption (trio) — two 16:9 bands stacked + bottom-left square + side caption.
const T9x9_22: PageTemplate = {
  ...tmpl('t9x9-22', 'Wide Pair + Caption', 'trio', STD, 'square', '16:9', [S99], [
    rsBox(0, 0, '16:9', 1.0, 0.36, S99),
    rsBox(0, 0.39, '16:9', 1.0, 0.36, S99),
    rsBox(0, 0.78, '1:1', 0.45, 0.22, S99),
  ]),
  textSlots: [{ id: 'cap', x: 0.5, y: 0.78, width: 0.5, height: 0.22, align: 'center', placeholder: 'Tap to add text' }],
};
const T8x8_22 = tmpl('t8x8-22', 'Sextet Grid 2×3', 'sextet', STD, 'square', '1:1', [S88], [
  rsBox(0, 0, '1:1', 0.485, 0.313, S88),
  rsBox(0.515, 0, '1:1', 0.485, 0.313, S88),
  rsBox(0, 0.343, '1:1', 0.485, 0.313, S88),
  rsBox(0.515, 0.343, '1:1', 0.485, 0.313, S88),
  rsBox(0, 0.686, '1:1', 0.485, 0.313, S88),
  rsBox(0.515, 0.686, '1:1', 0.485, 0.313, S88),
]);

/* ══════════════════════════════════════════════════════════════════════════
   6x6 / 8x8 / 9x9 NEW — Increment 1: 4:3 + 5-photo "Strip Five" (filmstrip)
   Five equal full-height columns, all 4:3, no caption. Fills the EMPTY
   (4:3 × 5-photo × square) cell.
   ══════════════════════════════════════════════════════════════════════════ */

/* Strip Five (4:3 filmstrip) removed — 4:3 photos in full-height columns left
   ~85% whitespace on a square album (the no-oversized-box rule). The 4:3 × 5-photo
   square cell is covered by Two-Top-Three-Bottom below. */

/* ══════════════════════════════════════════════════════════════════════════
   6x6 / 8x8 / 9x9 NEW — Increment 2: 4:3 + 5-photo "Two-Top Three-Bottom + Caption"
   Two larger 4:3 cells on the top row, three smaller 4:3 cells on the bottom
   row, with a bottom caption band absorbing leftover space. All slots 4:3
   (strict match, zero crop). Distinct from Strip Five (Inc 1).
   ══════════════════════════════════════════════════════════════════════════ */

const T6x6_23: PageTemplate = {
  ...tmpl('t6x6-23', 'Two-Top Three-Bottom + Caption', 'quint', STD, 'square', '4:3', [S66], [
    rsBox(0, 0, '4:3', 0.485, 0.42, S66),
    rsBox(0.515, 0, '4:3', 0.485, 0.42, S66),
    rsBox(0, 0.45, '4:3', 0.313, 0.40, S66),
    rsBox(0.343, 0.45, '4:3', 0.313, 0.40, S66),
    rsBox(0.686, 0.45, '4:3', 0.313, 0.40, S66),
  ]),
  textSlots: [{ id: 'cap', x: 0, y: 0.87, width: 1, height: 0.13, align: 'center', placeholder: 'Tap to add text' }],
};
const T8x8_24: PageTemplate = {
  ...tmpl('t8x8-24', 'Two-Top Three-Bottom + Caption', 'quint', STD, 'square', '4:3', [S88], [
    rsBox(0, 0, '4:3', 0.485, 0.42, S88),
    rsBox(0.515, 0, '4:3', 0.485, 0.42, S88),
    rsBox(0, 0.45, '4:3', 0.313, 0.40, S88),
    rsBox(0.343, 0.45, '4:3', 0.313, 0.40, S88),
    rsBox(0.686, 0.45, '4:3', 0.313, 0.40, S88),
  ]),
  textSlots: [{ id: 'cap', x: 0, y: 0.87, width: 1, height: 0.13, align: 'center', placeholder: 'Tap to add text' }],
};
const T9x9_24: PageTemplate = {
  ...tmpl('t9x9-24', 'Two-Top Three-Bottom + Caption', 'quint', STD, 'square', '4:3', [S99], [
    rsBox(0, 0, '4:3', 0.485, 0.42, S99),
    rsBox(0.515, 0, '4:3', 0.485, 0.42, S99),
    rsBox(0, 0.45, '4:3', 0.313, 0.40, S99),
    rsBox(0.343, 0.45, '4:3', 0.313, 0.40, S99),
    rsBox(0.686, 0.45, '4:3', 0.313, 0.40, S99),
  ]),
  textSlots: [{ id: 'cap', x: 0, y: 0.87, width: 1, height: 0.13, align: 'center', placeholder: 'Tap to add text' }],
};

/* ══════════════════════════════════════════════════════════════════════════
   6x6 / 8x8 / 9x9 NEW — Increment 3: 4:3 + 6-photo "Three-Top Three-Bottom"
   Sextet grid, 3 columns x 2 rows, all slots 4:3 (strict match, zero crop).
   Cols x=0/0.343/0.686 (w=0.313); rows y=0/0.515 (h=0.485). No caption.
   Fills the EMPTY (4:3 × 6-photo × square) cell; distinct from the 1:1 2×3 grid.
   ══════════════════════════════════════════════════════════════════════════ */

const T6x6_24 = tmpl('t6x6-24', 'Three-Top Three-Bottom', 'sextet', STD, 'square', '4:3', [S66], [
  rsBox(0, 0, '4:3', 0.313, 0.485, S66),
  rsBox(0.343, 0, '4:3', 0.313, 0.485, S66),
  rsBox(0.686, 0, '4:3', 0.313, 0.485, S66),
  rsBox(0, 0.515, '4:3', 0.313, 0.485, S66),
  rsBox(0.343, 0.515, '4:3', 0.313, 0.485, S66),
  rsBox(0.686, 0.515, '4:3', 0.313, 0.485, S66),
]);
const T8x8_25 = tmpl('t8x8-25', 'Three-Top Three-Bottom', 'sextet', STD, 'square', '4:3', [S88], [
  rsBox(0, 0, '4:3', 0.313, 0.485, S88),
  rsBox(0.343, 0, '4:3', 0.313, 0.485, S88),
  rsBox(0.686, 0, '4:3', 0.313, 0.485, S88),
  rsBox(0, 0.515, '4:3', 0.313, 0.485, S88),
  rsBox(0.343, 0.515, '4:3', 0.313, 0.485, S88),
  rsBox(0.686, 0.515, '4:3', 0.313, 0.485, S88),
]);
const T9x9_25 = tmpl('t9x9-25', 'Three-Top Three-Bottom', 'sextet', STD, 'square', '4:3', [S99], [
  rsBox(0, 0, '4:3', 0.313, 0.485, S99),
  rsBox(0.343, 0, '4:3', 0.313, 0.485, S99),
  rsBox(0.686, 0, '4:3', 0.313, 0.485, S99),
  rsBox(0, 0.515, '4:3', 0.313, 0.485, S99),
  rsBox(0.343, 0.515, '4:3', 0.313, 0.485, S99),
  rsBox(0.686, 0.515, '4:3', 0.313, 0.485, S99),
]);

/* ══════════════════════════════════════════════════════════════════════════
   6x6 / 8x8 / 9x9 NEW — Increment 4: 4:3 + 6-photo "Hero + Five Satellites"
   Sextet, dominant 0.62×0.62 hero top-left; 2-tall satellite column on the
   right (x=0.64) and a 3-wide satellite row along the bottom (y=0.64). Every
   slot 4:3 (strict match, zero crop). Packed edge-to-edge, no caption.
   Distinct from the Three-Top Three-Bottom grid — a hero-anchored sextet.
   Fills (4:3 × 6-photo × square) with a SECOND archetype.
   ══════════════════════════════════════════════════════════════════════════ */

const T6x6_25 = tmpl('t6x6-25', 'Hero + Five Satellites', 'sextet', STD, 'square', '4:3', [S66], [
  rsBox(0, 0, '4:3', 0.62, 0.62, S66),
  rsBox(0.64, 0, '4:3', 0.36, 0.30, S66),
  rsBox(0.64, 0.32, '4:3', 0.36, 0.30, S66),
  rsBox(0, 0.64, '4:3', 0.30, 0.36, S66),
  rsBox(0.32, 0.64, '4:3', 0.30, 0.36, S66),
  rsBox(0.64, 0.64, '4:3', 0.30, 0.36, S66),
]);
const T8x8_26 = tmpl('t8x8-26', 'Hero + Five Satellites', 'sextet', STD, 'square', '4:3', [S88], [
  rsBox(0, 0, '4:3', 0.62, 0.62, S88),
  rsBox(0.64, 0, '4:3', 0.36, 0.30, S88),
  rsBox(0.64, 0.32, '4:3', 0.36, 0.30, S88),
  rsBox(0, 0.64, '4:3', 0.30, 0.36, S88),
  rsBox(0.32, 0.64, '4:3', 0.30, 0.36, S88),
  rsBox(0.64, 0.64, '4:3', 0.30, 0.36, S88),
]);
const T9x9_26 = tmpl('t9x9-26', 'Hero + Five Satellites', 'sextet', STD, 'square', '4:3', [S99], [
  rsBox(0, 0, '4:3', 0.62, 0.62, S99),
  rsBox(0.64, 0, '4:3', 0.36, 0.30, S99),
  rsBox(0.64, 0.32, '4:3', 0.36, 0.30, S99),
  rsBox(0, 0.64, '4:3', 0.30, 0.36, S99),
  rsBox(0.32, 0.64, '4:3', 0.30, 0.36, S99),
  rsBox(0.64, 0.64, '4:3', 0.30, 0.36, S99),
]);

/* ──────────────────────────────────────────────────────────────────────────
   6x6 / 8x8 / 9x9 NEW — Increment 5: 3:4 + 5-photo "Strip Five Portrait"
   Five equal full-height tall columns (portrait filmstrip). STRICT 3:4: every
   slot carries '3:4' (zero crop). Distinct from the 4:3 Strip Five (Inc 1).
   No textSlot — packs edge-to-edge.
   ────────────────────────────────────────────────────────────────────────── */
/* Strip Five Portrait (3:4 filmstrip) removed — same whitespace problem on a
   square album. The 3:4 × 5-photo square cell is covered by Hero + Quad Strip. */

/* ══════════════════════════════════════════════════════════════════════════
   6x6 / 8x8 / 9x9 NEW — Increment 6: 3:4 + 5-photo "Hero + Quad Strip + Caption"
   One large portrait hero on the left (trimmed to clear a caption band beneath
   it) + a 4-up right satellite stack. All 5 slots carry '3:4' (strict match,
   zero crop). Caption band sits under the hero, absorbing the leftover space.
   Distinct from Strip Five Portrait (Inc 5).
   ══════════════════════════════════════════════════════════════════════════ */

const T6x6_27: PageTemplate = {
  ...tmpl('t6x6-27', 'Hero + Quad Strip + Caption', 'quint', STD, 'square', '3:4', [S66], [
    rsBox(0, 0, '3:4', 0.60, 0.90, S66),
    rsBox(0.64, 0, '3:4', 0.36, 0.235, S66),
    rsBox(0.64, 0.255, '3:4', 0.36, 0.235, S66),
    rsBox(0.64, 0.51, '3:4', 0.36, 0.235, S66),
    rsBox(0.64, 0.765, '3:4', 0.36, 0.235, S66),
  ]),
  textSlots: [{ id: 'cap', x: 0, y: 0.92, width: 0.60, height: 0.08, align: 'center', placeholder: 'Tap to add text' }],
};
const T8x8_28: PageTemplate = {
  ...tmpl('t8x8-28', 'Hero + Quad Strip + Caption', 'quint', STD, 'square', '3:4', [S88], [
    rsBox(0, 0, '3:4', 0.60, 0.90, S88),
    rsBox(0.64, 0, '3:4', 0.36, 0.235, S88),
    rsBox(0.64, 0.255, '3:4', 0.36, 0.235, S88),
    rsBox(0.64, 0.51, '3:4', 0.36, 0.235, S88),
    rsBox(0.64, 0.765, '3:4', 0.36, 0.235, S88),
  ]),
  textSlots: [{ id: 'cap', x: 0, y: 0.92, width: 0.60, height: 0.08, align: 'center', placeholder: 'Tap to add text' }],
};
const T9x9_28: PageTemplate = {
  ...tmpl('t9x9-28', 'Hero + Quad Strip + Caption', 'quint', STD, 'square', '3:4', [S99], [
    rsBox(0, 0, '3:4', 0.60, 0.90, S99),
    rsBox(0.64, 0, '3:4', 0.36, 0.235, S99),
    rsBox(0.64, 0.255, '3:4', 0.36, 0.235, S99),
    rsBox(0.64, 0.51, '3:4', 0.36, 0.235, S99),
    rsBox(0.64, 0.765, '3:4', 0.36, 0.235, S99),
  ]),
  textSlots: [{ id: 'cap', x: 0, y: 0.92, width: 0.60, height: 0.08, align: 'center', placeholder: 'Tap to add text' }],
};

/* ══════════════════════════════════════════════════════════════════════════
   6x6 / 8x8 / 9x9 NEW — Increment 7: 3:4 + 6-photo "Three-Top Three-Bottom Portrait"
   Two rows of three equal cells, every slot '3:4' (strict match, zero crop).
   Cols x=0,0.343,0.686 (w=0.313); rows y=0 and y=0.515 (h=0.485). The portrait
   counterpart of the 4:3 sextet grid (Inc 3). No textSlot — packs edge-to-edge.
   Fills (3:4 × 6-photo × square).
   ══════════════════════════════════════════════════════════════════════════ */

const T6x6_28 = tmpl('t6x6-28', 'Three-Top Three-Bottom Portrait', 'sextet', STD, 'square', '3:4', [S66], [
  rsBox(0, 0, '3:4', 0.313, 0.485, S66),
  rsBox(0.343, 0, '3:4', 0.313, 0.485, S66),
  rsBox(0.686, 0, '3:4', 0.313, 0.485, S66),
  rsBox(0, 0.515, '3:4', 0.313, 0.485, S66),
  rsBox(0.343, 0.515, '3:4', 0.313, 0.485, S66),
  rsBox(0.686, 0.515, '3:4', 0.313, 0.485, S66),
]);
const T8x8_29 = tmpl('t8x8-29', 'Three-Top Three-Bottom Portrait', 'sextet', STD, 'square', '3:4', [S88], [
  rsBox(0, 0, '3:4', 0.313, 0.485, S88),
  rsBox(0.343, 0, '3:4', 0.313, 0.485, S88),
  rsBox(0.686, 0, '3:4', 0.313, 0.485, S88),
  rsBox(0, 0.515, '3:4', 0.313, 0.485, S88),
  rsBox(0.343, 0.515, '3:4', 0.313, 0.485, S88),
  rsBox(0.686, 0.515, '3:4', 0.313, 0.485, S88),
]);
const T9x9_29 = tmpl('t9x9-29', 'Three-Top Three-Bottom Portrait', 'sextet', STD, 'square', '3:4', [S99], [
  rsBox(0, 0, '3:4', 0.313, 0.485, S99),
  rsBox(0.343, 0, '3:4', 0.313, 0.485, S99),
  rsBox(0.686, 0, '3:4', 0.313, 0.485, S99),
  rsBox(0, 0.515, '3:4', 0.313, 0.485, S99),
  rsBox(0.343, 0.515, '3:4', 0.313, 0.485, S99),
  rsBox(0.686, 0.515, '3:4', 0.313, 0.485, S99),
]);

/* ══════════════════════════════════════════════════════════════════════════
   6x6 / 8x8 / 9x9 NEW — Increment 8a: 1:1 + 6-photo "Hero + Five Satellites"
   One dominant 1:1 hero (top-left) wrapped by 5 small 1:1 cells — 2 stacked on
   the right and 3 along the bottom. STRICT 1:1: every slot carries '1:1' (zero
   crop). A second sextet archetype for the square 6-photo cell (beyond the
   2×3 grid). No textSlot — packs edge-to-edge.
   ══════════════════════════════════════════════════════════════════════════ */
const T6x6_29 = tmpl('t6x6-29', 'Hero + Five Satellites', 'sextet', STD, 'square', '1:1', [S66], [
  rsBox(0, 0, '1:1', 0.62, 0.62, S66),
  rsBox(0.64, 0, '1:1', 0.36, 0.30, S66),
  rsBox(0.64, 0.32, '1:1', 0.36, 0.30, S66),
  rsBox(0, 0.64, '1:1', 0.30, 0.36, S66),
  rsBox(0.32, 0.64, '1:1', 0.30, 0.36, S66),
  rsBox(0.64, 0.64, '1:1', 0.30, 0.36, S66),
]);
const T8x8_30 = tmpl('t8x8-30', 'Hero + Five Satellites', 'sextet', STD, 'square', '1:1', [S88], [
  rsBox(0, 0, '1:1', 0.62, 0.62, S88),
  rsBox(0.64, 0, '1:1', 0.36, 0.30, S88),
  rsBox(0.64, 0.32, '1:1', 0.36, 0.30, S88),
  rsBox(0, 0.64, '1:1', 0.30, 0.36, S88),
  rsBox(0.32, 0.64, '1:1', 0.30, 0.36, S88),
  rsBox(0.64, 0.64, '1:1', 0.30, 0.36, S88),
]);
const T9x9_30 = tmpl('t9x9-30', 'Hero + Five Satellites', 'sextet', STD, 'square', '1:1', [S99], [
  rsBox(0, 0, '1:1', 0.62, 0.62, S99),
  rsBox(0.64, 0, '1:1', 0.36, 0.30, S99),
  rsBox(0.64, 0.32, '1:1', 0.36, 0.30, S99),
  rsBox(0, 0.64, '1:1', 0.30, 0.36, S99),
  rsBox(0.32, 0.64, '1:1', 0.30, 0.36, S99),
  rsBox(0.64, 0.64, '1:1', 0.30, 0.36, S99),
]);

/* ══════════════════════════════════════════════════════════════════════════
   6x6 / 8x8 / 9x9 NEW — Increment 8b: 1:1 + 5-photo "L-Frame + Caption"
   An L of photos wraps the page: 3 cells across the top row + 2 more down the
   left column, leaving the inner bottom-right corner open for a caption. STRICT
   1:1: every slot carries '1:1' (zero crop). The caption textSlot absorbs the
   open inner-L corner (canvas-packing). Distinct from pinwheel/windowpane.
   ══════════════════════════════════════════════════════════════════════════ */
const T6x6_30: PageTemplate = {
  ...tmpl('t6x6-30', 'L-Frame + Caption', 'quint', STD, 'square', '1:1', [S66], [
    rsBox(0, 0, '1:1', 0.313, 0.313, S66),
    rsBox(0.343, 0, '1:1', 0.313, 0.313, S66),
    rsBox(0.686, 0, '1:1', 0.313, 0.313, S66),
    rsBox(0, 0.343, '1:1', 0.313, 0.313, S66),
    rsBox(0, 0.686, '1:1', 0.313, 0.313, S66),
  ]),
  textSlots: [{ id: 'cap', x: 0.343, y: 0.343, width: 0.657, height: 0.657, align: 'center', placeholder: 'Tap to add text' }],
};
const T8x8_31: PageTemplate = {
  ...tmpl('t8x8-31', 'L-Frame + Caption', 'quint', STD, 'square', '1:1', [S88], [
    rsBox(0, 0, '1:1', 0.313, 0.313, S88),
    rsBox(0.343, 0, '1:1', 0.313, 0.313, S88),
    rsBox(0.686, 0, '1:1', 0.313, 0.313, S88),
    rsBox(0, 0.343, '1:1', 0.313, 0.313, S88),
    rsBox(0, 0.686, '1:1', 0.313, 0.313, S88),
  ]),
  textSlots: [{ id: 'cap', x: 0.343, y: 0.343, width: 0.657, height: 0.657, align: 'center', placeholder: 'Tap to add text' }],
};
const T9x9_31: PageTemplate = {
  ...tmpl('t9x9-31', 'L-Frame + Caption', 'quint', STD, 'square', '1:1', [S99], [
    rsBox(0, 0, '1:1', 0.313, 0.313, S99),
    rsBox(0.343, 0, '1:1', 0.313, 0.313, S99),
    rsBox(0.686, 0, '1:1', 0.313, 0.313, S99),
    rsBox(0, 0.343, '1:1', 0.313, 0.313, S99),
    rsBox(0, 0.686, '1:1', 0.313, 0.313, S99),
  ]),
  textSlots: [{ id: 'cap', x: 0.343, y: 0.343, width: 0.657, height: 0.657, align: 'center', placeholder: 'Tap to add text' }],
};

/* ══════════════════════════════════════════════════════════════════════════
   ASSEMBLE ALL TEMPLATES
   ══════════════════════════════════════════════════════════════════════════ */

/* Bonus WIDE mosaic (the wireframe) — needs a 16:9 photo, so it's a "bonus tier"
   layout for panorama shooters. The bulk of tiled templates (phone-native 4:3 /
   3:4 / 1:1) are generated in tiledTemplates.ts. Uses fill() for edge-to-edge.

   C — Headline mosaic: wide 16:9 top, 1:1 square bottom-left, textbox bottom-right. */
const T8x8_TILE_C: PageTemplate = {
  ...tmpl('T8x8_tile_c', 'Headline mosaic', 'duo', STD, 'square', '16:9', ['8x8'],
    [fill(0, 0, 1, 0.5625, '16:9'), fill(0, 0.5625, 0.4375, 0.4375, '1:1')]),
  textSlots: [{ id: 'cap', x: 0.4375, y: 0.5625, width: 0.5625, height: 0.4375, align: 'center', placeholder: 'Tap to add text' }],
};

const PAGE_TEMPLATES_BASE: PageTemplate[] = [
  T8x8_TILE_C,
  // 6×4 (6 templates)
  T6x4_01, T6x4_02, T6x4_03, T6x4_04, T6x4_05, T6x4_06,
  // 6×4 NEW (trio strip + caption, hero + pair)
  T6x4_07, T6x4_08,
  // 6×6 (19 templates)
  T6x6_01, T6x6_02, T6x6_03, T6x6_04, T6x6_05, T6x6_06, T6x6_07, T6x6_08, T6x6_09,
  T6x6_10, T6x6_11, T6x6_12, T6x6_13, T6x6_14, T6x6_15, T6x6_16, T6x6_17, T6x6_18, T6x6_19,
  // 8×8 (19 templates)
  T8x8_01, T8x8_02, T8x8_03, T8x8_04, T8x8_05, T8x8_06, T8x8_07, T8x8_08, T8x8_09,
  T8x8_10, T8x8_11, T8x8_12, T8x8_13, T8x8_14, T8x8_15, T8x8_16, T8x8_17, T8x8_18, T8x8_19,
  // 9×9 (19 templates)
  T9x9_01, T9x9_02, T9x9_03, T9x9_04, T9x9_05, T9x9_06, T9x9_07, T9x9_08, T9x9_09,
  T9x9_10, T9x9_11, T9x9_12, T9x9_13, T9x9_14, T9x9_15, T9x9_16, T9x9_17, T9x9_18, T9x9_19,
  // 6×6 / 8×8 / 9×9 NEW (square 4-photo + caption)
  T6x6_20, T8x8_20, T9x9_20,
  // 6×6 / 8×8 / 9×9 NEW (square 5-photo pinwheel + 6-photo 2×3 grid)
  T6x6_21, T8x8_21, T9x9_21, T8x8_22,
  // 6×6 / 8×8 / 9×9 NEW (Inc 2: 4:3 5-photo Two-Top Three-Bottom + Caption)
  T6x6_23, T8x8_24, T9x9_24,
  // 6×6 / 8×8 / 9×9 NEW (Inc 3: 4:3 6-photo Three-Top Three-Bottom sextet grid)
  T6x6_24, T8x8_25, T9x9_25,
  // 6×6 / 8×8 / 9×9 NEW (Inc 4: 4:3 6-photo Hero + Five Satellites sextet)
  T6x6_25, T8x8_26, T9x9_26,
  // 6×6 / 8×8 / 9×9 NEW (Inc 6: 3:4 5-photo Hero + Quad Strip + Caption)
  T6x6_27, T8x8_28, T9x9_28,
  // 6×6 / 8×8 / 9×9 NEW (Inc 7: 3:4 6-photo Three-Top Three-Bottom Portrait)
  T6x6_28, T8x8_29, T9x9_29,
  // 6×6 / 8×8 / 9×9 NEW (Inc 8a: 1:1 6-photo Hero + Five Satellites)
  T6x6_29, T8x8_30, T9x9_30,
  // 6×6 / 8×8 / 9×9 NEW (Inc 8b: 1:1 5-photo L-Frame + Caption)
  T6x6_30, T8x8_31, T9x9_31,
  // 11.5×8 (12 templates)
  T1158_01, T1158_02, T1158_03, T1158_04, T1158_05, T1158_06, T1158_07, T1158_08, T1158_09, T1158_10, T1158_11, T1158_12,
  // 11.5×8 NEW (varied-ratio 3/4/5-photo)
  T1158_13, T1158_14, T1158_15,
  // 11.5×8 NEW (trio + side caption)
  T1158_16,
  // 8.5×11 (12 templates)
  T8511_01, T8511_02, T8511_03, T8511_04, T8511_05, T8511_06, T8511_07, T8511_08, T8511_09, T8511_10, T8511_11, T8511_12,
  T8511_13, T8511_14, T8511_15,
  // 8.5×11 + 9×9 NEW (increment 6: caption layouts)
  T8511_16, T8511_17, T9x9_22,
];

/* ══════════════════════════════════════════════════════════════════════════
   GAP FILLERS — guarantee EVERY photo ratio has at least a full-page + a
   2-photo template on EVERY album size, so the ratio engine never has to fall
   back to a mismatched template. The hand-made templates above take precedence;
   we only generate the (size × ratio) combos they don't already cover.
   ══════════════════════════════════════════════════════════════════════════ */

const ALL_RATIOS: PhotoRatio[] = ['4:3', '3:4', '3:2', '2:3', '1:1', '16:9', '9:16'];
const WIDE_RATIOS = new Set<PhotoRatio>(['4:3', '3:2', '16:9']);
const SIZE_ORIENTATION: { size: AlbumSizePreset; orientation: PageTemplate['orientation'] }[] = [
  { size: S66, orientation: 'square' },
  { size: S88, orientation: 'square' },
  { size: S99, orientation: 'square' },
  { size: S64, orientation: 'landscape' },
  { size: S1158, orientation: 'landscape' },
  { size: S8511, orientation: 'portrait' },
];

const GAP_FILLERS: PageTemplate[] = [];
for (const { size, orientation } of SIZE_ORIENTATION) {
  for (const ratio of ALL_RATIOS) {
    const covered = PAGE_TEMPLATES_BASE.some(
      (t) => t.albumSizes.includes(size) && t.targetRatio === ratio,
    );
    if (covered) continue;
    const key = `${size}-${ratio}`.replace(/[:.]/g, '');
    const wide = WIDE_RATIOS.has(ratio);
    // 1-photo full page (also the landing spot for leftover "hero" photos)
    GAP_FILLERS.push(tmpl(`gap-${key}-1`, `Full Page ${ratio}`, 'single', STD, orientation, ratio, [size], [
      rsBox(0, 0, ratio, 1.0, 1.0, size),
    ]));
    // 2-photo: stack wide ratios; place tall/square ratios side-by-side
    GAP_FILLERS.push(tmpl(`gap-${key}-2`, `Duo ${ratio}`, 'duo', STD, orientation, ratio, [size], wide ? [
      rsBox(0, 0, ratio, 1.0, 0.485, size),
      rsBox(0, 0.515, ratio, 1.0, 0.485, size),
    ] : [
      rsBox(0, 0, ratio, 0.485, 1.0, size),
      rsBox(0.515, 0, ratio, 0.485, 1.0, size),
    ]));
  }
}

/** Single-photo page rule: a template with exactly ONE photo slot and NO textbox
 *  renders full bleed — the photo runs edge to edge with no inner margin and no
 *  frame. Templates that carry a textbox keep their margin (the caption needs the
 *  breathing room), and multi-photo templates are untouched. The lone slot is
 *  expanded to the whole page (object-cover fills it) and its per-slot border is
 *  dropped; `fullBleed` then zeroes the page margin in every renderer via
 *  marginForTemplate, and the renderers skip the theme frame for full-bleed pages. */
function applySinglePicFullBleed(t: PageTemplate): PageTemplate {
  const hasTextbox = !!(t.textSlots && t.textSlots.length > 0);
  if (t.slotCount !== 1 || hasTextbox || t.fullBleed) return t;
  const [slot] = t.slots;
  return {
    ...t,
    fullBleed: true,
    slots: [{ ...slot, x: 0, y: 0, width: 1, height: 1, borderWidth: 0, borderColor: undefined }],
  };
}

export const PAGE_TEMPLATES: PageTemplate[] =
  [...TILED_TEMPLATES, ...PAGE_TEMPLATES_BASE, ...GAP_FILLERS].map(applySinglePicFullBleed);

export const TEMPLATE_COUNT = PAGE_TEMPLATES.length;

/** Operator-hidden / soft-deleted template ids. Populated at app start from
 *  Supabase (see lib/templateSettings). These are excluded from SELECTION (album
 *  generation + the "Change" cycle) but NOT from getTemplateById — so an album
 *  already using a now-off template still renders. */
let INACTIVE_TEMPLATE_IDS = new Set<string>();
export function setInactiveTemplateIds(ids: Set<string>): void {
  INACTIVE_TEMPLATE_IDS = ids;
}
function isActive(t: PageTemplate): boolean {
  return !INACTIVE_TEMPLATE_IDS.has(t.id);
}

/** Get templates filtered by album size */
export function getTemplatesForAlbum(albumSize: AlbumSizePreset): PageTemplate[] {
  return PAGE_TEMPLATES.filter(t => isActive(t) && t.albumSizes.includes(albumSize));
}

/** Get templates filtered by album size AND target ratio */
export function getTemplatesForRatio(
  albumSize: AlbumSizePreset,
  targetRatio: PhotoRatio,
): PageTemplate[] {
  return PAGE_TEMPLATES.filter(
    t => isActive(t) && t.albumSizes.includes(albumSize) && t.targetRatio === targetRatio,
  );
}

/** Get templates filtered by album size, ratio, AND photo count */
export function getTemplatesForCount(
  albumSize: AlbumSizePreset,
  targetRatio: PhotoRatio,
  slotCount: number,
): PageTemplate[] {
  return PAGE_TEMPLATES.filter(
    t => isActive(t) && t.albumSizes.includes(albumSize) && t.targetRatio === targetRatio && t.slotCount === slotCount,
  );
}

export function getTemplateById(id: string): PageTemplate | undefined {
  return PAGE_TEMPLATES.find(t => t.id === id);
}

export const TEMPLATE_CATEGORIES: { id: PageTemplate['category']; label: string }[] = [
  { id: 'single', label: 'Single' },
  { id: 'duo', label: 'Duo' },
  { id: 'trio', label: 'Trio' },
  { id: 'quad', label: 'Quad' },
  { id: 'quint', label: 'Quint' },
  { id: 'sextet', label: 'Sextet' },
];

/** Adapt a template to the canvas orientation.
 *  When template orientation differs from canvas, rotates slots 90°
 *  and swaps margins accordingly. */
export function adaptTemplateToOrientation(
  template: PageTemplate,
  canvasW: number,
  canvasH: number,
): PageTemplate {
  const isLandscapeTemplate = template.orientation === 'landscape';
  const isLandscapeCanvas = canvasW > canvasH;
  const needsRotation = isLandscapeTemplate !== isLandscapeCanvas;

  if (!needsRotation) return template;

  const rotatedSlots = template.slots.map(slot => ({
    ...slot,
    x: slot.y,
    y: slot.x,
    width: slot.height,
    height: slot.width,
  }));

  return {
    ...template,
    margin: {
      top: template.margin.left,
      bottom: template.margin.right,
      left: template.margin.top,
      right: template.margin.bottom,
    },
    slots: rotatedSlots,
  };
}

/** Compute pixel coordinates for all slots in a template. */
export function computeSlotPixels(
  template: PageTemplate,
  canvasW: number,
  canvasH: number,
): Array<{ x: number; y: number; width: number; height: number }> {
  const safeX = canvasW * template.margin.left;
  const safeY = canvasH * template.margin.top;
  const safeW = canvasW * (1 - template.margin.left - template.margin.right);
  const safeH = canvasH * (1 - template.margin.top - template.margin.bottom);

  return template.slots.map(slot => ({
    x: safeX + slot.x * safeW,
    y: safeY + slot.y * safeH,
    width: slot.width * safeW,
    height: slot.height * safeH,
  }));
}
