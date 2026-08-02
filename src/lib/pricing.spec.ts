import { describe, it, expect } from 'vitest';
import {
  priceOf, priceBreakdown, costOf, ownerPriceOf, scheduleFrom, perPageRate,
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

  it('per-page rate is positive for every size', () => {
    const schedule = scheduleFrom(MODEL, 3);
    for (const size of SIZE_KEYS) expect(perPageRate(schedule, size)).toBeGreaterThan(0);
  });
});
