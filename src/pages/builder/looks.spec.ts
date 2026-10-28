import { describe, it, expect } from 'vitest';
import { LOOKS, lookCss, applyLookToPixel, applyLookToPixels, isLookId, lookOps } from './looks';

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

/* The 2.0 app runs a look over a whole photo with applyLookToPixels (the
   same arithmetic, matrices built once): it must give applyLookToPixel's
   numbers exactly, for every look. */
describe('a look over a whole photo (the 2.0 app), number for number', () => {
  it.each(LOOKS.map((l) => l.id))('%s', (id) => {
    const ops = lookOps(id);
    // Every 5th level on each channel, the two ends and their neighbours.
    const levels = [...Array.from({ length: 52 }, (_, i) => i * 5), 1, 254, 255];
    const px = new Uint8Array(levels.length ** 3 * 4);
    let k = 0;
    for (const r of levels) for (const g of levels) for (const b of levels) { px[k] = r; px[k + 1] = g; px[k + 2] = b; px[k + 3] = 255; k += 4; }
    const want = new Uint8Array(px);
    for (let i = 0; i < want.length; i += 4) {
      const [r, g, b] = applyLookToPixel(want[i], want[i + 1], want[i + 2], ops);
      want[i] = r; want[i + 1] = g; want[i + 2] = b;
    }
    applyLookToPixels(px, ops);
    // Counted by hand: toEqual on ~600 KB of bytes is slow enough to time out.
    let differ = 0;
    for (let i = 0; i < px.length; i++) if (px[i] !== want[i]) differ++;
    expect(differ).toBe(0);
  }, 30_000);
  it('leaves see-through pixels alone, as applyLookPixels does', () => {
    const px = new Uint8Array([200, 100, 50, 0, 200, 100, 50, 255]);
    applyLookToPixels(px, lookOps('sepia'));
    expect(Array.from(px.slice(0, 4))).toEqual([200, 100, 50, 0]);
    expect(Array.from(px.slice(4, 7))).toEqual(applyLookToPixel(200, 100, 50, lookOps('sepia')));
  });
});
