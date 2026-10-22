import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { ALBUM_SIZES, type AlbumSizePreset, type CoverType } from './types';
import { MIN_PAGES } from '../../lib/pricing';
import { bindingEdge } from './binding';
import {
  PRESS_SHEET, BUTTED_SIZES, sheetLayout, sheetPlan, printSides, leavesFor, pagesPerSheetBySize,
  pageSidesFromSheet, coverOnSheet, coverFitsSheet, coverChoiceNote, maxPagesForCover, type Turn,
} from './printSheet';

const SIZES = ALBUM_SIZES.map((s) => s.preset);
const MIGRATION = readFileSync(resolve(__dirname, '../../../supabase/migrations/0046_press_sheet.sql'), 'utf8');
const MIGRATION_6X6 = readFileSync(resolve(__dirname, '../../../supabase/migrations/0050_six_by_six_twelve_a_sheet.sql'), 'utf8');

describe('press sheet layout (owner, 2026-10-11: 12.5 × 19 in, 0.25 in white edge, layout B)', () => {
  it('fits the pages per sheet the owner agreed to', () => {
    expect(pagesPerSheetBySize()).toEqual({
      // 6x6: 12 since the owner's own sheet, 2026-10-22 (pages touching, 6 a side).
      '6x4': 12, '8x6': 6, '6x8': 6, '6x6': 12, '8x8': 4, '9x9': 4, '11.5x8': 4, '8.5x11': 4,
    });
  });

  it('keeps every page and its trim edge inside what the printer can print, with no overlaps', () => {
    const u = PRESS_SHEET.unprintableIn;
    for (const size of SIZES) {
      const L = sheetLayout(size);
      const boxes = L.slots.map((s) => ({
        l: s.x - s.bleed.left, r: s.x + s.w + s.bleed.right,
        t: s.y - s.bleed.top, b: s.y + s.h + s.bleed.bottom,
      }));
      for (const b of boxes) {
        expect(b.l, size).toBeGreaterThanOrEqual(u - 1e-9);
        expect(b.t, size).toBeGreaterThanOrEqual(u - 1e-9);
        expect(b.r, size).toBeLessThanOrEqual(PRESS_SHEET.wIn - u + 1e-9);
        expect(b.b, size).toBeLessThanOrEqual(PRESS_SHEET.hIn - u + 1e-9);
      }
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], c = boxes[j];
          const overlap = a.l < c.r - 1e-9 && c.l < a.r - 1e-9 && a.t < c.b - 1e-9 && c.t < a.b - 1e-9;
          expect(overlap, `${size} slots ${i}/${j}`).toBe(false);
        }
      }
    }
  });

  it('gives every outside edge the full 1/8 in and never less than 1/16 in between pages (butted sizes aside)', () => {
    for (const size of SIZES.filter((s) => !BUTTED_SIZES.includes(s))) {
      const L = sheetLayout(size);
      L.slots.forEach((s, i) => {
        const r = Math.floor(i / L.cols), c = i % L.cols;
        if (r === 0) expect(s.bleed.top).toBe(PRESS_SHEET.bleedIn);
        if (r === L.rows - 1) expect(s.bleed.bottom).toBe(PRESS_SHEET.bleedIn);
        if (c === 0) expect(s.bleed.left).toBe(PRESS_SHEET.bleedIn);
        if (c === L.cols - 1) expect(s.bleed.right).toBe(PRESS_SHEET.bleedIn);
        for (const v of Object.values(s.bleed)) expect(v).toBeGreaterThanOrEqual(PRESS_SHEET.minInnerBleedIn);
      });
    }
  });

  it('only narrows the gap between pages when that fits one more row', () => {
    // 8x8: two rows fit with full edges, so nothing narrows.
    const big = sheetLayout('8x8');
    expect(big.slots.every((s) => Object.values(s.bleed).every((v) => v === PRESS_SHEET.bleedIn))).toBe(true);
    // 6x6: the third row only fits at 1/8 in apart.
    const small = sheetLayout('6x6');
    expect(small.rows).toBe(3);
    expect(small.slots[0].bleed.bottom).toBe(PRESS_SHEET.minInnerBleedIn);
  });

  /* The owner's 6x6 sheet (2026-10-22): two pages across, touching, three
     down. Two 6 in pages are exactly the 12 in the printer prints. */
  it('6x6 goes 2 across with the pages touching, right to the printer\'s edge; down the sheet it keeps its trim edges', () => {
    expect(BUTTED_SIZES).toEqual(['6x6']);
    const L = sheetLayout('6x6');
    expect([L.cols, L.rows, L.leavesPerSheet, L.pagesPerSheet]).toEqual([2, 3, 6, 12]);
    const u = PRESS_SHEET.unprintableIn;
    for (const [i, s] of L.slots.entries()) {
      const c = i % 2;
      expect(s.bleed.left, `slot ${i}`).toBe(0);
      expect(s.bleed.right, `slot ${i}`).toBe(0);
      expect(s.x, `slot ${i}`).toBeCloseTo(c === 0 ? u : u + 6, 9);
    }
    // Rows: 1/8 in outside, 1/16 in where two rows face each other.
    expect(L.slots[0].bleed.top).toBe(PRESS_SHEET.bleedIn);
    expect(L.slots[4].bleed.bottom).toBe(PRESS_SHEET.bleedIn);
    expect(L.slots[0].bleed.bottom).toBe(PRESS_SHEET.minInnerBleedIn);
    expect(L.spareX).toBeCloseTo(0, 9);
    expect(L.cutsX).toEqual([0.25, 6.25, 12.25]);
  });

  it('no other size changes: butting is only for the sizes the owner chose', () => {
    expect(Object.fromEntries(SIZES.filter((s) => s !== '6x6').map((s) => [s, sheetLayout(s).leavesPerSheet]))).toEqual({
      '8x8': 2, '9x9': 2, '6x4': 6, '8x6': 3, '6x8': 3, '11.5x8': 2, '8.5x11': 2,
    });
  });
});

describe('book order on glued single leaves', () => {
  it('matches the builder: page 1 is a RIGHT page, so it is the first leaf\'s front, with no blank before it (owner, 2026-10-21)', () => {
    expect(printSides(40)).toHaveLength(40);
    expect(printSides(40).slice(0, 3)).toEqual([0, 1, 2]);
    expect(printSides(40)).not.toContain(null);
    expect(leavesFor(40)).toBe(20);
    // An odd count leaves the last leaf's back blank, and nothing else.
    expect(printSides(41)).toHaveLength(42);
    expect(printSides(41)[40]).toBe(40);
    expect(printSides(41)[41]).toBeNull();
  });

  it('a print file made before the change (page 1 drawn as a LEFT page) still backs a blank first side', () => {
    expect(printSides(40, 'left')).toHaveLength(42);
    expect(printSides(40, 'left')[0]).toBeNull();
    expect(printSides(40, 'left')[1]).toBe(0);
    expect(printSides(40, 'left')[41]).toBeNull();
    expect(leavesFor(40, 'left')).toBe(21);
    expect(sheetPlan('8x8', 40, 'left').sides[0].placements[0].page).toBeNull();
  });

  it('prints exactly the sheets pricing bills: no blank first side to pay for', () => {
    for (const size of SIZES) {
      const pps = sheetLayout(size).pagesPerSheet;
      for (let pages = 20; pages <= 120; pages++) {
        expect(sheetPlan(size, pages).sheets, `${size} ${pages} pages`).toBe(Math.ceil(pages / pps));
      }
    }
  });

  it('puts every front on a page that binds on its LEFT and every back on one that binds on its RIGHT', () => {
    const sides = printSides(60);
    for (let leaf = 0; leaf < sides.length / 2; leaf++) {
      const front = sides[2 * leaf];
      const back = sides[2 * leaf + 1];
      if (front !== null) expect(bindingEdge(front), `leaf ${leaf} front`).toBe('left');
      if (back !== null) expect(bindingEdge(back), `leaf ${leaf} back`).toBe('right');
    }
  });
});

describe('sheet plan', () => {
  const pageTop: Record<Turn, [number, number]> = { 0: [0, -1], 90: [1, 0], 180: [0, 1], 270: [-1, 0] };

  for (const size of SIZES) {
    it(`${size}: every page prints once, back to back with its partner, in page order`, () => {
      const pages = 57;
      const plan = sheetPlan(size, pages);
      const seen = new Map<number, number>();
      for (const side of plan.sides) for (const p of side.placements) {
        if (p.page !== null) seen.set(p.page, (seen.get(p.page) ?? 0) + 1);
      }
      expect([...seen.keys()].sort((a, b) => a - b)).toEqual(Array.from({ length: pages }, (_, i) => i));
      expect([...seen.values()].every((n) => n === 1)).toBe(true);
      expect(plan.sheets).toBe(Math.ceil(leavesFor(pages) / plan.layout.leavesPerSheet));
      expect(plan.sides).toHaveLength(2 * plan.sheets);

      for (let i = 0; i < plan.sheets; i++) {
        const front = plan.sides[2 * i];
        const back = plan.sides[2 * i + 1];
        expect([front.side, back.side]).toEqual(['front', 'back']);
        front.placements.forEach((f, s) => {
          const b = back.placements[s];
          expect(b.leaf).toBe(f.leaf);
          // Long-edge flip: the back of a spot is its mirror across the sheet.
          expect(b.slot.x).toBeCloseTo(PRESS_SHEET.wIn - f.slot.x - f.slot.w, 9);
          expect(b.slot.y).toBeCloseTo(f.slot.y, 9);
          // Both pages' tops point at the SAME physical edge of the leaf.
          const [fx, fy] = pageTop[f.turn];
          const [bx, by] = pageTop[b.turn];
          expect([0 - bx || 0, by]).toEqual([fx, fy]);
        });
      }

      // Cut each sheet, stack its pieces left to right, top to bottom, sheet 1's
      // on top → leaves in book order.
      const stacked: number[] = [];
      for (let i = 0; i < plan.sheets; i++) {
        for (const p of plan.sides[2 * i].placements) if (p.leaf < plan.leaves) stacked.push(p.leaf);
      }
      expect(stacked).toEqual(Array.from({ length: plan.leaves }, (_, i) => i));
    });
  }

  /* The owner's drawing, 2026-10-22: FRONT 1 3 / 5 7 / 9 11, BACK 4 2 / 8 6 / 12 10. */
  it('6x6, sheet 1: the front is 1 3 / 5 7 / 9 11 and the back 4 2 / 8 6 / 12 10, as the owner drew it', () => {
    const plan = sheetPlan('6x6', 40);
    expect(plan.sheets).toBe(4);
    const grid = (i: number) => {
      const side = plan.sides[i];
      const cells = [...side.placements].sort((a, b) => a.slot.y - b.slot.y || a.slot.x - b.slot.x);
      return cells.map((p) => (p.page === null ? null : p.page + 1));
    };
    expect(grid(0)).toEqual([1, 3, 5, 7, 9, 11]);
    expect(grid(1)).toEqual([4, 2, 8, 6, 12, 10]);
    // Sheet 2 carries on: 13 15 / 17 19 / 21 23.
    expect(grid(2)).toEqual([13, 15, 17, 19, 21, 23]);
    // Sheet 4 holds the last 2 leaves (pages 37–40); its other spots are blank.
    expect(grid(6)).toEqual([37, 39, null, null, null, null]);
  });

  it('turns page edges with the page: a quarter turn puts the page top on the sheet\'s right', () => {
    const sheet = { top: 1, right: 2, bottom: 3, left: 4 };
    expect(pageSidesFromSheet(sheet, 0)).toEqual(sheet);
    expect(pageSidesFromSheet(sheet, 90)).toEqual({ top: 2, right: 3, bottom: 4, left: 1 });
    expect(pageSidesFromSheet(sheet, 270)).toEqual({ top: 4, right: 1, bottom: 2, left: 3 });
  });
});

describe('covers on the sheet', () => {
  const HARD: CoverType = 'hardboundLeather';
  it('cannot fit a 9x9 hardbound cover (≈20.2 in on 19 in paper)', () => {
    const c = coverOnSheet('9x9', HARD, 40);
    expect(c.fits).toBe(false);
    expect(c.reason).toMatch(/longer than the 19 in paper/);
  });

  it('fits the covers the owner sells', () => {
    for (const size of ['6x4', '8x6', '6x8', '6x6', '8x8', '9x9'] as AlbumSizePreset[]) {
      expect(coverFitsSheet(size, 'softcover', 40), `${size} soft`).toBe(true);
    }
    for (const size of ['6x4', '8x6', '6x8', '6x6', '8x8'] as AlbumSizePreset[]) {
      expect(coverFitsSheet(size, HARD, 40), `${size} hard`).toBe(true);
    }
  });

  it('runs out of printable length on a very thick 9x9 softcover (C2S 140 matte: 142 pages fit, 144 do not)', () => {
    expect(coverFitsSheet('9x9', 'softcover', 142)).toBe(true);
    expect(coverFitsSheet('9x9', 'softcover', 144)).toBe(false);
  });

  it('tells checkout, in plain words, why a cover is missing', () => {
    expect(coverChoiceNote('8x8', 40, ['softcover', HARD])).toBeNull();
    expect(coverChoiceNote('9x9', 40, ['softcover'])).toBe('Hardbound is not available for 9×9 albums. The cover is too big for our printer.');
    expect(coverChoiceNote('8x8', 400, ['softcover'])).toBe('Hardbound is not available for an album with 400 pages. The cover is too big for our printer.');
    expect(coverChoiceNote('9x9', 160, [])).toBe('This album has too many pages for our printer. Make it 142 pages or fewer.');
    // Glossy C2S 140 is the thinner sheet: more pages fit under the same cover.
    expect(coverChoiceNote('9x9', 160, [], { material: 'glossy' })).toBe('This album has too many pages for our printer. Make it 158 pages or fewer.');
    expect(coverChoiceNote('11.5x8', 40, [])).toBe('We can\'t print this album size right now.');
  });

  it('finds the most pages a cover can take', () => {
    // The spine may be 3/8" before the 9x9 flat cover outgrows what prints:
    // 71 leaves of C2S 140 matte (0.134 mm), 79 of gloss (0.120 mm).
    expect(maxPagesForCover('9x9', 'softcover', MIN_PAGES)).toBe(142);
    expect(maxPagesForCover('9x9', 'softcover', MIN_PAGES, { material: 'glossy' })).toBe(158);
    expect(maxPagesForCover('9x9', HARD, MIN_PAGES)).toBeNull();
  });

  it('places a fitting cover inside the paper', () => {
    for (const size of SIZES) {
      for (const cover of ['softcover', HARD] as CoverType[]) {
        const c = coverOnSheet(size, cover, 40);
        if (!c.fits) continue;
        expect(c.x).toBeGreaterThanOrEqual(0);
        expect(c.y).toBeGreaterThanOrEqual(0);
        expect(c.x + c.w).toBeLessThanOrEqual(PRESS_SHEET.wIn + 1e-9);
        expect(c.y + c.h).toBeLessThanOrEqual(PRESS_SHEET.hIn + 1e-9);
      }
    }
  });
});

describe('0046_press_sheet.sql (and 0050 for 6x6) stay in step with the press geometry', () => {
  it('sets every changed pps to the layout, and the layout matches the rest', () => {
    const setBy = (sql: string) => Object.fromEntries([...sql.matchAll(/'\{([0-9.x]+),pps\}', '(\d+)'/g)].map((m) => [m[1], Number(m[2])]));
    expect(setBy(MIGRATION_6X6)).toEqual({ '6x6': 12 });
    const set = { ...setBy(MIGRATION), ...setBy(MIGRATION_6X6) };
    const want = pagesPerSheetBySize();
    expect(Object.keys(set).sort()).toEqual(['6x4', '6x6', '6x8', '8x6']);
    for (const [size, pps] of Object.entries(set)) expect(pps, size).toBe(want[size as AlbumSizePreset]);
    // The sizes the migration leaves alone were already right (0024's seed).
    for (const size of ['8x8', '9x9', '11.5x8', '8.5x11'] as AlbumSizePreset[]) expect(want[size]).toBe(4);
  });

  it('refuses exactly the size + cover pairs that never fit', () => {
    const listed = new Set([...MIGRATION.matchAll(/\('([0-9.x]+)', '(soft|hard)'\)/g)].map((m) => `${m[1]}:${m[2]}`));
    const never = new Set<string>();
    for (const size of SIZES) {
      for (const [binding, cover] of [['soft', 'softcover'], ['hard', 'hardboundLeather']] as const) {
        // The spine only grows with pages, so not fitting at the minimum = never.
        if (!coverFitsSheet(size, cover, MIN_PAGES)) never.add(`${size}:${binding}`);
      }
    }
    expect([...listed].sort()).toEqual([...never].sort());
    expect(never.has('9x9:hard')).toBe(true);
  });
});
