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
const MIGRATION_TOUCHING = readFileSync(resolve(__dirname, '../../../supabase/migrations/0052_pages_touching_every_size.sql'), 'utf8');

describe('press sheet layout (owner, 2026-10-11: 12.5 × 19 in, 0.25 in white edge, layout B)', () => {
  it('fits the pages per sheet the owner agreed to', () => {
    expect(pagesPerSheetBySize()).toEqual({
      // Pages touching across the sheet: 6x6 since the owner's own sheet
      // (2026-10-22), every size since 2026-10-23 (6x4 18 was 12, 6x8 / 8x6 8 were 6).
      '6x4': 18, '8x6': 8, '6x8': 8, '6x6': 12, '8x8': 4, '9x9': 4, '11.5x8': 4, '8.5x11': 4,
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
    expect(BUTTED_SIZES).toContain('6x6');
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

  /* "And how it has to be applied to other album sizes too" (owner, 2026-10-23):
     pages touch wherever that fits one more column. Rows never gain. */
  it('every size: pages touch across the sheet only where that fits one more column', () => {
    expect([...BUTTED_SIZES].sort()).toEqual([...SIZES].sort());
    const shape = (s: AlbumSizePreset) => { const L = sheetLayout(s); return `${L.cols}x${L.rows}${L.rotated ? ' turned' : ''}`; };
    expect(Object.fromEntries(SIZES.map((s) => [s, shape(s)]))).toEqual({
      '6x6': '2x3', '6x4': '3x3 turned', '6x8': '2x2', '8x6': '2x2 turned',
      '8x8': '1x2', '9x9': '1x2', '11.5x8': '1x2', '8.5x11': '1x2 turned',
    });
    const u = PRESS_SHEET.unprintableIn;
    for (const size of ['6x4', '6x8', '8x6'] as AlbumSizePreset[]) {
      const L = sheetLayout(size);
      // Across: touching, the outside cuts right at the printer's edge.
      expect(L.spareX, size).toBeCloseTo(0, 9);
      expect(L.cutsX[0], size).toBeCloseTo(u, 9);
      expect(L.cutsX.at(-1)!, size).toBeCloseTo(PRESS_SHEET.wIn - u, 9);
      for (const s of L.slots) expect([s.bleed.left, s.bleed.right], size).toEqual([0, 0]);
      // Down: trim edges kept.
      expect(L.slots[0].bleed.top, size).toBe(PRESS_SHEET.bleedIn);
      expect(L.slots.at(-1)!.bleed.bottom, size).toBe(PRESS_SHEET.bleedIn);
    }
    // The sizes that gain nothing keep a full trim edge all round.
    for (const size of ['8x8', '9x9', '11.5x8', '8.5x11'] as AlbumSizePreset[]) {
      for (const s of sheetLayout(size).slots) for (const v of Object.values(s.bleed)) expect(v, size).toBe(PRESS_SHEET.bleedIn);
    }
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
    it(`${size}: every page prints once, back to back with its partner, in cut-and-stack order`, () => {
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

      // Cut the whole stack (sheet 1 on top) at once: spot s is a pile, sheets
      // in order; pile 1 on pile 2 on pile 3 … → leaves in book order.
      const stacked: number[] = [];
      for (let s = 0; s < plan.layout.leavesPerSheet; s++) {
        for (let i = 0; i < plan.sheets; i++) {
          const p = plan.sides[2 * i].placements[s];
          if (p.leaf < plan.leaves) stacked.push(p.leaf);
        }
      }
      expect(stacked).toEqual(Array.from({ length: plan.leaves }, (_, i) => i));
    });
  }

  /* The shop's way, via the owner, 2026-10-24: "11 sheets of 12.5x19, 132
     pages: page 1, and behind it it runs on to page 22; once it's cut, put it
     on the one to its right, page 23, which runs on to 44; once that's cut,
     put it on page 45, and so on". His sheet: FRONT 1 23 / 45 67 / 89 111,
     BACK 24 2 / 68 46 / 112 90. */
  const grid = (plan: ReturnType<typeof sheetPlan>, i: number) => [...plan.sides[i].placements]
    .sort((a, b) => a.slot.y - b.slot.y || a.slot.x - b.slot.x)
    .map((p) => (p.page === null ? null : p.page + 1));
  it('6x6, 132 pages on 11 sheets: sheet 1 is 1 23 / 45 67 / 89 111, its back 24 2 / 68 46 / 112 90, as the shop drew it', () => {
    const plan = sheetPlan('6x6', 132);
    expect(plan.sheets).toBe(11);
    expect(grid(plan, 0)).toEqual([1, 23, 45, 67, 89, 111]);
    expect(grid(plan, 1)).toEqual([24, 2, 68, 46, 112, 90]);
    expect(grid(plan, 2)).toEqual([3, 25, 47, 69, 91, 113]);
    expect(grid(plan, 20)).toEqual([21, 43, 65, 87, 109, 131]);
    // Each spot, down the 11 sheets, is one pile: top left 1–22, top right 23–44 …
    const pile = (s: number) => plan.sides.filter((side) => side.side === 'front').flatMap((side) => {
      const p = side.placements[s];
      return p.page === null ? [] : [p.page + 1, p.page + 2];
    });
    expect(pile(0)).toEqual(Array.from({ length: 22 }, (_, i) => i + 1));
    expect(pile(1)).toEqual(Array.from({ length: 22 }, (_, i) => i + 23));
    expect(pile(5)).toEqual(Array.from({ length: 22 }, (_, i) => i + 111));
  });

  it('6x6, 130 pages (MP-2026-KGCFSQN): the same sheet 1; the last pile ends at 130 with one spot blank', () => {
    const plan = sheetPlan('6x6', 130);
    expect(plan.sheets).toBe(11);
    expect(grid(plan, 0)).toEqual([1, 23, 45, 67, 89, 111]);
    expect(grid(plan, 20)).toEqual([21, 43, 65, 87, 109, null]);
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

describe('0046_press_sheet.sql (then 0050 for 6x6, 0052 for the rest) stay in step with the press geometry', () => {
  it('sets every changed pps to the layout, and the layout matches the rest', () => {
    const setBy = (sql: string) => Object.fromEntries([...sql.matchAll(/'\{([0-9.x]+),pps\}', '(\d+)'/g)].map((m) => [m[1], Number(m[2])]));
    expect(setBy(MIGRATION_6X6)).toEqual({ '6x6': 12 });
    expect(setBy(MIGRATION_TOUCHING)).toEqual({ '6x4': 18, '6x8': 8, '8x6': 8 });
    const set = { ...setBy(MIGRATION), ...setBy(MIGRATION_6X6), ...setBy(MIGRATION_TOUCHING) };
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
