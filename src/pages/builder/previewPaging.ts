/* ══════════════════════════════════════════════════════════════════════════
   previewPaging — where the book preview's page turns go.

   An upright phone shows ONE page at a time (owner, 2026-10-05). The open book
   is two pages wide, so the preview used to turn itself 90° in code and ask
   the customer to turn their phone: "Preview forces the phone sideways" (6 of
   16 testers, round 2). Now the open book shows when the phone is really
   turned, or on "See it as an open book". Both open on the front cover when
   the album has one, and pages pair 1–2, 3–4, … as they print.
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

/** The left page of the open book a page sits in: pages pair 1–2, 3–4, … */
export const spreadStart = (index: number): number => Math.floor(index / 2) * 2;

const step = (p: PreviewPosition) => (p.view === 'page' ? 1 : 2);
/** The first page of what is showing: the page itself, or its open book's left page. */
const firstShown = (p: PreviewPosition) => (p.view === 'page' ? p.index : spreadStart(p.index));

export function canTurnBack(p: PreviewPosition): boolean {
  return !p.onCover && (firstShown(p) > 0 || p.hasCover);
}

export function canTurnForward(p: PreviewPosition): boolean {
  return p.onCover ? p.total > 0 : firstShown(p) + step(p) < p.total;
}

/** A page turn: to the front cover, or to a page (leaving the cover). */
export type Turn = { cover: true } | { cover: false; index: number };

export function turnBack(p: PreviewPosition): Turn | null {
  if (!canTurnBack(p)) return null;
  if (firstShown(p) === 0) return { cover: true };
  return { cover: false, index: Math.max(0, p.index - step(p)) };
}

export function turnForward(p: PreviewPosition): Turn | null {
  if (!canTurnForward(p)) return null;
  // Opening the closed book shows the page it was closed over.
  if (p.onCover) return { cover: false, index: p.index };
  return { cover: false, index: Math.min(p.total - 1, p.index + step(p)) };
}

/** At the album's end: its last page (or last open book) is showing. */
export function atAlbumEnd(p: PreviewPosition): boolean {
  return !p.onCover && p.total > 0 && !canTurnForward(p);
}

/** Under the book: what is showing. */
export function previewCaption(p: PreviewPosition): string {
  if (p.onCover) return 'Front cover';
  if (p.view === 'page') return `Page ${p.index + 1} of ${p.total}`;
  const s = spreadStart(p.index);
  return s + 1 < p.total ? `Pages ${s + 1}–${s + 2} of ${p.total}` : `Page ${s + 1} of ${p.total}`;
}

/** The toolbar's short count. */
export function previewCounter(p: PreviewPosition): string {
  if (p.onCover) return 'Cover';
  if (p.view === 'page') return `${p.index + 1} / ${p.total}`;
  const s = spreadStart(p.index);
  return `${s + 1}-${Math.min(s + 2, p.total)} / ${p.total}`;
}

/** The least sideways travel that counts as a swipe (px). */
export const SWIPE_MIN_PX = 48;

/** A finger moved (dx, dy) across the page: a page turn, or nothing (a tap,
 *  or scrolling up and down). Right to left turns forward, like a book. */
export function swipeTurn(dx: number, dy: number): 'forward' | 'back' | null {
  if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return null;
  return dx < 0 ? 'forward' : 'back';
}
