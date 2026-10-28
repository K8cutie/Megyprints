import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { wordPatches } from './printPipeline';

/* ══════════════════════════════════════════════════════════════════════════
   SHARP WORDS IN THE PRINT FILE (owner, 2026-10-21: "the cover page and the
   text — its print out looks low resolution"). A page went in as one JPEG,
   shrunk to 1800 px (≈218 DPI on an 8×8) for the upload cap: the words came
   out soft, with JPEG specks round every letter. Now the page is drawn with
   and without its words, and the pixels the words change go on top as a
   lossless, see-through 300 DPI picture. The cover's title, spine and back
   mark too.
   ══════════════════════════════════════════════════════════════════════════ */

/** A W×H "page": white, with `marks` drawn as solid rectangles. */
function page(W: number, H: number, marks: { x: number; y: number; w: number; h: number; rgb: [number, number, number] }[]) {
  const data = new Uint8ClampedArray(W * H * 4).fill(255);
  for (const m of marks) {
    for (let y = m.y; y < m.y + m.h; y++) for (let x = m.x; x < m.x + m.w; x++) data.set([...m.rgb, 255], (y * W + x) * 4);
  }
  return {
    getImageData(x: number, y: number, w: number, h: number) {
      const out = new Uint8ClampedArray(w * h * 4);
      for (let r = 0; r < h; r++) out.set(data.subarray(((y + r) * W + x) * 4, ((y + r) * W + x + w) * 4), r * w * 4);
      return { data: out, width: w, height: h } as ImageData;
    },
  };
}

/** The patch's pixels back out of its PNG. */
function pngPixels(png: Uint8Array, w: number, h: number): Uint8Array {
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const idatLen = dv.getUint32(33);
  const raw = inflateSync(png.subarray(41, 41 + idatLen));
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) out.set(raw.subarray(y * (w * 4 + 1) + 1, (y + 1) * (w * 4 + 1)), y * w * 4);
  return out;
}

describe('wordPatches — the pixels the words change, and only those', () => {
  const photo = { x: 0, y: 0, w: 200, h: 120, rgb: [40, 90, 160] as [number, number, number] };
  const W = 200, H = 300;

  it('a title and a caption far apart: two patches, each just round its words', () => {
    const bare = page(W, H, [photo]);
    const full = page(W, H, [photo, { x: 20, y: 50, w: 100, h: 10, rgb: [255, 255, 255] }, { x: 30, y: 250, w: 60, h: 8, rgb: [45, 45, 45] }]);
    const patches = wordPatches(full, bare, { x: 0, y: 0, w: W, h: H });
    expect(patches.map(({ x, y, w, h }) => ({ x, y, w, h }))).toEqual([
      { x: 20, y: 50, w: 100, h: 10 },
      { x: 30, y: 250, w: 60, h: 8 },
    ]);
  });

  it("a caption's lines close together are one patch", () => {
    const full = page(W, H, [{ x: 10, y: 100, w: 50, h: 10, rgb: [0, 0, 0] }, { x: 20, y: 130, w: 70, h: 10, rgb: [0, 0, 0] }]);
    const [only, ...rest] = wordPatches(full, page(W, H, []), { x: 0, y: 0, w: W, h: H });
    expect(rest).toHaveLength(0);
    expect({ x: only.x, y: only.y, w: only.w, h: only.h }).toEqual({ x: 10, y: 100, w: 80, h: 40 });
  });

  it('opaque where the words are, see-through elsewhere — with the page\'s colour kept under it', () => {
    // White words over the photo, and a dark word on the paper below it, both in one patch's box.
    const bare = page(W, H, [photo]);
    const full = page(W, H, [photo, { x: 10, y: 100, w: 4, h: 30, rgb: [255, 255, 255] }, { x: 40, y: 125, w: 4, h: 10, rgb: [0, 0, 0] }]);
    const [p] = wordPatches(full, bare, { x: 0, y: 0, w: W, h: H });
    const px = pngPixels(p.png, p.w, p.h);
    const at = (x: number, y: number) => [...px.subarray(((y - p.y) * p.w + (x - p.x)) * 4, ((y - p.y) * p.w + (x - p.x)) * 4 + 4)];
    expect(at(11, 105)).toEqual([255, 255, 255, 255]); // a word over the photo
    expect(at(41, 128)).toEqual([0, 0, 0, 255]); // a word on the paper
    expect(at(15, 105)).toEqual([40, 90, 160, 0]); // next to a word: the photo's colour, see-through — never black
    expect(at(38, 128)).toEqual([255, 255, 255, 0]); // next to a word: the paper's colour, see-through
    expect(at(16, 105)).toEqual([0, 0, 0, 0]); // further out: blank (packs small), still see-through
    expect(at(25, 128)).toEqual([0, 0, 0, 0]);
  });

  it('a page with nothing different has no patches', () => {
    expect(wordPatches(page(W, H, [photo]), page(W, H, [photo]), { x: 0, y: 0, w: W, h: H })).toEqual([]);
  });

  it('works on part of the canvas (the cover lifts each text from its own spot)', () => {
    const full = page(W, H, [{ x: 150, y: 200, w: 10, h: 10, rgb: [9, 9, 9] }]);
    const [p] = wordPatches(full, page(W, H, []), { x: 100, y: 180, w: 100, h: 100 });
    expect({ x: p.x, y: p.y, w: p.w, h: p.h }).toEqual({ x: 150, y: 200, w: 10, h: 10 });
  });
});

describe('wired in (source guards)', () => {
  const pipeline = readFileSync(resolve(__dirname, 'printPipeline.ts'), 'utf8');
  const pdf = readFileSync(resolve(__dirname, 'generateAlbumPdf.ts'), 'utf8');

  it('the page is drawn once without its words — every kind of word — and once with them', () => {
    expect(pipeline).toMatch(/if \(st\) \{\s*if \(words\) \{\s*await loadFontFaces\(\[st\]\);[^\n]*\n\s*renderSlotText\(ctx, st, sx, sy, sw, sh, W, uiW, coverMode\);\s*\}\s*continue;/);
    expect(pipeline).toMatch(/for \(const text of words \? page\.textElements \|\| \[\] : \[\]\) \{/);
    expect(pipeline).toMatch(/const bare = await drawPrintPage\(page, photos, albumSize, pageIndex, coverMode, false, bindingIn\);\s*const full = await drawPrintPage\(page, photos, albumSize, pageIndex, coverMode, true, bindingIn\);/);
  });

  it('the page picture is still shrunk for the upload cap; the words are not', () => {
    // The number lives in printFileSpec.ts (shared with the 2.0 app).
    expect(pipeline).toMatch(/const MAX_SIDE = PRINT_PAGE_MAX_SIDE;/);
    expect(readFileSync(resolve(__dirname, 'printFileSpec.ts'), 'utf8')).toMatch(/export const PRINT_PAGE_MAX_SIDE = 1800;/);
    expect(pipeline).toMatch(/: await renderPageLayers\(page, photos, albumSize, pageIndex, false, bindingIn\);/);
  });

  it('the cover: the front is drawn by the page renderer with its words lifted; the back and spine words are lifted too', () => {
    expect(pipeline).toMatch(/for \(const t of branded\.texts\) words\.push\(\.\.\.liftWords\(ctx, t\.rect, \(\) => drawCoverText\(ctx, t\)\)\);/);
    expect(pipeline).toMatch(/words\.push\(\.\.\.frontPage\.words\.map\(/);
    expect(pipeline).not.toMatch(/renderCoverPanelImage/); // no JPEG round trip for the front any more
  });

  it('both print files put the words on top of the picture', () => {
    const album = pdf.slice(pdf.indexOf('export async function generateAlbumPdf('), pdf.indexOf('export async function generateCoverWrapPdf('));
    const cover = pdf.slice(pdf.indexOf('export async function generateCoverWrapPdf('));
    for (const f of [album, cover]) {
      expect(f.indexOf('addWords(doc, ')).toBeGreaterThan(f.indexOf("doc.addImage(dataUrl, 'JPEG', 0, 0, pw, ph, undefined, 'FAST');"));
    }
    expect(pdf).toMatch(/doc\.addImage\(w\.png, 'PNG', w\.x \* pw, w\.y \* ph, w\.w \* pw, w\.h \* ph, undefined, 'FAST'\)/);
  });
});
