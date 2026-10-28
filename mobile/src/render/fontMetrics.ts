/* ══════════════════════════════════════════════════════════════════════════
   WHERE A LINE OF WORDS SITS: the vertical numbers a browser reads from a
   font file, read the same way here.

   The website draws every caption with canvas textBaseline 'middle': each
   line is centred on its y. Chromium (the browser on Android phones, where
   most print files are made) puts that middle from the font's OS/2 table
   (sTypoAscender / sTypoDescender), scaled so ascent + descent is exactly
   the font size, each rounded to 1/64 px (Blink: SimpleFontData::
   NormalizedTypoAscentAndDescent; TextMetrics::GetFontBaseline). The app
   reads the same two numbers from the same TTF file, so its lines land
   where the website's do.
   ══════════════════════════════════════════════════════════════════════════ */

export interface FontFileMetrics {
  unitsPerEm: number;
  typoAscender: number;
  /** Negative below the baseline, as stored. */
  typoDescender: number;
  hheaAscender: number;
  hheaDescender: number;
}

/** Read the few numbers above from a TrueType/OpenType file. */
export function readFontMetrics(bytes: Uint8Array): FontFileMetrics {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const numTables = view.getUint16(4);
  const tables = new Map<string, number>();
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    const tag = String.fromCharCode(bytes[rec], bytes[rec + 1], bytes[rec + 2], bytes[rec + 3]);
    tables.set(tag, view.getUint32(rec + 8));
  }
  const head = tables.get('head');
  const os2 = tables.get('OS/2');
  const hhea = tables.get('hhea');
  if (head == null || hhea == null) throw new Error('not a font file the app can read (no head/hhea table)');
  return {
    unitsPerEm: view.getUint16(head + 18),
    typoAscender: os2 != null ? view.getInt16(os2 + 68) : 0,
    typoDescender: os2 != null ? view.getInt16(os2 + 70) : 0,
    hheaAscender: view.getInt16(hhea + 4),
    hheaDescender: view.getInt16(hhea + 6),
  };
}

const round64 = (v: number) => Math.round(v * 64) / 64;

/** How far below a line's middle its baseline is, px, at `fontSize`: what
 *  Chromium adds to y for textBaseline 'middle'. */
export function middleToBaseline(m: FontFileMetrics, fontSize: number): number {
  let ascent = m.typoAscender;
  let descent = -m.typoDescender;
  if (!(ascent > 0) || !(ascent + descent > 0) || ascent > ascent + descent) {
    // No usable typo numbers: Chromium falls back to the font's ascent/descent.
    ascent = m.hheaAscender;
    descent = -m.hheaDescender;
  }
  const normAscent = round64((fontSize * ascent) / (ascent + descent));
  const normDescent = round64(fontSize) - normAscent;
  return (normAscent - normDescent) / 2;
}
