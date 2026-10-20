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
   ══════════════════════════════════════════════════════════════════════════ */

import { PDFDocument, PDFName, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { AlbumSizePreset, CoverType } from './types';
import {
  PRESS_SHEET, sheetPlan, trimInches, coverOnSheet, type SheetPlan, type SheetPlacement, type SheetSlot, type Sides, type Turn,
} from './printSheet';
import { isHardcover } from './coverGeometry';
import { PAGE_ONE_RIGHT_MARK, type PageOneSide } from './binding';

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

/** Text that stays inside the printable area. `vertical` reads bottom to top. */
function label(page: PDFPage, font: PDFFont, text: string, xIn: number, yIn: number, size: number, vertical = false) {
  page.drawText(text, { x: px(xIn), y: py(yIn), size, font, color: GREY, rotate: vertical ? degrees(90) : undefined });
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
  return { doc, pages };
}

/** Where a print file puts page 1. The checkout writes PAGE_ONE_RIGHT_MARK
 *  into every file it makes since page 1 became a right-hand page; a file
 *  without it was drawn with page 1 on the left (its spine margin on the
 *  right), and must go on the sheets that way. The mark only picks between
 *  the two layouts, so a forged one can't do more than a wrong order would. */
export function printFilePageOne(doc: PDFDocument): PageOneSide {
  return (doc.getKeywords() ?? '').split(/[\s,;]+/).includes(PAGE_ONE_RIGHT_MARK) ? 'right' : 'left';
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
 * (the order number). Throws with a plain message if the file doesn't match
 * the album size.
 */
export async function imposeAlbumSheets(src: ArrayBuffer | Uint8Array, size: AlbumSizePreset, orderLabel: string): Promise<ImposeResult> {
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
  const font = await out.embedFont(StandardFonts.Helvetica);

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
      sheet.drawPage(embedded, { x: at.x, y: at.y, width: ew, height: eh, rotate: degrees(at.r) });
    }
    drawCutMarks(sheet, side.placements.map((q) => q.slot));
    drawSheetLabel(sheet, font, `${orderLabel} · sheet ${side.sheet} of ${plan.sheets} · ${side.side}`, side.placements.map((q) => q.slot), side.placements.map((q) => q.pile));
  }
  return { bytes: await out.save(), plan, pageOne, sourceBleedIn: srcBleed };
}

/** Cut marks for every cut line, in the white around the block — or, where
 *  the block reaches the printer's white edge, over the outer trim edge (that
 *  strip is cut off). */
function drawCutMarks(page: PDFPage, slots: SheetSlot[]) {
  const u = PRESS_SHEET.unprintableIn;
  const top = Math.min(...slots.map((s) => s.y - s.bleed.top));
  const bottom = Math.max(...slots.map((s) => s.y + s.h + s.bleed.bottom));
  const left = Math.min(...slots.map((s) => s.x - s.bleed.left));
  const right = Math.max(...slots.map((s) => s.x + s.w + s.bleed.right));
  const cutsX = [...new Set(slots.flatMap((s) => [s.x, s.x + s.w]).map((v) => Math.round(v * 1e4) / 1e4))];
  const cutsY = [...new Set(slots.flatMap((s) => [s.y, s.y + s.h]).map((v) => Math.round(v * 1e4) / 1e4))];
  const outerBleed = PRESS_SHEET.bleedIn;

  // Room in the white: from the art's edge to the printer's edge.
  const roomTop = top - u, roomBottom = PRESS_SHEET.hIn - u - bottom;
  const roomLeft = left - u, roomRight = PRESS_SHEET.wIn - u - right;
  const span = (room: number) => Math.min(MARK_LEN, room - MARK_GAP);
  for (const x of cutsX) {
    if (span(roomTop) > 0.05) markLine(page, x, top - MARK_GAP - span(roomTop), x, top - MARK_GAP, false);
    else markLine(page, x, top, x, top + outerBleed - 1 / 32, true);
    if (span(roomBottom) > 0.05) markLine(page, x, bottom + MARK_GAP, x, bottom + MARK_GAP + span(roomBottom), false);
    else markLine(page, x, bottom - outerBleed + 1 / 32, x, bottom, true);
  }
  for (const y of cutsY) {
    if (span(roomLeft) > 0.05) markLine(page, left - MARK_GAP - span(roomLeft), y, left - MARK_GAP, y, false);
    else markLine(page, left, y, left + outerBleed - 1 / 32, y, true);
    if (span(roomRight) > 0.05) markLine(page, right + MARK_GAP, y, right + MARK_GAP + span(roomRight), y, false);
    else markLine(page, right - outerBleed + 1 / 32, y, right, y, true);
  }
}

/** The sheet's name, along the paper edge of the widest white band, and each
 *  spot's pile number next to it — in the side band beside its column, or
 *  above the top row / below the bottom row when the sides are too narrow. */
function drawSheetLabel(page: PDFPage, font: PDFFont, text: string, slots: SheetSlot[], piles: number[]) {
  const u = PRESS_SHEET.unprintableIn;
  const size = 7;
  const cap = 0.1; // text height, inches
  const top = Math.min(...slots.map((s) => s.y - s.bleed.top));
  const bottom = Math.max(...slots.map((s) => s.y + s.h + s.bleed.bottom));
  const left = Math.min(...slots.map((s) => s.x - s.bleed.left));
  const right = Math.max(...slots.map((s) => s.x + s.w + s.bleed.right));
  const bandL = left - u, bandR = PRESS_SHEET.wIn - u - right, bandT = top - u, bandB = PRESS_SHEET.hIn - u - bottom;
  const widthIn = (t: string) => font.widthOfTextAtSize(t, size) / PT;

  // Sheet name: right at the paper's printable edge, clear of the cut marks.
  if (bandL >= 0.6) label(page, font, text, u + 0.02 + cap, PRESS_SHEET.hIn - u - 0.3, size, true);
  else if (bandT >= 0.2) label(page, font, text, u + 0.3, u + cap + 0.02, size);
  else if (bandB >= 0.2) label(page, font, text, u + 0.3, PRESS_SHEET.hIn - u - 0.04, size);

  const lastCol = Math.max(...slots.map((s) => s.x));
  const firstCol = Math.min(...slots.map((s) => s.x));
  const firstRow = Math.min(...slots.map((s) => s.y));
  const lastRow = Math.max(...slots.map((s) => s.y));
  slots.forEach((s, i) => {
    const t = `pile ${piles[i] + 1}`;
    const midY = s.y + s.h / 2 + widthIn(t) / 2;
    if (s.x === firstCol && bandL >= 0.3) label(page, font, t, left - 0.08, midY, size, true);
    else if (s.x === lastCol && bandR >= 0.3) label(page, font, t, right + 0.08 + cap, midY, size, true);
    else if (s.y === firstRow && bandT >= 0.3) label(page, font, t, s.x + s.w / 2 - widthIn(t) / 2, top - 0.35, size);
    else if (s.y === lastRow && bandB >= 0.3) label(page, font, t, s.x + s.w / 2 - widthIn(t) / 2, bottom + 0.35 + cap, size);
  });
}

export interface CoverSheetResult { bytes: Uint8Array; wrapWIn: number; wrapHIn: number }

/**
 * Put the flat cover on one sheet: centred, turned to run along the 19 in
 * side, with cut marks at its trim and fold marks at the spine. Throws with
 * the plain reason when the cover can't fit (e.g. 9x9 hardbound).
 */
export async function imposeCoverSheet(
  src: ArrayBuffer | Uint8Array, size: AlbumSizePreset, cover: CoverType, pageCount: number, orderLabel: string,
): Promise<CoverSheetResult> {
  const { pages: [srcPage] } = await loadCustomerPdf(src, 'cover file');
  const fit = coverOnSheet(size, cover, pageCount);
  if (!fit.fits) throw new Error(`This cover can't go on one ${PRESS_SHEET.wIn} × ${PRESS_SHEET.hIn} sheet. ${fit.reason}`);
  const s = srcPage.getSize();
  const wrapW = s.width / PT;
  const wrapH = s.height / PT;
  if (Math.abs(wrapW - fit.wrapW) > 0.05 || Math.abs(wrapH - fit.wrapH) > 0.05) {
    throw new Error(`The cover file is ${wrapW.toFixed(2)} × ${wrapH.toFixed(2)} in, but a ${size} ${isHardcover(cover) ? 'hardbound' : 'softcover'} cover with ${pageCount} pages should be ${fit.wrapW.toFixed(2)} × ${fit.wrapH.toFixed(2)} in. Check the page count.`);
  }

  const out = await PDFDocument.create();
  out.setTitle(`${orderLabel} — cover sheet`);
  const font = await out.embedFont(StandardFonts.Helvetica);
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
  const txt = `${orderLabel} · cover · ${size} ${kind} · ${pageCount} pages · print ONE side · dashed = spine edges`;
  // Along the paper's printable edge, clear of the marks: above the cover when
  // that band holds a mark and the text, else down the left side, a quarter of
  // the way along (the corners and the spine have marks).
  const cap = 0.1;
  const len = font.widthOfTextAtSize(txt, 7) / PT;
  if (fit.y - u >= MARK_GAP + MARK_LEN + cap + 0.1) label(sheet, font, txt, u + 0.3, u + cap + 0.02, 7);
  else label(sheet, font, txt, u + cap + 0.02, fit.y + fit.h / 4 + len / 2, 7, true);
  return { bytes: await out.save(), wrapWIn: wrapW, wrapHIn: wrapH };
}

/**
 * One 12.5 × 19 sheet, both sides, that tells the shop if the printer is set
 * up right: actual size (a 5 in bar), how close to the edge it prints (rulers),
 * and which way it flips (hold it to a light — the circle must line up with
 * LONG).
 */
export async function pressTestSheet(): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  out.setTitle('Megyprints press test sheet');
  const font = await out.embedFont(StandardFonts.Helvetica);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);
  const W = PRESS_SHEET.wIn, H = PRESS_SHEET.hIn;
  const target = { x: 3.5, y: 5 };

  const rulers = (page: PDFPage) => {
    // Ticks at 1/8, 1/4 and 3/8 in from every edge: the first one that prints
    // is how close the printer gets.
    for (const d of [0.125, 0.25, 0.375]) {
      const c = d === 0.25 ? INK : GREY;
      page.drawRectangle({ x: px(d), y: py(H - d), width: (W - 2 * d) * PT, height: (H - 2 * d) * PT, borderColor: c, borderWidth: 0.5, borderDashArray: d === 0.25 ? undefined : [3, 3] });
    }
    label(page, font, 'Lines at 1/8, 1/4 (solid) and 3/8 in from the edge.', 0.5, 0.62, 8);
  };
  const ring = (page: PDFPage, x: number, y: number) => {
    for (const r of [0.0625, 0.125, 0.25]) page.drawCircle({ x: px(x), y: py(y), size: r * PT, borderColor: INK, borderWidth: 0.6 });
    page.drawLine({ start: { x: px(x - 0.4), y: py(y) }, end: { x: px(x + 0.4), y: py(y) }, thickness: 0.4, color: INK });
    page.drawLine({ start: { x: px(x), y: py(y - 0.4) }, end: { x: px(x), y: py(y + 0.4) }, thickness: 0.4, color: INK });
  };

  const front = out.addPage([SHEET_W, SHEET_H]);
  rulers(front);
  front.drawText('FRONT', { x: px(W / 2 - 0.6), y: py(1.3), size: 28, font: bold, color: INK });
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
  lines.forEach((t, i) => front.drawText(t, { x: px(1), y: py(10.2 + i * 0.3), size: 12, font, color: INK }));

  const back = out.addPage([SHEET_W, SHEET_H]);
  rulers(back);
  back.drawText('BACK', { x: px(W / 2 - 0.5), y: py(1.3), size: 28, font: bold, color: INK });
  // Long-edge flip mirrors left↔right; short-edge flip mirrors top↔bottom.
  ring(back, W - target.x, target.y);
  back.drawText('LONG', { x: px(W - target.x - 0.25), y: py(target.y + 0.75), size: 14, font: bold, color: INK });
  ring(back, target.x, H - target.y);
  back.drawText('SHORT', { x: px(target.x - 0.3), y: py(H - target.y + 0.75), size: 14, font: bold, color: GREY });
  return out.save();
}
