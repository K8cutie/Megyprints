/* ══════════════════════════════════════════════════════════════════════════
   printSheetPdf — the order's print files, laid out on the shop's press sheet.

   The customer's device makes "<order>.pdf" (one page per album page, trim +
   0.125" edge) and "<order>-cover.pdf" (the flat cover) at checkout. The shop
   prints on 12.5 × 19 in sheets, so the console turns those files into:
     • imposeAlbumSheets — sheet 1 front, sheet 1 back, sheet 2 front, … with
       cut marks, ready to print both sides (flip on the long edge);
     • imposeCoverSheet  — the flat cover on one sheet, with cut and fold marks;
     • pressTestSheet    — one sheet that checks the printer's settings.
   Where each page goes is printSheet.ts's job; this file only draws it. It
   runs in the console (pdf-lib is loaded only there), so it works for orders
   placed before it existed, and a fix here reaches every order.

   NO FONTS (the shop's printer, 2026-10-21: "the font is not available"). The
   album's pages are pictures already, but the PDF library the checkout uses
   (jsPDF) lists 14 standard fonts on every page, used or not, and the sheet
   labels were drawn in Helvetica, which isn't put in the file. A printer
   without those fonts refuses the job. So every file the console hands out
   has no font at all: the unused font lists are dropped as a file is opened
   (loadCustomerPdf), and every word is drawn as a picture (TextPainter).
   ══════════════════════════════════════════════════════════════════════════ */

import {
  PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, clip, decodePDFRawStream, degrees, endPath, popGraphicsState, pushGraphicsState, rectangle, rgb,
  type PDFImage, type PDFPage,
} from 'pdf-lib';
import { DEFAULT_MATERIAL, type AlbumSizePreset, type CoverType, type MaterialType } from './types';
import {
  PRESS_SHEET, sheetPlan, printSides, trimInches, coverOnSheet, type SheetPlan, type SheetPlacement, type SheetSlot, type Sides, type Turn,
} from './printSheet';
import { LEGACY_LEAF_IN, coverWrapGeometry, isHardcover, leafInches, spineForLeaf, spineFromWrapWidth, spineLabel } from './coverGeometry';
import { PAGE_ONE_RIGHT_MARK, type PageOneSide } from './binding';
import type { TextPainter } from './textPainter';

export type { TextPainter } from './textPainter';

const PT = 72;
const SHEET_W = PRESS_SHEET.wIn * PT;
const SHEET_H = PRESS_SHEET.hIn * PT;
const INK = rgb(0, 0, 0);
const PAPER = rgb(1, 1, 1);
const GREY = rgb(0.35, 0.35, 0.35);
/** A cut mark this long when there's room; it starts this far off the art. */
const MARK_LEN = 0.25;
const MARK_GAP = 1 / 16;
/** No album gets near this; a file past it is refused. */
export const MAX_PRINT_PAGES = 600;

/** Sheet inches (origin top-left) → PDF points (origin bottom-left). */
const px = (xIn: number) => xIn * PT;
const py = (yIn: number) => SHEET_H - yIn * PT;

const SIDE_ORDER: (keyof Sides)[] = ['top', 'right', 'bottom', 'left'];

/** The page's kept edges, seen from the sheet (inverse of pageSidesFromSheet). */
function sheetSidesFromPage(page: Sides, turn: Turn): Sides {
  const k = turn / 90;
  const out = {} as Sides;
  SIDE_ORDER.forEach((side, i) => { out[SIDE_ORDER[(i + k) % 4]] = page[side]; });
  return out;
}

/** Hairline that shows on light AND dark art: white under, black on top. */
function markLine(page: PDFPage, x1: number, y1: number, x2: number, y2: number, overArt: boolean) {
  const start = { x: px(x1), y: py(y1) };
  const end = { x: px(x2), y: py(y2) };
  if (overArt) page.drawLine({ start, end, thickness: 1.2, color: PAPER });
  page.drawLine({ start, end, thickness: 0.4, color: INK });
}

const GREY_HEX = '#595959';
const INK_HEX = '#000000';

interface WriteOpts { vertical?: boolean; color?: string; bold?: boolean }
type Write = (page: PDFPage, text: string, xIn: number, yIn: number, size: number, opts?: WriteOpts) => Promise<void>;

/** Words for one output file: each picture is put in the file once, however
 *  many sheets show it. (x, y) is where the baseline starts, in sheet inches;
 *  `vertical` reads bottom to top, like turned text. */
function writer(out: PDFDocument, painter: TextPainter): { write: Write; widthIn: (text: string, size: number, bold?: boolean) => number } {
  const made = new Map<string, Promise<{ img: PDFImage; wPt: number; hPt: number; descentPt: number }>>();
  const write: Write = async (page, text, xIn, yIn, size, { vertical = false, color = GREY_HEX, bold = false } = {}) => {
    const key = `${bold ? 'b' : 'r'}|${size}|${color}|${text}`;
    let pic = made.get(key);
    if (!pic) {
      const p = painter.png(text, size, color, bold);
      pic = out.embedPng(p.bytes).then((img) => ({ img, wPt: p.wPt, hPt: p.hPt, descentPt: p.descentPt }));
      made.set(key, pic);
    }
    const { img, wPt, hPt, descentPt } = await pic;
    const x = px(xIn), y = py(yIn);
    // The picture's bottom-left: the baseline start, moved down by the descent
    // (turned with the words: a quarter turn moves "down" to the right).
    const at = vertical ? { x: x + descentPt, y } : { x, y: y - descentPt };
    page.drawImage(img, { x: at.x, y: at.y, width: wPt, height: hPt, rotate: vertical ? degrees(90) : undefined });
  };
  return { write, widthIn: (text, size, bold = false) => painter.width(text, size, bold) / PT };
}

/** Whether any of the page's own drawing writes text (a BT operator). A
 *  stream that can't be read counts as text, so its fonts stay. */
function pageDrawsText(page: PDFPage): boolean {
  const contents = page.node.Contents();
  if (!contents) return false;
  const streams = contents instanceof PDFArray ? contents.asArray().map((r) => page.doc.context.lookup(r)) : [contents];
  for (const s of streams) {
    if (!(s instanceof PDFRawStream)) return true;
    let bytes: Uint8Array;
    try { bytes = decodePDFRawStream(s).decode(); } catch { return true; }
    let str = '';
    for (let i = 0; i < bytes.length; i += 0x8000) str += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    if (/(^|[\s\]>)])BT[\s/[(<]/.test(str)) return true;
  }
  return false;
}

/** Save a file the console made. pdf-lib gives every new page an empty font
 *  list: it names nothing, but a strict print check could still stop on it. */
function saveNoFonts(out: PDFDocument): Promise<Uint8Array> {
  for (const p of out.getPages()) {
    const res = p.node.Resources();
    const fonts = res?.lookup(PDFName.of('Font'));
    if (res && fonts instanceof PDFDict && fonts.keys().length === 0) res.delete(PDFName.of('Font'));
  }
  return out.save();
}

/** Drop the font lists from pages that write no text (every page our checkout
 *  makes: one picture each). If any page writes text, every font stays: pages
 *  can share one list, and that file isn't one our checkout made. */
function dropUnusedFonts(pages: PDFPage[]): void {
  if (pages.some(pageDrawsText)) return;
  for (const pg of pages) pg.node.Resources()?.delete(PDFName.of('Font'));
}

export interface ImposeResult {
  bytes: Uint8Array;
  plan: SheetPlan;
  /** Where the print file puts page 1: 'left' = a file from before 2026-10-21. */
  pageOne: PageOneSide;
  /** Trim edge the print file had (0.125 normally; 0 on orders before PI-2). */
  sourceBleedIn: number;
}

/** No print file gets near this (a 50-page album is ~15 MB). */
export const MAX_PRINT_FILE_BYTES = 200 * 1024 * 1024;

/**
 * Open a print file the customer's device uploaded. It is untrusted: refuse
 * what our checkout never makes (too big, turned pages, a shifted page box)
 * and strip what a page can carry besides its picture (links, actions,
 * thumbnails) so none of it is copied onto the sheets.
 */
async function loadCustomerPdf(src: ArrayBuffer | Uint8Array, what: string): Promise<{ doc: PDFDocument; pages: PDFPage[] }> {
  if (src.byteLength > MAX_PRINT_FILE_BYTES) throw new Error(`This ${what} is ${Math.round(src.byteLength / 1048576)} MB — bigger than any album. Ask the customer to order again.`);
  const doc = await PDFDocument.load(src);
  const pages = doc.getPages();
  if (!pages.length) throw new Error(`This ${what} has no pages.`);
  for (const pg of pages) {
    const box = pg.getMediaBox();
    if (pg.getRotation().angle % 360 !== 0 || Math.abs(box.x) > 0.5 || Math.abs(box.y) > 0.5) {
      throw new Error(`This ${what} wasn't made by our checkout (its pages are turned or shifted). Ask the customer to order again.`);
    }
    for (const key of ['Annots', 'AA', 'Thumb', 'PieceInfo']) pg.node.delete(PDFName.of(key));
  }
  dropUnusedFonts(pages);
  return { doc, pages };
}

/** The customer's print file as the shop gets it from "Print PDF": the same
 *  pages, with no font lists and nothing but the pictures (a fresh file, so
 *  the old font objects aren't carried along unused). */
export async function cleanPrintFile(src: ArrayBuffer | Uint8Array, what: 'print file' | 'cover file'): Promise<Uint8Array> {
  const { doc, pages } = await loadCustomerPdf(src, what);
  if (what === 'print file' && pages.length > MAX_PRINT_PAGES) throw new Error(`This print file has ${pages.length} pages — more than any album. Ask the customer to order again.`);
  const out = await PDFDocument.create();
  // The page-1 mark stays: the console's sheets read it (printFilePageOne).
  let keywords = '';
  try { keywords = doc.getKeywords() ?? ''; } catch { /* not text: leave it out */ }
  if (keywords) out.setKeywords(keywords.split(/\s+/).filter(Boolean));
  const copied = await out.copyPages(doc, pages.map((_, i) => i));
  copied.forEach((p) => out.addPage(p));
  return saveNoFonts(out);
}

/** Where a print file puts page 1. The checkout writes PAGE_ONE_RIGHT_MARK
 *  into every file it makes since page 1 became a right-hand page; a file
 *  without it was drawn with page 1 on the left (its spine margin on the
 *  right), and must go on the sheets that way. The mark only picks between
 *  the two layouts, so a forged one can't do more than a wrong order would. */
export function printFilePageOne(doc: PDFDocument): PageOneSide {
  let keywords = '';
  // pdf-lib throws on Keywords that aren't text: not a file our checkout made.
  try { keywords = doc.getKeywords() ?? ''; } catch { /* treated as unmarked */ }
  return keywords.split(/[\s,;]+/).includes(PAGE_ONE_RIGHT_MARK) ? 'right' : 'left';
}

/** How much trim edge the print file's pages carry, from their size. */
function sourceBleed(wPt: number, hPt: number, size: AlbumSizePreset): number {
  const { trimW, trimH } = trimInches(size);
  const bw = (wPt / PT - trimW) / 2;
  const bh = (hPt / PT - trimH) / 2;
  const ok = (b: number) => Math.abs(b - PRESS_SHEET.bleedIn) < 0.01 || Math.abs(b) < 0.01;
  if (!ok(bw) || !ok(bh) || Math.abs(bw - bh) > 0.01) {
    throw new Error(`This print file's pages are ${(wPt / PT).toFixed(2)} × ${(hPt / PT).toFixed(2)} in, not ${size} pages. Check the order's album size.`);
  }
  return Math.abs(bw) < 0.01 ? 0 : PRESS_SHEET.bleedIn;
}

/**
 * Lay the order's page PDF out on press sheets. `label` goes on every sheet
 * (the order number); `text` draws it (no fonts). Throws with a plain message
 * if the file doesn't match the album size.
 */
export async function imposeAlbumSheets(src: ArrayBuffer | Uint8Array, size: AlbumSizePreset, orderLabel: string, text: TextPainter): Promise<ImposeResult> {
  const { doc, pages } = await loadCustomerPdf(src, 'print file');
  const pageOne = printFilePageOne(doc);
  // A page count no album has is a bad file, not a job to lay out (and would
  // only lock up this tab).
  if (pages.length > MAX_PRINT_PAGES) throw new Error(`This print file has ${pages.length} pages — more than any album. Ask the customer to order again.`);
  const first = pages[0].getSize();
  const srcBleed = sourceBleed(first.width, first.height, size);
  const { trimW, trimH } = trimInches(size);
  const plan = sheetPlan(size, pages.length, pageOne);
  pages.forEach((pg, i) => {
    const s = pg.getSize();
    if (Math.abs(s.width - first.width) > 1 || Math.abs(s.height - first.height) > 1) {
      throw new Error(`Page ${i + 1} of the print file is a different size from page 1.`);
    }
  });

  const out = await PDFDocument.create();
  out.setTitle(`${orderLabel} — press sheets`);
  const words = writer(out, text);

  // Each spot's pages, front and back, for its label ("pages 1–2").
  const sides = printSides(pages.length, pageOne);
  const leafName = (leaf: number) => {
    const shown = [sides[2 * leaf], sides[2 * leaf + 1]].filter((p): p is number => p !== null && p !== undefined).map((p) => p + 1);
    return shown.length === 2 ? `pages ${shown[0]}–${shown[1]}` : shown.length === 1 ? `page ${shown[0]}` : '';
  };

  // Keep only the trim edge each spot has room for (the file has 0.125).
  const keepOf = (p: SheetPlacement): Sides => ({
    top: Math.min(p.pageBleed.top, srcBleed), right: Math.min(p.pageBleed.right, srcBleed),
    bottom: Math.min(p.pageBleed.bottom, srcBleed), left: Math.min(p.pageBleed.left, srcBleed),
  });
  // Every page is used once. Embed them in ONE call: separate calls copy
  // anything the pages share (a hostile file's one big image) once per page.
  const placed = plan.sides.flatMap((side) => side.placements.filter((p) => p.page !== null));
  const embeddedList = await out.embedPages(
    placed.map((p) => pages[p.page!]),
    placed.map((p) => {
      const keep = keepOf(p);
      return {
        left: (srcBleed - keep.left) * PT,
        right: (srcBleed + trimW + keep.right) * PT,
        bottom: (srcBleed - keep.bottom) * PT,
        top: (srcBleed + trimH + keep.top) * PT,
      };
    }),
  );
  const embeddedOf = new Map(placed.map((p, i) => [p, embeddedList[i]]));

  for (const side of plan.sides) {
    const sheet = out.addPage([SHEET_W, SHEET_H]);
    for (const p of side.placements) {
      const embedded = embeddedOf.get(p);
      if (!embedded) continue;
      const keep = keepOf(p);
      const ew = (trimW + keep.left + keep.right) * PT;
      const eh = (trimH + keep.top + keep.bottom) * PT;
      const ks = sheetSidesFromPage(keep, p.turn);
      // The drawn box on the sheet (already turned), bottom-left in points.
      const boxL = px(p.slot.x - ks.left);
      const boxB = py(p.slot.y + p.slot.h + ks.bottom);
      // pdf-lib turns counter-clockwise about (x, y); place that point so the
      // turned page lands on the box.
      const at = p.turn === 90 ? { x: boxL, y: boxB + ew, r: -90 }
        : p.turn === 270 ? { x: boxL + eh, y: boxB, r: 90 }
          : p.turn === 180 ? { x: boxL + ew, y: boxB + eh, r: 180 }
            : { x: boxL, y: boxB, r: 0 };
      // Cut the page at that box on the sheet too. The embedded page is trimmed
      // by its own box (BBox), but some design programs ignore it and show the
      // whole page, 1/8" past every edge: where pages touch, one page's edge then
      // lies over its neighbour (the shop, 2026-10-25: "nag overlap… kasi
      // bleeding mo all sides"). A clipping path on the sheet every program reads.
      const boxW = (p.slot.w + ks.left + ks.right) * PT;
      const boxH = (p.slot.h + ks.top + ks.bottom) * PT;
      sheet.pushOperators(pushGraphicsState(), rectangle(boxL, boxB, boxW, boxH), clip(), endPath());
      sheet.drawPage(embedded, { x: at.x, y: at.y, width: ew, height: eh, rotate: degrees(at.r) });
      sheet.pushOperators(popGraphicsState());
    }
    if (side.side === 'front') {
      for (const p of side.placements) if (p.leaf < plan.leaves) await drawPieceNumber(sheet, words, p);
    }
    drawCutMarks(sheet, side.placements.map((q) => q.slot));
    await drawSheetLabel(sheet, words, `${orderLabel} · sheet ${side.sheet} of ${plan.sheets} · ${side.side}`, side.placements.map((q) => q.slot), side.placements.map((q, s) => [`pile ${s + 1}`, leafName(q.leaf)].filter(Boolean).join(' · ')));
  }
  return { bytes: await saveNoFonts(out), plan, pageOne, sourceBleedIn: srcBleed };
}

/** The piece number: small, grey, on the piece's FRONT. */
export const PIECE_NUMBER = { pt: 6, color: '#7A7A7A', fromSpineIn: 0.03 } as const;

/**
 * Each cut piece's place in the stack ("1", "2", "3"… through the book) on
 * its FRONT, just inside the spine edge (owner, 2026-10-24: "once its cut the
 * order of pages gets jumbled… put a number on the bleed or the binding
 * side"). Not the trim edge: that is what the cut takes off. The number sits
 * in the first 1/8" of the binding side, the strip that goes into the glue,
 * so the bound book doesn't show it. It runs along the spine edge, so it
 * reaches no further in than the type is tall. A piece that shows no number
 * is lying back side up.
 *
 * Every front's spine is the page's own LEFT edge (page 1, 3, 5… bind on the
 * left; an older file's blank first side and even pages sit the same way),
 * turned with the page onto the sheet.
 */
async function drawPieceNumber(sheet: PDFPage, words: ReturnType<typeof writer>, p: SheetPlacement) {
  const text = String(p.leaf + 1);
  const { pt, color, fromSpineIn } = PIECE_NUMBER;
  const em = pt / PT;
  const len = words.widthIn(text, pt);
  const spine = SIDE_ORDER[(SIDE_ORDER.indexOf('left') + p.turn / 90) % 4];
  const s = p.slot;
  const midX = s.x + s.w / 2, midY = s.y + s.h / 2;
  // Turned words read bottom to top, with the letters' tops toward the left.
  if (spine === 'left') await words.write(sheet, text, s.x + fromSpineIn + em, midY + len / 2, pt, { vertical: true, color });
  else if (spine === 'right') await words.write(sheet, text, s.x + s.w - fromSpineIn, midY + len / 2, pt, { vertical: true, color });
  else if (spine === 'top') await words.write(sheet, text, midX - len / 2, s.y + fromSpineIn + em, pt, { color });
  else await words.write(sheet, text, midX - len / 2, s.y + s.h - fromSpineIn, pt, { color });
}

/** The block of pages on one side of a sheet: its outside (art) edges, and
 *  the trim edge it keeps outside on each side — 0 where pages are butted
 *  against the printer's edge (6x6 across). */
function blockOf(slots: SheetSlot[]) {
  const top = Math.min(...slots.map((s) => s.y - s.bleed.top));
  const bottom = Math.max(...slots.map((s) => s.y + s.h + s.bleed.bottom));
  const left = Math.min(...slots.map((s) => s.x - s.bleed.left));
  const right = Math.max(...slots.map((s) => s.x + s.w + s.bleed.right));
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  const edge = (on: (s: SheetSlot) => boolean, of: (s: SheetSlot) => number) => Math.min(...slots.filter(on).map(of));
  return {
    top, bottom, left, right,
    edgeTop: edge((s) => near(s.y - s.bleed.top, top), (s) => s.bleed.top),
    edgeBottom: edge((s) => near(s.y + s.h + s.bleed.bottom, bottom), (s) => s.bleed.bottom),
    edgeLeft: edge((s) => near(s.x - s.bleed.left, left), (s) => s.bleed.left),
    edgeRight: edge((s) => near(s.x + s.w + s.bleed.right, right), (s) => s.bleed.right),
  };
}

/** The strips cut off between rows (and above / below them), along one axis:
 *  [from, to] in inches, art that goes in the bin. */
function wasteStrips(from: number, to: number, spans: [number, number][]): [number, number][] {
  const sorted = [...new Map(spans.map(([a, b]) => [`${a.toFixed(4)}`, [a, b] as [number, number]])).values()].sort((p, q) => p[0] - q[0]);
  const out: [number, number][] = [];
  let at = from;
  for (const [a, b] of sorted) {
    if (a - at > 1 / 64) out.push([at, a]);
    at = Math.max(at, b);
  }
  if (to - at > 1 / 64) out.push([at, to]);
  return out;
}

/** How long a cutting line at the side of a butted sheet is. */
export const SIDE_CUT_LINE_IN = 0.25;

/** A cutting line lying just inside a strip that is cut off: its edge is the
 *  cut, so nothing of it reaches the page. Black on a thin white line, so it
 *  shows on dark art too. `inward` is the strip's side of the cut (+1 = down /
 *  right in sheet inches). Horizontal for a cut across, vertical for a cut down. */
function cutLineInStrip(page: PDFPage, cut: number, from: number, to: number, inward: 1 | -1, across: boolean) {
  const at = (pt: number) => cut + inward * (pt / 2) / PT;
  const line = (offset: number, thickness: number, color: typeof INK) => {
    const c = at(offset);
    const [x1, y1, x2, y2] = across ? [from, c, to, c] : [c, from, c, to];
    page.drawLine({ start: { x: px(x1), y: py(y1) }, end: { x: px(x2), y: py(y2) }, thickness, color });
  };
  line(1.2, 1.2, PAPER);
  line(0.5, 0.5, INK);
}

/** Cut marks for every cut line, in the white around the block — or, where
 *  the block reaches the printer's white edge, over the outer trim edge (that
 *  strip is cut off). Where pages are butted right against the printer's
 *  edge (6x6 across) there is neither: there, each cut across the sheet gets
 *  a short thin cutting line at both sides, lying inside the strip that is
 *  cut off, with its edge on the cut. (They were small black blocks filling
 *  those strips' ends, 2026-10-22 to -25; the shop: "wag na lagyan, cutting
 *  line na lang" — leave them out, just a cutting line.) */
function drawCutMarks(page: PDFPage, slots: SheetSlot[]) {
  const u = PRESS_SHEET.unprintableIn;
  const { top, bottom, left, right, edgeTop, edgeBottom, edgeLeft, edgeRight } = blockOf(slots);
  const cutsX = [...new Set(slots.flatMap((s) => [s.x, s.x + s.w]).map((v) => Math.round(v * 1e4) / 1e4))];
  const cutsY = [...new Set(slots.flatMap((s) => [s.y, s.y + s.h]).map((v) => Math.round(v * 1e4) / 1e4))];
  const MIN_EDGE = 1 / 16;

  // Room in the white: from the art's edge to the printer's edge.
  const roomTop = top - u, roomBottom = PRESS_SHEET.hIn - u - bottom;
  const roomLeft = left - u, roomRight = PRESS_SHEET.wIn - u - right;
  const span = (room: number) => Math.min(MARK_LEN, room - MARK_GAP);
  for (const x of cutsX) {
    if (span(roomTop) > 0.05) markLine(page, x, top - MARK_GAP - span(roomTop), x, top - MARK_GAP, false);
    else if (edgeTop >= MIN_EDGE) markLine(page, x, top, x, top + edgeTop - 1 / 32, true);
    if (span(roomBottom) > 0.05) markLine(page, x, bottom + MARK_GAP, x, bottom + MARK_GAP + span(roomBottom), false);
    else if (edgeBottom >= MIN_EDGE) markLine(page, x, bottom - edgeBottom + 1 / 32, x, bottom, true);
  }
  for (const y of cutsY) {
    if (span(roomLeft) > 0.05) markLine(page, left - MARK_GAP - span(roomLeft), y, left - MARK_GAP, y, false);
    else if (edgeLeft >= MIN_EDGE) markLine(page, left, y, left + edgeLeft - 1 / 32, y, true);
    if (span(roomRight) > 0.05) markLine(page, right + MARK_GAP, y, right + MARK_GAP + span(roomRight), y, false);
    else if (edgeRight >= MIN_EDGE) markLine(page, right - edgeRight + 1 / 32, y, right, y, true);
  }

  // Butted sides: a cutting line at each end of every cut across the sheet
  // (and down it, were pages ever butted top to bottom), inside the strip
  // that is cut off. A strip's edge is a cut unless it is the art's own edge.
  const isCut = (v: number, cuts: number[]) => cuts.some((c) => Math.abs(c - v) < 1e-3);
  const rowsY = wasteStrips(top, bottom, slots.map((s) => [s.y, s.y + s.h]));
  const colsX = wasteStrips(left, right, slots.map((s) => [s.x, s.x + s.w]));
  const sides: [boolean, number, number][] = [
    [span(roomLeft) <= 0.05 && edgeLeft < MIN_EDGE, left, left + SIDE_CUT_LINE_IN],
    [span(roomRight) <= 0.05 && edgeRight < MIN_EDGE, right - SIDE_CUT_LINE_IN, right],
  ];
  for (const [butted, from, to] of sides) {
    if (!butted) continue;
    for (const [a, b] of rowsY) {
      if (isCut(a, cutsY)) cutLineInStrip(page, a, from, to, 1, true);
      if (isCut(b, cutsY)) cutLineInStrip(page, b, from, to, -1, true);
    }
  }
  const ends: [boolean, number, number][] = [
    [span(roomTop) <= 0.05 && edgeTop < MIN_EDGE, top, top + SIDE_CUT_LINE_IN],
    [span(roomBottom) <= 0.05 && edgeBottom < MIN_EDGE, bottom - SIDE_CUT_LINE_IN, bottom],
  ];
  for (const [butted, from, to] of ends) {
    if (!butted) continue;
    for (const [a, b] of colsX) {
      if (isCut(a, cutsX)) cutLineInStrip(page, a, from, to, 1, false);
      if (isCut(b, cutsX)) cutLineInStrip(page, b, from, to, -1, false);
    }
  }
}

/** The sheet's name, along the paper edge of the widest white band, and next
 *  to each spot the pages it holds ("pages 1–2") — in the side band beside
 *  its column, or above the top row / below the bottom row when the sides
 *  are too narrow. With no white band at all (6x6), the name goes small on a
 *  white patch in the strip cut off above the top row. */
async function drawSheetLabel(page: PDFPage, words: ReturnType<typeof writer>, text: string, slots: SheetSlot[], names: string[]) {
  const u = PRESS_SHEET.unprintableIn;
  const size = 7;
  const cap = 0.1; // text height, inches
  const { top, bottom, left, right, edgeTop } = blockOf(slots);
  const bandL = left - u, bandR = PRESS_SHEET.wIn - u - right, bandT = top - u, bandB = PRESS_SHEET.hIn - u - bottom;
  const widthIn = (t: string) => words.widthIn(t, size);
  const label = (t: string, xIn: number, yIn: number, vertical = false) => words.write(page, t, xIn, yIn, size, { vertical });

  // Sheet name: right at the paper's printable edge, clear of the cut marks.
  if (bandL >= 0.6) await label(text, u + 0.02 + cap, PRESS_SHEET.hIn - u - 0.3, true);
  else if (bandT >= 0.2) await label(text, u + 0.3, u + cap + 0.02);
  else if (bandB >= 0.2) await label(text, u + 0.3, PRESS_SHEET.hIn - u - 0.04);
  else if (edgeTop >= 0.1) {
    const small = 5.5;
    const x = left + 0.5;
    page.drawRectangle({ x: px(x - 0.04), y: py(top + edgeTop - 1 / 64), width: (words.widthIn(text, small) + 0.08) * PT, height: (edgeTop - 1 / 32) * PT, color: PAPER });
    await words.write(page, text, x, top + edgeTop - 0.03, small);
  }

  const lastCol = Math.max(...slots.map((s) => s.x));
  const firstCol = Math.min(...slots.map((s) => s.x));
  const firstRow = Math.min(...slots.map((s) => s.y));
  const lastRow = Math.max(...slots.map((s) => s.y));
  for (const [i, s] of slots.entries()) {
    const t = names[i];
    if (!t) continue;
    const midY = s.y + s.h / 2 + widthIn(t) / 2;
    if (s.x === firstCol && bandL >= 0.3) await label(t, left - 0.08, midY, true);
    else if (s.x === lastCol && bandR >= 0.3) await label(t, right + 0.08 + cap, midY, true);
    else if (s.y === firstRow && bandT >= 0.3) await label(t, s.x + s.w / 2 - widthIn(t) / 2, top - 0.35);
    else if (s.y === lastRow && bandB >= 0.3) await label(t, s.x + s.w / 2 - widthIn(t) / 2, bottom + 0.35 + cap);
  }
}

export interface CoverSheetResult {
  bytes: Uint8Array; wrapWIn: number; wrapHIn: number;
  /** The spine the cover file was drawn with, inches. */
  spineIn: number;
}

/**
 * Put the flat cover on one sheet: centred, turned to run along the 19 in
 * side, with cut marks at its trim and fold marks at the spine. Throws with
 * the plain reason when the cover can't fit (e.g. 8.5x11 hardbound).
 *
 * The spine is read from the cover file's width, so the fold marks land on
 * the spine it was drawn with: files made since 2026-10-22 for C2S 140
 * (matte or glossy), older ones for a 0.006" leaf. A file wider or narrower
 * than any of those for this page count is refused.
 */
export async function imposeCoverSheet(
  src: ArrayBuffer | Uint8Array, size: AlbumSizePreset, cover: CoverType, pageCount: number, orderLabel: string, text: TextPainter,
  material: MaterialType = DEFAULT_MATERIAL,
): Promise<CoverSheetResult> {
  const { pages: [srcPage] } = await loadCustomerPdf(src, 'cover file');
  const s = srcPage.getSize();
  const wrapW = s.width / PT;
  const wrapH = s.height / PT;
  const spineIn = spineFromWrapWidth(size, cover, wrapW);
  const shouldBe = coverWrapGeometry(size, pageCount, cover, { material }).wrap;
  const thinnest = spineForLeaf(pageCount, cover, Math.min(leafInches('glossy'), leafInches('matte')));
  const thickest = spineForLeaf(pageCount, cover, LEGACY_LEAF_IN);
  if (spineIn < thinnest - 0.05 || spineIn > thickest + 0.05 || Math.abs(wrapH - shouldBe.hIn) > 0.05) {
    throw new Error(`The cover file is ${wrapW.toFixed(2)} × ${wrapH.toFixed(2)} in, but a ${size} ${isHardcover(cover) ? 'hardbound' : 'softcover'} cover with ${pageCount} pages should be ${shouldBe.wIn.toFixed(2)} × ${shouldBe.hIn.toFixed(2)} in. Check the page count.`);
  }
  const fit = coverOnSheet(size, cover, pageCount, { spineIn });
  if (!fit.fits) throw new Error(`This cover can't go on one ${PRESS_SHEET.wIn} × ${PRESS_SHEET.hIn} sheet. ${fit.reason}`);

  const out = await PDFDocument.create();
  out.setTitle(`${orderLabel} — cover sheet`);
  const words = writer(out, text);
  const sheet = out.addPage([SHEET_W, SHEET_H]);
  const embedded = await out.embedPage(srcPage);
  // Turned a quarter clockwise: the cover's top faces the sheet's right edge.
  const boxL = px(fit.x);
  const boxB = py(fit.y + fit.h);
  if (fit.rotated) sheet.drawPage(embedded, { x: boxL, y: boxB + s.width, width: s.width, height: s.height, rotate: degrees(-90) });
  else sheet.drawPage(embedded, { x: boxL, y: boxB, width: s.width, height: s.height });

  // Cover → sheet: along the cover's width runs down the sheet when turned.
  const toSheet = (cx: number, cy: number) => fit.rotated
    ? { x: fit.x + (fit.wrapH - cy), y: fit.y + cx }
    : { x: fit.x + cx, y: fit.y + cy };
  const seg = (x1: number, y1: number, x2: number, y2: number, overArt: boolean) => {
    const a = toSheet(x1, y1);
    const b = toSheet(x2, y2);
    markLine(sheet, a.x, a.y, b.x, b.y, overArt);
  };
  // White room past the cover's left/right edges and past its top/bottom.
  const u = PRESS_SHEET.unprintableIn;
  const spanX = (fit.rotated ? PRESS_SHEET.hIn : PRESS_SHEET.wIn) - wrapW;
  const spanY = (fit.rotated ? PRESS_SHEET.wIn : PRESS_SHEET.hIn) - wrapH;
  const roomX = spanX / 2 - u - MARK_GAP;
  const roomY = spanY / 2 - u - MARK_GAP;
  // How far the printer's white edge reaches INTO the cover at its ends.
  const hiddenX = Math.max(0, u - spanX / 2);
  const hiddenY = Math.max(0, u - spanY / 2);
  const inset = fit.cutInsetIn;
  /** With no white room, a mark goes over the strip past the cut instead: a
   *  softcover's trim edge (cut off) or a hardcover's fold-over (glued inside
   *  the board). It starts where the printer can print. */
  const insideEnd = (hidden: number) => (inset > 0 ? inset - 1 / 32 : hidden + 0.15);
  // Cut marks at the four trim corners.
  const corners: [number, number, number, number][] = [
    [inset, inset, -1, -1], [wrapW - inset, inset, 1, -1],
    [inset, wrapH - inset, -1, 1], [wrapW - inset, wrapH - inset, 1, 1],
  ];
  for (const [cx, cy, dx, dy] of corners) {
    const ex = dx < 0 ? 0 : wrapW;
    const ey = dy < 0 ? 0 : wrapH;
    const lx = Math.min(MARK_LEN, roomX);
    if (lx > 0.05) seg(ex + dx * MARK_GAP, cy, ex + dx * (MARK_GAP + lx), cy, false);
    else if (insideEnd(hiddenX) - hiddenX > 0.02) seg(ex - dx * hiddenX, cy, ex - dx * insideEnd(hiddenX), cy, true);
    const ly = Math.min(MARK_LEN, roomY);
    if (ly > 0.05) seg(cx, ey + dy * MARK_GAP, cx, ey + dy * (MARK_GAP + ly), false);
    else if (insideEnd(hiddenY) - hiddenY > 0.02) seg(cx, ey - dy * hiddenY, cx, ey - dy * insideEnd(hiddenY), true);
  }
  // Fold marks: dashed ticks at the spine edges, past both long edges.
  const foldLen = Math.min(0.3, roomY);
  if (foldLen > 0.05) {
    for (const fx of fit.foldsIn) {
      for (const [ey, dy] of [[0, -1], [wrapH, 1]] as const) {
        const a = toSheet(fx, ey + dy * MARK_GAP);
        const b = toSheet(fx, ey + dy * (MARK_GAP + foldLen));
        sheet.drawLine({ start: { x: px(a.x), y: py(a.y) }, end: { x: px(b.x), y: py(b.y) }, thickness: 0.5, color: INK, dashArray: [2, 2] });
      }
    }
  }
  const kind = isHardcover(cover) ? 'hardbound' : 'softcover';
  const txt = `${orderLabel} · cover · ${size} ${kind} · ${pageCount} pages · spine ${spineLabel(spineIn)} · print ONE side · dashed = spine edges`;
  // Along the paper's printable edge, clear of the marks: above the cover when
  // that band holds a mark and the text, else down the left side, a quarter of
  // the way along (the corners and the spine have marks).
  const cap = 0.1;
  const len = words.widthIn(txt, 7);
  if (fit.y - u >= MARK_GAP + MARK_LEN + cap + 0.1) await words.write(sheet, txt, u + 0.3, u + cap + 0.02, 7);
  else await words.write(sheet, txt, u + cap + 0.02, fit.y + fit.h / 4 + len / 2, 7, { vertical: true });
  return { bytes: await saveNoFonts(out), wrapWIn: wrapW, wrapHIn: wrapH, spineIn };
}

/**
 * One 12.5 × 19 sheet, both sides, that tells the shop if the printer is set
 * up right: actual size (a 5 in bar), how close to the edge it prints (rulers),
 * and which way it flips (hold it to a light — the circle must line up with
 * LONG).
 */
export async function pressTestSheet(text: TextPainter): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  out.setTitle('Megyprints press test sheet');
  const { write } = writer(out, text);
  const W = PRESS_SHEET.wIn, H = PRESS_SHEET.hIn;
  const target = { x: 3.5, y: 5 };

  const rulers = async (page: PDFPage) => {
    // Ticks at 1/8, 1/4 and 3/8 in from every edge: the first one that prints
    // is how close the printer gets.
    for (const d of [0.125, 0.25, 0.375]) {
      const c = d === 0.25 ? INK : GREY;
      page.drawRectangle({ x: px(d), y: py(H - d), width: (W - 2 * d) * PT, height: (H - 2 * d) * PT, borderColor: c, borderWidth: 0.5, borderDashArray: d === 0.25 ? undefined : [3, 3] });
    }
    await write(page, 'Lines at 1/8, 1/4 (solid) and 3/8 in from the edge.', 0.5, 0.62, 8);
  };
  const ring = (page: PDFPage, x: number, y: number) => {
    for (const r of [0.0625, 0.125, 0.25]) page.drawCircle({ x: px(x), y: py(y), size: r * PT, borderColor: INK, borderWidth: 0.6 });
    page.drawLine({ start: { x: px(x - 0.4), y: py(y) }, end: { x: px(x + 0.4), y: py(y) }, thickness: 0.4, color: INK });
    page.drawLine({ start: { x: px(x), y: py(y - 0.4) }, end: { x: px(x), y: py(y + 0.4) }, thickness: 0.4, color: INK });
  };

  const front = out.addPage([SHEET_W, SHEET_H]);
  await rulers(front);
  await write(front, 'FRONT', W / 2 - 0.6, 1.3, 28, { bold: true, color: INK_HEX });
  ring(front, target.x, target.y);
  // A 5 in bar: if it measures less, the printer is shrinking the file.
  front.drawRectangle({ x: px(1), y: py(9.1), width: 5 * PT, height: 0.12 * PT, color: INK });
  for (let i = 0; i <= 5; i++) front.drawLine({ start: { x: px(1 + i), y: py(9.25) }, end: { x: px(1 + i), y: py(8.9) }, thickness: 0.6, color: INK });
  const lines = [
    '1. This black bar must measure exactly 5 inches. If it is shorter, turn off "fit to page"',
    '   and print at actual size (100%).',
    '2. Look at the lines near the edge. The solid line is 1/4 in from the edge. Every sheet',
    '   keeps its pictures inside it.',
    '3. Hold this sheet up to a light. The circle on this side must line up with the circle',
    '   marked LONG on the back. If it lines up with SHORT, set the printer to',
    '   "flip on long edge" and print again.',
    '4. If the circles are close but not on top of each other, the gap you see is how far',
    '   the back moves. Up to 1/16 in is fine.',
  ];
  for (const [i, t] of lines.entries()) await write(front, t, 1, 10.2 + i * 0.3, 12, { color: INK_HEX });

  const back = out.addPage([SHEET_W, SHEET_H]);
  await rulers(back);
  await write(back, 'BACK', W / 2 - 0.5, 1.3, 28, { bold: true, color: INK_HEX });
  // Long-edge flip mirrors left↔right; short-edge flip mirrors top↔bottom.
  ring(back, W - target.x, target.y);
  await write(back, 'LONG', W - target.x - 0.25, target.y + 0.75, 14, { bold: true, color: INK_HEX });
  ring(back, target.x, H - target.y);
  await write(back, 'SHORT', target.x - 0.3, H - target.y + 0.75, 14, { bold: true });
  return saveNoFonts(out);
}
