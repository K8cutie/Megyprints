/* ══════════════════════════════════════════════════════════════════════════
   jpegZip — the two small file jobs behind "Sheets as JPEG" (console).

   setJpegDpi: a browser's canvas writes JPEGs that don't say how big to
   print them, and a print shop's software then guesses (often 72 DPI, a
   sheet 52 in tall). Each picture says 300 DPI, so 3750 × 5700 pixels opens
   as 12.5 × 19 in.

   zipStored: all the pictures in one download. JPEGs don't get smaller in a
   zip, so they are stored as they are (no compression library needed).
   ══════════════════════════════════════════════════════════════════════════ */

const JFIF = [0x4a, 0x46, 0x49, 0x46, 0x00]; // "JFIF\0"

/** The JPEG's print resolution written into its JFIF header (dots per inch).
 *  A JPEG without one gets one, right after the start marker. */
export function setJpegDpi(jpeg: Uint8Array, dpi: number): Uint8Array {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('Not a JPEG.');
  const d = Math.max(1, Math.min(0xffff, Math.round(dpi)));
  const hasJfif = jpeg[2] === 0xff && jpeg[3] === 0xe0 && JFIF.every((b, i) => jpeg[6 + i] === b);
  if (hasJfif) {
    const out = jpeg.slice();
    out[13] = 1; // units: dots per inch
    out[14] = d >> 8; out[15] = d & 0xff;
    out[16] = d >> 8; out[17] = d & 0xff;
    return out;
  }
  const app0 = [0xff, 0xe0, 0x00, 0x10, ...JFIF, 0x01, 0x01, 0x01, d >> 8, d & 0xff, d >> 8, d & 0xff, 0x00, 0x00];
  const out = new Uint8Array(jpeg.length + app0.length);
  out.set(jpeg.subarray(0, 2), 0);
  out.set(app0, 2);
  out.set(jpeg.subarray(2), 2 + app0.length);
  return out;
}

/** The DPI a JPEG's JFIF header says, or null when it says none. */
export function jpegDpi(jpeg: Uint8Array): number | null {
  const hasJfif = jpeg[2] === 0xff && jpeg[3] === 0xe0 && JFIF.every((b, i) => jpeg[6 + i] === b);
  if (!hasJfif || jpeg[13] !== 1) return null;
  return (jpeg[14] << 8) | jpeg[15];
}

let crcTable: Uint32Array | null = null;
export function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry { name: string; data: Uint8Array }

/** One .zip holding the files as they are ("stored"). Names are plain ASCII
 *  paths. Limited to what a press job needs: under 4 GB, under 65,535 files. */
export function zipStored(files: readonly ZipEntry[], when: Date = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const dosTime = (when.getHours() << 11) | (when.getMinutes() << 5) | Math.floor(when.getSeconds() / 2);
  const dosDate = ((when.getFullYear() - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const size = f.data.length;
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0, true); // flags
    lv.setUint16(8, 0, true); // stored
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);
    parts.push(local, f.data);

    const cd = new Uint8Array(46 + name.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); // made by
    cv.setUint16(6, 20, true); // needed
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    cd.set(name, 46);
    central.push(cd);
    offset += local.length + size;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const total = offset + cdSize + end.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of [...parts, ...central, end]) { out.set(p, at); at += p.length; }
  return out;
}
