import { describe, it, expect } from 'vitest';
import {
  priceOf, priceBreakdown, costOf, SIZES, SIZE_SURCHARGE, MIN_PAGES,
  type Binding,
} from './pricing';
import type { AlbumSizePreset } from '../pages/builder/types';

// The customer pays real pesos off this module and the operator prices from the
// SAME functions, so a silent regression here mis-charges every order with no
// signal. These lock the invariants that must never drift.

const SIZE_KEYS = Object.keys(SIZES) as AlbumSizePreset[];
const BINDINGS: Binding[] = ['soft', 'hard'];
const MULTIPLES = [2, 2.5, 3, 4];
const PAGE_COUNTS = [1, 20, MIN_PAGES - 1, MIN_PAGES, MIN_PAGES + 1, 60, 80, 120, 200];

describe('priceBreakdown', () => {
  it('line items always sum EXACTLY to the total (no rounding leak)', () => {
    for (const size of SIZE_KEYS)
      for (const binding of BINDINGS)
        for (const mult of MULTIPLES)
          for (const pages of PAGE_COUNTS) {
            const b = priceBreakdown(size, binding, pages, mult);
            const sum = b.items.reduce((s, i) => s + i.amount, 0);
            expect(sum, `${size}/${binding}/${pages}pp/x${mult}`).toBe(b.total);
          }
  });

  it('never produces a negative or non-finite line amount', () => {
    for (const size of SIZE_KEYS)
      for (const binding of BINDINGS)
        for (const mult of MULTIPLES)
          for (const pages of PAGE_COUNTS) {
            const b = priceBreakdown(size, binding, pages, mult);
            for (const item of b.items) {
              expect(Number.isFinite(item.amount)).toBe(true);
              expect(item.amount, `${item.label}`).toBeGreaterThanOrEqual(0);
            }
            expect(b.total).toBeGreaterThan(0);
          }
  });

  it('total equals priceOf for the same inputs', () => {
    for (const size of SIZE_KEYS)
      for (const binding of BINDINGS)
        for (const pages of PAGE_COUNTS) {
          const b = priceBreakdown(size, binding, pages, 3);
          expect(b.total).toBe(priceOf(size, binding, pages, 3));
        }
  });
});

describe('priceOf', () => {
  it('is non-decreasing as page count grows', () => {
    for (const size of SIZE_KEYS)
      for (const binding of BINDINGS) {
        let prev = -Infinity;
        for (const pages of [...PAGE_COUNTS].sort((a, b) => a - b)) {
          const p = priceOf(size, binding, pages, 3);
          expect(p, `${size}/${binding}/${pages}pp`).toBeGreaterThanOrEqual(prev);
          prev = p;
        }
      }
  });

  it('applies exactly the size surcharge premium (soft binding isolates it: 9x9 vs 8x8 cost the same to produce)', () => {
    // 8x8 and 9x9 share pps=4 → identical costOf on SOFT binding, so the whole
    // price difference must be their SIZE_SURCHARGE difference — nothing else.
    for (const pages of PAGE_COUNTS) {
      expect(costOf('9x9', 'soft', pages)).toBe(costOf('8x8', 'soft', pages));
      const diff = priceOf('9x9', 'soft', pages, 3) - priceOf('8x8', 'soft', pages, 3);
      expect(diff).toBe(SIZE_SURCHARGE['9x9'] - SIZE_SURCHARGE['8x8']);
    }
  });

  it('charges at least MIN_PAGES worth even for a tiny album', () => {
    for (const size of SIZE_KEYS) {
      expect(priceOf(size, 'soft', 1, 3)).toBe(priceOf(size, 'soft', MIN_PAGES, 3));
    }
  });
});
