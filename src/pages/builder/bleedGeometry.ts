/* ══════════════════════════════════════════════════════════════════════════
   BLEED GEOMETRY: the part of printBleed.ts that needs no browser, so the
   2.0 app adds the same bleed to a page (src/shared/sharedModules.ts): how
   wide the bleed is, a page file's size with it, and the mirrored strips
   that fill it (mirrorOps). printBleed.ts re-exports all of it and adds the
   canvas drawing; the website imports printBleed.ts exactly as before. Why
   pages have a bleed at all is told in printBleed.ts.
   ══════════════════════════════════════════════════════════════════════════ */

import { PRINTER_SPEC } from './coverGeometry';

export interface Margins { top: number; right: number; bottom: number; left: number }
export interface Box { x: number; y: number; w: number; h: number }

/** One draw: source pixels (in the image's own size) → destination box,
 *  flipped so the strip mirrors the image edge it sits against. */
export interface MirrorOp {
  sx: number; sy: number; sw: number; sh: number;
  dx: number; dy: number; dw: number; dh: number;
  flipX: boolean; flipY: boolean;
}

/** The draws that continue an image (srcW × srcH, drawn at `box`) outward by
 *  `m` on each side as its own mirror image: up to 4 sides + 4 corners. */
export function mirrorOps(srcW: number, srcH: number, box: Box, m: Margins): MirrorOp[] {
  const kx = srcW / box.w;
  const ky = srcH / box.h;
  const ops: MirrorOp[] = [];
  // Source spans are clamped to the image: a margin wider than the picture
  // repeats what there is rather than reading outside it.
  const sW = (d: number) => Math.min(srcW, d * kx);
  const sH = (d: number) => Math.min(srcH, d * ky);
  const cols: { dx: number; dw: number; sx: number; sw: number; flipX: boolean }[] = [
    ...(m.left > 0 ? [{ dx: box.x - m.left, dw: m.left, sx: 0, sw: sW(m.left), flipX: true }] : []),
    { dx: box.x, dw: box.w, sx: 0, sw: srcW, flipX: false },
    ...(m.right > 0 ? [{ dx: box.x + box.w, dw: m.right, sx: srcW - sW(m.right), sw: sW(m.right), flipX: true }] : []),
  ];
  const rows: { dy: number; dh: number; sy: number; sh: number; flipY: boolean }[] = [
    ...(m.top > 0 ? [{ dy: box.y - m.top, dh: m.top, sy: 0, sh: sH(m.top), flipY: true }] : []),
    { dy: box.y, dh: box.h, sy: 0, sh: srcH, flipY: false },
    ...(m.bottom > 0 ? [{ dy: box.y + box.h, dh: m.bottom, sy: srcH - sH(m.bottom), sh: sH(m.bottom), flipY: true }] : []),
  ];
  for (const r of rows) {
    for (const c of cols) {
      if (!c.flipX && !r.flipY) continue; // the picture itself is already drawn
      ops.push({ sx: c.sx, sy: r.sy, sw: c.sw, sh: r.sh, dx: c.dx, dy: r.dy, dw: c.dw, dh: r.dh, flipX: c.flipX, flipY: r.flipY });
    }
  }
  return ops;
}

/** Bleed in pixels at a resolution (PRINTER_SPEC.bleedIn — 0.125" = 38 px at 300 DPI). */
export const bleedPx = (dpi: number): number => Math.round(PRINTER_SPEC.bleedIn * dpi);

/** An interior page file's size: the trim plus the bleed on every edge. */
export function pageSizeWithBleedIn(trimWIn: number, trimHIn: number): { wIn: number; hIn: number } {
  return { wIn: trimWIn + 2 * PRINTER_SPEC.bleedIn, hIn: trimHIn + 2 * PRINTER_SPEC.bleedIn };
}

