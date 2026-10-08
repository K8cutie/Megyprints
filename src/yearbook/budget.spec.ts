import { describe, expect, it } from 'vitest';
import { fitBudget, pricePerCopy, roundPages, type DensityOption } from './budget';
import type { PriceSchedule } from '../lib/pricing';

describe('budget', () => {
  it('rounds pages up to whole 4-page sheets', () => {
    expect([1, 4, 5, 41, 44].map(roundPages)).toEqual([4, 4, 8, 44, 44]);
  });

  it('prices from the live schedule, null before it loads', () => {
    const schedule = { min_pages: 40, sheet_rate: 66.25, hosting_reserve: 50, sizes: { '8.5x11': { pps: 4, soft_rate: 675, hard_rate: 1550 } } } as unknown as PriceSchedule;
    expect(pricePerCopy(null, 'soft', 44)).toBeNull();
    expect(pricePerCopy(schedule, 'soft', 44)).toBe(Math.round(11 * 66.25 + 675) + 50);
  });

  it('fit my budget picks the biggest portraits that fit', () => {
    const opts: DensityOption[] = [
      { density: 4, pages: 120, price: 2400 }, { density: 9, pages: 72, price: 1700 }, { density: 12, pages: 60, price: 1500 },
    ];
    expect(fitBudget(opts, 1550)?.density).toBe(12);
    expect(fitBudget(opts, 1800)?.density).toBe(9);
    expect(fitBudget(opts, 5000)?.density).toBe(4);
    expect(fitBudget(opts, 1000)).toBeNull();
  });
});
