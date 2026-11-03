/* ══════════════════════════════════════════════════════════════════════════
   THE PREVIEW LOOKS LIKE A REAL BOOK: THE RULES (src/builder/bookLook.tsx).
   Owner, 2026-11-03: "make the view look like a book effect with edges
   looking like pages and page flips looking realistic".
     • the stack of page edges at a side is thin where few pages are and
       thick where many are, never quite flat, never past PAGE_EDGES_MAX;
     • the open book: the pages read on the left, those to come on the right;
     • one page at a time: its bound side (binding.ts: page 1, 3, 5… bound on
       the left) is the spine, the pages beyond it on the other side;
     • the closed book: just its cover;
     • the room kept around the pages is what the board and the edges take.
   What the screen shows of it: test/previewScreen.test.tsx.
   ══════════════════════════════════════════════════════════════════════════ */
import { bindingEdge } from '@web/pages/builder/binding';
import { bookSides, edgeLines, edgeThickness, TURN_LOOK } from '../src/builder/bookLook';
import { BOARD, BOOK_DRESS_X, BOOK_DRESS_Y, PAGE_EDGES_MAX } from '../src/builder/previewLayout';

describe('the stack of page edges', () => {
  it('thin for few pages, thick for many, never flat, never past its most', () => {
    expect(edgeThickness(0)).toBe(1.5);
    expect(edgeThickness(1)).toBe(PAGE_EDGES_MAX);
    expect(edgeThickness(0.5)).toBeGreaterThan(edgeThickness(0.2));
    expect(edgeThickness(-1)).toBe(1.5);
    expect(edgeThickness(7)).toBe(PAGE_EDGES_MAX);
    expect(edgeThickness(Number.NaN)).toBe(1.5);
  });

  it('a fine line between sheets: one per 1.3 points, at least two', () => {
    expect(edgeLines(1.5)).toBe(2);
    expect(edgeLines(PAGE_EDGES_MAX)).toBe(5);
    expect(edgeLines(13)).toBe(10);
  });

  it('the room around the pages is the stack and the board', () => {
    expect(BOOK_DRESS_X).toBe(PAGE_EDGES_MAX + BOARD);
    expect(BOOK_DRESS_Y).toBeGreaterThan(BOARD);
  });
});

describe('what is beside the pages', () => {
  const total = 40;

  it('the open book: the pages read on the left, the pages to come on the right', () => {
    const first = bookSides({ shows: 'spread', index: 0, start: -1, total });
    expect(first).toEqual({ left: edgeThickness(0), right: edgeThickness(39 / 40), spine: null });
    const middle = bookSides({ shows: 'spread', index: 19, start: 19, total });
    expect(middle.left).toBe(edgeThickness(20 / 40));
    expect(middle.right).toBe(edgeThickness(19 / 40));
    const last = bookSides({ shows: 'spread', index: 39, start: 39, total });
    expect(last.left).toBe(PAGE_EDGES_MAX);
    expect(last.right).toBe(edgeThickness(0));
  });

  it('one page: its bound side is the spine, the pages beyond it on the other side', () => {
    for (const index of [0, 1, 12, 13, 39]) {
      const s = bookSides({ shows: 'page', index, start: 0, total });
      expect(s.spine).toBe(bindingEdge(index));
      if (s.spine === 'left') expect(s).toEqual({ left: null, right: edgeThickness((total - index - 1) / total), spine: 'left' });
      else expect(s).toEqual({ left: edgeThickness(index / total), right: null, spine: 'right' });
    }
  });

  it('the closed book: just its cover', () => {
    expect(bookSides({ shows: 'closed', index: 0, start: -1, total })).toEqual({ left: null, right: null, spine: null });
  });
});

describe('the page turn\'s look', () => {
  it('its free edge followed from lying right (0°) to lying left (-180°), every 15°', () => {
    expect(TURN_LOOK.angles[0]).toBe(-180);
    expect(TURN_LOOK.angles[TURN_LOOK.angles.length - 1]).toBe(0);
    expect(TURN_LOOK.angles).toHaveLength(13);
  });

  it('the leaf bends darker at the spine, its two sides mirrored; its shadow fades away from its edge', () => {
    expect(TURN_LOOK.leafFront).toMatch(/^linear-gradient\(90deg, rgba\(60, 38, 20, 0\.28\) 0%/);
    expect(TURN_LOOK.leafBack).toBe(TURN_LOOK.leafFront.replace('90deg', '270deg'));
    expect(TURN_LOOK.castLeft).toBe(TURN_LOOK.castRight.replace('90deg', '270deg'));
    expect(TURN_LOOK.band).toBeGreaterThan(0);
    expect(TURN_LOOK.band).toBeLessThan(0.5);
  });
});
