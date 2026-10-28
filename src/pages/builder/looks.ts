/* LOOKS (owner, 2026-09-13, Studio): a colour treatment on ONE photo. The
   looks themselves and their pixel maths live in lookRules.ts, which the 2.0
   app shares; everything there is re-exported here, so the website imports
   this file as before. This file adds applyLookPixels, which colours a
   region of a browser canvas. */

import { applyLookToPixel, lookOps, type LookId } from './lookRules';

export * from './lookRules';

/** Apply a look to a canvas region in place (Fabric offscreen + print). */
export function applyLookPixels(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, id: LookId | null | undefined): void {
  const ops = lookOps(id);
  if (!ops.length || w <= 0 || h <= 0) return;
  const img = ctx.getImageData(x, y, w, h);
  const d = img.data;
  // A 256³ lookup is too big; a per-channel cache per unique colour is not
  // worth it either — the matrices are 9 multiplies per pixel. Fine for a
  // frame at print size (a few million pixels).
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const [r, g, b] = applyLookToPixel(d[i], d[i + 1], d[i + 2], ops);
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  ctx.putImageData(img, x, y);
}
