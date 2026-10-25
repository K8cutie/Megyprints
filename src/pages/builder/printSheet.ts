/* ══════════════════════════════════════════════════════════════════════════
   printSheet — where every album page lands on the shop's press sheet.

   The order's print PDF has one page per album page, cut to the album size
   plus a 0.125" trim edge. The shop's printer doesn't take album-sized paper:
   it takes ONE sheet size, prints both sides in one pass, and can't print the
   outer 0.25" (owner, 2026-10-11). The pages are then cut apart into single
   leaves and glued at the spine — softcover and hardbound alike.

   This module is the ONE place that knows that geometry:
     • sheetLayout(size)  — how many leaves fit a sheet and where they sit.
       Pages keep their full 0.125" trim edge on the outside; where pages
       face each other they may sit 1/8" apart (1/16" trim edge each), but
       only when that fits one more row (owner chose "B", 2026-10-11). Pages
       touch, with no trim edge, when that fits one more column (6x6 first,
       2026-10-22; every size, 2026-10-23: BUTTED_SIZES).
     • sheetPlan(size, pages) — which album page goes on which sheet, side,
       slot and turn, in CUT-AND-STACK order: cut the whole printed stack at
       once and every pile comes out already in page order.
     • coverOnSheet(size, cover, pages) — whether the flat cover fits a sheet.
   Pricing's pages-per-sheet must equal sheetLayout().pagesPerSheet; a spec
   holds the two together. Pricing counts sheets from the page count alone,
   which is exactly what prints now that page 1 is the FRONT of the first
   leaf (2026-10-21). Print files from before that start with a blank side
   (printSides 'left'), so those still print one sheet more than billed when
   the page count is a multiple of pps.
   ══════════════════════════════════════════════════════════════════════════ */

import { ALBUM_SIZES, COVERS, type AlbumSizePreset, type CoverType } from './types';
import { PRINTER_SPEC, coverWrapGeometry, isHardcover, type CoverPaper } from './coverGeometry';
import { MIN_PAGES, SIZE_LABELS } from '../../lib/pricing';
import type { PageOneSide } from './binding';

/** The shop's press (owner, 2026-10-11). Inches; the sheet is PORTRAIT. */
export const PRESS_SHEET = {
  wIn: 12.5,
  hIn: 19,
  /** The printer leaves this much white at every edge. */
  unprintableIn: 0.25,
  /** Full trim edge on every page's outer sides (the print file's bleed). */
  bleedIn: PRINTER_SPEC.bleedIn,
  /** Narrowest trim edge where two pages share a cut gap (layout B). */
  minInnerBleedIn: PRINTER_SPEC.bleedIn / 2,
  /** A hardcover's fold-over can run into the white edge (it's glued inside
   *  the board), but the art must still wrap the board's edge: this much past
   *  the trim has to print. */
  hardWrapPrintIn: 0.25,
} as const;

const EPS = 1e-6;

export type Turn = 0 | 90 | 180 | 270;

/** Trim edge on each side of a placed page. On a SheetSlot the sides are the
 *  SHEET's; on a SheetPlacement's pageBleed they are the PAGE's own sides. */
export interface Sides { top: number; right: number; bottom: number; left: number }

export interface SheetSlot {
  /** Trim box, inches from the sheet's top-left, as seen on that side. */
  x: number; y: number; w: number; h: number;
  bleed: Sides;
}

export interface SheetLayout {
  size: AlbumSizePreset;
  trimW: number;
  trimH: number;
  /** The page is turned a quarter on the sheet to fit more. */
  rotated: boolean;
  cols: number;
  rows: number;
  /** Each slot is one leaf: a page on the front, the next page on the back. */
  leavesPerSheet: number;
  /** = 2 × leavesPerSheet. This is pricing's `pps`. */
  pagesPerSheet: number;
  /** Front-side slots in reading order (rows top to bottom, left to right). */
  slots: SheetSlot[];
  /** Where the cutter goes, inches from the left / top edge (front side). */
  cutsX: number[];
  cutsY: number[];
  /** White space left over on each axis inside the printable area — where
   *  cut marks and the sheet label can go. */
  spareX: number;
  spareY: number;
}

export function trimInches(size: AlbumSizePreset): { trimW: number; trimH: number } {
  const cfg = ALBUM_SIZES.find((s) => s.preset === size);
  return { trimW: (cfg?.width ?? 2400) / 300, trimH: (cfg?.height ?? 2400) / 300 };
}

/** Sizes whose pages may touch, with no trim edge at all, where that fits one
 *  more column (owner, 2026-10-22, drawing his 6x6 sheet: 1 3 / 5 7 / 9 11 on
 *  the front, "yes, 6 a side"; 2026-10-23: the same for the other sizes).
 *  Pages 4" or 6" wide fill the 12" the printer prints exactly, so 6x6 goes
 *  6 to a side (was 3), 6x4 9 (was 6), 6x8 and 8x6 4 (was 3); the other
 *  sizes gain nothing and keep their trim edges. Rows never gain, so they
 *  always keep theirs. The cut has to be exact: a hair off shows white at
 *  the outside edge, or a sliver of the next page. Take a size out of this
 *  list to give it its trim edges back. */
export const BUTTED_SIZES: readonly AlbumSizePreset[] = ALBUM_SIZES.map((s) => s.preset);

/** How many pages of length `len` fit along one axis, and the trim edge they
 *  keep outside (`outer`) and where two pages face each other (`inner`).
 *  Full trim edges unless the narrow inner edge fits one more; on a butted
 *  size, no trim edge at all when THAT fits one more. */
function fitAxis(avail: number, len: number, butt: boolean): { n: number; inner: number; outer: number } {
  const b = PRESS_SHEET.bleedIn;
  const bi = PRESS_SHEET.minInnerBleedIn;
  const full = Math.floor((avail + EPS) / (len + 2 * b));
  // n·len + 2b (outside) + (n−1)·2bi (shared gaps) ≤ avail
  const tight = Math.floor((avail - 2 * b + 2 * bi + EPS) / (len + 2 * bi));
  const best = tight > full ? { n: tight, inner: bi, outer: b } : { n: full, inner: b, outer: b };
  // n·len ≤ avail: pages touching, cut on one line, the outside cuts right at the printer's edge.
  const butted = Math.floor((avail + EPS) / len);
  return butt && butted > best.n ? { n: butted, inner: 0, outer: 0 } : best;
}

/** The same sheet layout for every album of this size. */
export function sheetLayout(size: AlbumSizePreset): SheetLayout {
  const { trimW, trimH } = trimInches(size);
  const u = PRESS_SHEET.unprintableIn;
  const availW = PRESS_SHEET.wIn - 2 * u;
  const availH = PRESS_SHEET.hIn - 2 * u;

  const butt = BUTTED_SIZES.includes(size);
  let best: { rotated: boolean; pw: number; ph: number; ax: ReturnType<typeof fitAxis>; ay: ReturnType<typeof fitAxis> } | null = null;
  for (const rotated of [false, true]) {
    const pw = rotated ? trimH : trimW;
    const ph = rotated ? trimW : trimH;
    const ax = fitAxis(availW, pw, butt);
    const ay = fitAxis(availH, ph, butt);
    // Upright wins a tie: fewer turned pages, fewer ways to get it wrong.
    if (!best || ax.n * ay.n > best.ax.n * best.ay.n) best = { rotated, pw, ph, ax, ay };
  }
  if (!best || best.ax.n * best.ay.n === 0) throw new Error(`A ${size} page does not fit the ${PRESS_SHEET.wIn}×${PRESS_SHEET.hIn} sheet.`);

  const { rotated, pw, ph, ax, ay } = best;
  const cols = ax.n;
  const rows = ay.n;
  const usedW = cols * pw + 2 * ax.outer + (cols - 1) * 2 * ax.inner;
  const usedH = rows * ph + 2 * ay.outer + (rows - 1) * 2 * ay.inner;
  const spareX = availW - usedW;
  const spareY = availH - usedH;
  // Centre the block in the printable area.
  const x0 = u + spareX / 2 + ax.outer;
  const y0 = u + spareY / 2 + ay.outer;

  const slots: SheetSlot[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      slots.push({
        x: x0 + c * (pw + 2 * ax.inner),
        y: y0 + r * (ph + 2 * ay.inner),
        w: pw,
        h: ph,
        bleed: {
          top: r === 0 ? ay.outer : ay.inner,
          bottom: r === rows - 1 ? ay.outer : ay.inner,
          left: c === 0 ? ax.outer : ax.inner,
          right: c === cols - 1 ? ax.outer : ax.inner,
        },
      });
    }
  }
  const uniq = (xs: number[]) => [...new Set(xs.map((v) => Math.round(v * 10000) / 10000))].sort((p, q) => p - q);
  return {
    size, trimW, trimH, rotated, cols, rows,
    leavesPerSheet: cols * rows,
    pagesPerSheet: 2 * cols * rows,
    slots,
    cutsX: uniq(slots.flatMap((s) => [s.x, s.x + s.w])),
    cutsY: uniq(slots.flatMap((s) => [s.y, s.y + s.h])),
    spareX, spareY,
  };
}

/** Pages per sheet (both sides) for every size — pricing's `pps`. */
export function pagesPerSheetBySize(): Record<AlbumSizePreset, number> {
  return Object.fromEntries(ALBUM_SIZES.map((s) => [s.preset, sheetLayout(s.preset).pagesPerSheet])) as Record<AlbumSizePreset, number>;
}

/** The album's printed sides, in book order. `null` = blank side.
 *
 *  Page 1 is a RIGHT-hand page (binding.ts): open the cover and it is the
 *  first page, so on glued single leaves it is the FRONT of the first leaf,
 *  page 2 its back, and so on. Only an odd page count leaves a blank: the
 *  last leaf's back.
 *
 *  'left' is for print files made before 2026-10-21, which put page 1 on the
 *  left (spine margin on its right): a left page is the BACK of a leaf, so
 *  those start with a blank side, and end with one when the count is even. */
export function printSides(pageCount: number, pageOne: PageOneSide = 'right'): (number | null)[] {
  const sides: (number | null)[] = pageOne === 'left' ? [null] : [];
  for (let i = 0; i < pageCount; i++) sides.push(i);
  if (sides.length % 2) sides.push(null);
  return sides;
}

/** Leaves the album needs (blank sides included). */
export function leavesFor(pageCount: number, pageOne: PageOneSide = 'right'): number {
  return printSides(pageCount, pageOne).length / 2;
}

/** The page side that faces each sheet side after turning it `turn`° clockwise.
 *  Page side i lands on sheet side (i + turn/90) mod 4 (top, right, bottom, left). */
export function pageSidesFromSheet(sheet: Sides, turn: Turn): Sides {
  const order: (keyof Sides)[] = ['top', 'right', 'bottom', 'left'];
  const k = turn / 90;
  const out = {} as Sides;
  order.forEach((side, i) => { out[side] = sheet[order[(i + k) % 4]]; });
  return out;
}

export interface SheetPlacement {
  /** Album page index, or null for a blank side. */
  page: number | null;
  /** Leaf number in the book (0 = first leaf). */
  leaf: number;
  /** Trim box and trim edges, in this side's sheet directions. */
  slot: SheetSlot;
  /** Clockwise turn applied to the page art. */
  turn: Turn;
  /** Trim edge to keep on each of the PAGE's own sides. */
  pageBleed: Sides;
}

export interface SheetSide {
  /** 1-based sheet number. */
  sheet: number;
  side: 'front' | 'back';
  placements: SheetPlacement[];
}

export interface SheetPlan {
  layout: SheetLayout;
  pageCount: number;
  leaves: number;
  sheets: number;
  /** PDF order: sheet 1 front, sheet 1 back, sheet 2 front, … */
  sides: SheetSide[];
}

/** Mirror a front slot to where the same leaf sits on the back. The sheet is
 *  printed both sides and flips on its LONG edge, so left and right swap. */
export function backOf(slot: SheetSlot): SheetSlot {
  return {
    x: PRESS_SHEET.wIn - slot.x - slot.w, y: slot.y, w: slot.w, h: slot.h,
    bleed: { top: slot.bleed.top, bottom: slot.bleed.bottom, left: slot.bleed.right, right: slot.bleed.left },
  };
}

/**
 * Every album page's place on the press, in CUT-AND-STACK order (the shop,
 * via the owner, 2026-10-24, for a 132-page 6x6 on 11 sheets: front 1 23 /
 * 45 67 / 89 111, back 24 2 / 68 46 / 112 90 — "page 1, and behind it it runs
 * on to page 22; once it's cut, put it on the one to its right, page 23, which
 * runs on to 44; once that's cut, put it on page 45, and so on"). Slot s of
 * sheet i holds leaf s·S + i (S = number of sheets). Stack the printed sheets
 * with sheet 1 on top, front up, and cut them all at once: each spot is a
 * pile already in order, so pile 1 (top left) goes on pile 2, pile 2 on pile
 * 3, left to right, top to bottom. (2026-10-22 to -24 it was page order,
 * leaf i·K + s, from the owner's 1 3 / 5 7 / 9 11 drawing: right for cutting
 * one sheet at a time, but a guillotine cuts the whole stack, and every pile
 * then mixed pages from every sheet.)
 *
 * A turned page faces the sheet's right edge on the front; on the back the
 * same physical edge is on the LEFT, so the back page turns the other way.
 */
export function sheetPlan(size: AlbumSizePreset, pageCount: number, pageOne: PageOneSide = 'right'): SheetPlan {
  const layout = sheetLayout(size);
  const sides = printSides(pageCount, pageOne);
  const leaves = sides.length / 2;
  const k = layout.leavesPerSheet;
  const sheets = Math.ceil(leaves / k);
  const frontTurn: Turn = layout.rotated ? 90 : 0;
  const backTurn: Turn = layout.rotated ? 270 : 0;

  const out: SheetSide[] = [];
  for (let i = 0; i < sheets; i++) {
    const front: SheetPlacement[] = [];
    const back: SheetPlacement[] = [];
    layout.slots.forEach((slot, s) => {
      const leaf = s * sheets + i;
      const real = leaf < leaves;
      const bslot = backOf(slot);
      front.push({
        page: real ? sides[2 * leaf] : null, leaf, slot, turn: frontTurn,
        pageBleed: pageSidesFromSheet(slot.bleed, frontTurn),
      });
      back.push({
        page: real ? sides[2 * leaf + 1] : null, leaf, slot: bslot, turn: backTurn,
        pageBleed: pageSidesFromSheet(bslot.bleed, backTurn),
      });
    });
    out.push({ sheet: i + 1, side: 'front', placements: front });
    out.push({ sheet: i + 1, side: 'back', placements: back });
  }
  return { layout, pageCount, leaves, sheets, sides: out };
}

// ── Cover ──────────────────────────────────────────────────────────────────

export interface CoverOnSheet {
  fits: boolean;
  /** Plain-English reason when it doesn't fit. */
  reason: string | null;
  /** The flat cover runs along the sheet's 19" side. */
  rotated: boolean;
  /** Flat cover size, inches (as the cover PDF is drawn, before turning). */
  wrapW: number;
  wrapH: number;
  /** Where the flat cover's top-left sits on the sheet (after turning). */
  x: number;
  y: number;
  /** Size of the cover on the sheet (after turning). */
  w: number;
  h: number;
  /** Cut line inset from the flat cover's edge: the trim edge on a softcover;
   *  0 on a hardcover, whose fold-over is part of the piece. */
  cutInsetIn: number;
  /** Fold lines, inches from the flat cover's left edge (spine edges). */
  foldsIn: number[];
}

/**
 * Does the flat cover — back, spine and front in one piece — fit a sheet?
 * The whole piece must fit the PAPER. A softcover must also print to within
 * 1/16" past its trim; a hardcover's fold-over may run into the white edge,
 * but 1/4" past the trim must print so the art wraps the board's edge.
 */
export function coverOnSheet(size: AlbumSizePreset, cover: CoverType, pageCount: number, paper: CoverPaper = {}): CoverOnSheet {
  const g = coverWrapGeometry(size, pageCount, cover, paper);
  const hard = isHardcover(cover);
  const wrapW = g.wrap.wIn;
  const wrapH = g.wrap.hIn;
  const outer = hard ? PRINTER_SPEC.wrapTurnIn : PRINTER_SPEC.bleedIn;
  const mustPast = hard ? PRESS_SHEET.hardWrapPrintIn : PRESS_SHEET.minInnerBleedIn;
  const mustW = wrapW - 2 * outer + 2 * mustPast;
  const mustH = wrapH - 2 * outer + 2 * mustPast;
  const u = PRESS_SHEET.unprintableIn;
  const foldsIn = g.foldXPx.map((px) => px / g.dpi);

  // Prefer the cover's long side along the sheet's long side.
  const rotated = wrapW > wrapH;
  const w = rotated ? wrapH : wrapW;
  const h = rotated ? wrapW : wrapH;
  const mw = rotated ? mustH : mustW;
  const mh = rotated ? mustW : mustH;
  const fitsPaper = w <= PRESS_SHEET.wIn + EPS && h <= PRESS_SHEET.hIn + EPS;
  const fitsPrint = mw <= PRESS_SHEET.wIn - 2 * u + EPS && mh <= PRESS_SHEET.hIn - 2 * u + EPS;
  const fits = fitsPaper && fitsPrint;
  const longIn = Math.max(wrapW, wrapH);
  const reason = fits ? null
    : !fitsPaper
      ? `The flat cover is ${longIn.toFixed(1)} in long — longer than the ${PRESS_SHEET.hIn} in paper.`
      : `The flat cover's picture is ${Math.max(mustW, mustH).toFixed(2)} in long — more than the ${(PRESS_SHEET.hIn - 2 * u).toFixed(1)} in the printer can print.`;
  return {
    fits, reason, rotated, wrapW, wrapH,
    x: (PRESS_SHEET.wIn - w) / 2, y: (PRESS_SHEET.hIn - h) / 2, w, h,
    cutInsetIn: hard ? 0 : PRINTER_SPEC.bleedIn,
    foldsIn,
  };
}

/** Can this size + cover be printed at this page count? With no finish
 *  given, the spine is the matte one: the thicker paper, so a yes holds for
 *  either finish. */
export function coverFitsSheet(size: AlbumSizePreset, cover: CoverType, pageCount: number, paper: CoverPaper = {}): boolean {
  return coverOnSheet(size, cover, pageCount, paper).fits;
}

/** What checkout says when a cover is left out, in plain words — or null when
 *  every cover fits. `available` = the covers that fit this album. */
export function coverChoiceNote(size: AlbumSizePreset, pageCount: number, available: CoverType[], paper: CoverPaper = {}): string | null {
  const off = COVERS.filter((c) => !available.includes(c.type));
  if (!off.length) return null;
  if (!available.length) {
    const most = COVERS.map((c) => maxPagesForCover(size, c.type, MIN_PAGES, paper)).filter((n): n is number => n !== null);
    return most.length
      ? `This album has too many pages for our printer. Make it ${Math.max(...most)} pages or fewer.`
      : 'We can\'t print this album size right now.';
  }
  const names = off.map((c) => c.name).join(' and ');
  const never = off.every((c) => !coverFitsSheet(size, c.type, MIN_PAGES, paper));
  return never
    ? `${names} is not available for ${SIZE_LABELS[size]} albums. The cover is too big for our printer.`
    : `${names} is not available for an album with ${pageCount} pages. The cover is too big for our printer.`;
}

/** The most pages this size + cover can have and still fit the sheet, or null
 *  when it never fits. The spine only grows with pages, so the first page
 *  count that doesn't fit ends the search. */
export function maxPagesForCover(size: AlbumSizePreset, cover: CoverType, minPages: number, paper: CoverPaper = {}, upTo = 1000): number | null {
  if (!coverFitsSheet(size, cover, minPages, paper)) return null;
  let last = minPages;
  for (let p = minPages + 1; p <= upTo; p++) {
    if (!coverFitsSheet(size, cover, p, paper)) return last;
    last = p;
  }
  return last;
}
