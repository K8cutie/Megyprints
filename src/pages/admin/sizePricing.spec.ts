// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { PricingModel } from '../../lib/pricing';

/* Admin → Pricing → Album prices by size (0074): the owner's price per size and
   cover, with the cost, the multiple, the full cost, the profit, each partner's
   half and the affiliate's share beside it; flags a row that loses money or
   where the affiliate earns more than each partner; refuses a price under the
   floor before asking the database; saves only what changed. */

const MODEL = {
  sheet_cost: 26.5, soft_cover_cost: 50, soft_bind_cost: 100, min_pages: 40, price_multiple: 2.3,
  hosting_reserve: 50, shipping_allowance: 200, hosting_tiers: [], hd_memories_price: 99,
  sizes: {
    '6x4': { pps: 18, hb: 250, surcharge: 300, price_soft: 1078, price_hard: 1308 },
    '8x8': { pps: 4, hb: 350, surcharge: 300, price_soft: 1505, price_hard: 1965 },
    '11.5x8': { pps: 4, hb: 450, surcharge: 600 },
  },
} as unknown as PricingModel;

const mocks = vi.hoisted(() => ({
  setSizePrices: vi.fn<(p: unknown) => Promise<string | null>>(async () => null),
  disabled: ['11.5x8'] as string[],
  launch: { pct: 40, until: '2099-03-31' } as { pct: number | null; until: string | null } | null,
}));
vi.mock('../../lib/storeSettings', () => ({
  getDisabledSizes: () => mocks.disabled,
  loadOwnerLaunchPrice: async () => mocks.launch,
  loadOwnerPricingModel: async () => MODEL,
  setSizePrices: (p: unknown) => mocks.setSizePrices(p),
}));
vi.mock('../../lib/affiliates', () => ({
  loadAffiliateSettings: async () => ({ on: false, ratePct: 10, discount: 100, windowDays: 30, minPayout: 500 }),
}));

import SizePricing, { sizeRow } from './SizePricing';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const onSaved = vi.fn();
beforeEach(() => {
  mocks.setSizePrices.mockClear(); onSaved.mockClear();
  mocks.disabled = ['11.5x8'];
  mocks.launch = { pct: 40, until: '2099-03-31' };
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
const show = async () => { act(() => root.render(createElement(SizePricing, { model: MODEL, onSaved }))); await settle(); };
const byId = <T extends HTMLElement>(id: string) => host.querySelector<T>(`[data-testid="${id}"]`)!;
const type = (el: HTMLInputElement, v: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('sizeRow: one album, worst case', () => {
  const opts = { rebate: 200, affiliate: { ratePct: 10, discount: 100 }, launchPct: 40 };
  it('8×8 hardcover at ₱1,965: 2.8× cost, profit ₱613.50, ₱306.75 each, ₱186.50 to the affiliate, ₱3,275 crossed out', () => {
    const r = sizeRow(MODEL, '8x8', 'hard', 1965, opts);
    expect(r.cost).toBe(615);
    expect(r.floor).toBe(865);
    expect(r.times).toBeCloseTo(2.79, 2);
    expect(r.affiliate).toBeCloseTo(186.5, 6);
    expect(r.fullCost).toBeCloseTo(1251.5, 6);
    expect(r.profit).toBeCloseTo(613.5, 6);
    expect(r.partner).toBeCloseTo(306.75, 6);
    expect(r.regular).toBe(3275);
    expect(r.losesMoney).toBe(false);
    expect(r.affiliateAhead).toBe(false);
  });
  it('6×4 softcover at ₱778 (before the +₱300) loses money on an affiliate sale', () => {
    const r = sizeRow(MODEL, '6x4', 'soft', 778, opts);
    expect(r.profit).toBeLessThan(0);
    expect(r.losesMoney).toBe(true);
  });
  it('with no rebate and no affiliate, profit is price − cost − shipping − hosting', () => {
    const r = sizeRow(MODEL, '8x8', 'hard', 1965, { rebate: 0, affiliate: null, launchPct: null });
    expect(r.profit).toBe(1965 - 615 - 250);
    expect(r.affiliate).toBe(0);
    expect(r.regular).toBeNull();
  });
});

describe('Admin → Pricing: Album prices by size', () => {
  it('lists each size on sale, soft and hard, with its figures; a switched-off size is left out', async () => {
    await show();
    expect(byId<HTMLInputElement>('size-price-8x8:hard').value).toBe('1965');
    expect(byId<HTMLInputElement>('size-price-6x4:soft').value).toBe('1078');
    expect(byId('size-times-8x8:hard').textContent).toBe('2.8×');
    expect(byId('size-profit-8x8:hard').textContent).toBe('₱614');
    expect(byId('size-partner-8x8:hard').textContent).toBe('₱307');
    expect(byId('size-row-8x8:hard').textContent).toContain('₱3,275');
    expect(host.querySelector('[data-testid="size-row-11.5x8:hard"]')).toBeNull();
  });

  it('switching off the rebate adds it back to the profit', async () => {
    await show();
    act(() => byId<HTMLInputElement>('size-rebate-on').click());
    expect(byId('size-profit-8x8:hard').textContent).toBe('₱814');
  });

  it('flags a price where the affiliate earns more than each partner, and one that loses money', async () => {
    await show();
    act(() => type(byId<HTMLInputElement>('size-price-6x4:soft'), '900'));
    expect(byId('size-flag-6x4:soft').textContent).toBe('affiliate earns more than each partner');
    act(() => type(byId<HTMLInputElement>('size-price-6x4:soft'), '700'));
    expect(byId('size-flag-6x4:soft').textContent).toBe('loses money');
  });

  it('refuses a price under the floor before asking the database', async () => {
    await show();
    act(() => type(byId<HTMLInputElement>('size-price-8x8:hard'), '800'));
    act(() => byId<HTMLButtonElement>('size-save').click());
    await settle();
    expect(mocks.setSizePrices).not.toHaveBeenCalled();
    expect(byId('size-err').textContent).toContain('₱800 is under the floor of ₱865');
  });

  it('saves only what changed, and an empty box clears that price', async () => {
    await show();
    act(() => type(byId<HTMLInputElement>('size-price-8x8:hard'), '2100'));
    act(() => type(byId<HTMLInputElement>('size-price-6x4:soft'), ''));
    act(() => byId<HTMLButtonElement>('size-save').click());
    await settle();
    expect(mocks.setSizePrices).toHaveBeenCalledWith({ '8x8': { hard: 2100 }, '6x4': { soft: null } });
    expect(onSaved).toHaveBeenCalled();
    expect(byId('size-said').textContent).toContain('Saved 2 prices');
  });

  it('shows the database refusal', async () => {
    mocks.setSizePrices.mockResolvedValueOnce('not authorized');
    await show();
    act(() => type(byId<HTMLInputElement>('size-price-8x8:soft'), '1600'));
    act(() => byId<HTMLButtonElement>('size-save').click());
    await settle();
    expect(byId('size-err').textContent).toContain('not authorized');
  });

  it('with no launch price running, no crossed-out price', async () => {
    mocks.launch = { pct: 40, until: '2020-01-01' };
    await show();
    expect(byId('size-row-8x8:hard').textContent).not.toContain('₱3,275');
  });
});
