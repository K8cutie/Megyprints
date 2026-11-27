import { describe, it, expect } from 'vitest';
import {
  priceOf, priceBreakdown, costOf, ownerPriceOf, multiplePriceOf, setPriceOf, scheduleFrom, extraPagesCharge, sheetsFor,
  qrMemoryCharge, countQrMemories, FREE_QR_MEMORIES, QR_PACK_SIZE, QR_PACK_PRICE, QR_PACK_OFFER, QR_PACK_SENTENCE, qrPacksLine,
  hostingTiersOf, hostingTermCharge, includedHostingYears, DEFAULT_HOSTING_TIERS,
  hdMemoriesPriceOf, hdMemoriesCharge, shippingAllowanceOf, freeShippingValueOf, compareAtPriceOf, manilaToday,
  MIN_PAGES, SIZE_LABELS,
  type Binding, type PricingModel,
} from './pricing';
import type { AlbumSizePreset } from '../pages/builder/types';

// The customer pays real pesos off this module and the operator prices from the
// SAME model, so a silent regression here mis-charges every order with no
// signal. These lock the invariants that must never drift.
//
// The cost figures below are a TEST FIXTURE mirroring the seed in migration
// 0024. They deliberately no longer live in src/ — shipping them in the bundle
// is exactly the leak 0024 closed — and a spec file is not part of the app
// build, so keeping a copy here costs nothing.
const MODEL: PricingModel = {
  sheet_cost: 26.5,
  soft_cover_cost: 50,
  soft_bind_cost: 100,
  min_pages: 40,
  price_multiple: 3,
  hosting_reserve: 50,
  hosting_tiers: DEFAULT_HOSTING_TIERS,
  hd_memories_price: 49,
  sizes: {
    '6x4':    { pps: 16, hb: 250, surcharge: 0 },
    '8x6':    { pps: 4,  hb: 350, surcharge: 0 },
    '6x8':    { pps: 4,  hb: 350, surcharge: 0 },
    '6x6':    { pps: 12, hb: 280, surcharge: 0 },
    '8x8':    { pps: 4,  hb: 350, surcharge: 0 },
    '11.5x8': { pps: 4,  hb: 450, surcharge: 300 },
    '8.5x11': { pps: 4,  hb: 500, surcharge: 300 },
    // No A5: the Megy Mini isn't priced from the album model (0062, miniPriceBreakdown).
  } as PricingModel['sizes'],
};

const SIZE_KEYS = Object.keys(MODEL.sizes) as AlbumSizePreset[];
const BINDINGS: Binding[] = ['soft', 'hard'];
// The Pricing panel slider is min 2, max 6, step 0.25 — quarter steps are exact
// in float64, which is what lets the schedule reproduce the model bit for bit.
const MULTIPLES = Array.from({ length: 17 }, (_, i) => 2 + i * 0.25);
const PAGE_COUNTS = [1, 20, MIN_PAGES - 1, MIN_PAGES, MIN_PAGES + 1, 60, 80, 120, 200];

describe('schedule ↔ model agreement', () => {
  // THE load-bearing test. The customer is charged from the schedule and the
  // operator prices from the raw model; if these ever diverge the store quotes
  // one number and reports another.
  it('customer price from the schedule equals the operator price from the model', () => {
    for (const multiple of MULTIPLES) {
      const schedule = scheduleFrom(MODEL, multiple);
      for (const size of SIZE_KEYS)
        for (const binding of BINDINGS)
          for (const pages of PAGE_COUNTS)
            expect(priceOf(schedule, size, binding, pages))
              .toBe(ownerPriceOf(MODEL, size, binding, pages, multiple));
    }
  });

  it('the hosting reserve is FLAT: exactly ₱reserve more than a zero-reserve model, for every size/binding/pages/multiple', () => {
    const zero: PricingModel = { ...MODEL, hosting_reserve: 0 };
    for (const multiple of MULTIPLES)
      for (const size of SIZE_KEYS)
        for (const binding of BINDINGS)
          for (const pages of PAGE_COUNTS) {
            expect(ownerPriceOf(MODEL, size, binding, pages, multiple) - ownerPriceOf(zero, size, binding, pages, multiple))
              .toBe(MODEL.hosting_reserve);
            expect(priceOf(scheduleFrom(MODEL, multiple), size, binding, pages) - priceOf(scheduleFrom(zero, multiple), size, binding, pages))
              .toBe(MODEL.hosting_reserve);
          }
  });

  it('a pre-0029 schedule (no hosting_reserve field) still prices — as a zero reserve', () => {
    const schedule = scheduleFrom(MODEL, 3);
    const legacy = { ...schedule } as Partial<typeof schedule>;
    delete legacy.hosting_reserve;
    for (const size of SIZE_KEYS)
      expect(priceOf(legacy as typeof schedule, size, 'soft', 60))
        .toBe(priceOf(scheduleFrom({ ...MODEL, hosting_reserve: 0 }, 3), size, 'soft', 60));
  });

  it('the schedule carries no cost, multiple, or premium field', () => {
    const json = JSON.stringify(scheduleFrom(MODEL, 3));
    for (const leak of ['price_multiple', 'sheet_cost', 'soft_cover_cost', 'soft_bind_cost', 'hb', 'surcharge'])
      expect(json).not.toContain(leak);
  });

  it('cannot be solved back to the cost basis from the schedule alone', () => {
    // Two different (cost, multiple) pairs producing an identical schedule —
    // proof the rates are genuinely underdetermined, not merely obscured.
    const halfCost: PricingModel = {
      ...MODEL,
      sheet_cost: MODEL.sheet_cost / 2,
      soft_cover_cost: MODEL.soft_cover_cost / 2,
      soft_bind_cost: MODEL.soft_bind_cost / 2,
      sizes: Object.fromEntries(
        SIZE_KEYS.map((k) => [k, { ...MODEL.sizes[k], hb: MODEL.sizes[k].hb / 2 }]),
      ) as PricingModel['sizes'],
    };
    expect(scheduleFrom(halfCost, 6)).toEqual(scheduleFrom(MODEL, 3));
  });
});

// 0074: the owner sets an album price per size and cover (Admin → Pricing →
// Album prices). The live prices of 2026-11-26 (+₱300 on every album).
const SET: PricingModel = {
  ...MODEL,
  sizes: {
    ...MODEL.sizes,
    '6x4': { ...MODEL.sizes['6x4'], surcharge: 300, price_soft: 1078, price_hard: 1308 },
    '6x6': { ...MODEL.sizes['6x6'], surcharge: 300, price_soft: 1139, price_hard: 1438 },
    '8x6': { ...MODEL.sizes['8x6'], surcharge: 300, price_soft: 1200, price_hard: 1660 },
    '6x8': { ...MODEL.sizes['6x8'], surcharge: 300, price_soft: 1200, price_hard: 1660 },
    '8x8': { ...MODEL.sizes['8x8'], surcharge: 300, price_soft: 1505, price_hard: 1965 },
  } as PricingModel['sizes'],
};

describe('album prices set per size (0074)', () => {
  it('the schedule and the operator view still agree, for every size, cover, page count and multiple', () => {
    for (const multiple of MULTIPLES)
      for (const size of SIZE_KEYS)
        for (const binding of BINDINGS)
          for (const pages of PAGE_COUNTS)
            expect(priceOf(scheduleFrom(SET, multiple), size, binding, pages))
              .toBe(ownerPriceOf(SET, size, binding, pages, multiple));
    // A set-price size agrees even at a multiple that isn't a quarter step
    // (live is 2.3×), because both sides take the same steps.
    for (const size of ['6x4', '6x6', '8x6', '6x8', '8x8'] as AlbumSizePreset[])
      for (const binding of BINDINGS)
        for (const pages of PAGE_COUNTS)
          expect(priceOf(scheduleFrom(SET, 2.3), size, binding, pages))
            .toBe(ownerPriceOf(SET, size, binding, pages, 2.3));
  });

  it('the smallest album costs exactly the set price, whatever the multiple', () => {
    for (const multiple of [...MULTIPLES, 2.3]) {
      const schedule = scheduleFrom(SET, multiple);
      expect(priceOf(schedule, '8x8', 'hard', 40)).toBe(1965);
      expect(priceOf(schedule, '8x8', 'soft', 40)).toBe(1505);
      expect(priceOf(schedule, '6x4', 'soft', 40)).toBe(1078);
      expect(priceOf(schedule, '6x6', 'hard', 40)).toBe(1438);
      expect(priceOf(schedule, '8x6', 'soft', 20)).toBe(1200); // under the minimum pays the minimum
    }
  });

  it('extra pages still cost the one sheet rate on top of a set price', () => {
    const schedule = scheduleFrom(SET, 2.3);
    const sheets = sheetsFor(4, 40, 60) - sheetsFor(4, 40, 40);
    expect(priceOf(schedule, '8x8', 'hard', 60)).toBe(Math.round(1965 - 50 + sheets * schedule.sheet_rate) + 50);
    expect(priceOf(schedule, '8x8', 'hard', 60)).toBe(2270); // 1965 + 5 sheets at ₱60.95, rounded
  });

  it('a size with no set price is priced exactly as before', () => {
    for (const multiple of MULTIPLES)
      for (const size of ['11.5x8', '8.5x11'] as AlbumSizePreset[])
        for (const binding of BINDINGS)
          for (const pages of PAGE_COUNTS)
            expect(ownerPriceOf(SET, size, binding, pages, multiple)).toBe(ownerPriceOf(MODEL, size, binding, pages, multiple));
  });

  it('the what-if price (multiplePriceOf) ignores set prices', () => {
    expect(multiplePriceOf(SET, '8x8', 'hard', 40, 3)).toBe(ownerPriceOf({ ...SET, sizes: { ...SET.sizes, '8x8': { pps: 4, hb: 350, surcharge: 300 } } }, '8x8', 'hard', 40, 3));
    expect(multiplePriceOf(SET, '8x8', 'hard', 40, 3)).not.toBe(1965);
  });

  it('reads a set price only when it is a real number', () => {
    expect(setPriceOf(SET, '8x8', 'hard')).toBe(1965);
    expect(setPriceOf(SET, '11.5x8', 'hard')).toBeNull();
    const odd = { sizes: { '8x8': { pps: 4, hb: 350, surcharge: 0, price_hard: null, price_soft: Number.NaN } } } as unknown as PricingModel;
    expect(setPriceOf(odd, '8x8', 'hard')).toBeNull();
    expect(setPriceOf(odd, '8x8', 'soft')).toBeNull();
  });

  it('the schedule never carries a set price, a cost or the multiple', () => {
    const json = JSON.stringify(scheduleFrom(SET, 2.3));
    for (const leak of ['price_soft', 'price_hard', 'price_multiple', 'sheet_cost', 'hb', 'surcharge'])
      expect(json).not.toContain(leak);
  });
});

describe('priceBreakdown', () => {
  it('line items always sum EXACTLY to the total (no rounding leak)', () => {
    for (const multiple of MULTIPLES) {
      const schedule = scheduleFrom(MODEL, multiple);
      for (const size of SIZE_KEYS)
        for (const binding of BINDINGS)
          for (const pages of PAGE_COUNTS) {
            const b = priceBreakdown(schedule, size, binding, pages);
            expect(b.items.reduce((s, i) => s + i.amount, 0)).toBe(b.total);
          }
    }
  });

  it('total matches priceOf for every combination', () => {
    for (const multiple of MULTIPLES) {
      const schedule = scheduleFrom(MODEL, multiple);
      for (const size of SIZE_KEYS)
        for (const binding of BINDINGS)
          for (const pages of PAGE_COUNTS)
            expect(priceBreakdown(schedule, size, binding, pages).total)
              .toBe(priceOf(schedule, size, binding, pages));
    }
  });

  it('shows an extra-pages line only above the minimum', () => {
    const schedule = scheduleFrom(MODEL, 3);
    for (const size of SIZE_KEYS) {
      expect(priceBreakdown(schedule, size, 'soft', MIN_PAGES).items).toHaveLength(1);
      expect(priceBreakdown(schedule, size, 'soft', MIN_PAGES + 1).items).toHaveLength(2);
    }
  });

  it('never renders a raw cost figure in a customer-facing label', () => {
    const schedule = scheduleFrom(MODEL, 3);
    for (const size of SIZE_KEYS) {
      const labels = priceBreakdown(schedule, size, 'hard', 60).items.map((i) => i.label).join(' ');
      expect(labels).toContain(SIZE_LABELS[size]);
      expect(labels).not.toContain(String(MODEL.sheet_cost));
    }
  });
});

describe('video memories: 2 included, then packs of 3 for ₱100 (owner, 2026-11-19)', () => {
  it('the first 2 cost nothing; then every 1–3 more is one ₱100 pack', () => {
    expect(FREE_QR_MEMORIES).toBe(2);
    expect([QR_PACK_SIZE, QR_PACK_PRICE]).toEqual([3, 100]);
    for (let n = 0; n <= 2; n++) expect(qrMemoryCharge(n)).toBe(0);
    expect([3, 4, 5].map((n) => qrMemoryCharge(n))).toEqual([100, 100, 100]);
    expect([6, 8, 9, 17].map((n) => qrMemoryCharge(n))).toEqual([200, 200, 300, 500]);
    expect(qrMemoryCharge(-3)).toBe(0);
    expect(qrMemoryCharge(5, 2)).toBe(100);
    expect(qrPacksLine(8, 2)).toBe('2 included, 6 extra (2 packs of 3 × ₱100)');
    expect(qrPacksLine(3, 2)).toBe('2 included, 1 extra (1 pack of 3 × ₱100)');
    expect(QR_PACK_OFFER).toBe('3 more for ₱100');
    expect(QR_PACK_SENTENCE).toBe('Add more in packs of 3 for ₱100.');
  });

  it('counts QR memories from BOTH homes (photo-slot qrFills and combo-box textSlotQr), ignoring nulls', () => {
    const pages = [
      { qrFills: [null, { code: 'a' }], textSlotQr: [{ code: 'b' }] },
      { qrFills: [null, null] },
      { textSlotQr: [null, null, { code: 'c' }] },
      {},
    ];
    expect(countQrMemories(pages)).toBe(3);
    expect(countQrMemories([])).toBe(0);
  });

  it('the breakdown adds ONE add-on line only past 7, and every line still sums to the total', () => {
    const schedule = scheduleFrom(MODEL, 3);
    for (const size of SIZE_KEYS)
      for (const binding of BINDINGS)
        for (const pages of PAGE_COUNTS)
          for (const qr of [0, 1, 2, 3, 7, 8, 15]) {
            const b = priceBreakdown(schedule, size, binding, pages, qr);
            const print = priceOf(schedule, size, binding, pages);
            expect(b.total).toBe(print + qrMemoryCharge(qr));
            expect(b.items.reduce((s, i) => s + i.amount, 0)).toBe(b.total);
            const qrLines = b.items.filter((i) => i.label.includes('Living-memory QR'));
            expect(qrLines).toHaveLength(qr > FREE_QR_MEMORIES ? 1 : 0);
            if (qr > FREE_QR_MEMORIES) {
              expect(qrLines[0].label).toContain(`${FREE_QR_MEMORIES} included`);
              expect(qrLines[0].label).toContain(`${qr - FREE_QR_MEMORIES} extra`);
              expect(qrLines[0].amount).toBe(Math.ceil((qr - FREE_QR_MEMORIES) / QR_PACK_SIZE) * QR_PACK_PRICE);
            }
          }
  });

  it('omitting the QR count keeps every pre-existing price byte-identical', () => {
    const schedule = scheduleFrom(MODEL, 3);
    for (const size of SIZE_KEYS)
      for (const pages of PAGE_COUNTS)
        expect(priceBreakdown(schedule, size, 'hard', pages)).toEqual(priceBreakdown(schedule, size, 'hard', pages, 0));
  });
});

describe('hosting terms — 5 included, 10/15/20 paid (owner, 2026-09-09)', () => {
  it('defaults: 5 years included, 10 → ₱99, 15 → ₱149, 20 → ₱199', () => {
    expect(DEFAULT_HOSTING_TIERS).toEqual([{ years: 5, price: 0 }, { years: 10, price: 99 }, { years: 15, price: 149 }, { years: 20, price: 199 }]);
    const schedule = scheduleFrom(MODEL, 3);
    expect(includedHostingYears(schedule)).toBe(5);
    expect(hostingTermCharge(schedule, 5)).toBe(0);
    expect(hostingTermCharge(schedule, 10)).toBe(99);
    expect(hostingTermCharge(schedule, 20)).toBe(199);
  });

  it('an unknown term, no term, or a pre-0030 schedule charges NOTHING (never over-charge on a stale client)', () => {
    const schedule = scheduleFrom(MODEL, 3);
    expect(hostingTermCharge(schedule, 7)).toBe(0);
    expect(hostingTermCharge(schedule, null)).toBe(0);
    expect(hostingTermCharge({}, 20)).toBe(0);
    expect(includedHostingYears({})).toBeNull();
  });

  it('malformed owner saves are sanitised: sorted ascending, non-numeric dropped, negatives clamped', () => {
    const tiers = hostingTiersOf({ hosting_tiers: [{ years: 20, price: 199 }, { years: 'x', price: 1 }, { years: 5, price: -3 }, null, { years: 10, price: '99' }] });
    expect(tiers).toEqual([{ years: 5, price: 0 }, { years: 10, price: 99 }, { years: 20, price: 199 }]);
    expect(hostingTiersOf({ hosting_tiers: 'nope' })).toEqual([]);
  });

  it('the breakdown adds ONE term line only for a paid term, flat, and still sums exactly', () => {
    const schedule = scheduleFrom(MODEL, 3);
    for (const size of SIZE_KEYS)
      for (const binding of BINDINGS)
        for (const pages of PAGE_COUNTS)
          for (const years of [null, 5, 10, 15, 20]) {
            const b = priceBreakdown(schedule, size, binding, pages, 0, years);
            expect(b.total).toBe(priceOf(schedule, size, binding, pages) + hostingTermCharge(schedule, years));
            expect(b.items.reduce((s, i) => s + i.amount, 0)).toBe(b.total);
            const termLines = b.items.filter((i) => i.label.startsWith('Memories stay live'));
            expect(termLines).toHaveLength(years && years > 5 ? 1 : 0);
            if (years && years > 5) {
              expect(termLines[0].label).toContain(`${years} years`);
              expect(termLines[0].label).toContain('5 included');
            }
          }
  });

  it('QR add-on and term add-on stack independently', () => {
    const schedule = scheduleFrom(MODEL, 3);
    const b = priceBreakdown(schedule, '8x8', 'hard', 80, 9, 20);
    expect(b.total).toBe(priceOf(schedule, '8x8', 'hard', 80) + 3 * QR_PACK_PRICE + 199); // 9 videos: 2 free, 7 extra = 3 packs
    expect(b.items).toHaveLength(4); // album, extra pages, QR add-on, term
  });
});

describe('HD memories — one-time 1080p upgrade (owner, 2026-09-10)', () => {
  it('bills the flat price once, and ONLY when the album actually carries memories', () => {
    const schedule = scheduleFrom(MODEL, 3);
    expect(hdMemoriesPriceOf(schedule)).toBe(49);
    expect(hdMemoriesCharge(schedule, true, 3)).toBe(49);
    expect(hdMemoriesCharge(schedule, true, 12)).toBe(49);   // flat, not per memory
    expect(hdMemoriesCharge(schedule, true, 0)).toBe(0);     // HD flag, no memories
    expect(hdMemoriesCharge(schedule, false, 3)).toBe(0);
  });

  it('a pre-0032 schedule offers no upgrade and can never bill for one', () => {
    expect(hdMemoriesPriceOf({})).toBe(0);
    expect(hdMemoriesCharge({}, true, 7)).toBe(0);
    expect(hdMemoriesPriceOf({ hd_memories_price: 'free' })).toBe(0);
    expect(hdMemoriesPriceOf({ hd_memories_price: -5 })).toBe(0);
  });

  it('adds ONE line only when charged, and every line still sums to the total', () => {
    const schedule = scheduleFrom(MODEL, 3);
    for (const size of SIZE_KEYS)
      for (const binding of BINDINGS)
        for (const pages of PAGE_COUNTS)
          for (const qr of [0, 3, 9])
            for (const hd of [false, true]) {
              const b = priceBreakdown(schedule, size, binding, pages, qr, null, hd);
              expect(b.total).toBe(priceOf(schedule, size, binding, pages) + qrMemoryCharge(qr) + hdMemoriesCharge(schedule, hd, qr));
              expect(b.items.reduce((s, i) => s + i.amount, 0)).toBe(b.total);
              expect(b.items.filter((i) => i.label.startsWith('HD memories'))).toHaveLength(hd && qr > 0 ? 1 : 0);
            }
  });

  it('stacks with the QR add-on and the hosting term without double-counting', () => {
    const schedule = scheduleFrom(MODEL, 3);
    const b = priceBreakdown(schedule, '8x8', 'hard', 80, 9, 20, true);
    expect(b.total).toBe(priceOf(schedule, '8x8', 'hard', 80) + 3 * QR_PACK_PRICE + 199 + 49); // 9 videos: 3 packs
    expect(b.items).toHaveLength(5); // album, extra pages, QR add-on, term, HD
  });

  it('omitting the HD flag keeps every pre-0032 price byte-identical', () => {
    const schedule = scheduleFrom(MODEL, 3);
    for (const size of SIZE_KEYS)
      for (const pages of PAGE_COUNTS)
        expect(priceBreakdown(schedule, size, 'hard', pages, 7, 10))
          .toEqual(priceBreakdown(schedule, size, 'hard', pages, 7, 10, false));
  });
});

describe('pricing invariants', () => {
  it('prices never go down as pages go up', () => {
    const schedule = scheduleFrom(MODEL, 3);
    for (const size of SIZE_KEYS)
      for (const binding of BINDINGS) {
        let prev = 0;
        for (const pages of [...PAGE_COUNTS].sort((a, b) => a - b)) {
          const p = priceOf(schedule, size, binding, pages);
          expect(p).toBeGreaterThanOrEqual(prev);
          prev = p;
        }
      }
  });

  it('same-cost sizes differ by exactly their size premium', () => {
    // 11.5x8 and 8x8 share pps, so their softcover cost is identical — the
    // whole price gap must be the premium and nothing else.
    for (const pages of PAGE_COUNTS) {
      expect(costOf(MODEL, '11.5x8', 'soft', pages)).toBe(costOf(MODEL, '8x8', 'soft', pages));
      const diff = ownerPriceOf(MODEL, '11.5x8', 'soft', pages, 3)
        - ownerPriceOf(MODEL, '8x8', 'soft', pages, 3);
      expect(diff).toBe(MODEL.sizes['11.5x8'].surcharge - MODEL.sizes['8x8'].surcharge);
    }
  });

  it('bills the minimum page count below the floor', () => {
    const schedule = scheduleFrom(MODEL, 3);
    for (const size of SIZE_KEYS)
      expect(priceOf(schedule, size, 'soft', 1)).toBe(priceOf(schedule, size, 'soft', MIN_PAGES));
  });

  it('hardbound is never cheaper than softcover', () => {
    const schedule = scheduleFrom(MODEL, 3);
    for (const size of SIZE_KEYS)
      for (const pages of PAGE_COUNTS)
        expect(priceOf(schedule, size, 'hard', pages))
          .toBeGreaterThanOrEqual(priceOf(schedule, size, 'soft', pages));
  });

  it('the album line costs the same at any page count; the extra-pages line is all the extra pages add (round 3, the Indecisive One)', () => {
    for (const multiple of MULTIPLES) {
      const schedule = scheduleFrom(MODEL, multiple);
      for (const size of SIZE_KEYS)
        for (const binding of BINDINGS) {
          const base = priceOf(schedule, size, binding, MIN_PAGES);
          for (const pages of PAGE_COUNTS.filter((p) => p > MIN_PAGES)) {
            const [album, extra] = priceBreakdown(schedule, size, binding, pages).items;
            expect(album.amount, `${size} ${binding} ${pages}`).toBe(base);
            expect(extra.amount, `${size} ${binding} ${pages}`).toBe(priceOf(schedule, size, binding, pages) - base);
          }
        }
    }
  });

  it('10 more pages on an 8×8 are 3 more sheets of 4: ₱318 at ₱106 a sheet, not "10 × ₱27"', () => {
    const schedule = { ...scheduleFrom(MODEL, 3), sheet_rate: 106, min_pages: 40 };
    schedule.sizes = { ...schedule.sizes, '8x8': { ...schedule.sizes['8x8'], pps: 4 } };
    expect(extraPagesCharge(schedule, '8x8', 'soft', 50)).toEqual({ pages: 10, sheets: 3, amount: 318 });
    const [album, extra] = priceBreakdown(schedule, '8x8', 'soft', 50).items;
    expect(album.amount).toBe(priceOf(schedule, '8x8', 'soft', 40));
    expect(extra).toEqual({ label: 'Extra pages · 10 (pages print 4 to a sheet: 3 more sheets)', amount: 318 });
    expect(extraPagesCharge(schedule, '8x8', 'soft', 40)).toEqual({ pages: 0, sheets: 0, amount: 0 });
  });
});

// ── Free shipping built into the price + a real "was" price (owner, 2026-10-08; 0041) ──
// The owner matched Photobook PH's everyday sale at 2.5× and built ₱200 of
// shipping into every album, so checkout says "Free shipping". The crossed-out
// "was" price is the price we really charged (4×, 25 Jul – 8 Oct 2026, shipping
// free then too), and it switches off by itself on its end date.
const LIVE: PricingModel = { ...MODEL, price_multiple: 2.5, shipping_allowance: 200, compare_multiple: 4, compare_until: '2026-12-31' };
const BEFORE: PricingModel = { ...MODEL, price_multiple: 4 };

describe('shipping built into the price (0041)', () => {
  it('is FLAT: exactly ₱allowance more than a zero-allowance model, for every size/binding/pages/multiple', () => {
    const none: PricingModel = { ...LIVE, shipping_allowance: 0 };
    for (const multiple of MULTIPLES)
      for (const size of SIZE_KEYS)
        for (const binding of BINDINGS)
          for (const pages of PAGE_COUNTS) {
            expect(priceOf(scheduleFrom(LIVE, multiple), size, binding, pages) - priceOf(scheduleFrom(none, multiple), size, binding, pages)).toBe(200);
            expect(ownerPriceOf(LIVE, size, binding, pages, multiple) - ownerPriceOf(none, size, binding, pages, multiple)).toBe(200);
          }
  });

  it('schedule ↔ model agreement still holds with the allowance (customer charge = operator report)', () => {
    for (const multiple of MULTIPLES) {
      const schedule = scheduleFrom(LIVE, multiple);
      for (const size of SIZE_KEYS)
        for (const binding of BINDINGS)
          for (const pages of PAGE_COUNTS)
            expect(priceOf(schedule, size, binding, pages)).toBe(ownerPriceOf(LIVE, size, binding, pages, multiple));
    }
  });

  it('never touches the extra pages: they cost exactly what they did', () => {
    const none: PricingModel = { ...LIVE, shipping_allowance: 0 };
    for (const size of SIZE_KEYS)
      for (const binding of BINDINGS)
        for (const pages of PAGE_COUNTS)
          expect(extraPagesCharge(scheduleFrom(LIVE, 2.5), size, binding, pages)).toEqual(extraPagesCharge(scheduleFrom(none, 2.5), size, binding, pages));
  });

  it('the schedule tells checkout what the free shipping is worth, and carries no allowance/cost field', () => {
    const schedule = scheduleFrom(LIVE, 2.5);
    expect(freeShippingValueOf(schedule)).toBe(200);
    expect(shippingAllowanceOf(LIVE)).toBe(200);
    const json = JSON.stringify(schedule);
    for (const leak of ['shipping_allowance', 'compare_multiple', 'price_multiple', 'sheet_cost', 'hb', 'surcharge']) expect(json).not.toContain(leak);
  });

  it('a pre-0041 schedule or model prices exactly as before and claims no shipping value', () => {
    const legacy = scheduleFrom(MODEL, 3);
    delete (legacy as Partial<typeof legacy>).free_shipping_value;
    delete (legacy as Partial<typeof legacy>).compare_at;
    expect(freeShippingValueOf(legacy)).toBe(0);
    expect(shippingAllowanceOf(MODEL)).toBe(0);
    expect(compareAtPriceOf(legacy, '8x8', 'hard', 40, '2026-10-08')).toBeNull();
    for (const size of SIZE_KEYS) expect(priceOf(legacy, size, 'hard', 60)).toBe(ownerPriceOf(MODEL, size, 'hard', 60, 3));
  });
});

describe('the crossed-out "was" price (0041)', () => {
  it('is exactly the price we charged before, at every size, cover and page count', () => {
    const schedule = scheduleFrom(LIVE, 2.5, [], '2026-10-08');
    const before = scheduleFrom(BEFORE, 4);
    for (const size of SIZE_KEYS)
      for (const binding of BINDINGS)
        for (const pages of PAGE_COUNTS)
          expect(compareAtPriceOf(schedule, size, binding, pages, '2026-10-08')).toBe(priceOf(before, size, binding, pages));
  });

  it('switches itself off after its end date — on the server (no compare_at) and on a stale client', () => {
    expect(scheduleFrom(LIVE, 2.5, [], '2027-01-01').compare_at).toBeUndefined();
    const schedule = scheduleFrom(LIVE, 2.5, [], '2026-12-31');
    expect(compareAtPriceOf(schedule, '8x8', 'hard', 40, '2026-12-31')).toBe(2510);
    expect(compareAtPriceOf(schedule, '8x8', 'hard', 40, '2027-01-01')).toBeNull();
  });

  it('is never shown when it is not higher than today\'s price', () => {
    const notLower = scheduleFrom({ ...LIVE, compare_multiple: 2.5, shipping_allowance: 0 }, 2.5, [], '2026-10-08');
    for (const size of SIZE_KEYS) expect(compareAtPriceOf(notLower, size, 'hard', 40, '2026-10-08')).toBeNull();
    expect(scheduleFrom({ ...LIVE, compare_multiple: 2 }, 2.5, [], '2026-10-08').compare_at).toBeUndefined();
  });

  it('the owner\'s 2026-10-08 list: 8×8 hardbound ₱2,510 → ₱1,788, 8×8 softcover ₱1,710 → ₱1,288 (9×9 since removed)', () => {
    const live = { ...MODEL, sheet_cost: 26.5, hosting_reserve: 50 };
    const schedule = scheduleFrom({ ...live, shipping_allowance: 200, compare_multiple: 4, compare_until: '2026-12-31' }, 2.5, [], '2026-10-08');
    const cases: [AlbumSizePreset, Binding, number, number][] = [['8x8', 'hard', 2510, 1788], ['8x8', 'soft', 1710, 1288], ['6x6', 'hard', 1594, 1215]];
    for (const [size, binding, was, now] of cases) {
      expect(priceOf(schedule, size, binding, 40), `${size} ${binding} now`).toBe(now);
      expect(compareAtPriceOf(schedule, size, binding, 40, '2026-10-08'), `${size} ${binding} was`).toBe(was);
    }
  });

  it('manilaToday is a YYYY-MM-DD date in Philippine time', () => {
    expect(manilaToday(new Date('2026-12-31T16:30:00Z'))).toBe('2027-01-01');
    expect(manilaToday(new Date('2026-12-31T15:30:00Z'))).toBe('2026-12-31');
  });
});
