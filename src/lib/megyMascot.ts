// The Megy mascot's image files, in one place.
//
// The master art is 1024px and 1.5 MB (store/megy-character-master.png). The
// app shows Megy at 28–128 CSS px, so it ships shrunk copies instead and lets
// the browser pick by screen density: the home card (96 px) on a 2× phone
// fetches the 192 file, ~12 KB. scripts/build-mascot.mjs makes the files from
// this list; megyMascot.spec.ts keeps them under budget.

/** Pixel widths of the shipped copies (square). 384 = the 128 px builder Megy on a 3× phone. */
export const MEGY_MASCOT_WIDTHS = [128, 192, 256, 384] as const;

export type MegyMascotWidth = (typeof MEGY_MASCOT_WIDTHS)[number];

export function megyMascotUrl(width: MegyMascotWidth): string {
  return `/megy-character-${width}.png`;
}

/** srcset with every copy, so the browser fetches only the one the screen needs. */
export const MEGY_MASCOT_SRCSET = MEGY_MASCOT_WIDTHS.map((w) => `${megyMascotUrl(w)} ${w}w`).join(', ');

/** For a browser that ignores srcset: the 2× copy for the largest place Megy shows. */
export const MEGY_MASCOT_FALLBACK = megyMascotUrl(256);
