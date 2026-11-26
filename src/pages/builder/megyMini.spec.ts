import { describe, it, expect } from 'vitest';
import { generateAlbum, isFullPagePhoto } from './generateAlbum';
import { getTemplatesForAlbum, getTemplateById } from './pageTemplates';
import { offerableSizesAmong, isSizeOfferableAmong } from './sizeOffer';
import { coverWrapGeometry, isHardcover, spineWidthInches, PRINTER_SPEC } from './coverGeometry';
import { bindingInchesFor, bindingMarginFraction, BINDING_INCHES, MINI_FOLD_INCHES } from './binding';
import { saddleFolds, saddleSheetPlan, PRESS_SHEET } from './printSheet';
import { ALBUM_SIZES, type AlbumPage, type UploadedPhoto } from './types';
import { ALBUM_INCHES, MIN_FRAME_INCHES } from './templateKit';
import {
  MINI_SIZE, MINI_COVER, MINI_PAGES, MINI_MIN_PHOTOS, MINI_MAX_PHOTOS,
  isMiniSize, bookPagesFor, minPhotosFor, maxPhotosFor, miniOfferOf, miniPhotoProblem,
} from '../../lib/megyMini';
import { miniPriceBreakdown, type PriceSchedule } from '../../lib/pricing';
import { seedMathRandom, mulberry32 } from '../../test/seededRandom';

seedMathRandom(); // same books every run (generateAlbum deals with Math.random)

/* ═══════════════════════════════════════════════════════════════════════════
   MEGY MINI (owner, 2026-11-16): a 16-page A5 booklet with staples, ₱350 +
   shipping, 2 video memories free. These lock what makes it a Mini: always
   16 pages with no empty page for 16–40 photos, never offered as an album
   size, a cover with no spine, and a bill that matches order_quote() (0062).
   ═══════════════════════════════════════════════════════════════════════════ */

const SHAPE = { L: [4032, 3024], P: [3024, 4032], S: [3000, 3000] } as const;

/** A phone roll: mostly portraits, a minute between shots. */
function roll(n: number, seed = n): UploadedPhoto[] {
  const rnd = mulberry32(seed * 7919);
  const t0 = Date.UTC(2026, 10, 16, 9);
  return Array.from({ length: n }, (_, i) => {
    const r = rnd();
    const [width, height] = SHAPE[r < 0.6 ? 'P' : r < 0.95 ? 'L' : 'S'];
    return { id: `ph-${i}`, previewUrl: '', name: `ph-${i}.jpg`, type: 'image/jpeg', size: 1, width, height, capturedAt: t0 + i * 60_000 };
  });
}

const photoFills = (p: AlbumPage) => {
  const t = p.templateId ? getTemplateById(p.templateId) : undefined;
  return (p.slotFills ?? []).filter((f, i) => f != null && t?.slots[i]?.kind !== 'qr');
};

describe('Megy Mini: the product', () => {
  it('is A5 with staples and 16 pages', () => {
    expect(MINI_SIZE).toBe('5.8x8.3');
    expect(MINI_COVER).toBe('staple');
    expect(MINI_PAGES).toBe(16);
    const a5 = ALBUM_SIZES.find((s) => s.preset === MINI_SIZE)!;
    // 148 x 210 mm at 300 dpi
    expect([a5.width, a5.height]).toEqual([1748, 2480]);
    expect(ALBUM_INCHES[MINI_SIZE].w * 25.4).toBeCloseTo(148, 6);
    expect(ALBUM_INCHES[MINI_SIZE].h * 25.4).toBeCloseTo(210, 6);
  });

  it('is never offered as an album size', () => {
    expect(isSizeOfferableAmong(MINI_SIZE, [])).toBe(false);
    expect(offerableSizesAmong([]).map((s) => s.preset)).not.toContain(MINI_SIZE);
    // and every album size still is
    expect(offerableSizesAmong([]).map((s) => s.preset)).toEqual(
      ALBUM_SIZES.map((s) => s.preset).filter((s) => s !== MINI_SIZE));
  });

  it('has its own page and photo counts; albums keep theirs', () => {
    expect(bookPagesFor(MINI_SIZE)).toBe(16);
    expect(minPhotosFor(MINI_SIZE)).toBe(16);
    expect(maxPhotosFor(MINI_SIZE)).toBe(40);
    expect(bookPagesFor('8x8')).toBe(40);
    expect(minPhotosFor('8x8')).toBe(40);
    expect(maxPhotosFor('8x8')).toBe(Infinity);
    expect(isMiniSize('6x8')).toBe(false);
  });

  it('says plainly when a roll is too small or too big', () => {
    expect(miniPhotoProblem(15)).toBe('A Megy Mini needs at least 16 photos. Add 1 more.');
    expect(miniPhotoProblem(16)).toBeNull();
    expect(miniPhotoProblem(40)).toBeNull();
    expect(miniPhotoProblem(43)).toBe('A Megy Mini holds up to 40 photos. Remove 3, or make an album instead.');
  });
});

describe('Megy Mini: its pages', () => {
  it('has A5 layouts, every frame at least the print floor', () => {
    const decks = getTemplatesForAlbum(MINI_SIZE);
    expect(decks.length).toBeGreaterThan(5);
    const { w, h } = ALBUM_INCHES[MINI_SIZE];
    for (const t of decks) {
      for (const s of t.slots) {
        if (s.kind === 'qr') continue;
        expect(Math.min(s.width * w, s.height * h), t.id).toBeGreaterThanOrEqual(MIN_FRAME_INCHES - 0.01);
      }
    }
  });

  it('is always exactly 16 pages, none empty, every photo placed, for 16 to 40 photos', () => {
    for (let n = MINI_MIN_PHOTOS; n <= MINI_MAX_PHOTOS; n++) {
      for (const seed of [n, n + 1000]) {
        const photos = roll(n, seed);
        const pages = generateAlbum(photos, MINI_SIZE);
        expect(pages.length, `${n} photos (seed ${seed})`).toBe(MINI_PAGES);
        expect(pages.filter((p) => photoFills(p).length === 0).length, `${n} photos: empty pages`).toBe(0);
        const placed = new Set(pages.flatMap(photoFills));
        expect(placed.size, `${n} photos all placed`).toBe(n);
      }
    }
  });

  it('opens on a full page and keeps two full pages for its two free videos', () => {
    const pages = generateAlbum(roll(30), MINI_SIZE);
    expect(isFullPagePhoto(pages[0])).toBe(true);
    expect(pages.filter(isFullPagePhoto).length).toBeGreaterThanOrEqual(3);
  });

  it('leaves albums as they were (40 pages from 40 photos on 6x8)', () => {
    expect(generateAlbum(roll(40), '6x8').length).toBe(40);
  });
});

describe('Megy Mini: the stapled cover', () => {
  it('is soft, with no spine', () => {
    expect(isHardcover(MINI_COVER)).toBe(false);
    expect(spineWidthInches(16, MINI_COVER)).toBe(0);
    expect(spineWidthInches(16, 'softcover')).toBeGreaterThan(0);
  });

  it('lays flat as back | front, the bleed all round, nothing between', () => {
    const g = coverWrapGeometry(MINI_SIZE, 16, MINI_COVER);
    // the cover reads the trim off the 300-dpi pixels (1748 x 2480)
    const a5 = ALBUM_SIZES.find((s) => s.preset === MINI_SIZE)!;
    const w = a5.width / 300, h = a5.height / 300;
    expect(g.spineIn).toBe(0);
    expect(g.wrap.wIn).toBeCloseTo(2 * PRINTER_SPEC.bleedIn + 2 * w, 9);
    expect(g.wrap.hIn).toBeCloseTo(2 * PRINTER_SPEC.bleedIn + h, 9);
    expect(g.foldXPx[0]).toBe(g.foldXPx[1]);
    expect(g.pageCount).toBe(16);
  });

  it('keeps no allowance at the staple fold: photos run to it (owner, 2026-11-17)', () => {
    expect(bindingInchesFor(MINI_COVER)).toBe(MINI_FOLD_INCHES);
    expect(MINI_FOLD_INCHES).toBe(0);
    expect(bindingMarginFraction(MINI_SIZE)).toBe(0);
    // albums keep theirs
    expect(bindingInchesFor('softcover')).toBe(BINDING_INCHES);
    expect(bindingMarginFraction('6x8')).toBeCloseTo(BINDING_INCHES / 6, 9);
  });
});

describe('Megy Mini: the price (mirrors order_quote, 0062)', () => {
  const schedule = {
    min_pages: 40, sheet_rate: 66.25, hosting_reserve: 50,
    hosting_tiers: [{ years: 5, price: 0 }, { years: 10, price: 99 }],
    hd_memories_price: 49, disabled_sizes: [], sizes: {},
    mini: { size: '5.8x8.3', cover: 'staple', pages: 16, price: 350, package_price: 299, shipping_fee: 120, free_qr: 2 },
  } as unknown as PriceSchedule;

  it('reads the offer only when it is whole', () => {
    expect(miniOfferOf(schedule)).toEqual({ size: '5.8x8.3', cover: 'staple', pages: 16, price: 350, package_price: 299, shipping_fee: 120, free_qr: 2, options: [{ pages: 16, price: 350, package_price: 299 }] });
    expect(miniOfferOf({ mini: null })).toBeNull();
    expect(miniOfferOf({})).toBeNull();
    expect(miniOfferOf(null)).toBeNull();
    expect(miniOfferOf({ mini: { ...schedule.mini, shipping_fee: null } })).toBeNull();
    expect(miniOfferOf({ mini: { ...schedule.mini, pages: 20 } })).toBeNull();
    expect(miniOfferOf({ mini: { ...schedule.mini, size: '6x8' } })).toBeNull();
  });

  it('is the price + shipping, the two free videos included', () => {
    const offer = miniOfferOf(schedule)!;
    for (const qr of [0, 1, 2]) expect(miniPriceBreakdown(schedule, offer, qr).total).toBe(470);
    const b = miniPriceBreakdown(schedule, offer, 0);
    expect(b.items.map((i) => [i.label, i.amount])).toEqual([
      ['Megy Mini — A5 · 16 pages · staples · 2 video memories included', 350],
      ['Shipping', 120],
    ]);
    expect(b.shipping).toBe(120);
  });

  it('adds videos past the free ones in packs of 3 for ₱100 (2026-11-19), and the same term and HD as an album', () => {
    const offer = miniOfferOf(schedule)!;
    expect(miniPriceBreakdown(schedule, offer, 4).total).toBe(570);   // 2 extra = 1 pack
    expect(miniPriceBreakdown(schedule, offer, 6).total).toBe(670);   // 4 extra = 2 packs
    expect(miniPriceBreakdown(schedule, offer, 4, 10).total).toBe(669);
    expect(miniPriceBreakdown(schedule, offer, 4, 10, true).total).toBe(718);
    // items always add up to the total
    const b = miniPriceBreakdown(schedule, offer, 5, 10, true);
    expect(b.items.reduce((s, i) => s + i.amount, 0)).toBe(b.total);
  });
});

describe('Megy Mini: the press sheet (folded and stapled)', () => {
  it('puts the 16 pages on 4 folded sheets, outermost first', () => {
    expect(saddleFolds(16)).toEqual([
      { front: { left: 16, right: 1 }, back: { left: 2, right: 15 } },
      { front: { left: 14, right: 3 }, back: { left: 4, right: 13 } },
      { front: { left: 12, right: 5 }, back: { left: 6, right: 11 } },
      { front: { left: 10, right: 7 }, back: { left: 8, right: 9 } },
    ]);
    expect(() => saddleFolds(15)).toThrow();
    expect(() => saddleFolds(18)).toThrow();
  });

  it('prints every page exactly once, facing pages always adding up to n + 1', () => {
    for (const n of [4, 8, 16, 24]) {
      const sides = saddleFolds(n).flatMap((f) => [f.front, f.back]);
      const pages = sides.flatMap((s) => [s.left, s.right]).sort((a, b) => a - b);
      expect(pages).toEqual(Array.from({ length: n }, (_, i) => i + 1));
      for (const s of sides) expect(s.left + s.right).toBe(n + 1);
    }
  });

  it('fits two A5 spreads a side on the 12.5 x 19 sheet with full trim edges: 8 pages a sheet, 2 sheets', () => {
    const { layout, sheets } = saddleSheetPlan(MINI_SIZE, 16);
    expect(layout.spreadsPerSide).toBe(2);
    expect(layout.pagesPerSheet).toBe(8);
    expect(sheets).toEqual([
      { front: [{ left: 16, right: 1 }, { left: 14, right: 3 }], back: [{ left: 2, right: 15 }, { left: 4, right: 13 }] },
      { front: [{ left: 12, right: 5 }, { left: 10, right: 7 }], back: [{ left: 6, right: 11 }, { left: 8, right: 9 }] },
    ]);
    const u = PRESS_SHEET.unprintableIn;
    for (const s of layout.slots) {
      expect(s.x - s.bleed.left).toBeGreaterThanOrEqual(u - 1e-9);
      expect(s.y - s.bleed.top).toBeGreaterThanOrEqual(u - 1e-9);
      expect(s.x + s.w + s.bleed.right).toBeLessThanOrEqual(PRESS_SHEET.wIn - u + 1e-9);
      expect(s.y + s.h + s.bleed.bottom).toBeLessThanOrEqual(PRESS_SHEET.hIn - u + 1e-9);
      expect(s.bleed).toEqual({ top: 0.125, right: 0.125, bottom: 0.125, left: 0.125 });
    }
    // the two spreads never overlap, and each folds down its middle
    expect(layout.slots[1].y - layout.slots[1].bleed.top).toBeGreaterThanOrEqual(layout.slots[0].y + layout.slots[0].h + layout.slots[0].bleed.bottom - 1e-9);
    expect(layout.foldX).toBeCloseTo(layout.slots[0].x + layout.trimW, 9);
  });
});