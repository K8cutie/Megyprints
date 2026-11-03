/* ══════════════════════════════════════════════════════════════════════════
   A FINGER TURNS THE PAGE: THE RULES (src/builder/pageDrag.ts).
     • the page follows the finger: flat where the finger started, standing up
       halfway across, over on the other side at the end of its reach (the
       open book: most of both pages; one page: its width);
     • let go after a swipe, past halfway, or on a flick: it finishes its
       turn; else it goes back;
     • the cover turns on a swipe, as before.
   On the real Preview: test/previewScreen.test.tsx.
   ══════════════════════════════════════════════════════════════════════════ */
import { planTurn, type TurnPlan } from '@web/pages/builder/pageTurn';
import { SWIPE_MIN_PX, type PreviewPosition } from '@web/pages/builder/previewPaging';
import { dragAngle, dragKeeps, dragProgress, dragReach, dragTurns, FLICK } from '../src/builder/pageDrag';

const at = (o: Partial<PreviewPosition>): PreviewPosition => ({ view: 'spread', index: 2, total: 40, onCover: false, hasCover: true, ...o });
const forwardSpread = planTurn(at({ index: 1 }), { cover: false, index: 3 })!;

describe('how far the finger takes the page', () => {
  it('the open book: across most of both pages; one page: its width', () => {
    expect(dragReach('spread', 300)).toBe(480);
    expect(dragReach('page', 300)).toBe(300);
  });

  it('forward: right to left; back: left to right; never past either end', () => {
    expect(dragProgress('forward', -240, 480)).toBe(0.5);
    expect(dragProgress('forward', 100, 480)).toBe(0);
    expect(dragProgress('forward', -2000, 480)).toBe(1);
    expect(dragProgress('back', 120, 480)).toBe(0.25);
    expect(dragProgress('back', -50, 480)).toBe(0);
  });

  it('the leaf follows: flat at the start, standing up halfway, over at the end', () => {
    expect(forwardSpread.leaf).toEqual(expect.objectContaining({ from: 0, to: -180 }));
    expect(dragAngle(forwardSpread, 'forward', 0, 480)).toBe(0);
    expect(dragAngle(forwardSpread, 'forward', -240, 480)).toBe(-90);
    expect(dragAngle(forwardSpread, 'forward', -480, 480)).toBe(-180);
    const backSpread = planTurn(at({ index: 3 }), { cover: false, index: 1 })!;
    expect(dragAngle(backSpread, 'back', 120, 480)).toBe(backSpread.leaf.from + (backSpread.leaf.to - backSpread.leaf.from) * 0.25);
  });
});

describe('let go', () => {
  it('after a swipe the right way, past halfway, or on a flick: the page turns', () => {
    expect(dragKeeps('forward', -SWIPE_MIN_PX, 0, 0, 0.1)).toBe(true);
    expect(dragKeeps('forward', -10, 0, 0, 0.5)).toBe(true);
    expect(dragKeeps('forward', -20, 0, -FLICK, 0.04)).toBe(true);
    expect(dragKeeps('back', SWIPE_MIN_PX + 1, 0, 0, 0.1)).toBe(true);
  });

  it('a little move, a mostly up-and-down one, or back the other way: it goes back', () => {
    expect(dragKeeps('forward', -30, 0, -0.1, 0.06)).toBe(false);
    expect(dragKeeps('forward', -60, 200, -0.1, 0.12)).toBe(false);
    expect(dragKeeps('forward', 60, 0, 0.3, 0)).toBe(false);
    expect(dragKeeps('back', -60, 0, -0.3, 0)).toBe(false);
  });
});

describe('which turns a finger takes', () => {
  it('a page of the open book, and one page at a time', () => {
    expect(dragTurns(forwardSpread, false, false)).toBe(true);
    const onePage = planTurn(at({ view: 'page', index: 4 }), { cover: false, index: 5 })!;
    expect(dragTurns(onePage, false, false)).toBe(true);
  });

  it('not the cover: opening or closing the book slides it, so it turns on a swipe', () => {
    const opening = planTurn(at({ index: 0, onCover: true }), { cover: false, index: 0 }) as TurnPlan;
    expect(dragTurns(opening, true, false)).toBe(false);
    expect(dragTurns(forwardSpread, false, true)).toBe(false);
  });
});
