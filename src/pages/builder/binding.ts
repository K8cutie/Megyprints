/**
 * binding.ts — Binding (gutter) keep-out for double-sided, back-to-back pages.
 * ============================================================================
 * The book is bound down the spine, so the 0.5" keep-out sits on each page's
 * INNER edge (mirrored margins):
 *   • left page  (even index) → reserve its RIGHT edge
 *   • right page (odd index)  → reserve its LEFT edge
 * Reserving it on the inner margin shrinks the template safe area, so
 * auto-placed photos/slots never land in the spine.
 */

export const BINDING_INCHES = 0.5;

interface Margin { top: number; bottom: number; left: number; right: number; }

/** 0.5" binding reserve as a fraction of the page WIDTH for this album size. */
export function bindingMarginFraction(albumSize: string): number {
  const widthIn = parseFloat(String(albumSize).split('x')[0]) || 8;
  return BINDING_INCHES / widthIn;
}

/** Which edge binds for a page index (mirrored inner margin, double-sided). */
export function bindingEdge(pageIndex: number): 'left' | 'right' {
  return pageIndex % 2 === 0 ? 'right' : 'left';
}

/** Add the binding reserve to a template margin's inner edge for this page. */
export function applyBindingMargin(margin: Margin, albumSize: string, pageIndex: number): Margin {
  const frac = bindingMarginFraction(albumSize);
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
  template: { fullBleed?: boolean } | null | undefined,
  baseMargin: Margin,
  albumSize: string,
  pageIndex: number,
  opts?: { noBinding?: boolean },
): Margin {
  if (template?.fullBleed) {
    // A full-bleed page bleeds off THREE edges — top, bottom and the OUTER
    // edge — but still stops short of the spine. It used to run to all four,
    // which meant the inner 0.5" of every photo was swallowed by the binding:
    // a face near the gutter came out half-eaten. The keep-out guide warned
    // about it, but nothing moved out of the way.
    if (opts?.noBinding) return { top: 0, bottom: 0, left: 0, right: 0 };
    const frac = bindingMarginFraction(albumSize);
    return bindingEdge(pageIndex) === 'left'
      ? { top: 0, bottom: 0, left: frac, right: 0 }
      : { top: 0, bottom: 0, left: 0, right: frac };
  }
  if (opts?.noBinding) return { ...baseMargin };
  return applyBindingMargin(baseMargin, albumSize, pageIndex);
}
