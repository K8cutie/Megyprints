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
       only when that fits one more row (owner chose "B", 2026-10-11).
     • sheetPlan(size, pages) — which album page goes on which sheet, side,
       slot and turn, in cut-and-stack order.
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

/** How many pages of length `len` fit along one axis. Full trim edges between
 *  pages unless the narrow inner edge fits one more. */
function fitAxis(avail: number, len: number): { n: number; inner: number } {
  const b = PRESS_SHEET.bleedIn;
  const bi = PRESS_SHEET.minInnerBleedIn;
  const full = Math.floor((avail + EPS) / (len + 2 * b));
  // n·len + 2b (outside) + (n−1)·2bi (shared gaps) ≤ avail
  const tight = Math.floor((avail - 2 * b + 2 * bi + EPS) / (len + 2 * bi));
  return tight > full ? { n: tight, inner: bi } : { n: full, inner: b };
}

/** The same sheet layout for every album of this size. */
export function sheetLayout(size: AlbumSizePreset): SheetLayout {
  const { trimW, trimH } = trimInches(size);
  const u = PRESS_SHEET.unprintableIn;
  const b = PRESS_SHEET.bleedIn;
  const availW = PRESS_SHEET.wIn - 2 * u;
  const availH = PRESS_SHEET.hIn - 2 * u;

  let best: { rotated: boolean; pw: number; ph: number; ax: ReturnType<typeof fitAxis>; ay: ReturnType<typeof fitAxis> } | null = null;
  for (const rotated of [false, true]) {
    const pw = rotated ? trimH : trimW;
    const ph = rotated ? trimW : trimH;
    const ax = fitAxis(availW, pw);
    const ay = fitAxis(availH, ph);
    // Upright wins a tie: fewer turned pages, fewer ways to get it wrong.
    if (!best || ax.n * ay.n > best.ax.n * best.ay.n) best = { rotated, pw, ph, ax, ay };
  }
  if (!best || best.ax.n * best.ay.n === 0) throw new Error(`A ${size} page does not fit the ${PRESS_SHEET.wIn}×${PRESS_SHEET.hIn} sheet.`);

  const { rotated, pw, ph, ax, ay } = best;
  const cols = ax.n;
  const rows = ay.n;
  const usedW = cols * pw + 2 * b + (cols - 1) * 2 * ax.inner;
  const usedH = rows * ph + 2 * b + (rows - 1) * 2 * ay.inner;
  const spareX = availW - usedW;
  const spareY = availH - usedH;
  // Centre the block in the printable area.
  const x0 = u + spareX / 2 + b;
  const y0 = u + spareY / 2 + b;

  const slots: SheetSlot[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      slots.push({
        x: x0 + c * (pw + 2 * ax.inner),
        y: y0 + r * (ph + 2 * ay.inner),
        w: pw,
        h: ph,
        bleed: {
          top: r === 0 ? b : ay.inner,
          bottom: r === rows - 1 ? b : ay.inner,
          left: c === 0 ? b : ax.inner,
          right: c === cols - 1 ? b : ax.inner,
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
  /** Which cut-and-stack pile this slot makes (0 = the top pile). */
  pile: number;
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
 * Every album page's place on the press, in CUT-AND-STACK order: cut the whole
 * printed stack at once, and each slot position becomes a pile already in
 * order — pile 1 on top of pile 2, and so on. Slot s of sheet i holds leaf
 * s·S + i (S = number of sheets).
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
        page: real ? sides[2 * leaf] : null, leaf, pile: s, slot, turn: frontTurn,
        pageBleed: pageSidesFromSheet(slot.bleed, frontTurn),
      });
      back.push({
        page: real ? sides[2 * leaf + 1] : null, leaf, pile: s, slot: bslot, turn: backTurn,
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
