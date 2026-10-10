import { describe, it, expect } from 'vitest';
import { LOOKS, lookCss, applyLookToPixel, isLookId, lookOps } from './looks';

/* STUDIO looks (owner, 2026-09-13): one definition, CSS for the DOM, the
   spec's own matrices for pixels — so the editor and the print match the DOM. */
describe('looks', () => {
  it('four looks, each a CSS filter string built from the same ops the pixel path uses', () => {
    expect(LOOKS.map((l) => l.id)).toEqual(['bw', 'sepia', 'faded', 'warm']);
    expect(lookCss('bw')).toBe('grayscale(1) contrast(1.06)');
    expect(lookCss(null)).toBe('');
    expect(isLookId('bw')).toBe(true);
    expect(isLookId('vivid')).toBe(false);
  });
  it('grayscale(1) turns pure red into its CSS luma (54) on every channel', () => {
    const [r, g, b] = applyLookToPixel(255, 0, 0, [{ fn: 'grayscale', v: 1 }]);
    expect(r).toBe(g); expect(g).toBe(b);
    expect(r).toBe(Math.round(0.2126 * 255));
  });
  it('sepia(1) maps white to the CSS sepia white (255, 255, 239)', () => {
    expect(applyLookToPixel(255, 255, 255, [{ fn: 'sepia', v: 1 }])).toEqual([255, 255, 239]);
  });
  it('saturate(0) equals grayscale by luma weights; brightness and contrast are linear', () => {
    const [r] = applyLookToPixel(255, 0, 0, [{ fn: 'saturate', v: 0 }]);
    expect(r).toBe(Math.round(0.213 * 255));
    expect(applyLookToPixel(100, 100, 100, [{ fn: 'brightness', v: 1.5 }])).toEqual([150, 150, 150]);
    expect(applyLookToPixel(100, 100, 100, [{ fn: 'contrast', v: 2 }])).toEqual([73, 73, 73]);
  });
  it('the ops are applied in order and clamp', () => {
    expect(applyLookToPixel(250, 250, 250, [{ fn: 'brightness', v: 2 }])).toEqual([255, 255, 255]);
    expect(lookOps('faded').map((o) => o.fn)).toEqual(['sepia', 'saturate', 'contrast', 'brightness']);
  });
});
