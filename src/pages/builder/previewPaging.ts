/* ══════════════════════════════════════════════════════════════════════════
   previewPaging — where the book preview's page turns go.

   An upright phone shows ONE page at a time (owner, 2026-10-05). The open book
   is two pages wide, so the preview used to turn itself 90° in code and ask
   the customer to turn their phone: "Preview forces the phone sideways" (6 of
   16 testers, round 2). Now the open book shows when the phone is really
   turned, or on "See it as an open book". Both open on the front cover when
   the album has one.

   The open book is the printed book (binding.ts): open the cover and page 1
   is on the right, across from the inside of the front cover (owner,
   2026-10-21). Then 2 | 3, 4 | 5, … and the last page, when it is a left
   page, sits across from the inside of the back cover.
   ══════════════════════════════════════════════════════════════════════════ */

/** 'page' = one page at a time (an upright phone); 'spread' = the open book. */
export type PreviewView = 'page' | 'spread';

export interface PreviewPosition {
  view: PreviewView;
  /** The page on screen (the builder's current page). */
  index: number;
  total: number;
  /** The closed book's front cover is showing. */
  onCover: boolean;
  /** The album has a front cover to show before page 1. */
  hasCover: boolean;
}

/** The left page of the open book a page sits in: (cover | 1), (2 | 3), (4 | 5), …
 *  -1 = the inside of the front cover; a right side at or past the last page
 *  is the inside of the back cover. */
export const spreadStart = (index: number): number => Math.floor((index + 1) / 2) * 2 - 1;

/** The album pages an open book shows: two, or one at either end of the album. */
export function spreadPages(index: number, total: number): number[] {
  const s = spreadStart(index);
  return [s, s + 1].filter((i) => i >= 0 && i < total);
}

/** The first page of what is showing: the page itself, or its open book's first page. */
const firstShown = (p: PreviewPosition) => (p.view === 'page' ? p.index : Math.max(0, spreadStart(p.index)));
/** The first page the next turn forward shows. */
const nextFirst = (p: PreviewPosition) => (p.view === 'page' ? p.index + 1 : spreadStart(p.index) + 2);

export function canTurnBack(p: PreviewPosition): boolean {
  return !p.onCover && (firstShown(p) > 0 || p.hasCover);
}

export function canTurnForward(p: PreviewPosition): boolean {
  return p.onCover ? p.total > 0 : nextFirst(p) < p.total;
}

/** A page turn: to the front cover, or to a page (leaving the cover). */
export type Turn = { cover: true } | { cover: false; index: number };

export function turnBack(p: PreviewPosition): Turn | null {
  if (!canTurnBack(p)) return null;
  if (firstShown(p) === 0) return { cover: true };
  return { cover: false, index: p.view === 'page' ? p.index - 1 : Math.max(0, spreadStart(p.index) - 2) };
}

export function turnForward(p: PreviewPosition): Turn | null {
  if (!canTurnForward(p)) return null;
  // Opening the closed book shows the page it was closed over.
  if (p.onCover) return { cover: false, index: p.index };
  return { cover: false, index: nextFirst(p) };
}

/** At the album's end: its last page (or last open book) is showing. */
export function atAlbumEnd(p: PreviewPosition): boolean {
  return !p.onCover && p.total > 0 && !canTurnForward(p);
}

/** Under the book: what is showing. */
export function previewCaption(p: PreviewPosition): string {
  if (p.onCover) return 'Front cover';
  const shown = p.view === 'page' ? [p.index] : spreadPages(p.index, p.total);
  if (shown.length === 2) return `Pages ${shown[0] + 1}–${shown[1] + 1} of ${p.total}`;
  return `Page ${(shown[0] ?? p.index) + 1} of ${p.total}`;
}

/** The toolbar's short count. */
export function previewCounter(p: PreviewPosition): string {
  if (p.onCover) return 'Cover';
  const shown = p.view === 'page' ? [p.index] : spreadPages(p.index, p.total);
  if (shown.length === 2) return `${shown[0] + 1}-${shown[1] + 1} / ${p.total}`;
  return `${(shown[0] ?? p.index) + 1} / ${p.total}`;
}

/** The least sideways travel that counts as a swipe (px). */
export const SWIPE_MIN_PX = 48;

/** A finger moved (dx, dy) across the page: a page turn, or nothing (a tap,
 *  or scrolling up and down). Right to left turns forward, like a book. */
export function swipeTurn(dx: number, dy: number): 'forward' | 'back' | null {
  if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return null;
  return dx < 0 ? 'forward' : 'back';
}
