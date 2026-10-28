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
   the board) continues the picture seamlessly. The 3/8" spine keep-out is
   untouched — that is inside the page, where the glue is.
   ══════════════════════════════════════════════════════════════════════════ */

import { mirrorOps, type Box, type Margins } from './bleedGeometry';

/* The measures and the mirror maths live in bleedGeometry.ts, which the 2.0
   app shares. Everything is re-exported here, so the website imports this
   file as before. */
export * from './bleedGeometry';

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
