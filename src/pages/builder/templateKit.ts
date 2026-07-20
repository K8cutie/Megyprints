import type { PageTemplate, TemplateSlot, TemplateMargin, AlbumSizePreset } from './types';
import type { PhotoRatio } from './photoAnalyzer';

/** ══════════════════════════════════════════════════════════════════════════
 *  TEMPLATE KIT — the shared authoring primitives for page layouts.
 *
 *  Extracted from pageTemplates.ts so that layouts can be authored ONE ALBUM
 *  SIZE PER FILE (templates6x6.ts, …). This module is a LEAF: it imports only
 *  types, so both pageTemplates.ts and tiledTemplates.ts can depend on it with
 *  no import cycle.
 *
 *  Slot ids (`s1`, `s2`, …) come from a module-level counter and are NOT
 *  persisted — album data addresses slots POSITIONALLY (slotFills[i] pairs with
 *  template.slots[i]), so the counter's sequence is free to change.
 *  ══════════════════════════════════════════════════════════════════════════ */

/** Album sizes whose layout set is owned ENTIRELY by its own per-size file.
 *
 *  For a size listed here, the legacy hand-made block, the generated GAP_FILLERS
 *  and the tiled generator all emit NOTHING — the file is the single source of
 *  truth, so what you author is exactly what the builder can deal. (QR-badge
 *  templates are exempt: they carry the QR living-memory feature rather than
 *  being a layout choice, and are opt-in only.)
 *
 *  Add a size here when you take over authoring it; it starts EMPTY, and a size
 *  with zero layouts is not offered in the size picker (see albumSizeOptions). */
export const PER_SIZE_AUTHORED = new Set<AlbumSizePreset>(['6x6', '8x8', '9x9']);

export const STD: TemplateMargin = { top: 0.04, bottom: 0.04, left: 0.04, right: 0.04 };

/** Canvas dimensions for ratio calculations */
export const CANVAS_DIMS: Record<AlbumSizePreset, { w: number; h: number }> = {
  '6x4':    { w: 1800, h: 1200 },
  '6x6':    { w: 1800, h: 1800 },
  '8x8':    { w: 2400, h: 2400 },
  '9x9':    { w: 2700, h: 2700 },
  '11.5x8': { w: 3450, h: 2400 },
  '8.5x11': { w: 2550, h: 3300 },
};

/** Standard photo aspect ratios (width / height) */
export const RATIOS: Record<PhotoRatio, number> = {
  '4:3':  4 / 3,   // 1.333  ← phone landscape (primary)
  '3:4':  3 / 4,   // 0.750  ← phone portrait (primary)
  '3:2':  3 / 2,   // 1.500  ← DSLR landscape
  '2:3':  2 / 3,   // 0.667  ← DSLR portrait
  '1:1':  1 / 1,   // 1.000  ← square
  '16:9': 16 / 9,  // 1.778  ← panoramic
  '9:16': 9 / 16,  // 0.563  ← portrait panoramic
};

/** Physical inches per album size — the FULL trim, not the safe area. */
export const ALBUM_INCHES: Record<AlbumSizePreset, { w: number; h: number }> = {
  '6x4':    { w: 6,    h: 4  },
  '6x6':    { w: 6,    h: 6  },
  '8x8':    { w: 8,    h: 8  },
  '9x9':    { w: 9,    h: 9  },
  '11.5x8': { w: 11.5, h: 8  },
  '8.5x11': { w: 8.5,  h: 11 },
};

/** Smallest short side we will print a photo frame at. Below this a frame reads
 *  as a thumbnail on paper, so any layout whose frames fall under it is dropped
 *  rather than shipped. */
export const MIN_FRAME_INCHES = 2;

/** Printed size of a slot, in inches.
 *
 *  Slot fractions are of the SAFE AREA on a normal template but of the WHOLE
 *  TRIMMED PAGE on a full-bleed one, so the caller must say which. Measuring a
 *  full-bleed slot against the safe area under-reports it by 8% — enough to
 *  fail a compliant 2.00" frame and tempt an author into "fixing" a layout that
 *  was already correct. */
export function slotInches(
  albumSize: AlbumSizePreset, width: number, height: number,
  opts: { fullBleed?: boolean } = {},
): { w: number; h: number } {
  const { w, h } = ALBUM_INCHES[albumSize];
  const spanW = opts.fullBleed ? w : w * (1 - STD.left - STD.right);
  const spanH = opts.fullBleed ? h : h * (1 - STD.top - STD.bottom);
  return { w: width * spanW, h: height * spanH };
}

/** Would this slot print at or above the 2" floor on this album size?
 *  Pass `{ fullBleed: true }` for a zero-margin template — see slotInches. */
export function meetsPrintFloor(
  albumSize: AlbumSizePreset, width: number, height: number,
  opts: { fullBleed?: boolean } = {},
): boolean {
  const { w, h } = slotInches(albumSize, width, height, opts);
  return Math.min(w, h) >= MIN_FRAME_INCHES;
}

let slotCounter = 0;

/** Compute slot proportions for a target photo ratio on a specific album size.
 *
 *  The safe area has aspect ratio: safeW/safeH = canvasW/canvasH
 *  We want: (slotW * safeW) / (slotH * safeH) = targetRatio
 *  So: slotW/slotH = targetRatio / canvasRatio
 *
 *  fill='height' → slot fills full safe area height (slotH=1), slotW computed
 *  fill='width'  → slot fills full safe area width  (slotW=1), slotH computed
 */
export function rs(
  x: number,
  y: number,
  targetRatio: PhotoRatio,
  albumSize: AlbumSizePreset,
  fillAxis: 'height' | 'width',
  opts: Partial<Omit<TemplateSlot, 'id' | 'x' | 'y' | 'width' | 'height'>> = {},
): TemplateSlot {
  slotCounter += 1;
  const { w: cw, h: ch } = CANVAS_DIMS[albumSize];
  const canvasRatio = cw / ch;
  const t = RATIOS[targetRatio];

  // slotW/slotH = targetRatio / canvasRatio
  const proportionRatio = t / canvasRatio;

  let sw: number, sh: number;
  if (fillAxis === 'height') {
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
export function rsBox(
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
export function rsBoxExact(
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
export function fill(
  x: number, y: number, width: number, height: number, ratio: PhotoRatio,
  opts: Partial<Omit<TemplateSlot, 'id' | 'x' | 'y' | 'width' | 'height'>> = {},
): TemplateSlot {
  slotCounter += 1;
  return { id: `s${slotCounter}`, x, y, width, height, ratio, ...opts };
}

/** Helper: create a template */
export function tmpl(
  id: string, name: string, category: PageTemplate['category'],
  margin: TemplateMargin, orientation: PageTemplate['orientation'],
  targetRatio: PhotoRatio, albumSizes: AlbumSizePreset[],
  slots: TemplateSlot[],
): PageTemplate {
  return { id, name, category, slotCount: slots.length, margin, orientation, targetRatio, albumSizes, slots };
}
