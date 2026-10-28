/* ══════════════════════════════════════════════════════════════════════════
   pressSheetZip — "Sheets as JPEG": every sheet side and the cover sheet as
   300 DPI JPEG pictures, numbered in print order, in one zip with the words
   that say how to print them (the shop's printer asked for JPEG, 2026-10-21).

   Moved out of pressSheetFiles.ts (its downloadSheetsAsJpeg reads the print
   files from storage, calls this, and hands the zip to the browser) so the
   2.0 app makes the same zip from the same code (src/shared/sharedModules.ts).
   The sheet tools are handed in: the press-sheet layout (printSheetPdf's
   imposeAlbumSheets / imposeCoverSheet, which the console only loads on the
   operator's click: pdf-lib stays off customers' phones, see
   pressSheetFiles.spec) and what draws a sheet PDF as JPEG pictures (pdf.js
   in the console, pressSheetJpeg.ts; Skia in the app).
   ══════════════════════════════════════════════════════════════════════════ */

import type { AlbumSizePreset, CoverType, MaterialType } from '../pages/builder/types';
import type { TextPainter } from '../pages/builder/textPainter';
import type { SheetPlan } from '../pages/builder/printSheet';
import type { PageOneSide } from '../pages/builder/binding';
import { zipStored, type ZipEntry } from './jpegZip';
import {
  blankSidesNote, coverJpegName, coverOf, finishOf, jpegHowTo, sheetsNote, sideJpegName, sizeOf, type PressOrder,
} from './pressSheetWords';

/** Print resolution of every sheet picture: 12.5 × 19 in → 3750 × 5700 pixels. */
export const SHEET_JPEG_DPI = 300;
/** JPEG quality of a sheet picture (0 to 1): the console's pdf.js pictures and the app's Skia ones. */
export const SHEET_JPEG_QUALITY = 0.95;

/** Draws each page of a sheet PDF as a 300 DPI JPEG; `onPage(done, total)` after each. */
export type SheetsToJpegs = (pdf: Uint8Array, onPage?: (done: number, total: number) => void) => Promise<Uint8Array[]>;

/** The press-sheet layout (printSheetPdf.ts): the album's sheets and the cover sheet as PDFs. */
export interface SheetTools {
  imposeAlbumSheets(src: ArrayBuffer | Uint8Array, size: AlbumSizePreset, orderLabel: string, text: TextPainter): Promise<{ bytes: Uint8Array; plan: SheetPlan; pageOne: PageOneSide }>;
  imposeCoverSheet(src: ArrayBuffer | Uint8Array, size: AlbumSizePreset, cover: CoverType, pageCount: number, orderLabel: string, text: TextPainter, material?: MaterialType): Promise<{ bytes: Uint8Array; spineIn: number }>;
  /** Draws each page of a sheet PDF as a 300 DPI JPEG. */
  toJpegs: SheetsToJpegs;
}

export interface SheetsJpegZip {
  zip: Uint8Array;
  /** What to tell the operator (sheets, blank sides, and why there is no cover picture if there isn't). */
  note: string;
}

/**
 * The zip for an order: `src` is its print file ("<order>.pdf"); `readCover`
 * gets its cover file, and may throw (an order can still be waiting on its
 * cover: the zip then says so instead of holding a cover picture). `text`
 * draws the sheets' words (no fonts); `tools` lays out and draws the sheets.
 * `progress` gets a line to show while the pictures are made. `when` dates
 * the zip's entries.
 */
export async function makeSheetsJpegZip(
  o: PressOrder,
  src: ArrayBuffer | Uint8Array,
  readCover: () => Promise<ArrayBuffer | Uint8Array>,
  text: TextPainter,
  tools: SheetTools,
  progress: (line: string) => void = () => {},
  when?: Date,
): Promise<SheetsJpegZip> {
  const size = sizeOf(o);
  const { imposeAlbumSheets, imposeCoverSheet, toJpegs } = tools;
  const { bytes, plan, pageOne } = await imposeAlbumSheets(src, size, o.order_number, text);
  const total = plan.sides.length + 1;
  const say = (done: number) => progress(`Making the JPEG pictures: ${done} of ${total}…`);
  say(0);
  const sides = await toJpegs(bytes, (done) => say(done));
  const files: ZipEntry[] = plan.sides.map((s, i) => ({ name: sideJpegName(o.order_number, i + 1, plan.sides.length, s), data: sides[i] }));

  // The cover sheet: an order can still be waiting on its cover file.
  let coverMissing: string | null = null;
  let coverSpine: { spineIn: number } | null = null;
  try {
    const coverSrc = await readCover();
    const { bytes: coverPdf, spineIn } = await imposeCoverSheet(coverSrc, size, coverOf(o), o.page_count, o.order_number, text, finishOf(o));
    const [cover] = await toJpegs(coverPdf);
    files.push({ name: coverJpegName(o.order_number), data: cover });
    coverSpine = { spineIn };
  } catch (e) {
    coverMissing = e instanceof Error ? e.message : 'The cover file could not be read.';
  }
  say(total);
  files.push({ name: 'HOW-TO-PRINT.txt', data: new TextEncoder().encode(jpegHowTo(o, plan.sheets, plan.layout.leavesPerSheet, coverSpine, blankSidesNote(plan.pageCount, pageOne))) });
  const zip = zipStored(files, when);
  const note = `JPEG: ${sides.length} sheet ${sides.length === 1 ? 'side' : 'sides'}${coverMissing ? '' : ' and the cover sheet'}, 300 DPI · ${sheetsNote(o, plan, pageOne)}`;
  return { zip, note: coverMissing ? `${note}. No cover picture: ${coverMissing}` : note };
}
