/* ══════════════════════════════════════════════════════════════════════════
   A FINGER TURNS THE PAGE (owner, 2026-11-03: "page flips looking realistic";
   the drawing's "dragging the corner"). Plain sums, no React Native:
   test/pageDrag.test.ts; the Preview (src/app/preview.tsx) uses them.

   The moment a finger moves sideways on a page, the turn begins: the book
   is already where the turn goes (as a button's turn does: previewPaging),
   and the leaf follows the finger, from lying flat to lying on the other
   side as the finger crosses the book. Let go:
     • after a swipe (the website's swipeTurn, the same way), past halfway,
       or on a quick flick: the page finishes its turn;
     • short of that (a little move, or back the other way): the page goes
       back down and the book is where it was.
   The cover still turns on a swipe (its turn slides the book: planTurn's
   shift), and so does the last page into the back cover.
   ══════════════════════════════════════════════════════════════════════════ */
import { swipeTurn } from '@web/pages/builder/previewPaging';
import type { TurnPlan } from '@web/pages/builder/pageTurn';

export type DragDir = 'forward' | 'back';

/** How far a finger moves to take the page all the way over (points): the
 *  open book's leaf crosses most of both pages; one page, its width. */
export function dragReach(layout: TurnPlan['layout'], pageW: number): number {
  return Math.max(1, (layout === 'spread' ? 1.6 : 1) * pageW);
}

/** The turns a finger takes: a page of the open book or one page at a time,
 *  not the cover (opening or closing the book slides it). */
export function dragTurns(plan: TurnPlan, fromCover: boolean, toCover: boolean): boolean {
  return plan.layout !== 'closed' && !fromCover && !toCover && !plan.hideLeft && plan.shift[0] === 0 && plan.shift[1] === 0;
}

/** How far through the turn the finger has taken the page, 0 to 1. */
export function dragProgress(dir: DragDir, dx: number, reach: number): number {
  const along = dir === 'forward' ? -dx : dx;
  return Math.min(1, Math.max(0, along / Math.max(1, reach)));
}

/** The leaf's angle there (pageTurn: 0 lying right, -180 lying left). */
export function dragAngle(plan: TurnPlan, dir: DragDir, dx: number, reach: number): number {
  const p = dragProgress(dir, dx, reach);
  return plan.leaf.from + (plan.leaf.to - plan.leaf.from) * p;
}

/** A flick: this fast (points per millisecond) the right way. */
export const FLICK = 0.5;
/** The shortest a let-go page takes to land. */
export const DRAG_SETTLE_MIN_MS = 120;

/** Let go: does the page finish its turn? */
export function dragKeeps(dir: DragDir, dx: number, dy: number, vx: number, progress: number): boolean {
  if (progress >= 0.5) return true;
  if (swipeTurn(dx, dy) === dir) return true;
  return dir === 'forward' ? vx <= -FLICK : vx >= FLICK;
}
