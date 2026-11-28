/**
 * binding.ts — Binding (gutter) keep-out for double-sided, back-to-back pages.
 * ============================================================================
 * The book is bound down the spine, so the keep-out (BINDING_INCHES) sits on
 * each page's INNER edge (mirrored margins).
 *
 * PAGE 1 IS A RIGHT-HAND PAGE (owner, 2026-10-21: "Cover then as you flip the
 * cover its Page 1 at once"). Open the cover and page 1 is the first page you
 * see, across from the inside of the front cover; the open book then shows
 * 2 | 3, 4 | 5, … and the last page sits across from the inside of the back
 * cover. So:
 *   • page 1, 3, 5… (even index) → right-hand page → reserve its LEFT edge
 *   • page 2, 4, 6… (odd index)  → left-hand page  → reserve its RIGHT edge
 * Reserving it on the inner margin shrinks the template safe area, so
 * auto-placed photos/slots never land in the spine.
 */

/** The binding side allowance: 3/8" (owner, 2026-10-22: "gawin mo lng .375
 *  yung binding side allowance"; it was 0.5"). Every renderer, guide, frame
 *  guardrail and template reads it from here. Frames are stored as fractions
 *  of the safe area, so albums already in progress just grow a little toward
 *  the spine. */
export const BINDING_INCHES = 0.375;

/** A hardbound book keeps 1/2" (owner, 2026-10-25: "for softbind the edge
 *  allowance is .375 but for hardbound its still .5"): a case-bound book
 *  doesn't open as flat. The cover is picked at checkout, after the album is
 *  designed, so the editor shows 3/8" and only a hardbound order's PRINT FILE
 *  is drawn with 1/2" (frames are fractions of the safe area, so they follow). */
export const HARDBOUND_BINDING_INCHES = 0.5;

/** A stapled booklet (the Megy Mini's A5, Megy Magazine's A4; lib/megyMini) is stapled through its fold (saddle-
 *  stitched): it opens flat, and its middle spread already runs one photo
 *  across the fold. So its pages keep NO allowance there and photos run to
 *  the fold (owner, 2026-11-17: "im trying to avoid pages with lots of free
 *  spaces since the pages for mini are very few"; it was the softcover's 3/8",
 *  a white strip beside every full page). */
export const MINI_FOLD_INCHES = 0;
/** The stapled booklets' sizes: A4 and A5 (lib/megyMini). */
const MINI_SIZE_KEYS: readonly string[] = ['8.3x11.7', '5.8x8.3'];

/** The binding side allowance for an order's cover: 1/2" hardbound (every
 *  cover but softcover and the Megy Mini's staple cover binds as a hardcover),
 *  3/8" softcover or not chosen, none for the Mini's staples (MINI_FOLD_INCHES). */
export function bindingInchesFor(cover?: string | null): number {
  if (cover === 'staple') return MINI_FOLD_INCHES;
  return cover && cover !== 'softcover' ? HARDBOUND_BINDING_INCHES : BINDING_INCHES;
}

/** Which side of the open book page 1 is on. Every album is 'right' now.
 *  Print files made before 2026-10-21 put page 1 on the LEFT (a blank page
 *  first, then 1 | 2): 'left' exists only so the console can still lay THOSE
 *  files out on press sheets the way they were drawn. */
export type PageOneSide = 'right' | 'left';

/** Written into every print file's keywords, so the console knows the file
 *  puts page 1 on the right. A file without it is from before the change. */
export const PAGE_ONE_RIGHT_MARK = 'megy-page1-right';

interface Margin { top: number; bottom: number; left: number; right: number; }

/** The binding reserve as a fraction of the page WIDTH for this album size. */
export function bindingMarginFraction(albumSize: string, bindingIn: number = BINDING_INCHES): number {
  // The Mini's own allowance, whatever the caller assumed: the editor, the
  // preview and the app draw it before a cover is ever chosen.
  const inches = MINI_SIZE_KEYS.includes(albumSize) ? MINI_FOLD_INCHES : bindingIn;
  const widthIn = parseFloat(String(albumSize).split('x')[0]) || 8;
  return inches / widthIn;
}

/** Which edge binds for a page index (mirrored inner margin, double-sided). */
export function bindingEdge(pageIndex: number): 'left' | 'right' {
  return pageIndex % 2 === 0 ? 'left' : 'right';
}

/** Add the binding reserve to a template margin's inner edge for this page. */
export function applyBindingMargin(margin: Margin, albumSize: string, pageIndex: number, bindingIn: number = BINDING_INCHES): Margin {
  const frac = bindingMarginFraction(albumSize, bindingIn);
  return bindingEdge(pageIndex) === 'left'
    ? { ...margin, left: margin.left + frac }
    : { ...margin, right: margin.right + frac };
}

/** Effective page margin for rendering. A full-bleed template runs the photo to
 *  ALL four edges (no safe margin, no binding gutter); everything else gets the
 *  binding reserve added to its inner edge. Use this everywhere a page renders.
 *
 *  `opts.noBinding` — a COVER panel has no interior spine gutter (its inner edge
 *  IS the spine, handled by the wrap compositor), so cover pages pass this to
 *  keep the plain template margins and skip applyBindingMargin. */
export function marginForTemplate(
  template: { fullBleed?: boolean; spreadHalf?: 'left' | 'right' } | null | undefined,
  baseMargin: Margin,
  albumSize: string,
  pageIndex: number,
  opts?: { noBinding?: boolean; bindingIn?: number },
): Margin {
  // The Megy Mini's middle spread (miniSpread.ts): pages 8 and 9 are one
  // piece of paper, so its photo runs straight across the fold. No spine margin.
  if (template?.spreadHalf) return { top: 0, bottom: 0, left: 0, right: 0 };
  if (template?.fullBleed) {
    // A full-bleed page bleeds off THREE edges — top, bottom and the OUTER
    // edge — but still stops short of the spine. It used to run to all four,
    // which meant the inner 0.5" of every photo was swallowed by the binding:
    // a face near the gutter came out half-eaten. The keep-out guide warned
    // about it, but nothing moved out of the way.
    if (opts?.noBinding) return { top: 0, bottom: 0, left: 0, right: 0 };
    const frac = bindingMarginFraction(albumSize, opts?.bindingIn);
    return bindingEdge(pageIndex) === 'left'
      ? { top: 0, bottom: 0, left: frac, right: 0 }
      : { top: 0, bottom: 0, left: 0, right: frac };
  }
  if (opts?.noBinding) return { ...baseMargin };
  return applyBindingMargin(baseMargin, albumSize, pageIndex, opts?.bindingIn);
}
