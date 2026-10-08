/* ── Print files ─────────────────────────────────────────────────────────────
   One PDF per class section (build plan §2.4: a whole book in one browser PDF
   would run out of memory). Every page is painted at 300 dpi with the 0.125 in
   bleed — 2625 × 3375 px — by the same painter as the screen preview. */
import jsPDF from 'jspdf';
import { BLEED, PRINT_DPI, TRIM } from './geometry';
import { paintPage, type PhotoSource } from './painter';
import type { YbPage } from './layout';

const toJpegBytes = (c: HTMLCanvasElement): Promise<Uint8Array> =>
  new Promise((res, rej) => c.toBlob((b) => (b ? b.arrayBuffer().then((a) => res(new Uint8Array(a)), rej) : rej(new Error('Could not render the page'))), 'image/jpeg', 0.92));

export async function pagesToPdf(pages: YbPage[], photo: PhotoSource, onProgress?: (done: number, total: number) => void): Promise<Blob> {
  const w = TRIM.w + BLEED * 2, h = TRIM.h + BLEED * 2;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'in', format: [w, h], compress: true });
  const canvas = document.createElement('canvas');
  for (let i = 0; i < pages.length; i++) {
    if (i > 0) doc.addPage([w, h], 'portrait');
    paintPage(canvas, pages[i], { ppi: PRINT_DPI, bleed: true, photo });
    doc.addImage(await toJpegBytes(canvas), 'JPEG', 0, 0, w, h, undefined, 'FAST');
    onProgress?.(i + 1, pages.length);
    await new Promise((r) => setTimeout(r, 0)); // let the progress bar paint
  }
  canvas.width = canvas.height = 1;
  return doc.output('blob');
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
