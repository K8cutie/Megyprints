/* ══════════════════════════════════════════════════════════════════════════
   pressSheetJpeg — a sheet PDF as JPEG pictures, one per sheet side (the
   console's "Sheets as JPEG"; the shop's printer asked for JPEG, 2026-10-21).

   The pictures are drawn FROM the sheet PDF the console already makes
   (printSheetPdf), by pdf.js (Mozilla, Apache-2.0), so a JPEG is exactly the
   PDF sheet: same spots, marks and labels. Loaded only on that button.
   ══════════════════════════════════════════════════════════════════════════ */

import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { setJpegDpi } from './jpegZip';

GlobalWorkerOptions.workerSrc = workerUrl;

/** Print resolution of every picture: 12.5 × 19 in → 3750 × 5700 pixels. */
export const SHEET_DPI = 300;
const QUALITY = 0.95;

/** Each page of `pdf` as a JPEG at `dpi`, marked with that DPI so it opens
 *  at its real size. `onPage(done, total)` after each one. */
export async function pdfToJpegs(pdf: Uint8Array, onPage?: (done: number, total: number) => void, dpi = SHEET_DPI): Promise<Uint8Array[]> {
  // pdf.js takes the bytes over to its worker: give it a copy.
  const doc = await getDocument({ data: pdf.slice(), isEvalSupported: false, disableFontFace: true }).promise;
  const out: Uint8Array[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: dpi / 72 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error("This browser can't draw a sheet this big. Try Chrome on a computer.");
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't make the sheet picture."))), 'image/jpeg', QUALITY));
      out.push(setJpegDpi(new Uint8Array(await blob.arrayBuffer()), dpi));
      page.cleanup();
      canvas.width = 0; canvas.height = 0; // let the 85 MB go now, not at the end
      onPage?.(n, doc.numPages);
    }
  } finally {
    await doc.destroy();
  }
  return out;
}
