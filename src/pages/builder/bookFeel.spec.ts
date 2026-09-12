import { describe, it, expect } from 'vitest';
import { BOOK } from './bookFeel';

/* The preview's open-book look (owner, 2026-09-13: "it looks so flat"). These
   pin the contract: every layer is decoration that can never catch a tap, the
   cover lip scales with the spread, and the gutter is centred on the spine. */
describe('preview book layers', () => {
  it('overlays never take a tap', () => {
    for (const st of [BOOK.vignette(1), BOOK.grain, BOOK.gutter, BOOK.edgeShade('right'), BOOK.edges(1000, 625, 1)]) {
      expect(st.pointerEvents).toBe('none');
    }
  });
  it('the cover lip scales with the spread and never vanishes when the preview shrinks', () => {
    const big = BOOK.cover(1000, 625, 1);
    const small = BOOK.cover(300, 187, 0.3);
    expect(big.padding).toBe(11);
    expect(small.padding).toBe(5);
    expect(big.width).toBe(1000 + 22);
    expect(small.width).toBe(300 + 10);
  });
  it('the gutter is symmetric about the spine (50%)', () => {
    const bg = String(BOOK.gutter.background);
    expect(bg).toContain('rgba(0,0,0,0.34) 50%');
    expect(bg).toContain('49.75%');
    expect(bg).toContain('50.25%');
  });
  it('the page-edge stack steps out on both outer sides', () => {
    const sh = String(BOOK.edges(1000, 625, 1).boxShadow);
    expect(sh).toContain('2px 2px 0');
    expect(sh).toContain('-2px 2px 0');
  });
});
