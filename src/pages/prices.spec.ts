// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';

/* ══════════════════════════════════════════════════════════════════════════
   PRICES PAGE (2026-11-27). PayMongo checks that the website shows its prices
   in pesos before it turns payments on. The page reads the live price list,
   the same one checkout charges from, so it can't show a price the checkout
   doesn't: no numbers typed in by hand.
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({
  schedule: null as unknown,
  ready: true,
  retried: 0,
}));
vi.mock('../lib/storeSettings', () => ({
  getPriceSchedule: () => h.schedule,
  isStoreSettingsReady: () => h.ready,
  onStoreSettingsChange: () => () => {},
  retryStoreSettings: async () => { h.retried++; },
}));

import Prices, { sizesOnSale } from './Prices';
import { priceOf } from '../lib/pricing';
import type { PriceSchedule } from '../lib/pricing';

const SIZES = {
  '6x4': { pps: 16, soft_rate: 300, hard_rate: 530 },
  '6x6': { pps: 12, soft_rate: 330, hard_rate: 630 },
  '8x8': { pps: 4, soft_rate: 400, hard_rate: 860 },
  '11.5x8': { pps: 4, soft_rate: 700, hard_rate: 1200 },
};
const base = (extra: Record<string, unknown> = {}) => ({
  min_pages: 40, sheet_rate: 60.95, hosting_reserve: 50, hosting_tiers: [],
  disabled_sizes: ['11.5x8'], sizes: SIZES, ...extra,
}) as unknown as PriceSchedule;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  h.schedule = base(); h.ready = true; h.retried = 0;
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

const open = async () => { await act(async () => { root.render(createElement(MemoryRouter, null, createElement(Prices))); }); };
const $ = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const peso = (n: number) => `₱${Math.round(n).toLocaleString('en-PH')}`;

describe('the prices table', () => {
  it('shows every size on sale, softcover and hardcover, at the price checkout charges', async () => {
    await open();
    const rows = host.querySelectorAll('[data-testid="prices-row"]');
    expect(rows.length).toBe(3);
    for (const s of ['6x4', '6x6', '8x8'] as const) {
      expect($(`price-${s}-soft`)?.textContent).toBe(peso(priceOf(base(), s, 'soft', 40)));
      expect($(`price-${s}-hard`)?.textContent).toBe(peso(priceOf(base(), s, 'hard', 40)));
    }
    expect(host.textContent).toContain('Philippine pesos (₱)');
    expect($('prices-albums')?.textContent).toContain('40 pages and 2 video memories included');
  });

  it('leaves out a size the owner switched off, and lists the rest cheapest first', async () => {
    await open();
    expect($('price-11.5x8-soft')).toBeNull();
    expect(sizesOnSale(base())).toEqual(['6x4', '6x6', '8x8']);
    const pricier = base({ sizes: { ...SIZES, '6x4': { pps: 16, soft_rate: 2000, hard_rate: 2400 } } });
    expect(sizesOnSale(pricier)).toEqual(['6x6', '8x8', '6x4']);
  });

  it('shows the launch price line and the crossed-out regular price while it runs', async () => {
    h.schedule = base({ launch: { pct: 40, until: '2999-03-31' } });
    await open();
    expect($('prices-launch')?.textContent).toContain('40% off the album until March 31, 2999');
    const now = priceOf(base(), '8x8', 'hard', 40);
    expect($('price-was-8x8-hard')?.textContent).toBe(peso(Math.round(now / 0.6)));
  });

  it('shows no crossed-out price when no launch price runs', async () => {
    await open();
    expect($('prices-launch')).toBeNull();
    expect($('price-was-8x8-hard')).toBeNull();
  });
});

describe('Megy Mini', () => {
  it('shows its price and shipping while it is on sale', async () => {
    h.schedule = base({ mini: { size: '5.8x8.3', cover: 'staple', pages: 16, price: 350, package_price: 299, shipping_fee: 120, free_qr: 2 } });
    await open();
    expect($('prices-mini-price')?.textContent).toBe('From ₱350 + ₱120 shipping');
  });

  it('is left out when Megy Mini is off', async () => {
    await open();
    expect($('prices-mini')).toBeNull();
  });
});

describe('before the price list arrives', () => {
  it('says it is loading, never a made-up number', async () => {
    h.schedule = null; h.ready = false;
    await open();
    expect($('prices-loading')?.textContent).toContain('Loading');
    expect(host.textContent).not.toMatch(/₱\d/);
  });

  it('offers to try again when the list could not load', async () => {
    h.schedule = null; h.ready = true;
    await open();
    const btn = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Try again')!;
    await act(async () => { btn.click(); });
    expect(h.retried).toBe(1);
  });
});

describe('where visitors find it', () => {
  it('has its own address and a footer link', () => {
    expect(readFileSync('src/App.tsx', 'utf8')).toContain('<Route path="/prices" element={<Prices />} />');
    expect(readFileSync('src/components/Footer.tsx', 'utf8')).toContain("{ label: 'Prices', path: '/prices' }");
  });
});
