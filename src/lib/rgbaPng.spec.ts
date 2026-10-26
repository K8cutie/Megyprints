import { describe, it, expect } from 'vitest';
import { inflateSync } from 'node:zlib';
import jsPDF from 'jspdf';
import { rgbaToPng } from './rgbaPng';

/* The print file's words go in as see-through PNGs (printPipeline WordPatch).
   A canvas can't write them: a fully see-through pixel comes out black, and a
   printer smoothing the picture pulls that black into the letters' edges. */

function chunks(png: Uint8Array): { type: string; data: Uint8Array }[] {
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const out: { type: string; data: Uint8Array }[] = [];
  for (let p = 8; p < png.length;) {
    const len = dv.getUint32(p);
    out.push({ type: String.fromCharCode(...png.subarray(p + 4, p + 8)), data: png.subarray(p + 8, p + 8 + len) });
    p += 12 + len;
  }
  return out;
}

function pixels(w: number, h: number, at: (x: number, y: number) => [number, number, number, number]): Uint8Array {
  const d = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set(at(x, y), (y * w + x) * 4);
  return d;
}

describe('rgbaToPng', () => {
  it('a real PNG: RGBA 8-bit, every pixel back as it went in — colour kept under see-through pixels', () => {
    const w = 7, h = 3;
    const src = pixels(w, h, (x, y) => [10 * x, 50 + y, 200, x % 2 ? 255 : 0]);
    const png = rgbaToPng(src, w, h);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const [ihdr, idat, iend] = chunks(png);
    expect(ihdr.type).toBe('IHDR');
    const dv = new DataView(ihdr.data.buffer, ihdr.data.byteOffset, 13);
    expect([dv.getUint32(0), dv.getUint32(4), ihdr.data[8], ihdr.data[9]]).toEqual([w, h, 8, 6]);
    expect(iend.type).toBe('IEND');
    const raw = inflateSync(idat.data); // zlib checks the Adler-32
    for (let y = 0; y < h; y++) {
      expect(raw[y * (w * 4 + 1)]).toBe(0); // filter: none
      expect([...raw.subarray(y * (w * 4 + 1) + 1, (y + 1) * (w * 4 + 1))]).toEqual([...src.subarray(y * w * 4, (y + 1) * w * 4)]);
    }
    // The see-through pixel at (0, 0) still says what colour is under it.
    expect([...raw.subarray(1, 5)]).toEqual([0, 50, 200, 0]);
  });

  it('a big picture is carried in several blocks', () => {
    const w = 300, h = 200; // 240,200 bytes of rows: 4 blocks
    const src = pixels(w, h, (x, y) => [x & 255, y & 255, (x + y) & 255, 255]);
    const raw = inflateSync(chunks(rgbaToPng(src, w, h))[1].data);
    expect(raw.length).toBe((w * 4 + 1) * h);
    expect([...raw.subarray(raw.length - 4)]).toEqual([...src.subarray(src.length - 4)]);
  });

  it('refuses pixels that do not match the size', () => {
    expect(() => rgbaToPng(new Uint8Array(15), 2, 2)).toThrow(/size/);
  });

  it('jsPDF puts it in the print file with its see-through mask, compressed', () => {
    const w = 400, h = 120;
    const png = rgbaToPng(pixels(w, h, (x, y) => [255, 255, 255, (x >> 4) % 2 && y > 30 && y < 90 ? 255 : 0]), w, h);
    const doc = new jsPDF({ unit: 'in', format: [8.25, 8.25], compress: true });
    doc.addImage(png, 'PNG', 1, 1, w / 300, h / 300, undefined, 'FAST');
    const pdf = doc.output();
    expect(pdf).toMatch(/\/SMask \d+ 0 R/);
    expect(pdf.length).toBeLessThan(w * h); // the 192 KB of pixels went in compressed
  });
});
