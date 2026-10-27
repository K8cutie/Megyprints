import { describe, it, expect } from 'vitest';
import { clean } from './_quoteFilter.mjs';

/* The caption-line filter (moved out of the deleted /api/theme-quotes). Same
   cases as that endpoint's spec had for it. */

describe('clean', () => {
  it('drops held lines (case/punctuation-insensitive), duplicates, unsafe and over-long lines, and caps at count', () => {
    const out = clean(
      ['Two hearts, one journey', 'two hearts one journey!', 'Fresh as morning', 'Fresh as morning',
       'Love is patient — Paul', 'x'.repeat(60), 'ok', 'Another good line', 'Yet another line'],
      { count: 2, avoid: ['TWO HEARTS, ONE JOURNEY'] },
    );
    expect(out).toEqual(['Fresh as morning', 'Another good line']);
  });
});

describe('clean: max (photo-quotes passes the room of its box)', () => {
  it('keeps the caption cap by default, and a longer max when given', () => {
    const long = 'The lights came on after dark, and the whole night glowed with color'; // 68
    expect(clean([long], { count: 5 })).toEqual([]);
    expect(clean([long], { count: 5, max: 100 })).toEqual([long]);
  });
});
