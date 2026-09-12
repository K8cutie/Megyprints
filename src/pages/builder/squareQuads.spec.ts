import { describe, it, expect } from 'vitest';
import { getTemplatesForAlbum } from './pageTemplates';
import { DENSITY_BY_SIZE } from './densities';
import { ALBUM_INCHES, MIN_FRAME_INCHES } from './templateKit';
import { BINDING_INCHES } from './binding';
import { detectOverlaps } from './templateValidation';
import { generateAlbum, dealAlbumBoxes, sweepFillQuotes, pageSpeaks, QUOTE_CADENCE, type BoxContentOptions } from './generateAlbum';
import type { AlbumSizePreset, UploadedPhoto, AlbumPage } from './types';

/* ══════════════════════════════════════════════════════════════════════════
   4-PHOTO PAGES FOR THE SQUARE ALBUMS + THE QUOTE CADENCE (owner, 2026-09-12).
   "Quotes on every page are tiring — the customer will think they're fillers
   to inflate the page count." Two locks: the squares now have box-free 4-up
   layouts that clear the 2" print floor, and a dealt quote never lands twice
   on a page or on two pages in a row — at generation AND in the sweep.
   ══════════════════════════════════════════════════════════════════════════ */

const SQUARES: AlbumSizePreset[] = ['6x6', '8x8', '9x9'];
const prefix: Record<string, string> = { '6x6': 't66', '8x8': 't88', '9x9': 't99' };

describe('square 4-up layouts', () => {
  for (const size of SQUARES) {
    const deck = getTemplatesForAlbum(size);
    const quads = deck.filter((t) => t.slotCount === 4);
    const { w, h } = ALBUM_INCHES[size];

    it(`${size}: offers a box-free 2×2 grid of exact squares`, () => {
      const grid = deck.find((t) => t.id === `${prefix[size]}-fb-quad-grid-gap`);
      expect(grid, 'grid missing').toBeDefined();
      expect(grid!.slots.length).toBe(4);
      expect(grid!.textSlots ?? []).toHaveLength(0);
      for (const s of grid!.slots) expect(s.ratio ?? grid!.targetRatio).toBe('1:1');
    });

    it(`${size}: every 4-up slot clears the 2" print floor, even the column beside the spine`, () => {
      expect(quads.length).toBeGreaterThan(0);
      for (const t of quads) for (const s of t.slots) {
        const wIn = s.width * w, hIn = s.height * h;
        expect(Math.min(wIn, hIn), `${t.id} slot short side`).toBeGreaterThanOrEqual(MIN_FRAME_INCHES - 1e-6);
        // The inner edge loses the spine reserve; a slot touching it must still print.
        if (s.x <= 0.001) expect(wIn - BINDING_INCHES * (s.width >= 0.999 ? 0 : 1) + 1e-9, `${t.id} inner-edge slot`).toBeGreaterThan(MIN_FRAME_INCHES - 0.5 - 1e-6);
      }
    });

    it(`${size}: 4-up slots never overlap and stay inside the page`, () => {
      for (const t of quads) {
        expect(detectOverlaps(t.slots), `${t.id} overlaps`).toHaveLength(0);
        for (const s of t.slots) {
          expect(s.x).toBeGreaterThanOrEqual(-1e-9); expect(s.y).toBeGreaterThanOrEqual(-1e-9);
          expect(s.x + s.width).toBeLessThanOrEqual(1 + 1e-9); expect(s.y + s.height).toBeLessThanOrEqual(1 + 1e-9);
        }
      }
    });

    it(`${size}: the density picker's max equals the deck's densest layout (lockstep)`, () => {
      const deckMax = Math.max(...deck.map((t) => t.slotCount));
      expect(Math.max(...DENSITY_BY_SIZE[size])).toBe(deckMax);
      expect(deckMax).toBe(4);
    });
  }

  it('hero + three exists on 8x8 and 9x9, not on 6x6 (its 1/3 cell is 1.83" beside the spine)', () => {
    expect(getTemplatesForAlbum('6x6').some((t) => t.id.includes('quad-hero'))).toBe(false);
    for (const size of ['8x8', '9x9'] as AlbumSizePreset[]) {
      const heroes = getTemplatesForAlbum(size).filter((t) => t.id.includes('quad-hero'));
      expect(heroes.map((t) => t.id).sort()).toEqual(['bottom', 'left', 'right', 'top'].map((v) => `${prefix[size]}-fb-quad-hero-${v}-gap`).sort());
      for (const t of heroes) {
        const hero = t.slots[0];
        expect(hero.ratio ?? t.targetRatio).toBe(t.targetRatio);
        for (const s of t.slots.slice(1)) expect(s.ratio).toBe('1:1');
      }
    }
  });

  it('an 8x8 album at density 4 actually deals 4-photo pages', () => {
    const photos: UploadedPhoto[] = Array.from({ length: 160 }, (_, i) =>
      ({ id: `s${i}`, previewUrl: '', name: `s${i}.jpg`, type: 'image/jpeg', size: 1, width: 3000, height: 3000, capturedAt: i }));
    const pages = generateAlbum(photos, '8x8', 4);
    const fours = pages.filter((p) => (p.slotFills ?? []).filter((f) => f != null).length === 4);
    expect(fours.length).toBeGreaterThan(10);
    const placed = new Set(pages.flatMap((p) => (p.slotFills ?? []).filter((f): f is number => f != null)));
    expect(placed.size).toBe(160);
  });
});

/* ── Quote cadence ─────────────────────────────────────────────────────── */
const mixed = (n: number): UploadedPhoto[] => Array.from({ length: n }, (_, i) => {
  const portrait = i % 5 >= 3;
  return { id: `p${i}`, previewUrl: '', name: `p${i}.jpg`, type: 'image/jpeg', size: 1000, width: portrait ? 3024 : 4032, height: portrait ? 4032 : 3024, capturedAt: i };
});
const BOX: BoxContentOptions = {
  quotePool: Array.from({ length: 400 }, (_, i) => `Line ${i}`),
  quoteFontFamily: 'Playfair Display',
  quoteColor: '#2D2D2D',
};
const quotesOn = (p: AlbumPage) => p.textElements.filter((t) => t.boxIndex != null).length;
const assertCadence = (pages: AlbumPage[], label: string) => {
  for (let i = 0; i < pages.length; i++) {
    expect(quotesOn(pages[i]), `${label}: page ${i} carries ${quotesOn(pages[i])} quotes`).toBeLessThanOrEqual(QUOTE_CADENCE.maxPerPage);
    if (i > 0 && pageSpeaks(pages[i - 1])) expect(quotesOn(pages[i]), `${label}: pages ${i - 1} and ${i} both carry a quote`).toBe(0);
  }
};

describe('quote cadence — never two on a page, never two pages in a row', () => {
  it('generation-time dealing (boxContent passed to generateAlbum)', () => {
    for (let run = 0; run < 6; run++) assertCadence(generateAlbum(mixed(200), '8x8', undefined, undefined, { boxContent: BOX }), `gen run ${run}`);
  });
  it('album-wide dealing after generation (dealAlbumBoxes)', () => {
    for (let run = 0; run < 6; run++) {
      const pages = generateAlbum(mixed(200), '8x8');
      dealAlbumBoxes(pages, BOX);
      assertCadence(pages, `deal run ${run}`);
    }
  });
  it('the finish-line sweep fills only where the cadence allows, and reports the rest as remaining', () => {
    const boxed = getTemplatesForAlbum('8x8').find((t) => t.textSlots?.length === 2)!; // two boxes on one page
    const boxFree = getTemplatesForAlbum('8x8').find((t) => !t.textSlots?.length)!;
    const mk = (id: string, tid: string): AlbumPage => ({ id, layout: 'freeform', size: '8x8', templateId: tid, slotFills: [], photos: [], textElements: [], background: { type: 'solid', solid: '#FFFFFF' } } as unknown as AlbumPage);
    // box, box, box, spacer, box → quotes may land on pages 0, 2 and 4 only, one each.
    const pages = [mk('a', boxed.id), mk('b', boxed.id), mk('c', boxed.id), mk('s', boxFree.id), mk('d', boxed.id)];
    const { pages: swept, filled, remaining } = sweepFillQuotes(pages, BOX);
    assertCadence(swept, 'sweep');
    expect(swept.map(quotesOn)).toEqual([1, 0, 1, 0, 1]);
    expect(filled).toBe(3);
    expect(remaining).toBe(5); // a: 1 second box, b: 2, c: 1, d: 1
    // A second sweep changes nothing: the cadence, not the pool, is what holds them.
    const again = sweepFillQuotes(swept, BOX);
    expect(again.filled).toBe(0);
  });
  it('quotes still land: with the cadence on, an 8x8 album with 200 photos carries a healthy number of them', () => {
    const pages = generateAlbum(mixed(200), '8x8', undefined, undefined, { boxContent: BOX });
    const total = pages.reduce((n, p) => n + quotesOn(p), 0);
    expect(total).toBeGreaterThan(pages.length / 8);
  });
});
