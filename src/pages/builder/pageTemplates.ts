import type { PageTemplate, TemplateSlot, TemplateMargin, AlbumSizePreset } from './types';
import type { PhotoRatio } from './photoAnalyzer';

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
   ASSEMBLE ALL TEMPLATES
   ══════════════════════════════════════════════════════════════════════════ */

/* Sample template with a TEXT BOX (caption) — proves the textSlots feature.
   Any template becomes text-capable just by adding a `textSlots` entry. */
const T8x8_CAPTION: PageTemplate = {
  ...T8x8_01,
  id: 'T8x8_caption',
  name: 'Photo + caption',
  textSlots: [{ id: 'cap', x: 0.06, y: 0.8, width: 0.88, height: 0.14, align: 'center', placeholder: 'Tap to add text' }],
};

/* Sample MIXED-RATIO template — proves per-slot ratios + the matching generator.
   4:3 phone-landscape on top, 3:4 phone-portrait below — the two ratios a phone
   actually shoots, so it's easy to trigger. Generation uses it when a moment has
   both a landscape and a portrait photo; otherwise the leftover fallback applies. */
const T8x8_MIX_01: PageTemplate = tmpl(
  'T8x8_mix_01', 'Landscape + portrait', 'duo', STD, 'square', '4:3', ['8x8'],
  [rsBox(0, 0, '4:3', 1.0, 0.42, '8x8'), rsBox(0, 0.45, '3:4', 1.0, 0.52, '8x8')],
);

const PAGE_TEMPLATES_BASE: PageTemplate[] = [
  T8x8_CAPTION,
  T8x8_MIX_01,
  // 6×4 (6 templates)
  T6x4_01, T6x4_02, T6x4_03, T6x4_04, T6x4_05, T6x4_06,
  // 6×6 (19 templates)
  T6x6_01, T6x6_02, T6x6_03, T6x6_04, T6x6_05, T6x6_06, T6x6_07, T6x6_08, T6x6_09,
  T6x6_10, T6x6_11, T6x6_12, T6x6_13, T6x6_14, T6x6_15, T6x6_16, T6x6_17, T6x6_18, T6x6_19,
  // 8×8 (19 templates)
  T8x8_01, T8x8_02, T8x8_03, T8x8_04, T8x8_05, T8x8_06, T8x8_07, T8x8_08, T8x8_09,
  T8x8_10, T8x8_11, T8x8_12, T8x8_13, T8x8_14, T8x8_15, T8x8_16, T8x8_17, T8x8_18, T8x8_19,
  // 9×9 (19 templates)
  T9x9_01, T9x9_02, T9x9_03, T9x9_04, T9x9_05, T9x9_06, T9x9_07, T9x9_08, T9x9_09,
  T9x9_10, T9x9_11, T9x9_12, T9x9_13, T9x9_14, T9x9_15, T9x9_16, T9x9_17, T9x9_18, T9x9_19,
  // 11.5×8 (12 templates)
  T1158_01, T1158_02, T1158_03, T1158_04, T1158_05, T1158_06, T1158_07, T1158_08, T1158_09, T1158_10, T1158_11, T1158_12,
  // 8.5×11 (12 templates)
  T8511_01, T8511_02, T8511_03, T8511_04, T8511_05, T8511_06, T8511_07, T8511_08, T8511_09, T8511_10, T8511_11, T8511_12,
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

export const PAGE_TEMPLATES: PageTemplate[] = [...PAGE_TEMPLATES_BASE, ...GAP_FILLERS];

export const TEMPLATE_COUNT = PAGE_TEMPLATES.length;

/** Get templates filtered by album size */
export function getTemplatesForAlbum(albumSize: AlbumSizePreset): PageTemplate[] {
  return PAGE_TEMPLATES.filter(t => t.albumSizes.includes(albumSize));
}

/** Get templates filtered by album size AND target ratio */
export function getTemplatesForRatio(
  albumSize: AlbumSizePreset,
  targetRatio: PhotoRatio,
): PageTemplate[] {
  return PAGE_TEMPLATES.filter(
    t => t.albumSizes.includes(albumSize) && t.targetRatio === targetRatio,
  );
}

/** Get templates filtered by album size, ratio, AND photo count */
export function getTemplatesForCount(
  albumSize: AlbumSizePreset,
  targetRatio: PhotoRatio,
  slotCount: number,
): PageTemplate[] {
  return PAGE_TEMPLATES.filter(
    t => t.albumSizes.includes(albumSize) && t.targetRatio === targetRatio && t.slotCount === slotCount,
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
