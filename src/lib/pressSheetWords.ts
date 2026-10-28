/* ══════════════════════════════════════════════════════════════════════════
   pressSheetWords — what the console's print-sheet buttons say and name:
   the notes for the operator, the JPEG picture names in print order, and the
   HOW-TO-PRINT.txt that goes in the "Sheets as JPEG" zip.

   Moved out of pressSheetFiles.ts (which re-exports all of it, so the
   console reads it as before) because that file reads the private bucket
   (Supabase) and hands files to the browser. These are plain words and
   numbers: the 2.0 app names and explains the same pictures with this very
   code (src/shared/sharedModules.ts).
   ══════════════════════════════════════════════════════════════════════════ */

import { ALBUM_SIZES, type AlbumSizePreset, type CoverType, type MaterialType } from '../pages/builder/types';
import { PRINTER_SPEC, spineLabel, spineWidthInches } from '../pages/builder/coverGeometry';
import { printSides } from '../pages/builder/printSheet';
import type { PageOneSide } from '../pages/builder/binding';

/** The order fields the sheets need (an admin order row has them all). */
export interface PressOrder {
  order_number: string;
  album_size: string | null;
  cover: string | null;
  material: string | null;
  page_count: number;
}

export function sizeOf(o: Pick<PressOrder, 'album_size'>): AlbumSizePreset {
  const size = ALBUM_SIZES.find((s) => s.preset === o.album_size)?.preset;
  if (!size) throw new Error(`This order's album size (${o.album_size ?? 'none'}) isn't one we print.`);
  return size;
}

/** Any cover but softcover binds as a hardcover (coverGeometry.isHardcover). */
export const coverOf = (o: Pick<PressOrder, 'cover'>) => (o.cover || 'softcover') as CoverType;

/** The paper finish picked at checkout; anything but glossy is matte. */
export const finishOf = (o: Pick<PressOrder, 'material'>): MaterialType => (o.material === 'glossy' ? 'glossy' : 'matte');

/** How thick this book's spine is: its leaves of C2S 140 in the picked
 *  finish, stacked (plus the boards on a hardcover). */
export function orderSpine(o: Pick<PressOrder, 'cover' | 'material' | 'page_count'>): string {
  return `spine ${spineLabel(spineWidthInches(o.page_count, coverOf(o), finishOf(o)))}`;
}

/** What to tell the operator after the cover sheet: its spine, and when the
 *  cover file was drawn for another spine than this paper makes (files from
 *  before C2S 140 was set), the spine the pages will really stack to. */
export function coverSheetNote(o: Pick<PressOrder, 'cover' | 'material' | 'page_count'>, fileSpineIn: number): string {
  const note = `Cover sheet: print one side only · spine ${spineLabel(fileSpineIn)}`;
  const bookIn = spineWidthInches(o.page_count, coverOf(o), finishOf(o));
  return Math.abs(fileSpineIn - bookIn) * 25.4 < 0.2
    ? note
    : `${note}. This cover was made before the paper was set to ${PRINTER_SPEC.paperName}: the pages on ${PRINTER_SPEC.paperName} ${finishOf(o)} stack to about ${spineLabel(bookIn)}`;
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
export function sheetsNote(o: Pick<PressOrder, 'page_count'>, plan: { sheets: number; pageCount: number; layout: { leavesPerSheet: number } }, pageOne: PageOneSide): string {
  const note = `${plan.sheets} sheets, both sides · ${stackHowTo(plan.layout.leavesPerSheet)} · ${blankSidesNote(plan.pageCount, pageOne)}`;
  return plan.pageCount === o.page_count
    ? note
    : `${note}. Check: the print file has ${plan.pageCount} pages, the order says ${o.page_count}.`;
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
export function jpegHowTo(o: Pick<PressOrder, 'order_number'>, sheets: number, pieces: number, cover: { spineIn: number } | null, blankSides: string): string {
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
