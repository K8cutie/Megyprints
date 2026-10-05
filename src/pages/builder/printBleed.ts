/* ══════════════════════════════════════════════════════════════════════════
   printBleed — the art carries on past the cut, so a trim that drifts cuts
   through picture, never white paper.

   1-star testers round 2 (the print inspector):
   • PI-2: the interior page files were exactly 8.00 × 8.00 in with photos
     touching the trim on three sides — any trim drift leaves a white
     hairline, or the shop trims inside the design and the book comes out
     smaller than the 8×8 paid for.
   • PI-3: on the hardbound wrap the front photo stopped exactly at the 8×8
     panel; the 0.625" turn-in that wraps around the board was cream, so the
     board's edge would show a cream line.

   The measures are the settled ones in PRINTER_SPEC (coverGeometry): bleed
   0.125" (3 mm) on every page edge, the hardcover turn-in 0.625" (16 mm).
   The page is drawn exactly as the customer approved it, then its outer
   edge is MIRRORED outward into the bleed / turn-in: nothing inside the cut
   line moves or rescales, and the strip that is cut off (or wrapped round
   the board) continues the picture seamlessly. The 0.5" spine keep-out is
   untouched — that is inside the page, where the glue is.
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

/** Draw the mirrored strips around an image already drawn at `box`. */
export function drawMirroredEdges(
  ctx: CanvasRenderingContext2D, src: CanvasImageSource, srcW: number, srcH: number, box: Box, m: Margins,
): void {
  for (const op of mirrorOps(srcW, srcH, box, m)) {
    ctx.save();
    ctx.translate(op.flipX ? op.dx + op.dw : op.dx, op.flipY ? op.dy + op.dh : op.dy);
    ctx.scale(op.flipX ? -1 : 1, op.flipY ? -1 : 1);
    ctx.drawImage(src, op.sx, op.sy, op.sw, op.sh, 0, 0, op.dw, op.dh);
    ctx.restore();
  }
}

/** Bleed in pixels at a resolution (PRINTER_SPEC.bleedIn — 0.125" = 38 px at 300 DPI). */
export const bleedPx = (dpi: number): number => Math.round(PRINTER_SPEC.bleedIn * dpi);

/** An interior page file's size: the trim plus the bleed on every edge. */
export function pageSizeWithBleedIn(trimWIn: number, trimHIn: number): { wIn: number; hIn: number } {
  return { wIn: trimWIn + 2 * PRINTER_SPEC.bleedIn, hIn: trimHIn + 2 * PRINTER_SPEC.bleedIn };
}

/** A page canvas drawn at trim size → the same page with the bleed around it. */
export function withBleed(trim: HTMLCanvasElement, bleed: number): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = trim.width + 2 * bleed;
  out.height = trim.height + 2 * bleed;
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(trim, bleed, bleed);
  const box = { x: bleed, y: bleed, w: trim.width, h: trim.height };
  drawMirroredEdges(ctx, trim, trim.width, trim.height, box, { top: bleed, right: bleed, bottom: bleed, left: bleed });
  return out;
}
