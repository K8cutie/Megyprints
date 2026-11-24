import { describe, it, expect } from 'vitest';
import {
  crossedOutPrintOf, compareAtPriceOf, launchLine, launchOf, launchRegularOf, longDate, parseLaunchPrice, priceOf,
  type PriceSchedule,
} from './pricing';

/* ══════════════════════════════════════════════════════════════════════════
   WHY THIS TEST: the launch price (owner, 2026-11-24: "Yes, 40% to Mar 31")
   shows today's album prices as "40% off" a crossed-out regular price. That
   claim has to be TRUE for the album it sits on (a made-up regular price is a
   deceptive price claim under the Consumer Act), it must stop by itself after
   its end date, and it must never touch the Megy Mini. Nothing anyone pays
   changes: the paid price stays priceOf(); only the crossed-out number is new.
   ══════════════════════════════════════════════════════════════════════════ */

/** The live list on 2026-11-24 (2.3×): public_price_schedule(). */
const LIVE = {
  disabled_sizes: ['8.5x11', '11.5x8', '9x9'], free_shipping_value: 200, hd_memories_price: 99, hosting_reserve: 50,
  hosting_tiers: [{ price: 0, years: 5 }, { price: 99, years: 10 }, { price: 149, years: 15 }, { price: 199, years: 20 }],
  min_pages: 40, sheet_rate: 60.95,
  sizes: {
    '6x4': { pps: 18, hard_rate: 775, soft_rate: 545 }, '6x6': { pps: 12, hard_rate: 844, soft_rate: 545 },
    '6x8': { pps: 8, hard_rate: 1005, soft_rate: 545 }, '8x6': { pps: 8, hard_rate: 1005, soft_rate: 545 },
    '8x8': { pps: 4, hard_rate: 1005, soft_rate: 545 },
  },
} as unknown as PriceSchedule;
const LAUNCH = { ...LIVE, launch: { pct: 40, until: '2027-03-31' } } as PriceSchedule;
const TODAY = '2026-11-24';

describe('the launch price as the database sends it', () => {
  it('takes a whole % from 1 to 90 and a real end date', () => {
    expect(parseLaunchPrice({ pct: 40, until: '2027-03-31' })).toEqual({ pct: 40, until: '2027-03-31' });
    expect(parseLaunchPrice({ pct: 1, until: '2027-01-01' })).not.toBeNull();
    expect(parseLaunchPrice({ pct: 90, until: '2027-01-01' })).not.toBeNull();
  });

  it('refuses anything that could not be shown honestly', () => {
    for (const bad of [null, undefined, 'x', {}, { pct: 0, until: '2027-03-31' }, { pct: 91, until: '2027-03-31' },
      { pct: 40.5, until: '2027-03-31' }, { pct: 40 }, { pct: 40, until: 'March 31' }, { pct: 40, until: 20270331 }]) {
      expect(parseLaunchPrice(bad)).toBeNull();
    }
  });

  it('runs through its last day (Manila) and stops the day after', () => {
    expect(launchOf(LAUNCH, '2027-03-31')).toEqual({ pct: 40, until: '2027-03-31' });
    expect(launchOf(LAUNCH, '2027-04-01')).toBeNull();
    expect(launchOf(LIVE, TODAY)).toBeNull();
    expect(launchOf(null, TODAY)).toBeNull();
  });
});

describe("the regular price: today's ÷ (1 − 40%)", () => {
  it('the owner\'s table (2026-11-24): 8×8 hard ₱2,775 → ₱1,665, soft ₱2,008 → ₱1,205, 6×6 hard ₱1,897 → ₱1,138', () => {
    expect(priceOf(LAUNCH, '8x8', 'hard', 40)).toBe(1665);
    expect(launchRegularOf(LAUNCH, '8x8', 'hard', 40, TODAY)).toBe(2775);
    expect(launchRegularOf(LAUNCH, '8x8', 'soft', 40, TODAY)).toBe(2008);
    expect(launchRegularOf(LAUNCH, '6x6', 'hard', 40, TODAY)).toBe(1897);
    expect(launchRegularOf(LAUNCH, '6x6', 'soft', 40, TODAY)).toBe(1398);
    expect(launchRegularOf(LAUNCH, '8x6', 'hard', 40, TODAY)).toBe(2267);
    expect(launchRegularOf(LAUNCH, '6x4', 'soft', 40, TODAY)).toBe(1297);
  });

  it('"40% off" is true for every album the list sells, at every page count', () => {
    let checked = 0;
    for (const size of ['6x4', '6x6', '6x8', '8x6', '8x8'] as const) for (const binding of ['soft', 'hard'] as const) {
      for (let pages = 40; pages <= 200; pages += 2) {
        const now = priceOf(LAUNCH, size, binding, pages);
        const regular = launchRegularOf(LAUNCH, size, binding, pages, TODAY) as number;
        // Rounding to the peso moves it by well under 0.1 of a percent.
        expect(Math.abs(1 - now / regular - 0.4)).toBeLessThan(0.0005);
        checked++;
      }
    }
    expect(checked).toBe(810);
  });

  it('never for the Megy Mini (its own price) or a size the list has no rate for', () => {
    expect(launchRegularOf(LAUNCH, '5.8x8.3', 'soft', 16, TODAY)).toBeNull();
    expect(launchRegularOf(LAUNCH, '11.5x8', 'hard', 40, TODAY)).toBeNull();
  });
});

describe('one crossed-out price at a time', () => {
  const BOTH = {
    ...LAUNCH,
    compare_at: { until: '2026-12-31', sheet_rate: 106, sizes: { '8x8': { soft_rate: 650, hard_rate: 1450 } } },
  } as unknown as PriceSchedule;

  it('the launch price wins over the old "was" price while both are set', () => {
    expect(crossedOutPrintOf(BOTH, '8x8', 'hard', 40, TODAY)).toBe(2775);
    expect(crossedOutPrintOf(BOTH, '8x8', 'hard', 40, TODAY)).not.toBe(compareAtPriceOf(BOTH, '8x8', 'hard', 40, TODAY));
  });

  it('with no launch price, the old "was" price shows as before', () => {
    const wasOnly = { ...BOTH, launch: null } as PriceSchedule;
    expect(crossedOutPrintOf(wasOnly, '8x8', 'hard', 40, TODAY)).toBe(compareAtPriceOf(wasOnly, '8x8', 'hard', 40, TODAY));
  });
});

describe('the words', () => {
  it('say what is discounted (the album) and when it ends, in plain English', () => {
    expect(launchLine({ pct: 40, until: '2027-03-31' })).toBe('Launch price: 40% off the album until March 31, 2027');
    expect(longDate('2027-01-05')).toBe('January 5, 2027');
  });
});
