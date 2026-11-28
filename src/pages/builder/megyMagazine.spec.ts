import { describe, it, expect } from 'vitest';
import { generateAlbum } from './generateAlbum';
import { getTemplatesForAlbum, getTemplateById } from './pageTemplates';
import { offerableSizesAmong, isSizeOfferableAmong } from './sizeOffer';
import { saddleFoldOf, saddleSheetPlan, PRESS_SHEET } from './printSheet';
import { ALBUM_SIZES, type AlbumPage, type UploadedPhoto } from './types';
import { ALBUM_INCHES } from './templateKit';
import {
  A4_NAME, A4_SIZE, BOOKLET_SIZES, MINI_NAME, MINI_SIZE,
  bookletName, bookletPaper, isMiniSize, miniNamed, miniOfferFor, miniOfferOf, miniPhotoProblem,
} from '../../lib/megyMini';
import { miniPriceBreakdown, type PriceSchedule } from '../../lib/pricing';
import { sheetsNote } from '../../lib/pressSheetWords';
import { tooFewToOrderMessage } from './albumMinimum';
import { seedMathRandom, mulberry32 } from '../../test/seededRandom';

seedMathRandom(); // same books every run (generateAlbum deals with Math.random)

/* ═══════════════════════════════════════════════════════════════════════════
   MEGY MAGAZINE (owner, 2026-11-27): "A5 stays, with its current prices, the
   A4 album becomes another product which is the gap between mini and the
   cheapest album", at "₱599 / ₱699". The Megy Mini's booklet at A4, sold
   beside it from its own price list (public_price_schedule().a4, 0076).
   These lock that it is its own product and that the Mini is untouched.
   ═══════════════════════════════════════════════════════════════════════════ */

const SHAPE = { L: [4032, 3024], P: [3024, 4032], S: [3000, 3000] } as const;

function roll(n: number, seed = n): UploadedPhoto[] {
  const rnd = mulberry32(seed * 104729);
  const t0 = Date.UTC(2026, 10, 27, 9);
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

const a5 = { size: '5.8x8.3', cover: 'staple', pages: 16, price: 350, package_price: 299, shipping_fee: 120, free_qr: 2,
  options: [{ pages: 16, price: 350, package_price: 299 }, { pages: 24, price: 449, package_price: 399 }] };
const a4 = { size: '8.3x11.7', cover: 'staple', pages: 16, price: 599, package_price: 549, shipping_fee: 120, free_qr: 2,
  options: [{ pages: 16, price: 599, package_price: 549 }, { pages: 24, price: 699, package_price: 649 }] };
const schedule = {
  min_pages: 40, sheet_rate: 60.95, hosting_reserve: 50,
  hosting_tiers: [{ years: 5, price: 0 }, { years: 10, price: 99 }],
  hd_memories_price: 99, disabled_sizes: [], sizes: {},
  mini: a5, a4,
} as unknown as PriceSchedule;

describe('Megy Magazine: its own product beside the Megy Mini', () => {
  it('is A4 (210 x 297 mm) with staples; the Mini stays A5', () => {
    expect(A4_SIZE).toBe('8.3x11.7');
    expect(MINI_SIZE).toBe('5.8x8.3');
    expect(BOOKLET_SIZES).toEqual([MINI_SIZE, A4_SIZE]);
    const page = ALBUM_SIZES.find((s) => s.preset === A4_SIZE)!;
    expect([page.width, page.height]).toEqual([2480, 3508]);
    expect(ALBUM_INCHES[A4_SIZE].w * 25.4).toBeCloseTo(210, 6);
    expect(ALBUM_INCHES[A4_SIZE].h * 25.4).toBeCloseTo(297, 6);
  });

  it('has its own name and paper', () => {
    expect(A4_NAME).toBe('Megy Magazine');
    expect(bookletName(A4_SIZE)).toBe('Megy Magazine');
    expect(bookletName(MINI_SIZE)).toBe(MINI_NAME);
    expect(bookletPaper(A4_SIZE)).toBe('A4');
    expect(bookletPaper(MINI_SIZE)).toBe('A5');
    expect(miniNamed(24, A4_SIZE)).toBe('24-page Megy Magazine');
    expect(miniNamed(16, A4_SIZE)).toBe('Megy Magazine');
    expect(miniPhotoProblem(10, 16, A4_SIZE)).toBe('A Megy Magazine needs at least 16 photos. Add 6 more.');
    expect(miniPhotoProblem(61, 24, A4_SIZE)).toBe('A 24-page Megy Magazine holds up to 60 photos. Remove 1, or make an album instead.');
    expect(tooFewToOrderMessage(10, A4_SIZE, 16)).toBe('Your Megy Magazine has 10 photos. It needs at least 16 to print, so add 6 more before you order.');
    // the Mini's own words are as they were
    expect(miniPhotoProblem(10)).toBe('A Megy Mini needs at least 16 photos. Add 6 more.');
  });

  it('is a booklet like the Mini, never an album size', () => {
    expect(isMiniSize(A4_SIZE)).toBe(true);
    expect(isSizeOfferableAmong(A4_SIZE, [])).toBe(false);
    expect(offerableSizesAmong([]).map((s) => s.preset)).not.toContain(A4_SIZE);
  });

  it('takes the Mini\'s own layouts, the same fractions of the page', () => {
    const ids = (s: typeof MINI_SIZE) => getTemplatesForAlbum(s).filter((t) => t.id.startsWith('mini-')).map((t) => t.id).sort();
    expect(ids(A4_SIZE)).toEqual(ids(MINI_SIZE));
    expect(ids(A4_SIZE).length).toBe(12);
  });
});

describe('Megy Magazine: the price list (.a4, 0076)', () => {
  it('reads its own offer; the Mini reads its own', () => {
    expect(miniOfferOf(schedule, A4_SIZE)).toEqual({ ...a4, size: A4_SIZE });
    expect(miniOfferOf(schedule)?.price).toBe(350);
    expect(miniOfferOf(schedule, MINI_SIZE)?.options.map((o) => o.price)).toEqual([350, 449]);
  });

  it('is not on sale when the list has no .a4, or an .a4 that is not A4', () => {
    expect(miniOfferOf({ mini: a5 }, A4_SIZE)).toBeNull();
    expect(miniOfferOf({ mini: a5, a4: { ...a4, size: '5.8x8.3' } }, A4_SIZE)).toBeNull();
    expect(miniOfferOf({ mini: a5, a4: { ...a4, cover: 'softcover' } }, A4_SIZE)).toBeNull();
    // and an album size never reads a booklet's list
    expect(miniOfferOf(schedule, '8x8')).toBeNull();
    // the Mini never takes the A4 list's prices
    expect(miniOfferOf({ a4 })).toBeNull();
  });

  it('bills ₱599 or ₱699 + ₱120 shipping, the 2 free videos included', () => {
    const offer = miniOfferOf(schedule, A4_SIZE)!;
    const b16 = miniPriceBreakdown(schedule, miniOfferFor(offer, 16)!, 0);
    expect(b16.items.map((i) => [i.label, i.amount])).toEqual([
      ['Megy Magazine — A4 · 16 pages · staples · 2 video memories included', 599],
      ['Shipping', 120],
    ]);
    expect(b16.total).toBe(719);
    expect(miniPriceBreakdown(schedule, miniOfferFor(offer, 24)!, 2).total).toBe(819);
    // the Mini's bill is as it was
    const mini = miniPriceBreakdown(schedule, miniOfferOf(schedule)!, 0);
    expect(mini.items[0]).toEqual({ label: 'Megy Mini — A5 · 16 pages · staples · 2 video memories included', amount: 350 });
    expect(mini.total).toBe(470);
  });
});

describe('Megy Magazine: its pages', () => {
  it('is exactly 16 or 24 A4 pages, none empty, every photo placed', () => {
    for (const [pages, counts] of [[16, [16, 25, 40]], [24, [24, 41, 60]]] as const) {
      for (const n of counts) {
        const photos = roll(n);
        const book = generateAlbum(photos, A4_SIZE, undefined, undefined, { minPages: pages });
        expect(book, `${n} photos at ${pages} pages`).toHaveLength(pages);
        for (const p of book) {
          expect(p.size).toBe(A4_SIZE);
          expect(photoFills(p).length, `${n} photos: page ${p.id} is empty`).toBeGreaterThan(0);
        }
        const placed = new Set(book.flatMap((p) => photoFills(p)));
        expect(placed.size).toBe(n);
      }
    }
  });
});

describe('Megy Magazine: the press sheet', () => {
  it('one spread a side, turned down the 19" side, full trim edges: 4 pages a sheet, 4 sheets', () => {
    const { layout, sheets } = saddleSheetPlan(A4_SIZE, 16);
    expect(layout.rotated).toBe(true);
    expect(layout.spreadsPerSide).toBe(1);
    expect(layout.pagesPerSheet).toBe(4);
    expect(sheets).toEqual([
      { front: [{ left: 16, right: 1 }], back: [{ left: 2, right: 15 }] },
      { front: [{ left: 14, right: 3 }], back: [{ left: 4, right: 13 }] },
      { front: [{ left: 12, right: 5 }], back: [{ left: 6, right: 11 }] },
      { front: [{ left: 10, right: 7 }], back: [{ left: 8, right: 9 }] },
    ]);
    const u = PRESS_SHEET.unprintableIn;
    const s = layout.slots[0];
    expect(s.w * 25.4).toBeCloseTo(297, 0);
    expect(s.h * 25.4).toBeCloseTo(420, 0);
    expect(s.x - s.bleed.left).toBeGreaterThanOrEqual(u - 1e-9);
    expect(s.y - s.bleed.top).toBeGreaterThanOrEqual(u - 1e-9);
    expect(s.x + s.w + s.bleed.right).toBeLessThanOrEqual(PRESS_SHEET.wIn - u + 1e-9);
    expect(s.y + s.h + s.bleed.bottom).toBeLessThanOrEqual(PRESS_SHEET.hIn - u + 1e-9);
    expect(saddleFoldOf(layout, s)).toBeCloseTo(s.y + layout.trimW, 9);
    // 24 pages: 6 sheets
    expect(saddleSheetPlan(A4_SIZE, 24).sheets).toHaveLength(6);
    // the Mini: two A5 spreads a side, as before
    expect(saddleSheetPlan(MINI_SIZE, 16).layout.spreadsPerSide).toBe(2);
  });

  it('tells the operator which booklet it is and how to finish its sheets', () => {
    const plan = (sheets: number, pageCount: number) => ({ sheets, pageCount, layout: { leavesPerSheet: 1 } });
    expect(sheetsNote({ page_count: 16, album_size: A4_SIZE }, plan(4, 16), 'right')).toBe(
      'Megy Magazine A4: 4 sheets, both sides · flip on the long edge · one spread a side, turned: cut round its trim · fold it across the middle · nest them, fold 1 outermost · 2 staples through the fold');
    expect(sheetsNote({ page_count: 16, album_size: MINI_SIZE }, plan(2, 16), 'right')).toMatch(
      /^Megy Mini A5: 2 sheets, both sides · flip on the long edge · cut across between the two spreads/);
  });
});
