import { describe, it, expect } from 'vitest';
import { crc32, jpegDpi, setJpegDpi, zipStored } from './jpegZip';

/* "Sheets as JPEG" (the shop's printer, 2026-10-21): every picture opens at
   its real size (300 DPI), and all of them come in one zip. */

/** The start of a JPEG as a browser canvas writes it: JFIF, no resolution. */
const canvasJpeg = () => Uint8Array.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  0xff, 0xdb, 0x00, 0x04, 0x00, 0x00, 0xff, 0xd9,
]);

/** Read a stored zip back: each entry's name, bytes and stated CRC. */
export function readZip(zip: Uint8Array): { name: string; data: Uint8Array; crc: number }[] {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const out: { name: string; data: Uint8Array; crc: number }[] = [];
  let at = 0;
  while (v.getUint32(at, true) === 0x04034b50) {
    expect(v.getUint16(at + 8, true)).toBe(0); // stored
    const crc = v.getUint32(at + 14, true);
    const size = v.getUint32(at + 18, true);
    const nameLen = v.getUint16(at + 26, true);
    const extra = v.getUint16(at + 28, true);
    const name = new TextDecoder().decode(zip.subarray(at + 30, at + 30 + nameLen));
    const start = at + 30 + nameLen + extra;
    out.push({ name, data: zip.slice(start, start + size), crc });
    at = start + size;
  }
  // The central directory lists the same files, and the end record says how many.
  const end = zip.length - 22;
  expect(v.getUint32(end, true)).toBe(0x06054b50);
  expect(v.getUint16(end + 10, true)).toBe(out.length);
  expect(v.getUint32(end + 16, true)).toBe(at);
  return out;
}

describe('setJpegDpi', () => {
  it('a canvas JPEG says no size; after, 300 dots per inch (3750 px = 12.5 in)', () => {
    const src = canvasJpeg();
    expect(jpegDpi(src)).toBeNull();
    const out = setJpegDpi(src, 300);
    expect(jpegDpi(out)).toBe(300);
    expect(out.length).toBe(src.length); // only the header numbers change
    expect(out.subarray(18)).toEqual(src.subarray(18)); // the picture is untouched
  });

  it('a JPEG with no JFIF header gets one right after the start marker', () => {
    const bare = Uint8Array.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x04, 0x00, 0x00, 0xff, 0xd9]);
    const out = setJpegDpi(bare, 300);
    expect(jpegDpi(out)).toBe(300);
    expect(out.subarray(0, 2)).toEqual(bare.subarray(0, 2));
    expect(out.subarray(20)).toEqual(bare.subarray(2));
  });

  it('refuses something that is not a JPEG', () => {
    expect(() => setJpegDpi(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]), 300)).toThrow(/Not a JPEG/);
  });
});

describe('zipStored', () => {
  it('CRC-32 is the standard one', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
  });

  it('every file comes back out, byte for byte, in order, with its CRC', () => {
    const files = [
      { name: 'MP-1-sheet-01-front.jpg', data: setJpegDpi(canvasJpeg(), 300) },
      { name: 'MP-1-sheet-01-back.jpg', data: Uint8Array.from({ length: 70_000 }, (_, i) => (i * 31) % 256) },
      { name: 'HOW-TO-PRINT.txt', data: new TextEncoder().encode('Print at actual size (100%).') },
    ];
    const back = readZip(zipStored(files, new Date(2026, 9, 21, 10, 30)));
    expect(back.map((f) => f.name)).toEqual(files.map((f) => f.name));
    back.forEach((f, i) => {
      expect(Array.from(f.data)).toEqual(Array.from(files[i].data));
      expect(f.crc).toBe(crc32(files[i].data));
    });
  });
});
