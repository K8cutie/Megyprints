/* ── MEGYearbooks page geometry — the ONE home for every print measurement ──
   All yearbook layout math is in inches on an 8.5 × 11 trim (the only size,
   owner decision 2026-10-08). The painter turns inches into pixels at any
   resolution, so the screen preview and the 300 dpi print file come from the
   same numbers. Sources for each figure: docs/megyearbooks-build-plan.md and
   the layout reference (PSPA/SPOA portraits, Walsworth/Friesens spreads). */

export const TRIM = { w: 8.5, h: 11 } as const;

/** Bleed past the trim on every edge of the print file. */
export const BLEED = 0.125;

/** Nothing (faces, text, QR) inside this band at the spine. */
export const SPINE_KEEPOUT = 0.5;

/** Live area margins. The spine side is the keep-out plus a little air. */
export const MARGIN = { outside: 0.5, top: 0.5, bottom: 0.65, spine: SPINE_KEEPOUT + 0.125 } as const;

/** Section title band at the top of portrait pages. */
export const HEADER_H = 0.42;

/** Print resolution of the delivered page files. */
export const PRINT_DPI = 300;

/** Portrait shape (PSPA/SPOA): 4 wide to 5 tall. */
export const PORTRAIT_ASPECT = 0.8;

/** Where a fitted head sits in its portrait frame, as fractions of the frame.
 *  Head (crown to chin) ≈ half the frame height, eyes ≈ 36% down, centred. */
export const HEAD = {
  heightFrac: 0.5,
  eyeYFrac: 0.36,
  /** Adult head height ≈ 3.65 × the distance between the eye centres. */
  headPerEyeGap: 3.65,
} as const;

/** The upper-right QR badge (white square incl. quiet zone). The test print on
 *  the owner's press sets the real minimum; 0.5 in is the working value. */
export const QR_BADGE_IN = 0.5;
export const QR_BADGE_INSET = 0.04;
/** The class QR on a group photo is bigger: it has the room. */
export const CLASS_QR_IN = 0.95;

/** Portraits per page the adviser can pick. Owner decision 2026-10-08:
 *  "max 12 pic per page". Each fills the page (6 and 8 leave a fifth to a
 *  third of the page empty — see the layout reference). */
export const DENSITIES = [4, 9, 12] as const;
export type Density = (typeof DENSITIES)[number];
export const MAX_DENSITY: Density = 12;

/** Any saved or typed value → an allowed portrait size (old projects may hold 20 or 30). */
export function clampDensity(n: number): Density {
  return [...DENSITIES].reverse().find((d) => d <= n) ?? DENSITIES[0];
}

/** Columns × rows for each density on a portrait 8.5 × 11 page. */
export const GRID: Record<Density, { cols: number; rows: number }> = {
  4: { cols: 2, rows: 2 },
  9: { cols: 3, rows: 3 },
  12: { cols: 4, rows: 3 },
};

/** Name size under a portrait, by density (larger when roomy). */
export const NAME_PT: Record<Density, number> = { 4: 12, 9: 10.5, 12: 9.5 };
export const NAME_MIN_PT = 6.5;

/** Graduates with three looks (toga · Filipiniana/barong · creative). */
export const LOOKS_PER_PAGE = [2, 3, 4] as const;
export type LooksPerPage = (typeof LOOKS_PER_PAGE)[number];

/** A page is a right-hand page (recto, spine on the LEFT) when its number is odd. */
export const isRecto = (pageNumber: number): boolean => pageNumber % 2 === 1;

/** The live rectangle of a page, in inches from the trim's top-left. */
export function liveArea(pageNumber: number): { x0: number; x1: number; y0: number; y1: number } {
  const recto = isRecto(pageNumber);
  const left = recto ? MARGIN.spine : MARGIN.outside;
  const right = recto ? MARGIN.outside : MARGIN.spine;
  return { x0: left, x1: TRIM.w - right, y0: MARGIN.top, y1: TRIM.h - MARGIN.bottom };
}

export const PT_PER_IN = 72;
export const ptToIn = (pt: number): number => pt / PT_PER_IN;
