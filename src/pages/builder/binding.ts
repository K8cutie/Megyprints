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
