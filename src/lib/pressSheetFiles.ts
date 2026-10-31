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
import { ALBUM_SIZES, type AlbumSizePreset, type CoverType, type MaterialType } from '../pages/builder/types';
import { PRINTER_SPEC, spineLabel, spineWidthInches } from '../pages/builder/coverGeometry';
import { printSides } from '../pages/builder/printSheet';
import type { PageOneSide } from '../pages/builder/binding';
import { canvasTextPainter } from './canvasTextPainter';
import { zipStored, type ZipEntry } from './jpegZip';

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

function sizeOf(o: PrintOrder): AlbumSizePreset {
  const size = ALBUM_SIZES.find((s) => s.preset === o.album_size)?.preset;
  if (!size) throw new Error(`This order's album size (${o.album_size ?? 'none'}) isn't one we print.`);
  return size;
}

/** Any cover but softcover binds as a hardcover (coverGeometry.isHardcover). */
const coverOf = (o: Pick<PrintOrder, 'cover'>) => (o.cover || 'softcover') as CoverType;

/** The paper finish picked at checkout; anything but glossy is matte. */
const finishOf = (o: Pick<PrintOrder, 'material'>): MaterialType => (o.material === 'glossy' ? 'glossy' : 'matte');

/** How thick this book's spine is: its leaves of C2S 120 in the picked
 *  finish, stacked (plus the boards on a hardcover). */
export function orderSpine(o: Pick<PrintOrder, 'cover' | 'material' | 'page_count'>): string {
  return `spine ${spineLabel(spineWidthInches(o.page_count, coverOf(o), finishOf(o)))}`;
}

/** What to tell the operator after the cover sheet: its spine, and when the
 *  cover file was drawn for another spine than this paper makes (files from
 *  before C2S 120 was set: C2S 140 or the old 0.15 mm guess), the spine the
 *  pages will really stack to. */
export function coverSheetNote(o: Pick<PrintOrder, 'cover' | 'material' | 'page_count'>, fileSpineIn: number): string {
  const note = `Cover sheet: print one side only · spine ${spineLabel(fileSpineIn)}`;
  const bookIn = spineWidthInches(o.page_count, coverOf(o), finishOf(o));
  return Math.abs(fileSpineIn - bookIn) * 25.4 < 0.2
    ? note
    : `${note}. This cover was made before the paper was set to ${PRINTER_SPEC.paperName}: the pages on ${PRINTER_SPEC.paperName} ${finishOf(o)} stack to about ${spineLabel(bookIn)}`;
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

/** Which sides of this order's stack are blank, read from its print file
 *  (printSides). Files made since 21 Oct 2026 start with page 1; older ones
 *  start with a blank side that faces the inside of the front cover. */
export function blankSidesNote(pageCount: number, pageOne: PageOneSide): string {
  const sides = printSides(pageCount, pageOne);
  const first = sides[0] === null;
  const last = sides[sides.length - 1] === null;
  const start = first ? 'The first side is blank (an older order: it faces the inside of the front cover)' : 'Page 1 is the first side';
  return last ? `${start}; the last side is blank${first ? ' too' : ''}` : start;
}

/** How to cut and stack: the whole printed stack at once, then the piles
 *  one on the next (the shop's way, 2026-10-24: "page 1, and behind it it
 *  runs on to page 22; once it's cut, put it on the one to its right, page
 *  23…"). Every piece's front carries its number at the spine edge, so the
 *  finished stack counts 1, 2, 3… from the top. */
export function stackHowTo(piles: number): string {
  return piles === 1
    ? 'keep sheet 1 on top, front up, and cut the whole stack on the marks'
    : `keep sheet 1 on top, front up, cut the whole stack at once into ${piles} piles, then put pile 1 (top left) on pile 2, that on pile 3, left to right, top to bottom`;
}

/** What to tell the operator about the album sheets (sheet count, blank
 *  sides, and a warning if the file and the order disagree). */
function sheetsNote(o: PrintOrder, plan: { sheets: number; pageCount: number; layout: { leavesPerSheet: number } }, pageOne: PageOneSide): string {
  const note = `${plan.sheets} sheets, both sides · ${stackHowTo(plan.layout.leavesPerSheet)} · ${blankSidesNote(plan.pageCount, pageOne)}`;
  return plan.pageCount === o.page_count
    ? note
    : `${note}. Check: the print file has ${plan.pageCount} pages, the order says ${o.page_count}.`;
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

/** A sheet side's picture name. The number in front is the print order, so
 *  any folder lists the pictures the way they print: 01 the front of sheet 1,
 *  02 its back, 03 the front of sheet 2… and the cover after them all.
 *  (Named "sheet-01-front" / "sheet-01-back", a folder put every back before
 *  its front and the cover first: printed in that order, no side lined up.) */
export function sideJpegName(orderNumber: string, n: number, total: number, side: { sheet: number; side: 'front' | 'back' }): string {
  const width = Math.max(2, String(total).length);
  return `${orderNumber}-${String(n).padStart(width, '0')}-${side.side}-of-sheet-${side.sheet}.jpg`;
}

/** The cover's picture name: after every numbered side in a folder. */
export const coverJpegName = (orderNumber: string) => `${orderNumber}-cover.jpg`;

/** The words that go in the zip with the pictures. */
export function jpegHowTo(o: PrintOrder, sheets: number, pieces: number, cover: { spineIn: number } | null, blankSides: string): string {
  const total = 2 * sheets;
  const name = (n: number, side: 'front' | 'back', sheet: number) => sideJpegName(o.order_number, n, total, { sheet, side });
  return [
    `Megyprints order ${o.order_number}: the press sheets as JPEG pictures.`,
    '',
    'Every picture is one side of a 12.5 x 19 in sheet at 300 DPI (3750 x 5700 pixels).',
    'Print at actual size (100%). Do not use "fit to page".',
    '',
    `Album: ${sheets} sheets, both sides: ${total} pictures, numbered in print order.`,
    `Print them in number order, 2-sided (duplex), flipping on the long edge:`,
    `${name(1, 'front', 1)} on the front of the first sheet, ${name(2, 'back', 1)} on its back,`,
    `then ${name(3, 'front', 2)} on the front of the next sheet, and so on.`,
    'Every sheet has a picture on both sides. Never print a picture on a sheet by itself.',
    'Keep the printed sheets in order: sheet 1 on top, front side up.',
    `Cut the whole stack at once on the marks: ${pieces} ${pieces === 1 ? 'pile' : 'piles'}, each already in page order.`,
    'Put pile 1 (top left) on top of pile 2 (to its right), that on pile 3, and so on: left to right, top to bottom.',
    'Every piece has its number (1, 2, 3...) printed small on its front, at the spine edge: the finished stack counts 1, 2, 3 from the top.',
    `${blankSides}.`,
    '',
    cover
      ? `Cover: print ${coverJpegName(o.order_number)} on one side of its own sheet. Cut on the marks; the dashed marks are the spine edges (spine ${spineLabel(cover.spineIn)}).`
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
  const { bytes, plan, pageOne } = await imposeAlbumSheets(src, size, o.order_number, text);
  const total = plan.sides.length + 1;
  const say = (done: number) => progress(`Making the JPEG pictures: ${done} of ${total}…`);
  say(0);
  const sides = await pdfToJpegs(bytes, (done) => say(done));
  const files: ZipEntry[] = plan.sides.map((s, i) => ({ name: sideJpegName(o.order_number, i + 1, plan.sides.length, s), data: sides[i] }));

  // The cover sheet: an order can still be waiting on its cover file.
  let coverMissing: string | null = null;
  let coverSpine: { spineIn: number } | null = null;
  try {
    const coverSrc = await readPrintFile(`${printFilesOf(o)}-cover.pdf`, 'cover file');
    const { bytes: coverPdf, spineIn } = await imposeCoverSheet(coverSrc, size, coverOf(o), o.page_count, o.order_number, text, finishOf(o));
    const [cover] = await pdfToJpegs(coverPdf);
    files.push({ name: coverJpegName(o.order_number), data: cover });
    coverSpine = { spineIn };
  } catch (e) {
    coverMissing = e instanceof Error ? e.message : 'The cover file could not be read.';
  }
  say(total);
  files.push({ name: 'HOW-TO-PRINT.txt', data: new TextEncoder().encode(jpegHowTo(o, plan.sheets, plan.layout.leavesPerSheet, coverSpine, blankSidesNote(plan.pageCount, pageOne))) });
  saveFile(zipStored(files), `megyprints-${o.order_number}-jpeg.zip`, 'application/zip');
  const note = `JPEG: ${sides.length} sheet ${sides.length === 1 ? 'side' : 'sides'}${coverMissing ? '' : ' and the cover sheet'}, 300 DPI · ${sheetsNote(o, plan, pageOne)}`;
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
