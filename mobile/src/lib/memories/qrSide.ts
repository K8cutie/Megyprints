/* ══════════════════════════════════════════════════════════════════════════
   A VIDEO MEMORY'S QR SITS ON THE PAGE'S OUTER EDGE, never on the side the
   pages are bound on (owner, 2026-11-02: "QR's should be placed on the outer
   part of the page since the inner part would be on the binding edge").
   Next to the binding the page curves into the spine, and a QR there is hard
   to scan.

   Which side is outer comes from the page's place in the album (the
   website's binding.ts bindingEdge: page 1 is a right-hand page, bound on
   its left, so its outer corners are top-right and bottom-right; page 2 the
   other way). A QR keeps its top or bottom; only its side follows the page.

   The website's album code (shared, not changed here) lets a QR take any of
   the 4 corners, and a page changes sides when a page before it is added or
   taken out. So the app reads its pages through `qrPagesOnOuterSide`: the
   editor, the Preview, the print files and the order all see the QR on the
   outer edge, whatever corner the saved album still names.
   ══════════════════════════════════════════════════════════════════════════ */
import { bindingEdge } from '@web/pages/builder/binding';
import { qrBadgeCornerOf, qrCornerAwayFromFace, type QrCorner } from '@web/pages/builder/pageTemplates';
import type { AlbumPage } from '@web/pages/builder/types';

/** The page's two outer corners: [top, bottom]. */
export function outerCorners(pageIndex: number): readonly [QrCorner, QrCorner] {
  return bindingEdge(pageIndex) === 'left' ? ['tr', 'br'] : ['tl', 'bl'];
}

/** The outer corner at the same height (top or bottom) as `corner`. */
export function outerCornerOf(corner: QrCorner, pageIndex: number): QrCorner {
  const [top, bottom] = outerCorners(pageIndex);
  return corner === 'tl' || corner === 'tr' ? top : bottom;
}

/** "Auto": the outer corner farthest from the face (the website's
 *  qrCornerAwayFromFace, kept to the outer edge). No face found: the
 *  bottom outer corner. */
export function autoOuterCorner(face: { x: number; y: number } | null, pageIndex: number): QrCorner {
  return outerCornerOf(qrCornerAwayFromFace(face), pageIndex);
}

/** The page with its QR on the outer edge. A page without a QR corner, or
 *  with it already outside, comes back as it is (the same object). */
export function qrPageOnOuterSide(page: AlbumPage, pageIndex: number): AlbumPage {
  const corner = qrBadgeCornerOf(page.templateId);
  if (!corner) return page;
  const outer = outerCornerOf(corner, pageIndex);
  if (outer === corner) return page;
  return { ...page, templateId: page.templateId!.replace(/-(tl|tr|bl|br)$/, `-${outer}`) };
}

const seen = new WeakMap<readonly AlbumPage[], AlbumPage[]>();

/** Every page with its QR on the outer edge. Nothing to move: the same
 *  array; the same pages in: the same answer (screens that compare pages
 *  see no change where there is none). */
export function qrPagesOnOuterSide(pages: AlbumPage[]): AlbumPage[] {
  const known = seen.get(pages);
  if (known) return known;
  let moved = false;
  const out = pages.map((p, i) => {
    const q = qrPageOnOuterSide(p, i);
    if (q !== p) moved = true;
    return q;
  });
  const answer = moved ? out : pages;
  seen.set(pages, answer);
  return answer;
}

/** The album builder as the app's screens read it: its pages (and the page
 *  open in the editor) with every QR on the outer edge. Every change still
 *  goes to the builder itself. */
export function withQrOnOuterSide<B extends { albumPages: AlbumPage[]; currentPageIndex: number; currentPage: AlbumPage }>(b: B): B {
  const pages = qrPagesOnOuterSide(b.albumPages);
  if (pages === b.albumPages) return b;
  // The cover (edited as a page) is not bound on a side: it stays as it is.
  const currentPage = b.currentPage === b.albumPages[b.currentPageIndex] ? pages[b.currentPageIndex] : b.currentPage;
  return { ...b, albumPages: pages, currentPage };
}
