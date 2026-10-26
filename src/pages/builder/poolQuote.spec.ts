import { describe, it, expect } from 'vitest';
import { isPoolQuote } from './types';

/* Tapping a quote that is already on the page re-opens the quote pool, not
   the typing editor (owner, 2026-10-20). isPoolQuote decides which. */
describe('isPoolQuote — which editor a tap on a filled line opens', () => {
  it('a line the pool put there (dealt or picked) re-opens the pool', () => {
    expect(isPoolQuote({ quote: true, italic: true }, 'quote')).toBe(true);
    expect(isPoolQuote({ quote: true, italic: false }, 'text')).toBe(true);
    expect(isPoolQuote({ quote: true }, null)).toBe(true);
  });

  it('a line the customer typed opens the typing editor', () => {
    expect(isPoolQuote({ quote: false, italic: true }, 'quote')).toBe(false);
    expect(isPoolQuote({ italic: false }, 'text')).toBe(false);
    expect(isPoolQuote({ italic: false }, null)).toBe(false);
  });

  it('old albums (no flag): the italic line in a quote-dealt box is the dealt quote', () => {
    expect(isPoolQuote({ italic: true }, 'quote')).toBe(true);
    // ⋯ → Your Text into a quote-dealt box is upright by default: typing editor.
    expect(isPoolQuote({ italic: false }, 'quote')).toBe(false);
    // An italic caption in a text-dealt box is the customer's.
    expect(isPoolQuote({ italic: true }, 'text')).toBe(false);
  });

  it('an empty box is never a pool quote', () => {
    expect(isPoolQuote(null, 'quote')).toBe(false);
    expect(isPoolQuote(undefined, 'quote')).toBe(false);
  });
});
