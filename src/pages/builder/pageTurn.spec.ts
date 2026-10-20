import { describe, it, expect } from 'vitest';
import { planTurn } from './pageTurn';
import { turnBack, turnForward, type PreviewPosition } from './previewPaging';

/* The page turn (owner, 2026-10-09: "I don't feel the page turning action").
   What each turn shows while it plays: the leaf in flight, the old page kept
   on the side the leaf hasn't reached, and the book sliding to the middle
   when it opens or closes. */

const at = (view: 'spread' | 'page', index: number, onCover = false): PreviewPosition => ({ view, index, total: 40, onCover, hasCover: true });

describe('the open book (desktop, a phone turned sideways)', () => {
  it('Next: the right page lifts and lands on the left, showing the next left page; the old left page stays until it lands', () => {
    const p = at('spread', 3); // pages 4–5
    const plan = planTurn(p, turnForward(p)!)!;
    expect(plan.layout).toBe('spread');
    expect(plan.leaf).toEqual({ front: { kind: 'page', index: 4 }, back: { kind: 'page', index: 5 }, from: 0, to: -180 });
    expect(plan.patch).toEqual({ side: 'left', face: { kind: 'page', index: 3 } });
    expect(plan.cast).toBe('right');
  });

  it('Previous: the left page lifts and lands on the right, showing the previous right page', () => {
    const p = at('spread', 5); // pages 6–7
    const plan = planTurn(p, turnBack(p)!)!;
    expect(plan.leaf).toEqual({ front: { kind: 'page', index: 4 }, back: { kind: 'page', index: 5 }, from: -180, to: 0 });
    expect(plan.patch).toEqual({ side: 'right', face: { kind: 'page', index: 6 } });
    expect(plan.cast).toBe('left');
  });

  it('opening the cover swings it to the left, its inside up across from page 1, and the book slides from closed-in-the-middle to open', () => {
    const p = at('spread', 0, true);
    const plan = planTurn(p, turnForward(p)!)!;
    expect(plan).toMatchObject({ layout: 'spread', hideLeft: true, shift: [-0.5, 0], leaf: { front: { kind: 'cover' }, back: { kind: 'inside', cover: 'front' }, from: 0, to: -180 } });
  });

  it('closing it swings the cover back over page 1 and slides the closed book to the middle', () => {
    const p = at('spread', 0);
    const plan = planTurn(p, turnBack(p)!)!;
    expect(plan).toMatchObject({ layout: 'closed', shift: [0.5, 0], leaf: { front: { kind: 'cover' }, back: { kind: 'inside', cover: 'front' }, from: -180, to: 0 }, patch: { side: 'right', face: { kind: 'page', index: 0 } } });
  });

  it('the last page on its own (an even album): across from it is the inside of the back cover', () => {
    const p = at('spread', 37); // pages 38–39
    const plan = planTurn(p, turnForward(p)!)!;
    expect(plan.leaf).toMatchObject({ front: { kind: 'page', index: 38 }, back: { kind: 'page', index: 39 } });
    const back = planTurn(at('spread', 39), turnBack(at('spread', 39))!)!;
    expect(back.patch).toEqual({ side: 'right', face: { kind: 'inside', cover: 'back' } });
  });

  it('nothing turns within the same open book', () => {
    expect(planTurn(at('spread', 1), { cover: false, index: 2 })).toBeNull();
  });
});

describe('one page at a time (an upright phone)', () => {
  it('Next lifts this page off to the left; the next page is already under it', () => {
    const p = at('page', 6);
    const plan = planTurn(p, turnForward(p)!)!;
    expect(plan).toMatchObject({ layout: 'page', leaf: { front: { kind: 'page', index: 6 }, back: null, from: 0, to: -100 }, patch: null });
  });

  it('Previous lays the previous page down over this one', () => {
    const p = at('page', 6);
    const plan = planTurn(p, turnBack(p)!)!;
    expect(plan).toMatchObject({ leaf: { front: { kind: 'page', index: 5 }, from: -100, to: 0 }, patch: { side: 'right', face: { kind: 'page', index: 6 } } });
  });

  it('the cover lifts off page 1, and comes back down over it', () => {
    const open = planTurn(at('page', 0, true), { cover: false, index: 0 })!;
    expect(open).toMatchObject({ layout: 'page', leaf: { front: { kind: 'cover' }, from: 0, to: -100 } });
    const close = planTurn(at('page', 0), { cover: true })!;
    expect(close).toMatchObject({ layout: 'closed', leaf: { front: { kind: 'cover' }, from: -100, to: 0 }, patch: { side: 'right', face: { kind: 'page', index: 0 } } });
  });
});
