import { describe, it, expect } from 'vitest';
import {
  LEGACY_LEAF_IN, PRINTER_SPEC, coverWrapGeometry, leafInches, spineForLeaf, spineFromWrapWidth, spineLabel, spineLeaves, spineWidthInches,
} from './coverGeometry';
import { ALBUM_SIZES, COVERS } from './types';
import { MIN_PAGES } from '../../lib/pricing';

/* ══════════════════════════════════════════════════════════════════════════
   THE SPINE IS THE PAPER, STACKED (owner, 2026-10-22: "masmaganda kung kaya
   nya macompute kung gano kalaki yung spine (ibig sabihin yung kapal ng
   pinagsama samang papel)"; "the paper to be used is C2S140"; then 2026-10-24:
   "our standard paper would be c2s 120").

   One leaf = two pages. Its thickness is C2S 120's, by the finish the
   customer picked: matte 0.115 mm, gloss 0.103 mm (the C2S 140 sheet's
   0.134 / 0.120 mm at 120 gsm). Before that it was C2S 140, and before that
   a 0.006" (0.15 mm) guess for a 170 gsm stock.
   ══════════════════════════════════════════════════════════════════════════ */

const mm = (inches: number) => inches * 25.4;

describe('C2S 120', () => {
  it('one leaf: matte 0.115 mm, gloss 0.103 mm; any other finish counts as matte', () => {
    expect(PRINTER_SPEC.paperName).toBe('C2S 120');
    expect(mm(leafInches('matte'))).toBeCloseTo(0.115, 9);
    expect(mm(leafInches('glossy'))).toBeCloseTo(0.103, 9);
    expect(leafInches()).toBe(leafInches('matte'));
    for (const other of ['semigloss', 'pearl', 'linen'] as const) expect(leafInches(other)).toBe(leafInches('matte'));
  });

  it('leaves = pages ÷ 2, rounded up, never under the 40-page floor', () => {
    expect(spineLeaves(40)).toBe(20);
    expect(spineLeaves(45)).toBe(23);
    expect(spineLeaves(10)).toBe(MIN_PAGES / 2);
  });

  it('a softcover spine is the leaves stacked: 40 pages matte 2.30 mm, gloss 2.06 mm; 100 pages matte 5.75 mm', () => {
    expect(mm(spineWidthInches(40, 'softcover', 'matte'))).toBeCloseTo(2.3, 9);
    expect(mm(spineWidthInches(40, 'softcover', 'glossy'))).toBeCloseTo(2.06, 9);
    expect(mm(spineWidthInches(100, 'softcover', 'matte'))).toBeCloseTo(5.75, 9);
    // No finish given = matte.
    expect(spineWidthInches(100, 'softcover')).toBe(spineWidthInches(100, 'softcover', 'matte'));
  });

  it('a hardcover adds its two boards', () => {
    for (const material of ['matte', 'glossy'] as const) {
      expect(spineWidthInches(60, 'hardboundLeather', material))
        .toBeCloseTo(spineWidthInches(60, 'softcover', material) + 2 * PRINTER_SPEC.boardThicknessIn, 9);
    }
  });

  it('thinner than the old 0.15 mm guess, so the flat cover is narrower', () => {
    const now = coverWrapGeometry('8x8', 80, 'softcover', { material: 'matte' });
    const before = coverWrapGeometry('8x8', 80, 'softcover', { spineIn: spineForLeaf(80, 'softcover', LEGACY_LEAF_IN) });
    expect(mm(before.spineIn - now.spineIn)).toBeCloseTo(40 * (0.1524 - 0.115), 6);
    expect(now.wrap.wIn).toBeLessThan(before.wrap.wIn);
    // The fold lines sit on the spine's two edges.
    expect((now.foldXPx[1] - now.foldXPx[0]) / now.dpi).toBeCloseTo(now.spineIn, 2);
  });

  it('the spine read back from a cover file\'s width is the spine it was drawn with, every size and cover', () => {
    for (const { preset } of ALBUM_SIZES) {
      for (const { type } of COVERS) {
        for (const material of ['matte', 'glossy'] as const) {
          const g = coverWrapGeometry(preset, 64, type, { material });
          expect(spineFromWrapWidth(preset, type, g.wrap.wIn), `${preset} ${type} ${material}`).toBeCloseTo(g.spineIn, 9);
        }
      }
    }
  });

  it('a spine given outright (read from a file) is the one used', () => {
    const g = coverWrapGeometry('6x6', 40, 'softcover', { spineIn: 0.2 });
    expect(g.spineIn).toBe(0.2);
    expect(g.wrap.wIn).toBeCloseTo(2 * 0.125 + 2 * 6 + 0.2, 9);
  });

  it('says it in mm and inches', () => {
    expect(spineLabel(spineWidthInches(40, 'softcover', 'matte'))).toBe('2.3 mm (0.09 in)');
    expect(spineLabel(spineWidthInches(45, 'softcover', 'glossy'))).toBe('2.4 mm (0.09 in)');
  });

  it('thinner than C2S 140: a 100-page matte book stacks about 1 mm less, so its folds move in about 0.5 mm each', () => {
    const now = spineWidthInches(100, 'softcover', 'matte');
    const on140 = spineForLeaf(100, 'softcover', 0.134 / 25.4);
    expect(mm(on140 - now)).toBeCloseTo(50 * (0.134 - 0.115), 9);
    expect(mm(on140 - now)).toBeGreaterThan(0.9);
  });
});
