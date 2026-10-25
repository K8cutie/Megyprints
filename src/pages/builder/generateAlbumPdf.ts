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
import { renderAlbumForPrint, renderCoverWrapForPrint, type CoverPrintInput, type WordPatch } from './printPipeline';
import { coverWrapGeometry } from './coverGeometry';
import { pageSizeWithBleedIn } from './printBleed';
import { PAGE_ONE_RIGHT_MARK } from './binding';

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** The most a print file may weigh: Supabase Storage takes 50 MB a file on
 *  this plan (0015_print_pdfs_size_limit), less room for the upload itself. */
export const PRINT_FILE_BUDGET_BYTES = 45 * 1024 * 1024;

/** A page's words over its picture: sharp, see-through, at 300 DPI
 *  (printPipeline's WordPatch). The page is `pw` × `ph`. */
function addWords(doc: jsPDF, words: WordPatch[], pw: number, ph: number): void {
  for (const w of words) doc.addImage(w.png, 'PNG', w.x * pw, w.y * ph, w.w * pw, w.h * ph, undefined, 'FAST');
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
  budgetBytes = PRINT_FILE_BUDGET_BYTES,
  /** Binding side allowance, inches: binding.bindingInchesFor(the order's cover). */
  bindingIn?: number,
): Promise<Blob> {
  const config = ALBUM_SIZES.find((s) => s.preset === albumSize);
  // ALBUM_SIZES stores 300 DPI pixels → physical inches = px / 300. Each page
  // file is the trim plus its 0.125" bleed on every edge (printBleed, PI-2):
  // an 8×8 page is 8.25 × 8.25 in, cut down to 8 × 8.
  const { wIn, hIn } = pageSizeWithBleedIn((config?.width ?? 2400) / 300, (config?.height ?? 2400) / 300);
  const orientation: 'landscape' | 'portrait' = wIn >= hIn ? 'landscape' : 'portrait';

  const build = async (rendered: Awaited<ReturnType<typeof renderAlbumForPrint>>): Promise<Blob> => {
    const doc = new jsPDF({ orientation, unit: 'in', format: [wIn, hIn], compress: true });
    // Page 1 is drawn as a right-hand page (spine margin on its left). The
    // console's press-sheet layout reads this to put it on the first leaf's front.
    doc.setProperties({ keywords: PAGE_ONE_RIGHT_MARK });

    for (let i = 0; i < rendered.length; i++) {
      if (i > 0) doc.addPage([wIn, hIn], orientation);
      const dataUrl = await blobToDataURL(rendered[i].image);
      const pw = doc.internal.pageSize.getWidth();
      const ph = doc.internal.pageSize.getHeight();
      // Pages are JPEG (see printPipeline) so the PDF stays small enough to upload.
      doc.addImage(dataUrl, 'JPEG', 0, 0, pw, ph, undefined, 'FAST');
      addWords(doc, rendered[i].words, pw, ph);
    }
    return doc.output('blob');
  };

  const rendered = await renderAlbumForPrint(pages, photos, albumSize, onProgress, { bindingIn });
  if (!rendered.length) throw new Error('Album has no pages to export.');
  const pdf = await build(rendered);
  // Sharp words add a little to every page that has words. If that tips the
  // file past the upload cap, the words go back into the page pictures — the
  // file as it was before sharp words — rather than the file not arriving.
  if (pdf.size <= budgetBytes || !rendered.some((r) => r.words.length)) return pdf;
  return build(await renderAlbumForPrint(pages, photos, albumSize, onProgress, { bakeWords: true, bindingIn }));
}

/**
 * Compile the front·spine·back cover into its OWN print-ready PDF — a single
 * page sized to the physical flat-wrap inches (NOT the album trim), so the
 * operator prints the wrap at 1:1 scale. Separate from the interior PDF because
 * the wrap is a different, wider size.
 */
export async function generateCoverWrapPdf(input: CoverPrintInput): Promise<Blob> {
  const geom = coverWrapGeometry(input.albumSize, input.pageCount, input.cover, { material: input.material });
  const wIn = geom.wrap.wIn;
  const hIn = geom.wrap.hIn;
  const orientation: 'landscape' | 'portrait' = wIn >= hIn ? 'landscape' : 'portrait';

  const { image, words } = await renderCoverWrapForPrint(input);
  const dataUrl = await blobToDataURL(image);

  const doc = new jsPDF({ orientation, unit: 'in', format: [wIn, hIn], compress: true });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  doc.addImage(dataUrl, 'JPEG', 0, 0, pw, ph, undefined, 'FAST');
  addWords(doc, words, pw, ph);
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
