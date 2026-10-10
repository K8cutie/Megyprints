/* ══════════════════════════════════════════════════════════════════════════
   pageTurn — the page turn in the book preview.

   Owner (2026-10-09): "I'm going through the Megyprints preview but I don't
   feel the page turning action." The preview swapped pages instantly. Now a
   leaf turns: it lifts at the spine, throws a shadow on the page under it and
   lands on the other side, the way a page of the printed album does.

   The preview's own state still changes at once, exactly as before
   (previewPaging): the turn is a layer drawn OVER the new state that, for the
   length of the turn, shows what a real book would: the leaf in flight, and
   under it the old page on the side the leaf hasn't reached yet. So nothing
   that reads the preview's state (the caption, Megy, the end-of-album prompt,
   a tap that lands mid-turn) has to wait for an animation.

   Angles: the leaf is hinged at the spine; 0° = lying on the right, -180° =
   lying on the left. One page at a time (an upright phone) has no left side
   to land on, so the page lifts off to the left and is gone at -100°.
   ══════════════════════════════════════════════════════════════════════════ */

import { spreadStart, type PreviewPosition, type Turn } from './previewPaging';

export type TurnFace = { kind: 'page'; index: number } | { kind: 'cover' } | { kind: 'blank' };

export interface TurnPlan {
  /** The book the turn is drawn over: the open book, one page, or the closed cover. */
  layout: 'spread' | 'page' | 'closed';
  /** The turning leaf: `front` shows while it lies right, `back` once it lies left. */
  leaf: { front: TurnFace; back: TurnFace | null; from: number; to: number };
  /** The old page kept on show, on the side the leaf hasn't reached yet. */
  patch: { side: 'left' | 'right'; face: TurnFace } | null;
  /** The side whose page the lifting leaf throws its shadow on. */
  cast: 'left' | 'right' | null;
  /** Opening the cover: the open book's left side is still empty table. */
  hideLeft: boolean;
  /** The book slides so a closed book sits in the middle: [from, to] in page widths. */
  shift: [number, number];
  ms: number;
}

export const TURN_MS = { spread: 800, page: 560 } as const;
/** One page at a time: the page lifts this far and is gone (past edge-on). */
const LIFT = 100;

const pageFace = (i: number, total: number): TurnFace => (i >= 0 && i < total ? { kind: 'page', index: i } : { kind: 'blank' });

/** The turn from where the preview is to where a page turn takes it, or null
 *  when nothing turns (the same spread, or no cover to open). */
export function planTurn(p: PreviewPosition, t: Turn): TurnPlan | null {
  const spread = p.view === 'spread';
  const ms = spread ? TURN_MS.spread : TURN_MS.page;
  const base = { cast: null, hideLeft: false, shift: [0, 0] as [number, number], ms, patch: null };

  // Opening the closed book: the cover swings over to the left.
  if (p.onCover && !t.cover) {
    if (spread) {
      return { ...base, layout: 'spread', leaf: { front: { kind: 'cover' }, back: pageFace(spreadStart(t.index), p.total), from: 0, to: -180 }, cast: 'right', hideLeft: true, shift: [-0.5, 0] };
    }
    return { ...base, layout: 'page', leaf: { front: { kind: 'cover' }, back: null, from: 0, to: -LIFT }, cast: 'right' };
  }
  // Closing it: the cover swings back over the pages.
  if (!p.onCover && t.cover) {
    if (spread) {
      const s = spreadStart(p.index);
      return { ...base, layout: 'closed', leaf: { front: { kind: 'cover' }, back: pageFace(s, p.total), from: -180, to: 0 }, patch: { side: 'right', face: pageFace(s + 1, p.total) }, shift: [0.5, 0] };
    }
    return { ...base, layout: 'closed', leaf: { front: { kind: 'cover' }, back: null, from: -LIFT, to: 0 }, patch: { side: 'right', face: pageFace(p.index, p.total) } };
  }
  if (p.onCover || t.cover) return null;

  if (spread) {
    const a = spreadStart(p.index);
    const b = spreadStart(t.index);
    if (a === b) return null;
    // Forward: the right page lifts and lands on the left, showing the next left page.
    if (b > a) {
      return { ...base, layout: 'spread', leaf: { front: pageFace(a + 1, p.total), back: pageFace(b, p.total), from: 0, to: -180 }, patch: { side: 'left', face: pageFace(a, p.total) }, cast: 'right' };
    }
    // Back: the left page lifts and lands on the right, showing the previous right page.
    return { ...base, layout: 'spread', leaf: { front: pageFace(b + 1, p.total), back: pageFace(a, p.total), from: -180, to: 0 }, patch: { side: 'right', face: pageFace(a + 1, p.total) }, cast: 'left' };
  }

  if (t.index === p.index) return null;
  // One page at a time: forward lifts this page away; back lays the previous one down over it.
  if (t.index > p.index) {
    return { ...base, layout: 'page', leaf: { front: pageFace(p.index, p.total), back: null, from: 0, to: -LIFT }, cast: 'right' };
  }
  return { ...base, layout: 'page', leaf: { front: pageFace(t.index, p.total), back: null, from: -LIFT, to: 0 }, patch: { side: 'right', face: pageFace(p.index, p.total) }, cast: 'right' };
}
