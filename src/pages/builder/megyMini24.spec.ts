import { describe, it, expect } from 'vitest';
import { generateAlbum, isFullPagePhoto } from './generateAlbum';
import { getTemplateById } from './pageTemplates';
import { saddleSheetPlan } from './printSheet';
import { placeSpreadPair, spreadHalfOf, spreadLeftIndex, SPREAD_LEFT_INDEX } from './miniSpread';
import type { AlbumPage, UploadedPhoto } from './types';
import { photosOverBy, photosShortBy, tooFewToMakeMessage } from './albumMinimum';
import {
  MINI_SIZE, MINI_PAGES, MINI_PAGES_KEY, bookPagesFor, isMiniPages, maxPagesFor, maxPhotosFor, minPhotosFor,
  miniOfferFor, miniOfferOf, miniPagesForPhotos, miniPagesOf, miniPagesOfAlbum, miniPagesOnSale, miniPhotoProblem,
  miniPhotoRange, miniPhotoRangeLabel, miniSuggestion, pagesAreFixed, readMiniPagesFrom, writeMiniPagesTo,
} from '../../lib/megyMini';
import { miniPriceBreakdown, type PriceSchedule } from '../../lib/pricing';
import { seedMathRandom, mulberry32 } from '../../test/seededRandom';

seedMathRandom();

/* ═══════════════════════════════════════════════════════════════════════════
   THE 24-PAGE MEGY MINI (owner, 2026-11-23: "24 pages at 449", "an additional
   a second staple offering", one product "Megy Mini, 16 or 24 pages", ₱399
   inside a package). 6 folded sheets, 3 press sheets; 24 to 60 photos; the
   middle spread on pages 12 and 13. The price list names the page counts on
   sale (mini.options, 0070); one without them sells 16 only.
   ═══════════════════════════════════════════════════════════════════════════ */

const SHAPE = { L: [4032, 3024], P: [3024, 4032], S: [3000, 3000] } as const;
function roll(n: number, seed = n): UploadedPhoto[] {
  const rnd = mulberry32(seed * 7919);
  const t0 = Date.UTC(2026, 10, 23, 9);
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

const base = { size: '5.8x8.3', cover: 'staple', pages: 16, price: 350, package_price: 299, shipping_fee: 120, free_qr: 2 };
const both = { ...base, options: [{ pages: 16, price: 350, package_price: 299 }, { pages: 24, price: 449, package_price: 399 }] };
const schedule = {
  min_pages: 40, sheet_rate: 60.95, hosting_reserve: 50,
  hosting_tiers: [{ years: 5, price: 0 }, { years: 10, price: 99 }],
  hd_memories_price: 99, disabled_sizes: [], sizes: {}, mini: both,
} as unknown as PriceSchedule;

describe('the 24-page Mini: its pages and photos', () => {
  it('comes at 16 or 24 pages; anything else is the usual 16', () => {
    expect(isMiniPages(16)).toBe(true);
    expect(isMiniPages(24)).toBe(true);
    for (const n of [0, 8, 20, 32, '24', null]) expect(isMiniPages(n)).toBe(false);
    expect(miniPagesOf(24)).toBe(24);
    expect(miniPagesOf(20)).toBe(MINI_PAGES);
    expect(miniPagesOf(undefined)).toBe(16);
  });

  it('takes 24 to 60 photos at 24 pages, 16 to 40 at 16', () => {
    expect(miniPhotoRange(16)).toEqual({ min: 16, max: 40 });
    expect(miniPhotoRange(24)).toEqual({ min: 24, max: 60 });
    expect(miniPhotoRangeLabel(24)).toBe('24–60');
    expect(bookPagesFor(MINI_SIZE, 24)).toBe(24);
    expect(minPhotosFor(MINI_SIZE, 24)).toBe(24);
    expect(maxPhotosFor(MINI_SIZE, 24)).toBe(60);
    expect(maxPagesFor(MINI_SIZE, 24)).toBe(24);
    expect(photosShortBy(20, MINI_SIZE, 24)).toBe(4);
    expect(photosOverBy(61, MINI_SIZE, 24)).toBe(1);
    expect(photosOverBy(50, MINI_SIZE, 24)).toBe(0);
    expect(photosOverBy(50, MINI_SIZE)).toBe(10);
    // albums keep theirs, whatever is passed
    expect(bookPagesFor('8x8', 24)).toBe(40);
    expect(minPhotosFor('8x8', 24)).toBe(40);
    expect(pagesAreFixed(MINI_SIZE)).toBe(true);
    expect(pagesAreFixed('8x8')).toBe(false);
  });

  it('says plainly when the photos do not fit 24 pages', () => {
    expect(miniPhotoProblem(20, 24)).toBe('A 24-page Megy Mini needs at least 24 photos. Add 4 more.');
    expect(miniPhotoProblem(65, 24)).toBe('A 24-page Megy Mini holds up to 60 photos. Remove 5, or make an album instead.');
    expect(miniPhotoProblem(45, 24)).toBeNull();
    expect(miniPhotoProblem(45)).toBe('A Megy Mini holds up to 40 photos. Remove 5, or make an album instead.');
    expect(tooFewToMakeMessage(20, MINI_SIZE, 24)).toBe("A Megy Mini needs at least 24 photos, one for every page. You have 20: add 4 more and I'll make it.");
  });

  it('suggests the fewest pages the photos fit, of those on sale', () => {
    expect(miniPagesForPhotos(30, [16, 24])).toBe(16);
    expect(miniPagesForPhotos(45, [16, 24])).toBe(24);
    expect(miniPagesForPhotos(45, [16])).toBeNull();
    expect(miniPagesForPhotos(61, [16, 24])).toBeNull();
    expect(miniSuggestion(30, [16, 24])).toBe('Or make a Megy Mini: 16 A5 pages, and your 30 photos fit.');
    expect(miniSuggestion(10, [16, 24])).toBe('Or make a Megy Mini: it needs only 16 photos for its 16 A5 pages.');
  });

  it('is exactly 24 pages, none empty, every photo placed, for 24 to 60 photos', () => {
    for (let n = 24; n <= 60; n += 3) {
      for (const seed of [n, n + 1000]) {
        const photos = roll(n, seed);
        const pages = generateAlbum(photos, MINI_SIZE, undefined, undefined, { minPages: 24 });
        expect(pages.length, `${n} photos (seed ${seed})`).toBe(24);
        expect(pages.filter((p) => photoFills(p).length === 0).length, `${n} photos: empty pages`).toBe(0);
        expect(new Set(pages.flatMap(photoFills)).size, `${n} photos all placed`).toBe(n);
      }
    }
  });

  it('opens on a full page and keeps two full pages for its two free videos', () => {
    const pages = generateAlbum(roll(40), MINI_SIZE, undefined, undefined, { minPages: 24 });
    expect(isFullPagePhoto(pages[0])).toBe(true);
    expect(pages.filter(isFullPagePhoto).length).toBeGreaterThanOrEqual(3);
  });

  it('puts the middle spread on pages 12 and 13, the inside of its innermost sheet', () => {
    expect(spreadLeftIndex(16)).toBe(SPREAD_LEFT_INDEX);
    expect(spreadLeftIndex(24)).toBe(11);
    let found = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const pages = generateAlbum(roll(40, seed), MINI_SIZE, undefined, undefined, { minPages: 24 });
      const at = pages.findIndex((p) => spreadHalfOf(p.templateId) === 'left');
      if (at < 0) continue;
      found++;
      expect(at, `seed ${seed}`).toBe(11);
      expect(spreadHalfOf(pages[12].templateId)).toBe('right');
    }
    expect(found).toBeGreaterThan(0);
    // the press sheet's innermost fold is 12|13
    const { sheets } = saddleSheetPlan(MINI_SIZE, 24);
    expect(sheets.at(-1)!.back.at(-1)).toEqual({ left: 12, right: 13 });
  });

  it('puts a spread pushed along back in the middle of its own page count', () => {
    const page = (id: string, templateId?: string) => ({ id, templateId } as unknown as AlbumPage);
    const pages = Array.from({ length: 24 }, (_, i) => page(`p${i}`));
    pages.splice(3, 2, page('L', 'mini-spread-left'), page('R', 'mini-spread-right'));
    const placed = placeSpreadPair(pages);
    expect(placed.length).toBe(24);
    expect(placed[11].id).toBe('L');
    expect(placed[12].id).toBe('R');
  });

  it('prints on 3 press sheets: 6 folded sheets, two spreads a side', () => {
    const { layout, sheets } = saddleSheetPlan(MINI_SIZE, 24);
    expect(layout.pagesPerSheet).toBe(8);
    expect(sheets).toEqual([
      { front: [{ left: 24, right: 1 }, { left: 22, right: 3 }], back: [{ left: 2, right: 23 }, { left: 4, right: 21 }] },
      { front: [{ left: 20, right: 5 }, { left: 18, right: 7 }], back: [{ left: 6, right: 19 }, { left: 8, right: 17 }] },
      { front: [{ left: 16, right: 9 }, { left: 14, right: 11 }], back: [{ left: 10, right: 15 }, { left: 12, right: 13 }] },
    ]);
  });
});

describe('the 24-page Mini: the price list', () => {
  it('reads every page count on sale, 16 first, with its own prices', () => {
    const offer = miniOfferOf({ mini: both })!;
    expect(offer.options).toEqual([
      { pages: 16, price: 350, package_price: 299 },
      { pages: 24, price: 449, package_price: 399 },
    ]);
    // the 16-page Mini stays at the top, for 2.1.5 and before
    expect([offer.pages, offer.price, offer.package_price]).toEqual([16, 350, 299]);
    expect(miniPagesOnSale(offer)).toEqual([16, 24]);
    expect(miniPagesOnSale(null)).toEqual([]);
  });

  it('sells 16 pages only from a price list without page counts (before 0070)', () => {
    const offer = miniOfferOf({ mini: base })!;
    expect(offer.options).toEqual([{ pages: 16, price: 350, package_price: 299 }]);
    expect(miniOfferFor(offer, 24)).toBeNull();
    expect(miniOfferFor(offer, 16)).toEqual(offer);
  });

  it('leaves off a page count it cannot read, and still sells 16', () => {
    const odd = { ...base, options: [{ pages: 20, price: 400 }, { pages: 24, price: 0 }, { pages: 24 }, 'junk', null, { pages: 16, price: 1 }] };
    expect(miniOfferOf({ mini: odd })!.options).toEqual([{ pages: 16, price: 350, package_price: 299 }]);
    const noPackage = { ...base, options: [{ pages: 24, price: 449 }] };
    expect(miniOfferOf({ mini: noPackage })!.options[1]).toEqual({ pages: 24, price: 449, package_price: 449 });
  });

  it('bills the 24-page Mini at ₱449 + shipping, with the same videos and add-ons', () => {
    const offer = miniOfferFor(miniOfferOf(schedule), 24)!;
    expect(offer.price).toBe(449);
    const b = miniPriceBreakdown(schedule, offer, 0);
    expect(b.items.map((i) => [i.label, i.amount])).toEqual([
      ['Megy Mini — A5 · 24 pages · staples · 2 video memories included', 449],
      ['Shipping', 120],
    ]);
    expect(b.total).toBe(569);
    expect(miniPriceBreakdown(schedule, offer, 4).total).toBe(669); // 2 extra videos = 1 pack of 3
    expect(miniPriceBreakdown(schedule, offer, 4, 10).total).toBe(768); // + 10 years
  });
});

describe('the 24-page Mini: the choice before it is made', () => {
  const store = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, m };
  };

  it('is kept on the phone, and 16 needs no key', () => {
    const s = store();
    expect(readMiniPagesFrom(s)).toBe(16);
    writeMiniPagesTo(s, 24);
    expect(s.m.get(MINI_PAGES_KEY)).toBe('24');
    expect(readMiniPagesFrom(s)).toBe(24);
    writeMiniPagesTo(s, 16);
    expect(s.m.has(MINI_PAGES_KEY)).toBe(false);
    s.setItem(MINI_PAGES_KEY, '20');
    expect(readMiniPagesFrom(s)).toBe(16);
  });

  it('a made Mini is the pages it has; one not made yet is the choice', () => {
    const made = (n: number) => Array.from({ length: n }, (_, i) => ({ slotFills: i === 0 ? [0] : [] }));
    const empty = Array.from({ length: 40 }, () => ({ slotFills: [] as number[] }));
    expect(miniPagesOfAlbum(made(24), 16)).toBe(24);
    expect(miniPagesOfAlbum(made(16), 24)).toBe(16);
    expect(miniPagesOfAlbum(empty, 24)).toBe(24);
    expect(miniPagesOfAlbum(made(40), 24)).toBe(24); // an album's 40 pages are no Mini's
  });
});
