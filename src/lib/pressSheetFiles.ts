/* ══════════════════════════════════════════════════════════════════════════
   pressSheetFiles — the console's "Print sheets" / "Cover sheet" / "Sheets
   as JPEG" / "Print PDF" / "Cover PDF" buttons.

   Reads an order's print files from the private print-pdfs bucket (operators
   only), lays them out on the shop's 12.5 × 19 sheet (printSheetPdf) and hands
   the result to the browser as a download. pdf-lib (and pdf.js, for JPEG)
   only load here, on the first click, so customers never download them.

   Every file it hands out has NO fonts (the shop's printer, 2026-10-21: "the
   font is not available"): see printSheetPdf. The printer also asked for JPEG,
   so "Sheets as JPEG" gives every sheet side and the cover sheet as 300 DPI
   pictures in one zip, made on the spot (nothing extra is stored).
   ══════════════════════════════════════════════════════════════════════════ */

import { supabase } from './supabase';
import { printFilesOf, type AdminOrder } from './adminOrders';
import { ALBUM_SIZES, type AlbumSizePreset, type CoverType } from '../pages/builder/types';
import { canvasTextPainter } from './canvasTextPainter';
import { zipStored, type ZipEntry } from './jpegZip';

type PrintOrder = Pick<AdminOrder, 'id' | 'copy_of_order_id' | 'order_number' | 'album_size' | 'cover' | 'page_count'>;

async function readPrintFile(path: string, what: string): Promise<ArrayBuffer> {
  const { data, error } = await supabase.storage.from('print-pdfs').download(path);
  if (error || !data) throw new Error(`The ${what} isn't in storage for this order yet.`);
  return data.arrayBuffer();
}

function sizeOf(o: PrintOrder): AlbumSizePreset {
  const size = ALBUM_SIZES.find((s) => s.preset === o.album_size)?.preset;
  if (!size) throw new Error(`This order's album size (${o.album_size ?? 'none'}) isn't one we print.`);
  return size;
}

/** Any cover but softcover binds as a hardcover (coverGeometry.isHardcover). */
const coverOf = (o: PrintOrder) => (o.cover || 'softcover') as CoverType;

/** A tool loaded on first use. After a deploy the old file is gone from the
 *  server: say so in words instead of a module error. */
async function lazy<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch {
    throw new Error('The console was updated. Reload this page and try again.');
  }
}
const pressTools = () => lazy(() => import('../pages/builder/printSheetPdf'));
const jpegTools = () => lazy(() => import('./pressSheetJpeg'));

/** Give the browser a file to save. */
export function saveFile(bytes: Uint8Array, filename: string, type = 'application/pdf'): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** What to tell the operator about the album sheets (sheet count, and a
 *  warning if the file and the order disagree). */
function sheetsNote(o: PrintOrder, plan: { sheets: number; pageCount: number; layout: { leavesPerSheet: number } }): string {
  const piles = plan.layout.leavesPerSheet;
  const note = `${plan.sheets} sheets, both sides · cut into ${piles} ${piles === 1 ? 'pile' : 'piles'}, then stack pile 1 on top`;
  return plan.pageCount === o.page_count
    ? note
    : `${note}. Check: the print file has ${plan.pageCount} pages, the order says ${o.page_count}.`;
}

/** Download the album pages laid out on press sheets. */
export async function downloadAlbumSheets(o: PrintOrder): Promise<string> {
  const size = sizeOf(o);
  const src = await readPrintFile(`${printFilesOf(o)}.pdf`, 'print file');
  const { imposeAlbumSheets } = await pressTools();
  const { bytes, plan } = await imposeAlbumSheets(src, size, o.order_number, canvasTextPainter());
  saveFile(bytes, `megyprints-${o.order_number}-sheets.pdf`);
  return sheetsNote(o, plan);
}

/** Download the flat cover on one press sheet. */
export async function downloadCoverSheet(o: PrintOrder): Promise<string> {
  const size = sizeOf(o);
  const src = await readPrintFile(`${printFilesOf(o)}-cover.pdf`, 'cover file');
  const { imposeCoverSheet } = await pressTools();
  const { bytes } = await imposeCoverSheet(src, size, coverOf(o), o.page_count, o.order_number, canvasTextPainter());
  saveFile(bytes, `megyprints-${o.order_number}-cover-sheet.pdf`);
  return 'Cover sheet: print one side only';
}

/** The words that go in the zip with the pictures. */
export function jpegHowTo(o: PrintOrder, sheets: number, piles: number, cover: boolean): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return [
    `Megyprints order ${o.order_number}: the press sheets as JPEG pictures.`,
    '',
    'Every picture is one side of a 12.5 x 19 in sheet at 300 DPI (3750 x 5700 pixels).',
    'Print at actual size (100%). Do not use "fit to page".',
    '',
    `Album: ${sheets} sheets, both sides. Print sheet-${pad(1)}-front, then sheet-${pad(1)}-back on the other side of the`,
    'same sheet, flipping on the long edge. Then sheet 02, and so on.',
    `Keep sheet 1 on top, front side up. Cut the whole stack on the marks into ${piles} ${piles === 1 ? 'pile' : 'piles'},`,
    'then put pile 1 on top of pile 2, pile 2 on top of pile 3, and so on.',
    '',
    cover
      ? `Cover: print ${o.order_number}-cover.jpg on one side of its own sheet. Cut on the marks; the dashed marks are the spine edges.`
      : 'Cover: not in this zip (see the console for why).',
    '',
  ].join('\r\n');
}

/** Download every sheet side and the cover sheet as 300 DPI JPEGs in one zip.
 *  `progress` gets a line to show while the pictures are made. */
export async function downloadSheetsAsJpeg(o: PrintOrder, progress: (line: string) => void = () => {}): Promise<string> {
  const size = sizeOf(o);
  const text = canvasTextPainter();
  progress('Getting the print files…');
  const src = await readPrintFile(`${printFilesOf(o)}.pdf`, 'print file');
  const { imposeAlbumSheets, imposeCoverSheet } = await pressTools();
  const { pdfToJpegs } = await jpegTools();
  const { bytes, plan } = await imposeAlbumSheets(src, size, o.order_number, text);
  const total = plan.sides.length + 1;
  const pad = (n: number) => String(n).padStart(2, '0');
  const say = (done: number) => progress(`Making the JPEG pictures: ${done} of ${total}…`);
  say(0);
  const sides = await pdfToJpegs(bytes, (done) => say(done));
  const files: ZipEntry[] = plan.sides.map((s, i) => ({ name: `${o.order_number}-sheet-${pad(s.sheet)}-${s.side}.jpg`, data: sides[i] }));

  // The cover sheet: an order can still be waiting on its cover file.
  let coverMissing: string | null = null;
  try {
    const coverSrc = await readPrintFile(`${printFilesOf(o)}-cover.pdf`, 'cover file');
    const { bytes: coverPdf } = await imposeCoverSheet(coverSrc, size, coverOf(o), o.page_count, o.order_number, text);
    const [cover] = await pdfToJpegs(coverPdf);
    files.push({ name: `${o.order_number}-cover.jpg`, data: cover });
  } catch (e) {
    coverMissing = e instanceof Error ? e.message : 'The cover file could not be read.';
  }
  say(total);
  files.push({ name: 'HOW-TO-PRINT.txt', data: new TextEncoder().encode(jpegHowTo(o, plan.sheets, plan.layout.leavesPerSheet, !coverMissing)) });
  saveFile(zipStored(files), `megyprints-${o.order_number}-jpeg.zip`, 'application/zip');
  const note = `JPEG: ${sides.length} sheet ${sides.length === 1 ? 'side' : 'sides'}${coverMissing ? '' : ' and the cover sheet'}, 300 DPI · ${sheetsNote(o, plan)}`;
  return coverMissing ? `${note}. No cover picture: ${coverMissing}` : note;
}

/** Download the customer's print file as it is ("Print PDF"), with no fonts. */
export async function downloadPrintFile(o: PrintOrder): Promise<string> {
  const src = await readPrintFile(`${printFilesOf(o)}.pdf`, 'print file');
  const { cleanPrintFile } = await pressTools();
  saveFile(await cleanPrintFile(src, 'print file'), `megyprints-${o.order_number}.pdf`);
  return 'Print PDF: one page per album page';
}

/** Download the customer's flat cover as it is ("Cover PDF"), with no fonts. */
export async function downloadCoverFile(o: PrintOrder): Promise<string> {
  const src = await readPrintFile(`${printFilesOf(o)}-cover.pdf`, 'cover file');
  const { cleanPrintFile } = await pressTools();
  saveFile(await cleanPrintFile(src, 'cover file'), `megyprints-${o.order_number}-cover.pdf`);
  return 'Cover PDF: the flat cover';
}

/** Download the one-sheet printer check. */
export async function downloadPressTestSheet(): Promise<void> {
  const { pressTestSheet } = await pressTools();
  saveFile(await pressTestSheet(canvasTextPainter()), 'megyprints-press-test-sheet.pdf');
}
