import { describe, it, expect } from 'vitest';
import { atAlbumEnd, canTurnBack, canTurnForward, previewCaption, previewCounter, spreadStart, swipeTurn, turnBack, turnForward, type PreviewPosition } from './previewPaging';

/* ══════════════════════════════════════════════════════════════════════════
   Where the book preview's page turns go: one page at a time (an upright
   phone) or the open book, with the front cover before page 1.
   ══════════════════════════════════════════════════════════════════════════ */

const at = (over: Partial<PreviewPosition>): PreviewPosition => ({ view: 'page', index: 0, total: 40, onCover: false, hasCover: true, ...over });

describe('one page at a time (an upright phone)', () => {
  it('the cover, then page 1, 2, 3 … one by one, and back', () => {
    expect(turnForward(at({ onCover: true }))).toEqual({ cover: false, index: 0 });
    expect(turnForward(at({ index: 0 }))).toEqual({ cover: false, index: 1 });
    expect(turnForward(at({ index: 1 }))).toEqual({ cover: false, index: 2 });
    expect(turnBack(at({ index: 2 }))).toEqual({ cover: false, index: 1 });
    expect(turnBack(at({ index: 1 }))).toEqual({ cover: false, index: 0 });
    expect(turnBack(at({ index: 0 }))).toEqual({ cover: true });
  });
  it('nothing before the cover; no cover, nothing before page 1', () => {
    expect(canTurnBack(at({ onCover: true }))).toBe(false);
    expect(turnBack(at({ onCover: true }))).toBeNull();
    expect(canTurnBack(at({ index: 0, hasCover: false }))).toBe(false);
  });
  it('the last page: nothing forward, and that is the album\'s end', () => {
    expect(canTurnForward(at({ index: 39 }))).toBe(false);
    expect(turnForward(at({ index: 39 }))).toBeNull();
    expect(atAlbumEnd(at({ index: 39 }))).toBe(true);
    expect(atAlbumEnd(at({ index: 38 }))).toBe(false);
    expect(atAlbumEnd(at({ index: 39, onCover: true }))).toBe(false);
  });
  it('says the page, not a pair', () => {
    expect(previewCaption(at({ index: 2 }))).toBe('Page 3 of 40');
    expect(previewCounter(at({ index: 2 }))).toBe('3 / 40');
    expect(previewCaption(at({ onCover: true }))).toBe('Front cover');
    expect(previewCounter(at({ onCover: true }))).toBe('Cover');
  });
});

describe('the open book (as before: two pages a turn)', () => {
  const book = (over: Partial<PreviewPosition>) => at({ view: 'spread', ...over });
  it('pages pair 1–2, 3–4, …', () => {
    expect([0, 1, 2, 3, 38, 39].map(spreadStart)).toEqual([0, 0, 2, 2, 38, 38]);
    expect(previewCaption(book({ index: 3 }))).toBe('Pages 3–4 of 40');
    expect(previewCounter(book({ index: 3 }))).toBe('3-4 / 40');
  });
  it('two pages a turn, the cover before pages 1–2', () => {
    expect(turnForward(book({ index: 0 }))).toEqual({ cover: false, index: 2 });
    expect(turnBack(book({ index: 2 }))).toEqual({ cover: false, index: 0 });
    expect(turnBack(book({ index: 1 }))).toEqual({ cover: true });
  });
  it('an odd last page stands alone', () => {
    expect(previewCaption(book({ index: 40, total: 41 }))).toBe('Page 41 of 41');
    expect(atAlbumEnd(book({ index: 38 }))).toBe(true);
  });
});

describe('a swipe across the page', () => {
  it('right to left turns forward, left to right back, like a book', () => {
    expect(swipeTurn(-120, 10)).toBe('forward');
    expect(swipeTurn(120, -10)).toBe('back');
  });
  it('a tap, a small slip or scrolling up and down is not a turn', () => {
    expect(swipeTurn(10, 2)).toBeNull();
    expect(swipeTurn(-40, 0)).toBeNull();
    expect(swipeTurn(-80, 120)).toBeNull();
  });
});
