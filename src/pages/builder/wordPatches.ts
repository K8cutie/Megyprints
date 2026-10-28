/* ══════════════════════════════════════════════════════════════════════════
   SHARP WORDS (owner, 2026-10-21: "the cover page and the text — its print
   out looks low resolution").

   A page goes in the print file as one JPEG, shrunk to fit the upload cap
   (printFileSpec PRINT_PAGE_MAX_SIDE): fine for photos, but the words came
   out soft — drawn at 300 DPI, shrunk (to ~218 DPI on an 8×8), then
   JPEG-smudged round every letter. So the words go in on their own: the page
   is drawn twice, with and without its words, and every pixel the words
   change goes over the picture as a see-through, lossless 300 DPI picture
   (WordPatch). Only pixels that differ are kept, so whatever covers the words
   on the page (a photo or QR in a box) still covers them on paper. The cover
   does the same for its title, spine and back.

   Moved out of printPipeline.ts (which re-exports it) so the 2.0 app makes
   its print files' words with this very code (src/shared/sharedModules.ts):
   it takes pixels from anything that hands out RGBA rows, a browser canvas
   or the app's Skia surface.
   ══════════════════════════════════════════════════════════════════════════ */

import { rgbaToPng } from '../../lib/rgbaPng';

/** A page's (or the cover's) words as a see-through picture laid over its
 *  picture. x/y/w/h are fractions of the picture, its bleed included. */
export interface WordPatch { png: Uint8Array; x: number; y: number; w: number; h: number }

/** A WordPatch in canvas pixels, before it is placed. */
export interface PxPatch { png: Uint8Array; x: number; y: number; w: number; h: number }

export interface PixelArea { x: number; y: number; w: number; h: number }

/** RGBA pixels, not premultiplied, a row after another (a canvas's
 *  getImageData, or the app's Skia readPixels). Each call returns a fresh
 *  array of its own: the code reads it 32 bits at a time from its buffer. */
export interface PixelSource { getImageData(x: number, y: number, w: number, h: number): { data: Uint8Array | Uint8ClampedArray } }

/** Rows this close together make one patch (0.15 in at 300 DPI): a caption's
 *  lines go in one picture, a title and a caption far apart in two. */
const PATCH_GAP_PX = 45;
const DIFF_STRIP_ROWS = 256;

/** The pixels of `area` where `withWords` differs from `without`, as patches:
 *  opaque where they differ (the page's true colour there), see-through
 *  elsewhere — with the page's colour kept under the see-through pixels, so a
 *  printer that smooths the picture blends into the right colour (rgbaPng). */
export function wordPatches(withWords: PixelSource, without: PixelSource, area: PixelArea): PxPatch[] {
  const rowMin = new Int32Array(area.h).fill(-1);
  const rowMax = new Int32Array(area.h).fill(-1);
  // A strip at a time: two whole 8×8 pages of pixels would be ~50 MB on a phone.
  for (let y0 = 0; y0 < area.h; y0 += DIFF_STRIP_ROWS) {
    const h = Math.min(DIFF_STRIP_ROWS, area.h - y0);
    const a = new Uint32Array(withWords.getImageData(area.x, area.y + y0, area.w, h).data.buffer);
    const b = new Uint32Array(without.getImageData(area.x, area.y + y0, area.w, h).data.buffer);
    for (let r = 0; r < h; r++) {
      const base = r * area.w;
      let lo = -1;
      let hi = -1;
      for (let x = 0; x < area.w; x++) {
        if (a[base + x] !== b[base + x]) { if (lo < 0) lo = x; hi = x; }
      }
      rowMin[y0 + r] = lo;
      rowMax[y0 + r] = hi;
    }
  }
  const patches: PxPatch[] = [];
  let y = 0;
  while (y < area.h) {
    if (rowMin[y] < 0) { y++; continue; }
    let end = y;
    let x0 = rowMin[y];
    let x1 = rowMax[y];
    for (let k = y + 1; k < area.h && k - end <= PATCH_GAP_PX; k++) {
      if (rowMin[k] < 0) continue;
      end = k;
      x0 = Math.min(x0, rowMin[k]);
      x1 = Math.max(x1, rowMax[k]);
    }
    const w = x1 - x0 + 1;
    const h = end - y + 1;
    const a = withWords.getImageData(area.x + x0, area.y + y, w, h).data;
    const b = new Uint32Array(without.getImageData(area.x + x0, area.y + y, w, h).data.buffer);
    const a32 = new Uint32Array(a.buffer, a.byteOffset, a.length / 4);
    const on = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) on[i] = a32[i] !== b[i] ? 1 : 0;
    // The page's colour is only needed right next to a word (smoothing reaches a
    // pixel or two); further out a see-through pixel is left blank, so a title
    // over a photo doesn't carry the photo along (it doesn't pack small).
    const near = ringAround(on, w, h, 2);
    const rgba = new Uint8Array(a.length);
    for (let i = 0; i < b.length; i++) {
      if (!near[i]) continue;
      rgba[i * 4] = a[i * 4]; rgba[i * 4 + 1] = a[i * 4 + 1]; rgba[i * 4 + 2] = a[i * 4 + 2];
      rgba[i * 4 + 3] = on[i] ? 255 : 0;
    }
    patches.push({ png: rgbaToPng(rgba, w, h), x: area.x + x0, y: area.y + y, w, h });
    y = end + 1;
  }
  return patches;
}

/** `on` grown by `r` pixels every way (a square reach): 1 where a set pixel is that close. */
function ringAround(on: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const across = new Uint8Array(on.length);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (!on[row + x]) continue;
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) across[row + k] = 1;
    }
  }
  const out = new Uint8Array(on.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!across[y * w + x]) continue;
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) out[k * w + x] = 1;
    }
  }
  return out;
}
