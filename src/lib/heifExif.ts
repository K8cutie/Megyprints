/* ══════════════════════════════════════════════════════════════════════════
   heifExif — the EXIF block (where the capture date lives) inside a HEIC/HEIF
   photo, as TIFF bytes for exifr.

   exifr reads HEIC, but it skips the "base offset" in the file's item index
   and assumes it is 0. Files written by libheif (used by phones and apps
   other than Apple's own camera) put the EXIF block's position there, so
   exifr read the wrong bytes ("Malformed EXIF data") and the photo had no
   date: Megy sorts pages by when each photo was taken. This reads the index
   in full (ISO/IEC 14496-12 iinf + iloc, versions 0-3) and returns the TIFF
   bytes, or null when there is no EXIF block. Never throws.
   ══════════════════════════════════════════════════════════════════════════ */

interface Box { type: string; end: number; body: number }

export function heifExifTiff(data: ArrayBuffer | Uint8Array): Uint8Array | null {
  try {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const size = bytes.byteLength;
    const fourcc = (o: number) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
    const boxes = (start: number, end: number): Box[] => {
      const out: Box[] = [];
      for (let o = start; o + 8 <= end;) {
        let len = dv.getUint32(o);
        let head = 8;
        if (len === 1) {
          if (o + 16 > end) break;
          len = Number(dv.getBigUint64(o + 8));
          head = 16;
        } else if (len === 0) len = end - o;
        if (len < head || o + len > end) break;
        out.push({ type: fourcc(o + 4), end: o + len, body: o + head });
        o += len;
      }
      return out;
    };

    const top = boxes(0, size);
    if (top[0]?.type !== 'ftyp') return null;
    const meta = top.find((b) => b.type === 'meta');
    if (!meta) return null;
    const inMeta = boxes(meta.body + 4, meta.end); // meta is a full box
    const iinf = inMeta.find((b) => b.type === 'iinf');
    const iloc = inMeta.find((b) => b.type === 'iloc');
    if (!iinf || !iloc) return null;

    // iinf: which item is the EXIF block?
    const iinfVersion = bytes[iinf.body];
    let exifId = -1;
    for (const infe of boxes(iinf.body + 4 + (iinfVersion === 0 ? 2 : 4), iinf.end)) {
      if (infe.type !== 'infe') continue;
      const v = bytes[infe.body];
      if (v < 2) continue;
      let q = infe.body + 4;
      const id = v === 3 ? dv.getUint32(q) : dv.getUint16(q);
      q += (v === 3 ? 4 : 2) + 2; // item id, protection index
      if (fourcc(q) === 'Exif') { exifId = id; break; }
    }
    if (exifId < 0) return null;

    // iloc: where its bytes are (base offset + each extent's offset).
    const v = bytes[iloc.body];
    let q = iloc.body + 4;
    const offSize = bytes[q] >> 4;
    const lenSize = bytes[q] & 15;
    const baseSize = bytes[q + 1] >> 4;
    const idxSize = v === 1 || v === 2 ? bytes[q + 1] & 15 : 0;
    q += 2;
    const read = (n: number): number => {
      let val: number;
      if (n === 0) return 0;
      else if (n === 2) val = dv.getUint16(q);
      else if (n === 4) val = dv.getUint32(q);
      else if (n === 8) val = Number(dv.getBigUint64(q));
      else throw new Error('bad field size');
      q += n;
      return val;
    };
    const count = v < 2 ? dv.getUint16(q) : dv.getUint32(q);
    q += v < 2 ? 2 : 4;
    for (let i = 0; i < count; i++) {
      const id = v < 2 ? dv.getUint16(q) : dv.getUint32(q);
      q += v < 2 ? 2 : 4;
      let method = 0;
      if (v === 1 || v === 2) { method = dv.getUint16(q) & 15; q += 2; }
      q += 2; // data reference index
      const base = read(baseSize);
      const extents = dv.getUint16(q);
      q += 2;
      const parts: [number, number][] = [];
      for (let e = 0; e < extents; e++) {
        if (idxSize) read(idxSize);
        const off = read(offSize);
        const len = read(lenSize);
        parts.push([base + off, len === 0 ? size - (base + off) : len]);
      }
      if (id !== exifId) continue;
      if (method !== 0 || parts.length === 0) return null; // only bytes in this file
      const total = parts.reduce((s, [, len]) => s + len, 0);
      const item = new Uint8Array(total);
      let at = 0;
      for (const [from, len] of parts) {
        if (from < 0 || from + len > size) return null;
        item.set(bytes.subarray(from, from + len), at);
        at += len;
      }
      // The block starts with how far in the TIFF header is (after "Exif\0\0").
      if (item.length < 8) return null;
      const skip = new DataView(item.buffer).getUint32(0);
      const tiff = item.subarray(4 + skip);
      const isTiff = (tiff[0] === 0x4d && tiff[1] === 0x4d && tiff[2] === 0x00 && tiff[3] === 0x2a)
        || (tiff[0] === 0x49 && tiff[1] === 0x49 && tiff[2] === 0x2a && tiff[3] === 0x00);
      return isTiff ? tiff : null;
    }
    return null;
  } catch {
    return null;
  }
}
