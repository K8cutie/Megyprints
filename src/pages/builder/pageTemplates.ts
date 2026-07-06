import type { PageTemplate, TemplateSlot, TextSlot, TemplateMargin, AlbumSizePreset } from './types';
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
// INC1 3-photo additions — every cell FILLS its box (maxW/maxH == targetRatio/1.5).
// 6x4 canvasRatio=1.5 → 1:1 cell 0.667 (tall), 4:3 cell 0.889, 3:2 cell 1.0 (square).
// 3-photo: three 1:1 tall cells across a top band + caption fills the leftover bottom band.
// 1:1 intrinsic on 1.5 canvas = 0.6667, so a 0.307-wide cell is 0.4605 tall → fills exactly.
const T6x4_09: PageTemplate = {
  ...tmpl('t6x4-09', 'Trio Squares 1:1 + Caption', 'trio', STD, 'landscape', '1:1', [S64], [
    rsBox(0.02, 0, '1:1', 0.307, 0.4605, S64),
    rsBox(0.347, 0, '1:1', 0.307, 0.4605, S64),
    rsBox(0.674, 0, '1:1', 0.307, 0.4605, S64),
  ]),
  textSlots: [{ id: 'cap', x: 0, y: 0.5, width: 1, height: 0.48, align: 'center', placeholder: 'Tap to add text' }],
};
// 3-photo: 3:2 square hero left + two square cells stacked right (fills a 0.66-tall band edge-to-edge)
// + caption fills the leftover bottom band. 3:2 intrinsic on 1.5 canvas = 1.0 → cells are square.
const T6x4_10: PageTemplate = {
  ...tmpl('t6x4-10', 'Hero + Pair 3:2 + Caption', 'trio', STD, 'landscape', '3:2', [S64], [
    rsBox(0, 0, '3:2', 0.66, 0.66, S64),
    rsBox(0.68, 0, '3:2', 0.32, 0.32, S64),
    rsBox(0.68, 0.34, '3:2', 0.32, 0.32, S64),
  ]),
  textSlots: [{ id: 'cap', x: 0, y: 0.7, width: 1, height: 0.28, align: 'center', placeholder: 'Tap to add text' }],
};
// 3-photo: three 4:3 columns in a centered band + caption fills the leftover bottom band.
// 4:3 intrinsic on 1.5 canvas = 0.8889, so a 0.313-wide cell is 0.3521 tall → fills exactly.
const T6x4_11: PageTemplate = {
  ...tmpl('t6x4-11', 'Trio Columns 4:3 + Caption', 'trio', STD, 'landscape', '4:3', [S64], [
    rsBox(0.0155, 0.02, '4:3', 0.313, 0.3521, S64),
    rsBox(0.3435, 0.02, '4:3', 0.313, 0.3521, S64),
    rsBox(0.6715, 0.02, '4:3', 0.313, 0.3521, S64),
  ]),
  textSlots: [{ id: 'cap', x: 0, y: 0.44, width: 1, height: 0.54, align: 'center', placeholder: 'Tap to add text' }],
};

// ── INC2 4-photo (quad) additions ──
// 6x4 canvasRatio=1.5 → intrinsic fill ratios: 3:2→1.0 (square), 4:3→0.8889.
// 4-photo: clean 2x2 of SQUARE 3:2 cells tiling the whole page edge-to-edge, NO caption.
// 3:2 intrinsic = 1.0 → each 0.49×0.49 box is square and fills exactly (cx/cy offset = 0).
const T6x4_12 = tmpl('t6x4-12', 'Quad Grid 2×2 3:2', 'quad', STD, 'landscape', '3:2', [S64], [
  rsBox(0, 0, '3:2', 0.49, 0.49, S64),
  rsBox(0.51, 0, '3:2', 0.49, 0.49, S64),
  rsBox(0, 0.51, '3:2', 0.49, 0.49, S64),
  rsBox(0.51, 0.51, '3:2', 0.49, 0.49, S64),
]);
// 4-photo: 2x2 of 4:3 cells centered in a top band + caption fills the leftover bottom band.
// 4:3 intrinsic = 0.8889 → cell h=0.42 ⇒ w=0.42*0.8889=0.3734, so each box fills exactly.
/* t6x4-13 removed — 4:3 in a 2×2 on a 3:2 page left ~24% side whitespace. */
// 4-photo: 4:3 hero left + three 4:3 cells stacked right (no caption — variety).
// 4:3 intrinsic = 0.8889 → hero box 0.62×0.6975 fills; right cells 0.2845×0.32 fill.
// Hero centered vertically at y=0.15; right column x=0.66, three cells + 0.02 gutters fill height.
/* t6x4-14 removed — hero left bare top/bottom bands (~30% empty). */

// ── INC3 4 & 5-photo additions ──
// 6x4 canvasRatio=1.5 → 1:1 intrinsic = 0.6667 (tall). A 1:1 cell FILLS only when
// maxW/maxH == 0.6667. Four/five 1:1 cells across the width can't ALSO fill full page
// height (would need each 0.6667 wide), so the cell band is the honest fill and the
// genuine leftover bottom band becomes a caption — NEVER an oversized full-height box.
// 4-photo: four 1:1 tall cells across a top band + caption fills the leftover bottom.
// cell w=0.235 ⇒ h=0.235/0.6667=0.3525 → box 0.235×0.3525 fills exactly (offset 0).
const T6x4_15: PageTemplate = {
  ...tmpl('t6x4-15', 'Quad Row 1:1 + Caption', 'quad', STD, 'landscape', '1:1', [S64], [
    rsBox(0, 0.03, '1:1', 0.235, 0.3525, S64),
    rsBox(0.255, 0.03, '1:1', 0.235, 0.3525, S64),
    rsBox(0.51, 0.03, '1:1', 0.235, 0.3525, S64),
    rsBox(0.765, 0.03, '1:1', 0.235, 0.3525, S64),
  ]),
  textSlots: [{ id: 'cap', x: 0, y: 0.42, width: 1, height: 0.56, align: 'center', placeholder: 'Tap to add text' }],
};
// 5-photo: five 1:1 tall cells across a top band (filmstrip that ACTUALLY fills) + caption.
// cell w=0.188 ⇒ h=0.188/0.6667=0.282 → box 0.188×0.282 fills exactly (offset 0).
const T6x4_16: PageTemplate = {
  ...tmpl('t6x4-16', 'Five Row 1:1 + Caption', 'quint', STD, 'landscape', '1:1', [S64], [
    rsBox(0, 0.04, '1:1', 0.188, 0.282, S64),
    rsBox(0.203, 0.04, '1:1', 0.188, 0.282, S64),
    rsBox(0.406, 0.04, '1:1', 0.188, 0.282, S64),
    rsBox(0.609, 0.04, '1:1', 0.188, 0.282, S64),
    rsBox(0.812, 0.04, '1:1', 0.188, 0.282, S64),
  ]),
  textSlots: [{ id: 'cap', x: 0, y: 0.4, width: 1, height: 0.58, align: 'center', placeholder: 'Tap to add text' }],
};
// 5-photo: big square 3:2 hero left + 2x2 of small square 3:2 cells right — tiles a
// full-height 0.66-tall band edge-to-edge, then a caption fills the leftover bottom.
// 3:2 intrinsic on 1.5 canvas = 1.0 → every 3:2 cell is SQUARE (maxW=maxH), fills exactly.
// Hero 0.66×0.66; right 2x2 of 0.155×0.155 with 0.02 gutters spans the 0.66-tall band.
const T6x4_17: PageTemplate = {
  ...tmpl('t6x4-17', 'Hero + Quad 3:2 + Caption', 'quint', STD, 'landscape', '3:2', [S64], [
    rsBox(0, 0, '3:2', 0.66, 0.66, S64),
    rsBox(0.68, 0, '3:2', 0.155, 0.155, S64),
    rsBox(0.845, 0, '3:2', 0.155, 0.155, S64),
    rsBox(0.68, 0.175, '3:2', 0.155, 0.155, S64),
    rsBox(0.845, 0.175, '3:2', 0.155, 0.155, S64),
  ]),
  textSlots: [{ id: 'cap', x: 0, y: 0.7, width: 1, height: 0.28, align: 'center', placeholder: 'Tap to add text' }],
};

// ── INC4 5 & 6-photo additions ──
// 6x4 canvasRatio=1.5 → intrinsic fill ratios: 4:3→0.8889, 1:1→0.6667.
// Every cell FILLS only when maxW/maxH == intrinsic; captions take genuine leftover.
// 5-photo: two 4:3 cells top + three 4:3 cells bottom + caption fills the leftover band.
// 4:3 intrinsic = 0.8889. Top: w=0.44 ⇒ h=0.44/0.8889=0.495 → box fills exactly.
// Bottom: w=0.313 ⇒ h=0.313/0.8889=0.3521 → box fills exactly. Two rows tile a top band,
// caption fills the remaining ~0.12 bottom band edge-to-edge.
const T6x4_18: PageTemplate = {
  ...tmpl('t6x4-18', 'Two-Top Three-Bottom 4:3 + Caption', 'quint', STD, 'landscape', '4:3', [S64], [
    rsBox(0.03, 0, '4:3', 0.44, 0.495, S64),
    rsBox(0.53, 0, '4:3', 0.44, 0.495, S64),
    rsBox(0.0155, 0.515, '4:3', 0.313, 0.3521, S64),
    rsBox(0.3435, 0.515, '4:3', 0.313, 0.3521, S64),
    rsBox(0.6715, 0.515, '4:3', 0.313, 0.3521, S64),
  ]),
  textSlots: [{ id: 'cap', x: 0, y: 0.88, width: 1, height: 0.12, align: 'center', placeholder: 'Tap to add text' }],
};
// 6-photo: six 1:1 tall cells in a 3-col × 2-row grid that TILES the whole page edge-to-edge.
// 1:1 intrinsic = 0.6667 → cell w=0.32 ⇒ h=0.32/0.6667=0.48 → box fills exactly (offset 0).
// xi=0,0.34,0.68  yi=0,0.515 → 0.02–0.035 gutters, no caption (fills fully).
const T6x4_19 = tmpl('t6x4-19', 'Sextet Grid 3×2 1:1', 'sextet', STD, 'landscape', '1:1', [S64], [
  rsBox(0, 0, '1:1', 0.32, 0.48, S64),
  rsBox(0.34, 0, '1:1', 0.32, 0.48, S64),
  rsBox(0.68, 0, '1:1', 0.32, 0.48, S64),
  rsBox(0, 0.515, '1:1', 0.32, 0.48, S64),
  rsBox(0.34, 0.515, '1:1', 0.32, 0.48, S64),
  rsBox(0.68, 0.515, '1:1', 0.32, 0.48, S64),
]);
// 6-photo: six 4:3 cells in a 3-col × 2-row band + caption fills the leftover bottom band.
// 4:3 intrinsic = 0.8889 → cell w=0.313 ⇒ h=0.313/0.8889=0.3521 → box fills exactly.
// Two rows span 0..~0.744, caption fills the remaining bottom band edge-to-edge.
const T6x4_20: PageTemplate = {
  ...tmpl('t6x4-20', 'Sextet Grid 3×2 4:3 + Caption', 'sextet', STD, 'landscape', '4:3', [S64], [
    rsBox(0.0155, 0.02, '4:3', 0.313, 0.3521, S64),
    rsBox(0.3435, 0.02, '4:3', 0.313, 0.3521, S64),
    rsBox(0.6715, 0.02, '4:3', 0.313, 0.3521, S64),
    rsBox(0.0155, 0.392, '4:3', 0.313, 0.3521, S64),
    rsBox(0.3435, 0.392, '4:3', 0.313, 0.3521, S64),
    rsBox(0.6715, 0.392, '4:3', 0.313, 0.3521, S64),
  ]),
  textSlots: [{ id: 'cap', x: 0, y: 0.76, width: 1, height: 0.24, align: 'center', placeholder: 'Tap to add text' }],
};

// ── INC5 (finish 3/6-photo variety) ──
// 6x4 canvasRatio=1.5 → intrinsic fill ratios: 3:2→1.0 (square), 4:3→0.8889, 1:1→0.6667.
// 3-photo: three TRUE-SQUARE 3:2 cells in a top band + caption fills the larger bottom band.
// Distinct from T6x4_07 (0.313×0.78 boxes = photo centered in tall box, NOT filled): here each
// 0.32×0.32 box IS square so the 3:2 photo fills it exactly (offset 0), caption owns the rest.
const T6x4_21: PageTemplate = {
  ...tmpl('t6x4-21', 'Trio Row 3:2 + Caption', 'trio', STD, 'landscape', '3:2', [S64], [
    rsBox(0.02, 0.02, '3:2', 0.32, 0.32, S64),
    rsBox(0.34, 0.02, '3:2', 0.32, 0.32, S64),
    rsBox(0.66, 0.02, '3:2', 0.32, 0.32, S64),
  ]),
  textSlots: [{ id: 'cap', x: 0, y: 0.4, width: 1, height: 0.58, align: 'center', placeholder: 'Tap to add text' }],
};
// 6-photo: 1:1 hero left + five small 1:1 satellites clustered right (3 top row + 2 bottom row).
// 1:1 intrinsic = 0.6667 (tall). Hero 0.48×0.72 fills exactly (0.48/0.72=0.6667). Satellites
// 0.15×0.225 fill exactly (0.15/0.225=0.6667). Every cell is a filled tall 1:1 box — no whitespace.
/* t6x4-22 removed — tiny satellites left ~49% of the page bare (floating photos). */
// 4-photo: staggered 2x2 of 4:3 cells (top row shifted left, bottom row shifted right) + caption
// fills the leftover bottom band edge-to-edge. 4:3 intrinsic = 0.8889 → cell w=0.34 ⇒
// h=0.34/0.8889=0.3825 → each box fills exactly (offset 0). The x-stagger gives an offset look.
/* t6x4-23 removed — x-stagger left bare corners (~30% empty). */

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
// 5-photo: two 3:2 top + three 3:2 bottom, all cells FILL, caption owns the leftover band.
// 11.5x8 canvasRatio=1.4375 → 3:2 intrinsic = 1.0435. Top: w=0.44 ⇒ h=0.44/1.0435=0.4217 (fills).
// Bottom: w=0.313 ⇒ h=0.313/1.0435=0.3 (fills). (Replaces the old full-height-column filmstrip that
// left ~82% of each column empty — the forbidden "Strip Five" whitespace pattern.)
const T1158_15: PageTemplate = {
  ...tmpl('t1158-15', 'Two-Top Three-Bottom 3:2 + Caption', 'quint', STD, 'landscape', '3:2', [S1158], [
    rsBox(0.03, 0, '3:2', 0.44, 0.4217, S1158),
    rsBox(0.53, 0, '3:2', 0.44, 0.4217, S1158),
    rsBox(0.0155, 0.44, '3:2', 0.313, 0.3, S1158),
    rsBox(0.3435, 0.44, '3:2', 0.313, 0.3, S1158),
    rsBox(0.6715, 0.44, '3:2', 0.313, 0.3, S1158),
  ]),
  textSlots: [{ id: 'cap', x: 0, y: 0.76, width: 1, height: 0.24, align: 'center', placeholder: 'Tap to add text' }],
};
// 3-photo: three 4:3 stacked in the left two-thirds + side caption column on the right
const T1158_16: PageTemplate = {
  ...tmpl('t1158-16', 'Trio + Side Caption', 'trio', STD, 'landscape', '4:3', [S1158], [
    rsBox(0, 0, '4:3', 0.64, 0.31, S1158),
    rsBox(0, 0.345, '4:3', 0.64, 0.31, S1158),
    rsBox(0, 0.69, '4:3', 0.64, 0.31, S1158),
  ]),
  textSlots: [{ id: 'cap', x: 0.7, y: 0, width: 0.3, height: 1, align: 'center', placeholder: 'Tap to add text' }],
};

// ── INC6: 11.5×8 6-photo additions (canvasRatio = 3450/2400 = 1.4375) ──
// Anti-whitespace intrinsics on this canvas: 4:3 → 1.3333/1.4375 = 0.9275 ; 3:2 → 1.5/1.4375 = 1.0435.
// Every cell's maxW/maxH equals its intrinsic ratio so rsBox fills it edge-to-edge (cx/cy offset = 0).

// 6-photo: six 4:3 cells, 3 cols × 2 rows. 4:3 cell w=0.32 ⇒ h=0.32/0.9275=0.345 (fills exactly).
// Grid spans y 0..0.71 (width-bound on 1.4375 canvas); the genuine leftover bottom band is a caption.
const T1158_17: PageTemplate = {
  ...tmpl('t1158-17', 'Sextet Grid 3×2 4:3 + Caption', 'sextet', STD, 'landscape', '4:3', [S1158], [
    rsBox(0, 0, '4:3', 0.32, 0.345, S1158),
    rsBox(0.34, 0, '4:3', 0.32, 0.345, S1158),
    rsBox(0.68, 0, '4:3', 0.32, 0.345, S1158),
    rsBox(0, 0.365, '4:3', 0.32, 0.345, S1158),
    rsBox(0.34, 0.365, '4:3', 0.32, 0.345, S1158),
    rsBox(0.68, 0.365, '4:3', 0.32, 0.345, S1158),
  ]),
  textSlots: [{ id: 'cap', x: 0, y: 0.73, width: 1, height: 0.27, align: 'center', placeholder: 'Tap to add text' }],
};

// 6-photo: one 4:3 hero (left, fills 0.80×0.8625 exactly) + caption below it, and a right filmstrip
// of five 4:3 cells (each w=0.174 ⇒ h=0.174/0.9275=0.1876, fills exactly) spanning full height.
const T1158_18: PageTemplate = {
  ...tmpl('t1158-18', 'Hero + Five 4:3 + Caption', 'sextet', STD, 'landscape', '4:3', [S1158], [
    rsBox(0, 0, '4:3', 0.80, 0.8625, S1158),
    rsBox(0.826, 0, '4:3', 0.174, 0.1876, S1158),
    rsBox(0.826, 0.203, '4:3', 0.174, 0.1876, S1158),
    rsBox(0.826, 0.406, '4:3', 0.174, 0.1876, S1158),
    rsBox(0.826, 0.609, '4:3', 0.174, 0.1876, S1158),
    rsBox(0.826, 0.812, '4:3', 0.174, 0.1876, S1158),
  ]),
  textSlots: [{ id: 'cap', x: 0, y: 0.885, width: 0.80, height: 0.115, align: 'center', placeholder: 'Tap to add text' }],
};

// 6-photo: six 3:2 cells, 3 cols × 2 rows. 3:2 cell w=0.32 ⇒ h=0.32/1.0435=0.3067 (fills exactly).
// Grid spans y 0..0.637 (width-bound on 1.4375 canvas); the leftover bottom band is a caption.
const T1158_19: PageTemplate = {
  ...tmpl('t1158-19', 'Sextet 3×2 3:2 + Caption', 'sextet', STD, 'landscape', '3:2', [S1158], [
    rsBox(0, 0, '3:2', 0.32, 0.3067, S1158),
    rsBox(0.34, 0, '3:2', 0.32, 0.3067, S1158),
    rsBox(0.68, 0, '3:2', 0.32, 0.3067, S1158),
    rsBox(0, 0.33, '3:2', 0.32, 0.3067, S1158),
    rsBox(0.34, 0.33, '3:2', 0.32, 0.3067, S1158),
    rsBox(0.68, 0.33, '3:2', 0.32, 0.3067, S1158),
  ]),
  textSlots: [{ id: 'cap', x: 0, y: 0.66, width: 1, height: 0.34, align: 'center', placeholder: 'Tap to add text' }],
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
   8.5×11 NEW — Increment 7: 3:4 + 6-photo sextet, FILL-correct.
   Portrait canvasRatio = 2550/3300 = 0.7727, so a 3:4 cell fills its box only
   when boxW/boxH = 0.75/0.7727 = 0.9706 (near-square in normalized coords).
   The clean tessellation for 6 near-square cells is 3 cols × 2 rows covering the
   top ~0.665 band (col w=0.313 → h=0.313/0.9706=0.3225). The genuine leftover
   band becomes a caption — never empty margin. Two distinct arrangements: caption
   BELOW the grid (t8511-18) vs a title band ABOVE it (t8511-19).
   ══════════════════════════════════════════════════════════════════════════ */
// Sextet Grid 3×2 3:4 + Caption: three columns, two rows, caption fills bottom band.
const T8511_18: PageTemplate = {
  ...tmpl('t8511-18', 'Sextet Grid 3×2 3:4 + Caption', 'sextet', STD, 'portrait', '3:4', [S8511], [
    rsBox(0, 0, '3:4', 0.313, 0.3225, S8511),
    rsBox(0.343, 0, '3:4', 0.313, 0.3225, S8511),
    rsBox(0.686, 0, '3:4', 0.313, 0.3225, S8511),
    rsBox(0, 0.343, '3:4', 0.313, 0.3225, S8511),
    rsBox(0.343, 0.343, '3:4', 0.313, 0.3225, S8511),
    rsBox(0.686, 0.343, '3:4', 0.313, 0.3225, S8511),
  ]),
  textSlots: [{ id: 'cap', x: 0, y: 0.69, width: 1, height: 0.31, align: 'center', placeholder: 'Tap to add text' }],
};
// Title Band + Sextet 3×2 3:4: title caption fills the top band, grid fills below.
const T8511_19: PageTemplate = {
  ...tmpl('t8511-19', 'Title + Sextet 3×2 3:4', 'sextet', STD, 'portrait', '3:4', [S8511], [
    rsBox(0, 0.335, '3:4', 0.313, 0.3225, S8511),
    rsBox(0.343, 0.335, '3:4', 0.313, 0.3225, S8511),
    rsBox(0.686, 0.335, '3:4', 0.313, 0.3225, S8511),
    rsBox(0, 0.6775, '3:4', 0.313, 0.3225, S8511),
    rsBox(0.343, 0.6775, '3:4', 0.313, 0.3225, S8511),
    rsBox(0.686, 0.6775, '3:4', 0.313, 0.3225, S8511),
  ]),
  textSlots: [{ id: 'cap', x: 0, y: 0, width: 1, height: 0.315, align: 'center', placeholder: 'Tap to add text' }],
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

// Quad 2×2 4:3 + Caption — 4 photos in a strict 4:3 grid, caption fills leftover bottom band.
// Square canvas (canvasRatio=1.0) → 4:3 intrinsic = 1.3333. Cell w=0.485 ⇒ h=0.485/1.3333=0.3638
// → each rsBox fills exactly (offset 0). Two rows span y 0..0.76; caption owns the bottom band.
const T6x6_20: PageTemplate = {
  ...tmpl('t6x6-20', 'Frame Quad 4:3 + Caption', 'quad', STD, 'square', '4:3', [S66], [
    rsBox(0, 0, '4:3', 0.485, 0.3638, S66),
    rsBox(0.515, 0, '4:3', 0.485, 0.3638, S66),
    rsBox(0, 0.39, '4:3', 0.485, 0.3638, S66),
    rsBox(0.515, 0.39, '4:3', 0.485, 0.3638, S66),
  ]),
  textSlots: [{ id: 'cap', x: 0, y: 0.78, width: 1, height: 0.22, align: 'center', placeholder: 'Tap to add text' }],
};
const T8x8_20: PageTemplate = {
  ...tmpl('t8x8-20', 'Frame Quad 4:3 + Caption', 'quad', STD, 'square', '4:3', [S88], [
    rsBox(0, 0, '4:3', 0.485, 0.3638, S88),
    rsBox(0.515, 0, '4:3', 0.485, 0.3638, S88),
    rsBox(0, 0.39, '4:3', 0.485, 0.3638, S88),
    rsBox(0.515, 0.39, '4:3', 0.485, 0.3638, S88),
  ]),
  textSlots: [{ id: 'cap', x: 0, y: 0.78, width: 1, height: 0.22, align: 'center', placeholder: 'Tap to add text' }],
};
const T9x9_20: PageTemplate = {
  ...tmpl('t9x9-20', 'Frame Quad 4:3 + Caption', 'quad', STD, 'square', '4:3', [S99], [
    rsBox(0, 0, '4:3', 0.485, 0.3638, S99),
    rsBox(0.515, 0, '4:3', 0.485, 0.3638, S99),
    rsBox(0, 0.39, '4:3', 0.485, 0.3638, S99),
    rsBox(0.515, 0.39, '4:3', 0.485, 0.3638, S99),
  ]),
  textSlots: [{ id: 'cap', x: 0, y: 0.78, width: 1, height: 0.22, align: 'center', placeholder: 'Tap to add text' }],
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
// Wide Trio + Caption (trio) — full-width 16:9 pano hero on top, two half-width 16:9 cells
// below, caption fills the leftover bottom band. Square canvas → 16:9 intrinsic = 1.7778.
// Hero w=1.0 ⇒ h=0.5625 (fills). Bottom cells w=0.49 ⇒ h=0.49/1.7778=0.2756 (fill). Every slot 16:9.
const T9x9_22: PageTemplate = {
  ...tmpl('t9x9-22', 'Wide Trio + Caption', 'trio', STD, 'square', '16:9', [S99], [
    rsBox(0, 0, '16:9', 1.0, 0.5625, S99),
    rsBox(0, 0.5825, '16:9', 0.49, 0.2756, S99),
    rsBox(0.51, 0.5825, '16:9', 0.49, 0.2756, S99),
  ]),
  textSlots: [{ id: 'cap', x: 0, y: 0.87, width: 1, height: 0.13, align: 'center', placeholder: 'Tap to add text' }],
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
   (strict match, zero crop). Square canvas → 4:3 intrinsic = 1.3333, so every cell's
   maxW/maxH equals 1.3333: top w=0.485 ⇒ h=0.3638; bottom w=0.313 ⇒ h=0.2348 — each
   box fills exactly (offset 0). Distinct from Strip Five (Inc 1).
   ══════════════════════════════════════════════════════════════════════════ */

const T6x6_23: PageTemplate = {
  ...tmpl('t6x6-23', 'Two-Top Three-Bottom + Caption', 'quint', STD, 'square', '4:3', [S66], [
    rsBox(0.0075, 0.02, '4:3', 0.485, 0.3638, S66),
    rsBox(0.5075, 0.02, '4:3', 0.485, 0.3638, S66),
    rsBox(0, 0.41, '4:3', 0.313, 0.2348, S66),
    rsBox(0.343, 0.41, '4:3', 0.313, 0.2348, S66),
    rsBox(0.686, 0.41, '4:3', 0.313, 0.2348, S66),
  ]),
  textSlots: [{ id: 'cap', x: 0, y: 0.68, width: 1, height: 0.32, align: 'center', placeholder: 'Tap to add text' }],
};
const T8x8_24: PageTemplate = {
  ...tmpl('t8x8-24', 'Two-Top Three-Bottom + Caption', 'quint', STD, 'square', '4:3', [S88], [
    rsBox(0.0075, 0.02, '4:3', 0.485, 0.3638, S88),
    rsBox(0.5075, 0.02, '4:3', 0.485, 0.3638, S88),
    rsBox(0, 0.41, '4:3', 0.313, 0.2348, S88),
    rsBox(0.343, 0.41, '4:3', 0.313, 0.2348, S88),
    rsBox(0.686, 0.41, '4:3', 0.313, 0.2348, S88),
  ]),
  textSlots: [{ id: 'cap', x: 0, y: 0.68, width: 1, height: 0.32, align: 'center', placeholder: 'Tap to add text' }],
};
const T9x9_24: PageTemplate = {
  ...tmpl('t9x9-24', 'Two-Top Three-Bottom + Caption', 'quint', STD, 'square', '4:3', [S99], [
    rsBox(0.0075, 0.02, '4:3', 0.485, 0.3638, S99),
    rsBox(0.5075, 0.02, '4:3', 0.485, 0.3638, S99),
    rsBox(0, 0.41, '4:3', 0.313, 0.2348, S99),
    rsBox(0.343, 0.41, '4:3', 0.313, 0.2348, S99),
    rsBox(0.686, 0.41, '4:3', 0.313, 0.2348, S99),
  ]),
  textSlots: [{ id: 'cap', x: 0, y: 0.68, width: 1, height: 0.32, align: 'center', placeholder: 'Tap to add text' }],
};

/* ══════════════════════════════════════════════════════════════════════════
   6x6 / 8x8 / 9x9 NEW — Increment 3: 4:3 + 6-photo "Three-Top Three-Bottom + Caption"
   Sextet grid, 3 columns x 2 rows, all slots 4:3 (strict match, zero crop).
   Square canvas → 4:3 intrinsic = 1.3333, so a 0.313-wide cell is 0.2348 tall and
   FILLS exactly (offset 0). Two rows tile a top band (y 0.02..0.5148); the genuine
   leftover bottom band is a caption — never an oversized box with a centered photo.
   Cols x=0/0.343/0.686 (w=0.313); rows y=0.02/0.28 (h=0.2348).
   ══════════════════════════════════════════════════════════════════════════ */

const T6x6_24: PageTemplate = {
  ...tmpl('t6x6-24', 'Three-Top Three-Bottom + Caption', 'sextet', STD, 'square', '4:3', [S66], [
    rsBox(0, 0.02, '4:3', 0.313, 0.2348, S66),
    rsBox(0.343, 0.02, '4:3', 0.313, 0.2348, S66),
    rsBox(0.686, 0.02, '4:3', 0.313, 0.2348, S66),
    rsBox(0, 0.28, '4:3', 0.313, 0.2348, S66),
    rsBox(0.343, 0.28, '4:3', 0.313, 0.2348, S66),
    rsBox(0.686, 0.28, '4:3', 0.313, 0.2348, S66),
  ]),
  textSlots: [{ id: 'cap', x: 0, y: 0.55, width: 1, height: 0.45, align: 'center', placeholder: 'Tap to add text' }],
};
const T8x8_25: PageTemplate = {
  ...tmpl('t8x8-25', 'Three-Top Three-Bottom + Caption', 'sextet', STD, 'square', '4:3', [S88], [
    rsBox(0, 0.02, '4:3', 0.313, 0.2348, S88),
    rsBox(0.343, 0.02, '4:3', 0.313, 0.2348, S88),
    rsBox(0.686, 0.02, '4:3', 0.313, 0.2348, S88),
    rsBox(0, 0.28, '4:3', 0.313, 0.2348, S88),
    rsBox(0.343, 0.28, '4:3', 0.313, 0.2348, S88),
    rsBox(0.686, 0.28, '4:3', 0.313, 0.2348, S88),
  ]),
  textSlots: [{ id: 'cap', x: 0, y: 0.55, width: 1, height: 0.45, align: 'center', placeholder: 'Tap to add text' }],
};
const T9x9_25: PageTemplate = {
  ...tmpl('t9x9-25', 'Three-Top Three-Bottom + Caption', 'sextet', STD, 'square', '4:3', [S99], [
    rsBox(0, 0.02, '4:3', 0.313, 0.2348, S99),
    rsBox(0.343, 0.02, '4:3', 0.313, 0.2348, S99),
    rsBox(0.686, 0.02, '4:3', 0.313, 0.2348, S99),
    rsBox(0, 0.28, '4:3', 0.313, 0.2348, S99),
    rsBox(0.343, 0.28, '4:3', 0.313, 0.2348, S99),
    rsBox(0.686, 0.28, '4:3', 0.313, 0.2348, S99),
  ]),
  textSlots: [{ id: 'cap', x: 0, y: 0.55, width: 1, height: 0.45, align: 'center', placeholder: 'Tap to add text' }],
};

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
   6x6 / 8x8 / 9x9 NEW — Increment 6: 3:4 + 5-photo "Hero + Quad + Caption"
   One large portrait hero on the left (full height, fills) + a 2×2 grid of 3:4
   satellites on the right; a caption fills the genuine leftover bottom-right band.
   Square canvas → 3:4 intrinsic = 0.75. Hero w=0.49 ⇒ h=0.49/0.75=0.6533 (fills).
   Satellites w=0.235 ⇒ h=0.235/0.75=0.3133 (fill exactly, offset 0). All 5 slots '3:4'.
   ══════════════════════════════════════════════════════════════════════════ */

const T6x6_27: PageTemplate = {
  ...tmpl('t6x6-27', 'Hero + Quad + Caption', 'quint', STD, 'square', '3:4', [S66], [
    rsBox(0, 0.17, '3:4', 0.49, 0.6533, S66),
    rsBox(0.51, 0.02, '3:4', 0.235, 0.3133, S66),
    rsBox(0.765, 0.02, '3:4', 0.235, 0.3133, S66),
    rsBox(0.51, 0.35, '3:4', 0.235, 0.3133, S66),
    rsBox(0.765, 0.35, '3:4', 0.235, 0.3133, S66),
  ]),
  textSlots: [{ id: 'cap', x: 0.51, y: 0.68, width: 0.49, height: 0.32, align: 'center', placeholder: 'Tap to add text' }],
};
const T8x8_28: PageTemplate = {
  ...tmpl('t8x8-28', 'Hero + Quad + Caption', 'quint', STD, 'square', '3:4', [S88], [
    rsBox(0, 0.17, '3:4', 0.49, 0.6533, S88),
    rsBox(0.51, 0.02, '3:4', 0.235, 0.3133, S88),
    rsBox(0.765, 0.02, '3:4', 0.235, 0.3133, S88),
    rsBox(0.51, 0.35, '3:4', 0.235, 0.3133, S88),
    rsBox(0.765, 0.35, '3:4', 0.235, 0.3133, S88),
  ]),
  textSlots: [{ id: 'cap', x: 0.51, y: 0.68, width: 0.49, height: 0.32, align: 'center', placeholder: 'Tap to add text' }],
};
const T9x9_28: PageTemplate = {
  ...tmpl('t9x9-28', 'Hero + Quad + Caption', 'quint', STD, 'square', '3:4', [S99], [
    rsBox(0, 0.17, '3:4', 0.49, 0.6533, S99),
    rsBox(0.51, 0.02, '3:4', 0.235, 0.3133, S99),
    rsBox(0.765, 0.02, '3:4', 0.235, 0.3133, S99),
    rsBox(0.51, 0.35, '3:4', 0.235, 0.3133, S99),
    rsBox(0.765, 0.35, '3:4', 0.235, 0.3133, S99),
  ]),
  textSlots: [{ id: 'cap', x: 0.51, y: 0.68, width: 0.49, height: 0.32, align: 'center', placeholder: 'Tap to add text' }],
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
   6x6 / 8x8 / 9x9 NEW — Increment 7: FILL-CORRECT square 4-photo (the user's
   original "4-photo shows too few" gripe). Square canvasRatio = 1.0, so a cell's
   intrinsic ratio == its targetRatio. The existing Grid 2×2 4:3/3:4 templates
   (t*x*-15/16) size their boxes 0.485×0.485 — which CENTERS a 4:3/3:4 photo and
   leaves whitespace. These new templates size each box to the intrinsic ratio so
   every photo FILLS its cell edge-to-edge, and the genuine leftover band becomes
   a caption (never empty margin).
     • Quad 2×2 4:3 + Caption: cell 0.49×0.3675 (4:3), two rows (top 0.735),
       caption fills the bottom band.
     • Quad 2×2 3:4 + Caption: cell 0.3675×0.49 (3:4), two cols (left 0.735),
       caption fills the right band.
     • Hero + Trio 4:3: full-width 4:3 hero (1.0×0.75) on top + three 4:3 cells
       (0.32×0.24) filling the bottom row. Tessellates the full page, no caption.
   ══════════════════════════════════════════════════════════════════════════ */
// Quad 2×2 4:3 + Caption
const T6x6_31: PageTemplate = {
  ...tmpl('t6x6-31', 'Quad 2×2 4:3 + Caption', 'quad', STD, 'square', '4:3', [S66], [
    rsBox(0, 0, '4:3', 0.49, 0.3675, S66),
    rsBox(0.51, 0, '4:3', 0.49, 0.3675, S66),
    rsBox(0, 0.3775, '4:3', 0.49, 0.3675, S66),
    rsBox(0.51, 0.3775, '4:3', 0.49, 0.3675, S66),
  ]),
  textSlots: [{ id: 'cap', x: 0, y: 0.755, width: 1, height: 0.245, align: 'center', placeholder: 'Tap to add text' }],
};
const T8x8_32: PageTemplate = {
  ...tmpl('t8x8-32', 'Quad 2×2 4:3 + Caption', 'quad', STD, 'square', '4:3', [S88], [
    rsBox(0, 0, '4:3', 0.49, 0.3675, S88),
    rsBox(0.51, 0, '4:3', 0.49, 0.3675, S88),
    rsBox(0, 0.3775, '4:3', 0.49, 0.3675, S88),
    rsBox(0.51, 0.3775, '4:3', 0.49, 0.3675, S88),
  ]),
  textSlots: [{ id: 'cap', x: 0, y: 0.755, width: 1, height: 0.245, align: 'center', placeholder: 'Tap to add text' }],
};
const T9x9_32: PageTemplate = {
  ...tmpl('t9x9-32', 'Quad 2×2 4:3 + Caption', 'quad', STD, 'square', '4:3', [S99], [
    rsBox(0, 0, '4:3', 0.49, 0.3675, S99),
    rsBox(0.51, 0, '4:3', 0.49, 0.3675, S99),
    rsBox(0, 0.3775, '4:3', 0.49, 0.3675, S99),
    rsBox(0.51, 0.3775, '4:3', 0.49, 0.3675, S99),
  ]),
  textSlots: [{ id: 'cap', x: 0, y: 0.755, width: 1, height: 0.245, align: 'center', placeholder: 'Tap to add text' }],
};
// Quad 2×2 3:4 + Caption
const T6x6_32: PageTemplate = {
  ...tmpl('t6x6-32', 'Quad 2×2 3:4 + Caption', 'quad', STD, 'square', '3:4', [S66], [
    rsBox(0, 0, '3:4', 0.3675, 0.49, S66),
    rsBox(0, 0.51, '3:4', 0.3675, 0.49, S66),
    rsBox(0.3775, 0, '3:4', 0.3675, 0.49, S66),
    rsBox(0.3775, 0.51, '3:4', 0.3675, 0.49, S66),
  ]),
  textSlots: [{ id: 'cap', x: 0.755, y: 0, width: 0.245, height: 1, align: 'center', placeholder: 'Tap to add text' }],
};
const T8x8_33: PageTemplate = {
  ...tmpl('t8x8-33', 'Quad 2×2 3:4 + Caption', 'quad', STD, 'square', '3:4', [S88], [
    rsBox(0, 0, '3:4', 0.3675, 0.49, S88),
    rsBox(0, 0.51, '3:4', 0.3675, 0.49, S88),
    rsBox(0.3775, 0, '3:4', 0.3675, 0.49, S88),
    rsBox(0.3775, 0.51, '3:4', 0.3675, 0.49, S88),
  ]),
  textSlots: [{ id: 'cap', x: 0.755, y: 0, width: 0.245, height: 1, align: 'center', placeholder: 'Tap to add text' }],
};
const T9x9_33: PageTemplate = {
  ...tmpl('t9x9-33', 'Quad 2×2 3:4 + Caption', 'quad', STD, 'square', '3:4', [S99], [
    rsBox(0, 0, '3:4', 0.3675, 0.49, S99),
    rsBox(0, 0.51, '3:4', 0.3675, 0.49, S99),
    rsBox(0.3775, 0, '3:4', 0.3675, 0.49, S99),
    rsBox(0.3775, 0.51, '3:4', 0.3675, 0.49, S99),
  ]),
  textSlots: [{ id: 'cap', x: 0.755, y: 0, width: 0.245, height: 1, align: 'center', placeholder: 'Tap to add text' }],
};
// Hero + Trio 4:3 (full-page fill, no caption)
const T6x6_33 = tmpl('t6x6-33', 'Hero + Trio 4:3', 'quad', STD, 'square', '4:3', [S66], [
  rsBox(0, 0, '4:3', 1.0, 0.75, S66),
  rsBox(0.02, 0.76, '4:3', 0.32, 0.24, S66),
  rsBox(0.34, 0.76, '4:3', 0.32, 0.24, S66),
  rsBox(0.66, 0.76, '4:3', 0.32, 0.24, S66),
]);
const T8x8_34 = tmpl('t8x8-34', 'Hero + Trio 4:3', 'quad', STD, 'square', '4:3', [S88], [
  rsBox(0, 0, '4:3', 1.0, 0.75, S88),
  rsBox(0.02, 0.76, '4:3', 0.32, 0.24, S88),
  rsBox(0.34, 0.76, '4:3', 0.32, 0.24, S88),
  rsBox(0.66, 0.76, '4:3', 0.32, 0.24, S88),
]);
const T9x9_34 = tmpl('t9x9-34', 'Hero + Trio 4:3', 'quad', STD, 'square', '4:3', [S99], [
  rsBox(0, 0, '4:3', 1.0, 0.75, S99),
  rsBox(0.02, 0.76, '4:3', 0.32, 0.24, S99),
  rsBox(0.34, 0.76, '4:3', 0.32, 0.24, S99),
  rsBox(0.66, 0.76, '4:3', 0.32, 0.24, S99),
]);

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

/* ══════════════════════════════════════════════════════════════════════════
   QR "LIVING MEMORY" TEMPLATES — a full 1:1 hero photo + a corner QR slot.
   Square-only for now: a 1:1 photo fills a 1:1 canvas with NO crop and NO
   whitespace, so strict ratio-matching still holds while the QR sits in the
   bottom-right corner on its own white backing (drawn AFTER the photo in all
   three renderers, so it stays scannable on top). OPT-IN ONLY — excluded from
   album generation + the layout picker (see hasQrSlot in getTemplatesForAlbum /
   getTemplatesForRatio) so a photo is never auto-placed into the QR slot; the
   user picks these from the Templates tab.
   ══════════════════════════════════════════════════════════════════════════ */
function qrHeroSquare(id: string, size: AlbumSizePreset): PageTemplate {
  return tmpl(id, 'Photo + QR Memory', 'duo', STD, 'square', '1:1', [size], [
    rsBox(0, 0, '1:1', 1.0, 1.0, size),
    { id: `${id}-qr`, x: 0.70, y: 0.70, width: 0.26, height: 0.26, kind: 'qr' },
  ]);
}
const T_QR_66 = qrHeroSquare('tqr-66', S66);
const T_QR_88 = qrHeroSquare('tqr-88', S88);
const T_QR_99 = qrHeroSquare('tqr-99', S99);

const PAGE_TEMPLATES_BASE: PageTemplate[] = [
  T_QR_66, T_QR_88, T_QR_99,
  T8x8_TILE_C,
  // 6×4 (6 templates)
  T6x4_01, T6x4_02, T6x4_03, T6x4_04, T6x4_05, T6x4_06,
  // 6×4 NEW (trio strip + caption, hero + pair)
  T6x4_07, T6x4_08,
  // 6×4 INC1 (3-photo fill: trio squares, hero+pair 3:2, trio columns 4:3)
  T6x4_09, T6x4_10, T6x4_11,
  // 6×4 INC2 (4-photo quad: 2x2 3:2, 2x2 4:3 + caption, hero + trio strip 4:3)
  T6x4_12,
  // 6×4 INC3 (4 & 5-photo: quad row 1:1, five row 1:1, hero + quad 3:2)
  T6x4_15, T6x4_16, T6x4_17,
  // 6×4 INC4 (5 & 6-photo: two-top three-bottom 4:3, sextet 3x2 1:1, sextet 3x2 4:3)
  T6x4_18, T6x4_19, T6x4_20,
  // 6×4 INC5 (finish variety: trio row 3:2 + cap, hero + five 1:1, quad staggered 4:3 + cap)
  T6x4_21,
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
  // 6×6 / 8×8 / 9×9 NEW (Inc 7: FILL-correct square 4-photo — Quad 2×2 4:3 + Cap, 3:4 + Cap, Hero + Trio 4:3)
  T6x6_31, T8x8_32, T9x9_32,
  T6x6_32, T8x8_33, T9x9_33,
  T6x6_33, T8x8_34, T9x9_34,
  // 11.5×8 (12 templates)
  T1158_01, T1158_02, T1158_03, T1158_04, T1158_05, T1158_06, T1158_07, T1158_08, T1158_09, T1158_10, T1158_11, T1158_12,
  // 11.5×8 NEW (varied-ratio 3/4/5-photo)
  T1158_13, T1158_14, T1158_15,
  // 11.5×8 NEW (trio + side caption)
  T1158_16,
  // 11.5×8 NEW (INC6: 6-photo sextet grids + hero)
  T1158_17, T1158_18, T1158_19,
  // 8.5×11 (12 templates)
  T8511_01, T8511_02, T8511_03, T8511_04, T8511_05, T8511_06, T8511_07, T8511_08, T8511_09, T8511_10, T8511_11, T8511_12,
  T8511_13, T8511_14, T8511_15,
  // 8.5×11 + 9×9 NEW (increment 6: caption layouts)
  T8511_16, T8511_17, T9x9_22,
  // 8.5×11 NEW (Inc 7: 3:4 6-photo sextet — grid + caption / title + grid)
  T8511_18, T8511_19,
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

/** Physical safe-area inches per size (album inches × the 0.04 margin each side). */
const GAP_SAFE_IN: Record<string, [number, number]> = {
  '6x4': [6 * 0.92, 4 * 0.92], '6x6': [6 * 0.92, 6 * 0.92], '8x8': [8 * 0.92, 8 * 0.92],
  '9x9': [9 * 0.92, 9 * 0.92], '11.5x8': [11.5 * 0.92, 8 * 0.92], '8.5x11': [8.5 * 0.92, 11 * 0.92],
};
/** Would a ratio-fit frame inside a [maxW×maxH] fraction of the safe area print
 *  at least 2" on its short side? (Mirrors rsBox's fit math so gap variants
 *  can't silently drop below the print floor on small albums.) */
function gapFloorOk(size: AlbumSizePreset, maxW: number, maxH: number, ratio: PhotoRatio): boolean {
  const [sw, sh] = GAP_SAFE_IN[size];
  const intrinsic = RATIOS[ratio] / (sw / sh);
  const hAtMaxW = maxW / intrinsic;
  const slotW = hAtMaxW <= maxH ? maxW : maxH * intrinsic;
  const slotH = hAtMaxW <= maxH ? hAtMaxW : maxH;
  return Math.min(slotW * sw, slotH * sh) >= 2;
}

const GAP_FILLERS: PageTemplate[] = [];
/** Templates that must EXIST (persisted albums reference their ids — a missing
 *  id silently blanks those pages in BOTH the preview and the print PDF) but
 *  must never be SELECTED again. Folded into isActive alongside the operator's
 *  hidden set; getTemplateById still resolves them so old drafts render. */
const RETIRED_TEMPLATE_IDS = new Set<string>();
// A caption band template slot (spread onto tmpl() with `...`, since tmpl has no
// text param). Kept terse for the several caption-bearing variants below.
const gapCap = (y: number, h: number): TextSlot =>
  ({ id: 'cap', x: 0, y, width: 1, height: h, align: 'center', placeholder: 'Tap to add text' });
for (const { size, orientation } of SIZE_ORIENTATION) {
  // ROOMY sizes (short side ≥ 8") can print a 3-across / big+small frame ≥ 2";
  // small albums (6×4, 6×6) can't, so they keep only the 1- and 2-photo variants.
  const roomy = size === S88 || size === S99 || size === S1158 || size === S8511;
  for (const ratio of ALL_RATIOS) {
    // NOTE: gap variants are emitted for EVERY (size × ratio) — including combos
    // the hand-made base covers. They used to be skipped for covered combos,
    // which meant operator curation could starve a combo down to ONE active
    // multi layout (the literal A,A,A,A album: no selection algorithm can deal
    // variety from a deck of one). These low-density variants are the pool
    // FLOOR: always present, individually hideable in /admin like any template.
    const key = `${size}-${ratio}`.replace(/[:.]/g, '');
    const wide = WIDE_RATIOS.has(ratio);

    // Every slot is exact-ratio (rsBox), so no crop — the hard product rule.

    // 1-photo full page (also the landing spot for leftover "hero" photos).
    GAP_FILLERS.push(tmpl(`gap-${key}-1`, `Full Page ${ratio}`, 'single', STD, orientation, ratio, [size], [
      rsBox(0, 0, ratio, 1.0, 1.0, size),
    ]));
    // 1-photo hero + caption band — a distinct single-photo look (keeps its
    // margin + caption, so it is NOT collapsed to full-bleed).
    GAP_FILLERS.push({ ...tmpl(`gap-${key}-1c`, `Hero ${ratio} + Caption`, 'single', STD, orientation, ratio, [size], [
      rsBox(0, 0, ratio, 1.0, 0.76, size),
    ]), textSlots: [gapCap(0.8, 0.2)] });
    // 2-photo duo — stack wide ratios; side-by-side for tall/square. EXCEPT on
    // 6×4: stacking any wide ratio there caps the frame height at ~1.79" (the
    // safe height is only 3.68"), under the 2" print floor — so 4:3 and 3:2 go
    // SIDE-BY-SIDE (4:3 prints 2.68×2.01", compliant; 3:2 prints 2.68×1.79",
    // parity with the hand-made t6x4-05 — no compliant 3:2 duo exists on 6×4
    // at all). 16:9 stays stacked: side-by-side would print shorter (1.51").
    const stackWide = wide && !(size === S64 && (ratio === '4:3' || ratio === '3:2'));
    GAP_FILLERS.push(tmpl(`gap-${key}-2`, `Duo ${ratio}`, 'duo', STD, orientation, ratio, [size], stackWide ? [
      rsBox(0, 0, ratio, 1.0, 0.485, size),
      rsBox(0, 0.515, ratio, 1.0, 0.485, size),
    ] : [
      rsBox(0, 0, ratio, 0.485, 1.0, size),
      rsBox(0.515, 0, ratio, 0.485, 1.0, size),
    ]));
    // 2-photo duo + caption — same pairing, different composition. On 6×4 its
    // frames print under the 2" floor, so it is never SELECTABLE there — but
    // the three ids that shipped BEFORE this gate (2:3/16:9/9:16 were uncovered
    // combos at the time) must stay RESOLVABLE: albums persisted with them
    // would otherwise render + print BLANK pages. Those are emitted as retired.
    const t2c: PageTemplate = { ...tmpl(`gap-${key}-2c`, `Duo ${ratio} + Caption`, 'duo', STD, orientation, ratio, [size], wide ? [
      rsBox(0, 0, ratio, 1.0, 0.37, size),
      rsBox(0, 0.39, ratio, 1.0, 0.37, size),
    ] : [
      rsBox(0, 0, ratio, 0.485, 0.76, size),
      rsBox(0.515, 0, ratio, 0.485, 0.76, size),
    ]), textSlots: [gapCap(0.8, 0.2)] };
    if (size !== S64) {
      GAP_FILLERS.push(t2c);
    } else if (ratio === '2:3' || ratio === '16:9' || ratio === '9:16') {
      GAP_FILLERS.push(t2c);
      RETIRED_TEMPLATE_IDS.add(t2c.id);
    }

    if (roomy) {
      // 2-photo asymmetric big + small — a different rhythm from the even duo.
      // (Kept at 2 photos on purpose: more DISTINCT low-density layouts give
      // variety AND more pages; a 3-up would pack photos and shrink the album.)
      GAP_FILLERS.push(tmpl(`gap-${key}-2a`, `Big + Small ${ratio}`, 'duo', STD, orientation, ratio, [size], wide ? [
        rsBox(0, 0, ratio, 1.0, 0.63, size),
        rsBox(0.28, 0.66, ratio, 0.44, 0.34, size),
      ] : [
        rsBox(0, 0, ratio, 0.63, 1.0, size),
        rsBox(0.66, 0.25, ratio, 0.34, 0.5, size),
      ]));
      // 2-photo big + small, mirrored — small photo top-left, hero bottom/right.
      GAP_FILLERS.push(tmpl(`gap-${key}-2b`, `Small + Big ${ratio}`, 'duo', STD, orientation, ratio, [size], wide ? [
        rsBox(0.28, 0, ratio, 0.44, 0.34, size),
        rsBox(0, 0.37, ratio, 1.0, 0.63, size),
      ] : [
        rsBox(0, 0.25, ratio, 0.34, 0.5, size),
        rsBox(0.37, 0, ratio, 0.63, 1.0, size),
      ]));
    } else if (!wide) {
      // Small albums (6×4 / 6×6), tall/square ratios: add caption-FREE duos so
      // that once the caption cadence restricts a page to box-free layouts,
      // there's more than one to deal. Each is floor-gated — dropped on any
      // size where it would print under 2" (6×4 has little room; 6×6 has more).
      if (gapFloorOk(size, 1.0, 0.485, ratio)) {
        GAP_FILLERS.push(tmpl(`gap-${key}-2s`, `Stacked ${ratio}`, 'duo', STD, orientation, ratio, [size], [
          rsBox(0, 0, ratio, 1.0, 0.485, size),
          rsBox(0, 0.515, ratio, 1.0, 0.485, size),
        ]));
      }
      if (gapFloorOk(size, 0.42, 1.0, ratio)) {
        GAP_FILLERS.push(tmpl(`gap-${key}-2x`, `Wide + Narrow ${ratio}`, 'duo', STD, orientation, ratio, [size], [
          rsBox(0, 0, ratio, 0.56, 1.0, size),
          rsBox(0.58, 0, ratio, 0.42, 1.0, size),
        ]));
      }
    }
  }
}

/* ── QR living-memory corner badge ─────────────────────────────────────────
   A full-bleed photo with a small scannable QR chip tucked into a corner (the
   corner is chosen by face-avoidance when the memory is added). The QR slot is
   kind:'qr', so:
     • these are OPT-IN — hasQrSlot() excludes them from auto-generation, so a
       photo is never dealt onto the QR slot;
     • the QR renders through the SAME shared qrRect() path (white quiet-zone
       chip + centered code) in all three renderers — zero renderer changes.
   Four corner variants per size = the "same photo, different corner" assortment.
   The chip is sized to a fixed PRINTED inch, so it stays scannable on every
   album size (qrRect squares it to the smaller dimension). */
export const QR_CORNERS = ['tl', 'tr', 'bl', 'br'] as const;
export type QrCorner = typeof QR_CORNERS[number];
const QR_BADGE_IN = 1.2;   // printed QR side — comfortably scannable at arm's length
const QR_PAD_IN = 0.35;    // inset from the trimmed page edge
const ZERO_MARGIN_PT: TemplateMargin = { top: 0, bottom: 0, left: 0, right: 0 };
// FULL album inches (NOT the 0.92 safe area): these templates are fullBleed with
// a zero margin, so their slot fractions are of the WHOLE page — dividing by the
// safe area would over-size the chip by ~9%.
const QR_FULL_IN: Record<string, [number, number]> = {
  '6x4': [6, 4], '6x6': [6, 6], '8x8': [8, 8], '9x9': [9, 9], '11.5x8': [11.5, 8], '8.5x11': [8.5, 11],
};
const QR_BADGE_TEMPLATES: PageTemplate[] = [];
for (const { size, orientation } of SIZE_ORIENTATION) {
  const [sw, sh] = QR_FULL_IN[size];
  // A square chip: set both fractions so slotW·sw == slotH·sh == QR_BADGE_IN.
  const w = QR_BADGE_IN / sw, h = QR_BADGE_IN / sh;
  const px = QR_PAD_IN / sw, py = QR_PAD_IN / sh;
  for (const corner of QR_CORNERS) {
    const x = corner === 'tl' || corner === 'bl' ? px : 1 - px - w;
    const y = corner === 'tl' || corner === 'tr' ? py : 1 - py - h;
    QR_BADGE_TEMPLATES.push({
      id: `qr-badge-${size}-${corner}`.replace(/[.]/g, ''),
      name: `Full photo + QR (${corner.toUpperCase()})`,
      category: 'single',
      slotCount: 2,          // photo + QR chip (kind:'qr' → filled from qrFills)
      margin: ZERO_MARGIN_PT,
      orientation,
      targetRatio: '1:1',
      albumSizes: [size],
      fullBleed: true,
      slots: [
        { id: `qrb-${size}-${corner}-photo`, x: 0, y: 0, width: 1, height: 1 },
        { id: `qrb-${size}-${corner}-qr`, x, y, width: w, height: h, kind: 'qr' },
      ],
    });
  }
}

/** The full-bleed + QR-badge template for a size and corner (or undefined). */
export function qrBadgeTemplate(size: AlbumSizePreset, corner: QrCorner): PageTemplate | undefined {
  return QR_BADGE_TEMPLATES.find((t) => t.id === `qr-badge-${size}-${corner}`.replace(/[.]/g, ''));
}

/** The corner a placed QR-badge page currently uses, parsed from its templateId
 *  (`qr-badge-<size>-<corner>`). null when the page isn't a QR-badge page — used
 *  to (a) gate the corner picker to badge pages and (b) highlight the active corner. */
export function qrBadgeCornerOf(templateId?: string): QrCorner | null {
  const m = templateId?.match(/-(tl|tr|bl|br)$/);
  return m && templateId?.startsWith('qr-badge-') ? (m[1] as QrCorner) : null;
}

/** Pick the corner FARTHEST from a detected face center (normalized 0–1), so
 *  the QR chip tucks into the emptiest corner and never lands on a face. Falls
 *  back to bottom-right when no face was found. */
export function qrCornerAwayFromFace(face: { x: number; y: number } | null): QrCorner {
  if (!face) return 'br';
  const d: Record<QrCorner, number> = {
    tl: Math.hypot(face.x, face.y),
    tr: Math.hypot(1 - face.x, face.y),
    bl: Math.hypot(face.x, 1 - face.y),
    br: Math.hypot(1 - face.x, 1 - face.y),
  };
  return (Object.keys(d) as QrCorner[]).reduce((best, c) => (d[c] > d[best] ? c : best), 'br');
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
  // QR-badge templates are already full-bleed 2-slot layouts, so they pass
  // through applySinglePicFullBleed untouched (it only promotes lone photo slots).
  [...TILED_TEMPLATES, ...PAGE_TEMPLATES_BASE, ...GAP_FILLERS, ...QR_BADGE_TEMPLATES]
    .map(applySinglePicFullBleed);

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
  return !INACTIVE_TEMPLATE_IDS.has(t.id) && !RETIRED_TEMPLATE_IDS.has(t.id);
}

/* ── Geometry dedupe ─────────────────────────────────────────────────────────
   The generated gap variants intentionally overlap some hand-made layouts —
   they exist as a pool FLOOR against operator curation. When BOTH twins are
   active, selection must treat them as ONE layout: two ids with identical
   pixels would let the dealer place "different" templates on consecutive
   pages that LOOK identical, and would satisfy the ≥3-distinct variety checks
   with fake variety. The hand-made id wins; the gap twin only surfaces when
   curation hides its counterpart. */
const geoSigCache = new WeakMap<PageTemplate, string>();
function geoSig(t: PageTemplate): string {
  let sig = geoSigCache.get(t);
  if (!sig) {
    const slots = t.slots
      .map((s) => `${s.x.toFixed(3)},${s.y.toFixed(3)},${s.width.toFixed(3)},${s.height.toFixed(3)},${s.ratio ?? ''},${(s as { shape?: string }).shape ?? ''}`)
      .join(';');
    const texts = (t.textSlots ?? [])
      .map((s) => `${s.x.toFixed(2)},${s.y.toFixed(2)},${s.width.toFixed(2)},${s.height.toFixed(2)}`)
      .join(';');
    sig = `${t.fullBleed ? 'FB|' : ''}${slots}|T:${texts}`;
    geoSigCache.set(t, sig);
  }
  return sig;
}
function dedupeByGeometry(list: PageTemplate[]): PageTemplate[] {
  const keeper = new Map<string, PageTemplate>();
  for (const t of list) {
    const k = geoSig(t);
    const cur = keeper.get(k);
    if (!cur || (cur.id.startsWith('gap-') && !t.id.startsWith('gap-'))) keeper.set(k, t);
  }
  return list.filter((t) => keeper.get(geoSig(t)) === t);
}

/** A template that carries a QR "living memory" slot. These are OPT-IN ONLY:
 *  excluded from album generation + the "Change layout" picker so a photo is
 *  never auto-placed into a QR slot. Reachable only via the Templates tab
 *  (which browses PAGE_TEMPLATES directly). */
export function hasQrSlot(t: PageTemplate): boolean {
  return t.slots.some((s) => s.kind === 'qr');
}

/** Count of PHOTO slots (excludes QR slots). Used for the Templates-tab count
 *  label + the slot-count filter, so a 'Photo + QR Memory' template presents and
 *  filters as a 1-photo template. Equals slotCount for non-QR templates. */
export function photoSlotCount(t: PageTemplate): number {
  return t.slots.reduce((n, s) => (s.kind === 'qr' ? n : n + 1), 0);
}

/** Get templates filtered by album size (auto-generation + layout picker). QR
 *  templates are excluded here on purpose — see hasQrSlot. */
export function getTemplatesForAlbum(albumSize: AlbumSizePreset): PageTemplate[] {
  return dedupeByGeometry(PAGE_TEMPLATES.filter(t => isActive(t) && !hasQrSlot(t) && t.albumSizes.includes(albumSize)));
}

/** Get templates filtered by album size AND target ratio */
export function getTemplatesForRatio(
  albumSize: AlbumSizePreset,
  targetRatio: PhotoRatio,
): PageTemplate[] {
  return dedupeByGeometry(PAGE_TEMPLATES.filter(
    t => isActive(t) && !hasQrSlot(t) && t.albumSizes.includes(albumSize) && t.targetRatio === targetRatio,
  ));
}

/** Get templates filtered by album size, ratio, AND photo count */
export function getTemplatesForCount(
  albumSize: AlbumSizePreset,
  targetRatio: PhotoRatio,
  slotCount: number,
): PageTemplate[] {
  return dedupeByGeometry(PAGE_TEMPLATES.filter(
    t => isActive(t) && t.albumSizes.includes(albumSize) && t.targetRatio === targetRatio && t.slotCount === slotCount,
  ));
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
