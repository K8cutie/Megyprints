/** ═══════════════════════════════════════════════════════════════
    ALBUM → PRINT-READY PDF
    Stitches the 300 DPI page images from printPipeline into a single
    PDF sized to the album's physical dimensions — one PDF page per
    album page. This is the finished deliverable the operator prints;
    nothing is re-compiled on their end.
    ═══════════════════════════════════════════════════════════════ */

import jsPDF from 'jspdf';
import type { AlbumPage, UploadedPhoto, AlbumSizePreset } from './types';
import { ALBUM_SIZES } from './types';
import { renderAlbumForPrint } from './printPipeline';

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Compile the album into one print-ready PDF (300 DPI, one page per album page).
 * Returns the PDF as a Blob — ready to upload/transport.
 */
export async function generateAlbumPdf(
  pages: AlbumPage[],
  photos: UploadedPhoto[],
  albumSize: AlbumSizePreset,
  onProgress?: (completed: number, total: number) => void,
): Promise<Blob> {
  const config = ALBUM_SIZES.find((s) => s.preset === albumSize);
  // ALBUM_SIZES stores 300 DPI pixels → physical inches = px / 300.
  const wIn = (config?.width ?? 2400) / 300;
  const hIn = (config?.height ?? 2400) / 300;
  const orientation: 'landscape' | 'portrait' = wIn >= hIn ? 'landscape' : 'portrait';

  const rendered = await renderAlbumForPrint(pages, photos, albumSize, onProgress);
  if (!rendered.length) throw new Error('Album has no pages to export.');

  const doc = new jsPDF({ orientation, unit: 'in', format: [wIn, hIn], compress: true });

  for (let i = 0; i < rendered.length; i++) {
    if (i > 0) doc.addPage([wIn, hIn], orientation);
    const dataUrl = await blobToDataURL(rendered[i].blob);
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    doc.addImage(dataUrl, 'PNG', 0, 0, pw, ph, undefined, 'FAST');
  }

  return doc.output('blob');
}

/**
 * Convenience: compile the PDF and trigger a browser download.
 * Handy for previewing/verifying the print output in the builder.
 */
export async function downloadAlbumPdf(
  pages: AlbumPage[],
  photos: UploadedPhoto[],
  albumSize: AlbumSizePreset,
  filename = 'megyprints-album.pdf',
  onProgress?: (completed: number, total: number) => void,
): Promise<void> {
  const blob = await generateAlbumPdf(pages, photos, albumSize, onProgress);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
