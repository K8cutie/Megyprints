import { describe, it, expect } from 'vitest';
import {
  priceOf, priceBreakdown, costOf, ownerPriceOf, formulaPriceOf, scheduleFrom, extraPagesCharge,
  fixedPriceOf, qrMemoryCharge, countQrMemories, FREE_QR_MEMORIES, EXTRA_QR_RATE,
  hostingTiersOf, hostingTermCharge, includedHostingYears, DEFAULT_HOSTING_TIERS,
  hdMemoriesPriceOf, hdMemoriesCharge,
  MIN_PAGES, SIZE_LABELS,
  type Binding, type PricingModel, type FixedPrices,
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
    '9x9':    { pps: 4,  hb: 380, surcharge: 150 },
    '11.5x8': { pps: 4,  hb: 450, surcharge: 300 },
    '8.5x11': { pps: 4,  hb: 500, surcharge: 300 },
  },
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

describe('living-memory QR add-on (7 included, ₱20 each after — owner, 2026-09-09)', () => {
  it('the first 7 QR memories cost nothing; each one past 7 is ₱20', () => {
    expect(FREE_QR_MEMORIES).toBe(7);
    expect(EXTRA_QR_RATE).toBe(20);
    for (let n = 0; n <= 7; n++) expect(qrMemoryCharge(n)).toBe(0);
    expect(qrMemoryCharge(8)).toBe(20);
    expect(qrMemoryCharge(12)).toBe(100);
    expect(qrMemoryCharge(-3)).toBe(0);
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
          for (const qr of [0, 1, 7, 8, 15]) {
            const b = priceBreakdown(schedule, size, binding, pages, qr);
            const print = priceOf(schedule, size, binding, pages);
            expect(b.total).toBe(print + qrMemoryCharge(qr));
            expect(b.items.reduce((s, i) => s + i.amount, 0)).toBe(b.total);
            const qrLines = b.items.filter((i) => i.label.includes('Living-memory QR'));
            expect(qrLines).toHaveLength(qr > FREE_QR_MEMORIES ? 1 : 0);
            if (qr > FREE_QR_MEMORIES) {
              expect(qrLines[0].label).toContain(`${FREE_QR_MEMORIES} included`);
              expect(qrLines[0].label).toContain(`${qr - FREE_QR_MEMORIES} extra`);
              expect(qrLines[0].amount).toBe((qr - FREE_QR_MEMORIES) * EXTRA_QR_RATE);
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
    expect(b.total).toBe(priceOf(schedule, '8x8', 'hard', 80) + 2 * EXTRA_QR_RATE + 199);
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
    expect(b.total).toBe(priceOf(schedule, '8x8', 'hard', 80) + 2 * EXTRA_QR_RATE + 199 + 49);
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
    // 9x9 and 8x8 share pps, so their interior cost is identical — the whole
    // price gap must be the premium and nothing else.
    for (const pages of PAGE_COUNTS) {
      expect(costOf(MODEL, '9x9', 'soft', pages)).toBe(costOf(MODEL, '8x8', 'soft', pages));
      const diff = ownerPriceOf(MODEL, '9x9', 'soft', pages, 3)
        - ownerPriceOf(MODEL, '8x8', 'soft', pages, 3);
      expect(diff).toBe(MODEL.sizes['9x9'].surcharge - MODEL.sizes['8x8'].surcharge);
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

  it('with no fixed prices, the operator price is the plain cost × multiple formula (pre-0041 prices unchanged)', () => {
    for (const multiple of MULTIPLES)
      for (const size of SIZE_KEYS)
        for (const binding of BINDINGS)
          for (const pages of PAGE_COUNTS)
            expect(ownerPriceOf(MODEL, size, binding, pages, multiple))
              .toBe(formulaPriceOf(MODEL, size, binding, pages, multiple));
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

// ── Fixed prices (owner, 2026-10-08; migration 0041) ────────────────────────
// The owner matched Photobook PH's live sale price (their standing 50% code,
// photobook.com.ph, checked 2026-10-08) on 8×6, 6×8, 8×8 and 9×9 (vs their 8×11),
// and held 6×4 / 6×6 at a floor: 2 × production cost + the ₱50 hosting
// reserve, rounded UP to the next ₱50. Fixture mirrors the 0041 seed.
const FIXED: FixedPrices = {
  '6x4': { soft: 550, hard: 750 },
  '6x6': { soft: 600, hard: 850 },
  '8x6': { soft: 700, hard: 1375 },
  '6x8': { soft: 700, hard: 1375 },
  '8x8': { soft: 800, hard: 1500 },
  '9x9': { soft: 900, hard: 1625 },
};
const FIXED_MODEL: PricingModel = { ...MODEL, fixed_prices: FIXED };
const FIXED_KEYS = Object.keys(FIXED) as AlbumSizePreset[];
const fixed = (size: AlbumSizePreset, binding: Binding) => FIXED[size]![binding]!;

describe('fixed prices — the owner sets the 40-page price per size and cover (0041)', () => {
  it('a fixed price is exactly what the customer pays for the included pages, at EVERY store multiple', () => {
    for (const multiple of MULTIPLES) {
      const schedule = scheduleFrom(FIXED_MODEL, multiple);
      for (const size of FIXED_KEYS)
        for (const binding of BINDINGS)
          for (const pages of [1, 20, MIN_PAGES - 1, MIN_PAGES])
            expect(priceOf(schedule, size, binding, pages), `${size} ${binding} ${pages} @${multiple}`)
              .toBe(fixed(size, binding));
    }
  });

  it('pages past the included ones are extra sheets × the same sheet rate — identical to before at a whole-peso rate (live 4× = ₱106)', () => {
    for (const multiple of MULTIPLES) {
      const before = scheduleFrom(MODEL, multiple);
      const after = scheduleFrom(FIXED_MODEL, multiple);
      for (const size of FIXED_KEYS)
        for (const binding of BINDINGS)
          for (const pages of PAGE_COUNTS.filter((p) => p > MIN_PAGES)) {
            const was = extraPagesCharge(before, size, binding, pages);
            const now = extraPagesCharge(after, size, binding, pages);
            expect(now.sheets).toBe(was.sheets);
            expect(now.amount).toBe(Math.round(now.sheets * after.sheet_rate));
            // A sheet rate with centavos rounds once now instead of twice, so
            // the extra-pages line can move by ₱1 — never more, never at ₱106.
            expect(Math.abs(now.amount - was.amount)).toBeLessThanOrEqual(1);
            if (Number.isInteger(after.sheet_rate)) expect(now.amount).toBe(was.amount);
          }
    }
  });

  it('schedule ↔ model agreement still holds with fixed prices (customer charge = operator report)', () => {
    for (const multiple of MULTIPLES) {
      const schedule = scheduleFrom(FIXED_MODEL, multiple);
      for (const size of SIZE_KEYS)
        for (const binding of BINDINGS)
          for (const pages of PAGE_COUNTS)
            expect(priceOf(schedule, size, binding, pages), `${size} ${binding} ${pages} @${multiple}`)
              .toBe(ownerPriceOf(FIXED_MODEL, size, binding, pages, multiple));
    }
  });

  it('a size or cover with no fixed price keeps the formula, byte-identical', () => {
    for (const multiple of MULTIPLES) {
      const formula = scheduleFrom(MODEL, multiple);
      const withFixed = scheduleFrom(FIXED_MODEL, multiple);
      expect(withFixed.sizes['11.5x8']).toEqual(formula.sizes['11.5x8']);
      expect(withFixed.sizes['8.5x11']).toEqual(formula.sizes['8.5x11']);
      expect(withFixed.sheet_rate).toBe(formula.sheet_rate);
      // Only the hardbound fixed: softcover stays on the formula.
      const hardOnly = scheduleFrom({ ...MODEL, fixed_prices: { '8x8': { hard: 1500 } } }, multiple);
      expect(hardOnly.sizes['8x8'].soft_rate).toBe(formula.sizes['8x8'].soft_rate);
      expect(priceOf(hardOnly, '8x8', 'hard', MIN_PAGES)).toBe(1500);
    }
  });

  it('the hosting reserve is absorbed: raising or dropping it never moves a fixed price', () => {
    for (const reserve of [0, 50, 120])
      for (const size of FIXED_KEYS)
        for (const binding of BINDINGS)
          expect(priceOf(scheduleFrom({ ...FIXED_MODEL, hosting_reserve: reserve }, 4), size, binding, MIN_PAGES))
            .toBe(fixed(size, binding));
  });

  it('the schedule still carries no cost, multiple, premium or fixed-price field', () => {
    const json = JSON.stringify(scheduleFrom(FIXED_MODEL, 4));
    for (const leak of ['price_multiple', 'sheet_cost', 'soft_cover_cost', 'soft_bind_cost', 'hb', 'surcharge', 'fixed'])
      expect(json).not.toContain(leak);
  });

  it('a malformed fixed price is ignored (formula), never ₱0 or NaN', () => {
    const junk = { '8x8': { soft: 'cheap', hard: -5 }, '6x6': { soft: 0, hard: Number.NaN }, '9x9': null } as unknown as FixedPrices;
    const schedule = scheduleFrom({ ...MODEL, fixed_prices: junk }, 4);
    expect(schedule).toEqual(scheduleFrom(MODEL, 4));
    expect(fixedPriceOf({ ...MODEL, fixed_prices: junk }, '8x8', 'soft')).toBeNull();
    expect(fixedPriceOf({ ...MODEL, fixed_prices: junk }, '9x9', 'hard')).toBeNull();
    expect(fixedPriceOf(MODEL, '8x8', 'hard')).toBeNull();
    expect(fixedPriceOf(FIXED_MODEL, '8x8', 'hard')).toBe(1500);
  });

  it('prices still never go down as pages go up, and hardbound is never cheaper than softcover', () => {
    const schedule = scheduleFrom(FIXED_MODEL, 4);
    for (const size of SIZE_KEYS)
      for (const binding of BINDINGS) {
        let prev = 0;
        for (const pages of [...PAGE_COUNTS].sort((a, b) => a - b)) {
          const p = priceOf(schedule, size, binding, pages);
          expect(p).toBeGreaterThanOrEqual(prev);
          prev = p;
          if (binding === 'hard') expect(p).toBeGreaterThanOrEqual(priceOf(schedule, size, 'soft', pages));
        }
      }
  });
});

describe('the 2026-10-08 price list (Photobook PH sale match + small-size floor)', () => {
  it('every fixed price covers its production cost AND the hosting reserve — no album sells at a loss', () => {
    for (const size of FIXED_KEYS)
      for (const binding of BINDINGS)
        expect(fixed(size, binding), `${size} ${binding}`)
          .toBeGreaterThan(costOf(MODEL, size, binding, MIN_PAGES) + MODEL.hosting_reserve);
  });

  it('8×6, 6×8, 8×8 and 9×9 match Photobook PH\'s sale price (half their list price)', () => {
    // Their 40-page list prices (pbx_product_configs, 2026-10-08), 50% code applied.
    const photobookList: Partial<Record<AlbumSizePreset, { soft: number; hard: number }>> = {
      '8x6': { soft: 1400, hard: 2750 },  // their 8×6
      '6x8': { soft: 1400, hard: 2750 },  // same paper as 8×6; they sell no 6×8
      '8x8': { soft: 1600, hard: 3000 },
      '9x9': { soft: 1800, hard: 3250 },  // they sell no 9×9; nearest is 8×11
    };
    for (const [size, list] of Object.entries(photobookList) as [AlbumSizePreset, { soft: number; hard: number }][])
      for (const binding of BINDINGS)
        expect(fixed(size, binding), `${size} ${binding}`).toBe(list[binding] / 2);
  });

  it('6×4 and 6×6 sit at the floor: 2 × cost + ₱50 reserve, rounded up to the next ₱50', () => {
    for (const size of ['6x4', '6x6'] as AlbumSizePreset[])
      for (const binding of BINDINGS)
        expect(fixed(size, binding), `${size} ${binding}`)
          .toBe(Math.ceil((2 * costOf(MODEL, size, binding, MIN_PAGES) + MODEL.hosting_reserve) / 50) * 50);
  });
});
