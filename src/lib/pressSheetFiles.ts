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
import { canvasTextPainter } from './canvasTextPainter';
import { coverOf, coverSheetNote, finishOf, sheetsNote, sizeOf } from './pressSheetWords';
import { makeSheetsJpegZip } from './pressSheetZip';

// The notes, names and HOW-TO words live in pressSheetWords.ts (no Supabase,
// no browser), which the 2.0 app shares; re-exported here as before.
export {
  blankSidesNote, coverJpegName, coverSheetNote, jpegHowTo, orderSpine, sideJpegName, stackHowTo,
} from './pressSheetWords';

type PrintOrder = Pick<AdminOrder, 'id' | 'copy_of_order_id' | 'order_number' | 'album_size' | 'cover' | 'material' | 'page_count'>;

async function readPrintFile(path: string, what: string): Promise<ArrayBuffer> {
  const { data, error } = await supabase.storage.from('print-pdfs').download(path);
  if (error || !data) {
    // Only the customer's phone can make a cover (the photos are there): say how.
    const how = what === 'cover file' ? ' Ask the customer to open Your orders on the phone they made the album on and tap Send the cover.' : '';
    throw new Error(`The ${what} isn't in storage for this order yet.${how}`);
  }
  return data.arrayBuffer();
}

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

/** Download the album pages laid out on press sheets. */
export async function downloadAlbumSheets(o: PrintOrder): Promise<string> {
  const size = sizeOf(o);
  const src = await readPrintFile(`${printFilesOf(o)}.pdf`, 'print file');
  const { imposeAlbumSheets } = await pressTools();
  const { bytes, plan, pageOne } = await imposeAlbumSheets(src, size, o.order_number, canvasTextPainter());
  saveFile(bytes, `megyprints-${o.order_number}-sheets.pdf`);
  return sheetsNote(o, plan, pageOne);
}

/** Download the flat cover on one press sheet. */
export async function downloadCoverSheet(o: PrintOrder): Promise<string> {
  const size = sizeOf(o);
  const src = await readPrintFile(`${printFilesOf(o)}-cover.pdf`, 'cover file');
  const { imposeCoverSheet } = await pressTools();
  const { bytes, spineIn } = await imposeCoverSheet(src, size, coverOf(o), o.page_count, o.order_number, canvasTextPainter(), finishOf(o));
  saveFile(bytes, `megyprints-${o.order_number}-cover-sheet.pdf`);
  return coverSheetNote(o, spineIn);
}

/** Download every sheet side and the cover sheet as 300 DPI JPEGs in one zip
 *  (pressSheetZip, shared with the 2.0 app). `progress` gets a line to show
 *  while the pictures are made. */
export async function downloadSheetsAsJpeg(o: PrintOrder, progress: (line: string) => void = () => {}): Promise<string> {
  sizeOf(o);
  const text = canvasTextPainter();
  progress('Getting the print files…');
  const src = await readPrintFile(`${printFilesOf(o)}.pdf`, 'print file');
  const { imposeAlbumSheets, imposeCoverSheet } = await pressTools();
  const { pdfToJpegs } = await jpegTools();
  const tools = { imposeAlbumSheets, imposeCoverSheet, toJpegs: (pdf: Uint8Array, onPage?: (done: number, total: number) => void) => pdfToJpegs(pdf, onPage) };
  const { zip, note } = await makeSheetsJpegZip(o, src, () => readPrintFile(`${printFilesOf(o)}-cover.pdf`, 'cover file'), text, tools, progress);
  saveFile(zip, `megyprints-${o.order_number}-jpeg.zip`, 'application/zip');
  return note;
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
