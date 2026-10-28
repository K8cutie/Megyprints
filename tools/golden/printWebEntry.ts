/* The website side of the print-file comparison, bundled by printWeb.mjs and
   run in headless Chromium: the website's own code making an order's files,
   exactly as it does for real.
     • at checkout (Order.tsx, on the customer's phone): generateCoverWrapPdf
       ("<order>-cover.pdf") first, then generateAlbumPdf ("<order>.pdf");
     • in the console, on the operator's click (pressSheetFiles.ts): the
       album's press sheets and the cover sheet (printSheetPdf, words drawn
       by canvasTextPainter) and "Sheets as JPEG" (pressSheetZip + pdf.js).
   Nothing here draws anything itself. */

import { generateAlbumPdf, generateCoverWrapPdf } from '../../src/pages/builder/generateAlbumPdf';
import { imposeAlbumSheets, imposeCoverSheet } from '../../src/pages/builder/printSheetPdf';
import { bindingInchesFor } from '../../src/pages/builder/binding';
import { canvasTextPainter } from '../../src/lib/canvasTextPainter';
import { makeSheetsJpegZip } from '../../src/lib/pressSheetZip';
import { pdfToJpegs } from '../../src/lib/pressSheetJpeg';
import { DEFAULT_COVER_DESIGN, type UploadedPhoto } from '../../src/pages/builder/types';
import type { PrintAlbumCase } from './printAlbums';

interface FontIn { face: string; weight: number; italic: boolean; base64: string }

const fromBase64 = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Hands a made file to Node (printWeb.mjs exposes it), a piece at a time. */
declare function saveFile(name: string, base64: string, append: boolean): Promise<void>;
const PIECE = 8 * 1024 * 1024;

let imageUrls: string[] = [];

const api = {
  async registerFonts(fonts: FontIn[]): Promise<number> {
    for (const f of fonts) {
      const face = new FontFace(f.face, fromBase64(f.base64), { weight: String(f.weight), style: f.italic ? 'italic' : 'normal' });
      await face.load();
      document.fonts.add(face);
    }
    return document.fonts.size;
  },

  setImages(pngs: string[]): number {
    imageUrls.forEach((u) => URL.revokeObjectURL(u));
    imageUrls = pngs.map((b64) => URL.createObjectURL(new Blob([fromBase64(b64) as BlobPart], { type: 'image/png' })));
    return imageUrls.length;
  },

  /** Every file for one album, handed over one by one; returns the timings and notes. */
  async make(a: PrintAlbumCase, whenIso: string): Promise<{ ms: Record<string, number>; note: string; coverSheetMissing: string | null; sizes: Record<string, number> }> {
    const photos: UploadedPhoto[] = a.photos.map((p) => ({
      id: p.id, previewUrl: imageUrls[p.image], name: `${p.id}.png`, type: 'image/png', size: 0, width: p.width, height: p.height,
    }));
    const sizes: Record<string, number> = {};
    const put = async (name: string, bytes: Uint8Array) => {
      sizes[name] = bytes.length;
      for (let at = 0; at < Math.max(1, bytes.length); at += PIECE) await saveFile(name, toBase64(bytes.subarray(at, at + PIECE)), at > 0);
    };
    const t0 = performance.now();
    const coverBlob = await generateCoverWrapPdf({
      albumSize: a.albumSize, pageCount: a.pages.length, cover: a.cover, material: a.material,
      coverDesign: DEFAULT_COVER_DESIGN, coverFront: a.coverFront, photos,
    });
    const cover = new Uint8Array(await coverBlob.arrayBuffer());
    const t1 = performance.now();
    const interiorBlob = await generateAlbumPdf(a.pages, photos, a.albumSize, undefined, undefined, bindingInchesFor(a.cover));
    const interior = new Uint8Array(await interiorBlob.arrayBuffer());
    const t2 = performance.now();
    await put('interior.pdf', interior);
    await put('cover.pdf', cover);

    const text = canvasTextPainter();
    const t3 = performance.now();
    const sheets = await imposeAlbumSheets(interior, a.albumSize, a.orderNumber, text);
    // A cover too long for one sheet (11.5x8 hardbound) has no cover sheet: the console says why.
    let coverSheetMissing: string | null = null;
    let coverSheet: Uint8Array | null = null;
    try {
      coverSheet = (await imposeCoverSheet(cover, a.albumSize, a.cover, a.pages.length, a.orderNumber, text, a.material)).bytes;
    } catch (e) {
      coverSheetMissing = e instanceof Error ? e.message : String(e);
    }
    const t4 = performance.now();
    await put('sheets.pdf', sheets.bytes);
    if (coverSheet) await put('cover-sheet.pdf', coverSheet);

    const o = { order_number: a.orderNumber, album_size: a.albumSize, cover: a.cover, material: a.material, page_count: a.pages.length };
    const t5 = performance.now();
    const { zip, note } = await makeSheetsJpegZip(o, interior, async () => cover, text, { imposeAlbumSheets, imposeCoverSheet, toJpegs: pdfToJpegs }, () => {}, new Date(whenIso));
    const t6 = performance.now();
    await put('jpeg.zip', zip);
    return { ms: { cover: t1 - t0, interior: t2 - t1, sheets: t4 - t3, jpeg: t6 - t5, total: (t2 - t0) + (t4 - t3) + (t6 - t5) }, note, coverSheetMissing, sizes };
  },
};

(globalThis as unknown as { printWeb: typeof api }).printWeb = api;
