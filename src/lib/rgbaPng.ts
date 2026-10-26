/* ══════════════════════════════════════════════════════════════════════════
   rgbaPng — RGBA pixels as a PNG file, colour kept under see-through pixels.

   The print file's words are see-through pictures laid over the page
   (printPipeline's word layer). A canvas can't make that file: it stores
   colour pre-multiplied, so a fully see-through pixel comes out black, and a
   printer that smooths the picture pulls that black into the letters' edges —
   a dark rim round white words. Here every pixel keeps the colour of the page
   under it, so smoothing blends into the right colour.

   The PNG is not compressed (stored blocks): it only carries the pixels to
   jsPDF, which unpacks it and compresses it itself when it writes the PDF.
   ══════════════════════════════════════════════════════════════════════════ */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array, start: number, end: number): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const MAX_STORED = 65535;

/** `rgba` (width × height × 4, not pre-multiplied) as PNG bytes. */
export function rgbaToPng(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): Uint8Array {
  if (width < 1 || height < 1 || rgba.length !== width * height * 4) throw new Error('rgbaToPng: size does not match the pixels');
  // Scanlines: a filter byte (0 = none) then the row's pixels.
  const rowLen = width * 4 + 1;
  const raw = new Uint8Array(rowLen * height);
  for (let y = 0; y < height; y++) raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * rowLen + 1);

  // zlib: header, stored deflate blocks, Adler-32.
  const blocks = Math.max(1, Math.ceil(raw.length / MAX_STORED));
  const zlib = new Uint8Array(2 + raw.length + blocks * 5 + 4);
  zlib[0] = 0x78; zlib[1] = 0x01;
  let o = 2;
  for (let b = 0; b < blocks; b++) {
    const from = b * MAX_STORED;
    const len = Math.min(MAX_STORED, raw.length - from);
    zlib[o++] = b === blocks - 1 ? 1 : 0;
    zlib[o++] = len & 0xff; zlib[o++] = len >>> 8;
    zlib[o++] = ~len & 0xff; zlib[o++] = (~len >>> 8) & 0xff;
    zlib.set(raw.subarray(from, from + len), o);
    o += len;
  }
  let a = 1, s = 0;
  for (let i = 0; i < raw.length; i++) { a = (a + raw[i]) % 65521; s = (s + a) % 65521; }
  const adler = ((s << 16) | a) >>> 0;
  zlib[o++] = adler >>> 24; zlib[o++] = (adler >>> 16) & 0xff; zlib[o++] = (adler >>> 8) & 0xff; zlib[o++] = adler & 0xff;

  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width); dv.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  // compression, filter and interlace methods: 0

  const chunks: [string, Uint8Array][] = [['IHDR', ihdr], ['IDAT', zlib], ['IEND', new Uint8Array(0)]];
  const out = new Uint8Array(8 + chunks.reduce((n, [, d]) => n + 12 + d.length, 0));
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  let p = 8;
  const odv = new DataView(out.buffer);
  for (const [type, data] of chunks) {
    odv.setUint32(p, data.length);
    for (let i = 0; i < 4; i++) out[p + 4 + i] = type.charCodeAt(i);
    out.set(data, p + 8);
    odv.setUint32(p + 8 + data.length, crc32(out, p + 4, p + 8 + data.length));
    p += 12 + data.length;
  }
  return out;
}
