/* ═══════════════════════════════════════════════════════════════════════════
   coverGeometry.ts — PHYSICAL geometry for the front·spine·back album cover.
   ───────────────────────────────────────────────────────────────────────────
   A photobook cover is printed as ONE flat "wrap" that folds around the book
   block. Printed outside-face-up, laid left→right, the panels are:

        ┌──────────┬───────┬──────────┐
        │   BACK   │ SPINE │  FRONT   │      (+ bleed / turn-in all around)
        └──────────┴───────┴──────────┘

   The SPINE width is a PHYSICAL thickness that grows with the page count, so
   this module computes it from the interior page count and the paper caliper.

   The constants below are INDUSTRY-STANDARD defaults, so the cover works today.
   The hardcover "allowances" (board, turn-in, hinge) are standard case
   construction and rarely change. The one value that's stock-specific and worth
   confirming from a real album is `paperCaliperIn`. Edit ONLY the `PRINTER_SPEC`
   block — the whole wrap re-derives; nothing else hardcodes these numbers.
   ═══════════════════════════════════════════════════════════════════════════ */

import { ALBUM_SIZES, type AlbumSizePreset, type CoverType } from './types';
import { MIN_PAGES } from '../../lib/pricing';

export const COVER_DPI = 300;

/** ─────────────────────────────────────────────────────────────────────────
 *  PRINTER SPEC — industry-standard defaults (all values in INCHES). The whole
 *  wrap re-derives from these; nothing else hardcodes them.
 *  ───────────────────────────────────────────────────────────────────────── */
export const PRINTER_SPEC = {
  /** Thickness of ONE printed leaf (one sheet = 2 book pages). 0.006" ≈ 0.15 mm
   *  = a typical ~170gsm photo-book text stock. STOCK-SPECIFIC — the one value
   *  to fine-tune from a real album (measured spine ÷ leaf count). */
  paperCaliperIn: 0.006,
  /** How many builder pages print on one physical leaf. Double-sided = 2.
   *  Spine leaves = ceil(pages / sidesPerLeaf). */
  sidesPerLeaf: 2,
  /** Grey-board thickness per cover board — HARDCOVER ALLOWANCE. Industry
   *  standard 2.5 mm greyboard ≈ 0.098" (2 mm / 3 mm also common). */
  boardThicknessIn: 0.098,
  /** Joint / French-groove gap between the spine and each board — HARDCOVER
   *  ALLOWANCE. Industry standard ~8 mm ≈ 0.315". Text must avoid this fold. */
  hingeGapIn: 0.315,
  /** Turn-in: paper that folds around the board edges and glues inside —
   *  HARDCOVER ALLOWANCE. Industry standard ~16 mm ≈ 0.625" (5/8"). Softcover
   *  uses plain bleed instead (bleedIn). */
  wrapTurnIn: 0.625,
  /** Bleed — art past the trim that gets cut off. Universal print standard
   *  3 mm ≈ 0.125". */
  bleedIn: 0.125,
  /** Safe area — keep text / logos this far from every trim & fold. Standard
   *  ~6 mm ≈ 0.25". */
  safeIn: 0.25,
} as const;

export type CoverPanel = 'back' | 'spine' | 'front';

export interface Rect {
  /** Left edge, px from the wrap's top-left origin. */
  x: number;
  /** Top edge, px from the wrap's top-left origin. */
  y: number;
  width: number;
  height: number;
}

export interface CoverWrapGeometry {
  dpi: number;
  cover: CoverType;
  hardcover: boolean;
  /** Interior page count actually used (clamped to the MIN_PAGES floor). */
  pageCount: number;
  /** Computed spine thickness, inches. */
  spineIn: number;
  /** Full flat-wrap dimensions. */
  wrap: { wIn: number; hIn: number; wPx: number; hPx: number };
  /** Panel rects in PX (origin = wrap top-left). back is left, front is right. */
  panels: Record<CoverPanel, Rect>;
  /** X positions (px) of the two fold/crease lines, for drawing guides. */
  foldXPx: [number, number];
  /** Safe inset (px) to keep text/logos away from trims & folds. */
  safeInsetPx: number;
  /** Echo of the constants used, for the operator/print sheet + debugging. */
  spec: typeof PRINTER_SPEC & { trimWIn: number; trimHIn: number };
  /** Always true today — a loud reminder the numbers are provisional. */
  needsPrinterConfirmation: true;
}

const inToPx = (inches: number): number => Math.round(inches * COVER_DPI);

/** Is this cover a hard case? Every non-softcover CoverType binds as hardcover. */
export function isHardcover(cover: CoverType): boolean {
  return cover !== 'softcover';
}

/** Physical spine thickness in inches for a given page count + cover type.
 *  Spine = (leaves × paper caliper) + (hardcover ? two boards : 0).
 *  Uses the SAME MIN_PAGES floor as pricing so the spine matches the book the
 *  customer actually paid for. */
export function spineWidthInches(pageCount: number, cover: CoverType): number {
  const pages = Math.max(MIN_PAGES, Math.round(pageCount) || 0);
  const leaves = Math.ceil(pages / PRINTER_SPEC.sidesPerLeaf);
  const blockIn = leaves * PRINTER_SPEC.paperCaliperIn;
  return isHardcover(cover)
    ? blockIn + 2 * PRINTER_SPEC.boardThicknessIn
    : blockIn;
}

/** Album trim size (front/back panel size) in inches, from the 300-DPI px in
 *  ALBUM_SIZES. Front & back panels each equal the album trim. */
function trimInches(albumSize: AlbumSizePreset): { wIn: number; hIn: number } {
  const cfg = ALBUM_SIZES.find((s) => s.preset === albumSize);
  return { wIn: (cfg?.width ?? 2400) / COVER_DPI, hIn: (cfg?.height ?? 2400) / COVER_DPI };
}

/**
 * Compute the full flat-wrap geometry for a cover.
 *
 * width  = outerMargin·2 + trimW(back) + hinge + spine + hinge + trimW(front)
 * height = outerMargin·2 + trimH
 * (outerMargin = wrapTurn for hardcover, bleed for softcover; hinge = 0 for soft)
 */
export function coverWrapGeometry(
  albumSize: AlbumSizePreset,
  pageCount: number,
  cover: CoverType,
): CoverWrapGeometry {
  const hard = isHardcover(cover);
  const { wIn: trimWIn, hIn: trimHIn } = trimInches(albumSize);

  const outerMarginIn = hard ? PRINTER_SPEC.wrapTurnIn : PRINTER_SPEC.bleedIn;
  const hingeIn = hard ? PRINTER_SPEC.hingeGapIn : 0;
  const spineIn = spineWidthInches(pageCount, cover);

  const wrapWIn = outerMarginIn * 2 + trimWIn + hingeIn + spineIn + hingeIn + trimWIn;
  const wrapHIn = outerMarginIn * 2 + trimHIn;

  // Panel left edges, in inches, from the wrap's left edge (BACK | SPINE | FRONT).
  const backX0 = outerMarginIn;
  const spineX0 = backX0 + trimWIn + hingeIn;
  const frontX0 = spineX0 + spineIn + hingeIn;
  const panelY0 = outerMarginIn;

  const panels: Record<CoverPanel, Rect> = {
    back: { x: inToPx(backX0), y: inToPx(panelY0), width: inToPx(trimWIn), height: inToPx(trimHIn) },
    spine: { x: inToPx(spineX0), y: inToPx(panelY0), width: inToPx(spineIn), height: inToPx(trimHIn) },
    front: { x: inToPx(frontX0), y: inToPx(panelY0), width: inToPx(trimWIn), height: inToPx(trimHIn) },
  };

  return {
    dpi: COVER_DPI,
    cover,
    hardcover: hard,
    pageCount: Math.max(MIN_PAGES, Math.round(pageCount) || 0),
    spineIn,
    wrap: { wIn: wrapWIn, hIn: wrapHIn, wPx: inToPx(wrapWIn), hPx: inToPx(wrapHIn) },
    panels,
    foldXPx: [inToPx(spineX0), inToPx(spineX0 + spineIn)],
    safeInsetPx: inToPx(PRINTER_SPEC.safeIn),
    spec: { ...PRINTER_SPEC, trimWIn, trimHIn },
    needsPrinterConfirmation: true,
  };
}

/** Inset a rect by a uniform margin (px). Used for panel safe areas. */
export function insetRect(r: Rect, inset: number): Rect {
  const i = Math.min(inset, r.width / 2 - 1, r.height / 2 - 1);
  return { x: r.x + i, y: r.y + i, width: r.width - 2 * i, height: r.height - 2 * i };
}

/** Human-readable one-liner for the operator print sheet / debug overlay, e.g.
 *  "Hardcover wrap 18.10×9.50\" · spine 0.60\" (60pp) · 5430×2850px @300dpi". */
export function describeWrap(g: CoverWrapGeometry): string {
  const n = (x: number) => x.toFixed(2);
  return (
    `${g.hardcover ? 'Hardcover' : 'Softcover'} wrap ` +
    `${n(g.wrap.wIn)}×${n(g.wrap.hIn)}" · spine ${n(g.spineIn)}" (${g.pageCount}pp) · ` +
    `${g.wrap.wPx}×${g.wrap.hPx}px @${g.dpi}dpi`
  );
}
