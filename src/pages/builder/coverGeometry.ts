/* ═══════════════════════════════════════════════════════════════════════════
   coverGeometry.ts — PHYSICAL geometry for the front·spine·back album cover.
   ───────────────────────────────────────────────────────────────────────────
   A photobook cover is printed as ONE flat "wrap" that folds around the book
   block. Printed outside-face-up, laid left→right, the panels are:

        ┌──────────┬───────┬──────────┐
        │   BACK   │ SPINE │  FRONT   │      (+ bleed / turn-in all around)
        └──────────┴───────┴──────────┘

   The SPINE width is the thickness of all the leaves stacked together, so this
   module computes it from the page count and the thickness of ONE leaf of the
   shop's paper: C2S 140 (owner, 2026-10-22), matte or glossy as the customer
   picked at checkout. A hardcover adds its two boards.

   The hardcover "allowances" (board, turn-in, hinge) are standard case
   construction and rarely change. Edit ONLY the `PRINTER_SPEC` block — the
   whole wrap re-derives; nothing else hardcodes these numbers.
   ═══════════════════════════════════════════════════════════════════════════ */

import { ALBUM_SIZES, DEFAULT_MATERIAL, type AlbumSizePreset, type CoverType, type MaterialType } from './types';
import { MIN_PAGES } from '../../lib/pricing';

export const COVER_DPI = 300;

/** ─────────────────────────────────────────────────────────────────────────
 *  PRINTER SPEC — industry-standard defaults (all values in INCHES). The whole
 *  wrap re-derives from these; nothing else hardcodes them.
 *  ───────────────────────────────────────────────────────────────────────── */
export const PRINTER_SPEC = {
  /** The inside pages' paper (owner, 2026-10-22): C2S 140, coated both
   *  sides, 140 gsm. */
  paperName: 'C2S 140',
  /** Thickness of ONE leaf of it (one leaf = 2 book pages), in mm, by finish:
   *  the C2S mills' data sheets (ISO 534) give 140 gsm matte 0.134 mm and
   *  140 gsm gloss 0.120 mm. Matte runs thicker at the same weight. To fine-
   *  tune from a real album: its spine in mm ÷ its number of leaves. */
  leafMm: { matte: 0.134, glossy: 0.12 },
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
  /** Computed spine thickness, inches (or the one read from a cover file). */
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

const MM_PER_IN = 25.4;

/** One leaf's thickness in inches for the finish picked at checkout. Glossy
 *  is the thinner sheet; any other finish counts as matte. */
export function leafInches(material: MaterialType = DEFAULT_MATERIAL): number {
  return (material === 'glossy' ? PRINTER_SPEC.leafMm.glossy : PRINTER_SPEC.leafMm.matte) / MM_PER_IN;
}

/** Cover files made before 2026-10-22 were drawn for a guessed 0.006" leaf
 *  (≈ 0.15 mm). The console still has to take them. */
export const LEGACY_LEAF_IN = 0.006;

/** Leaves in the book block: two pages a leaf, page 1 on the first leaf's
 *  front. Uses the SAME MIN_PAGES floor as pricing. */
export function spineLeaves(pageCount: number): number {
  const pages = Math.max(MIN_PAGES, Math.round(pageCount) || 0);
  return Math.ceil(pages / PRINTER_SPEC.sidesPerLeaf);
}

/** Spine for a given leaf thickness: every leaf stacked, plus the two
 *  boards on a hardcover. */
export function spineForLeaf(pageCount: number, cover: CoverType, leafIn: number): number {
  const blockIn = spineLeaves(pageCount) * leafIn;
  return isHardcover(cover)
    ? blockIn + 2 * PRINTER_SPEC.boardThicknessIn
    : blockIn;
}

/** Physical spine thickness in inches: (leaves × one leaf of C2S 140 in the
 *  picked finish) + (hardcover ? two boards : 0). */
export function spineWidthInches(pageCount: number, cover: CoverType, material: MaterialType = DEFAULT_MATERIAL): number {
  return spineForLeaf(pageCount, cover, leafInches(material));
}

/** Everything but the spine across a flat cover: both panels, both hinges
 *  and the edge all round. */
function wrapWidthWithoutSpine(albumSize: AlbumSizePreset, cover: CoverType): number {
  const hard = isHardcover(cover);
  return 2 * (hard ? PRINTER_SPEC.wrapTurnIn : PRINTER_SPEC.bleedIn)
    + 2 * trimInches(albumSize).wIn
    + 2 * (hard ? PRINTER_SPEC.hingeGapIn : 0);
}

/** The spine a cover FILE was drawn with, from its width. */
export function spineFromWrapWidth(albumSize: AlbumSizePreset, cover: CoverType, wrapWIn: number): number {
  return wrapWIn - wrapWidthWithoutSpine(albumSize, cover);
}

/** "2.7 mm (0.11 in)" */
export function spineLabel(spineIn: number): string {
  return `${(spineIn * MM_PER_IN).toFixed(1)} mm (${spineIn.toFixed(2)} in)`;
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
  paper: CoverPaper = {},
): CoverWrapGeometry {
  const hard = isHardcover(cover);
  const { wIn: trimWIn, hIn: trimHIn } = trimInches(albumSize);

  const outerMarginIn = hard ? PRINTER_SPEC.wrapTurnIn : PRINTER_SPEC.bleedIn;
  const hingeIn = hard ? PRINTER_SPEC.hingeGapIn : 0;
  const spineIn = paper.spineIn ?? spineWidthInches(pageCount, cover, paper.material);

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

/** Which spine a wrap is for: the finish picked at checkout (C2S 140 matte
 *  or glossy), or, for a cover file that already exists, the spine it was
 *  drawn with (spineFromWrapWidth). */
export interface CoverPaper {
  material?: MaterialType;
  spineIn?: number;
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
