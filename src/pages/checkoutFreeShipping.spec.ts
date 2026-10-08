// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

/* ══════════════════════════════════════════════════════════════════════════
   FREE SHIPPING + THE REAL "WAS" PRICE AT CHECKOUT (owner, 2026-10-08; 0041)
   Shipping is built into the price, so the summary says Shipping · Free with
   what it is worth, and — while it runs — the total sits next to the price we
   really charged before, crossed out, with what the customer saves. Once the
   was price has ended, or on a schedule that predates it, none of that shows
   and nothing else about the total changes.
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({
  auth: { user: null as { id: string } | null, loading: true },
  job: null as unknown,
  schedule: null as unknown,
}));
vi.mock('../lib/authContext', () => ({ useAuth: () => h.auth }));
vi.mock('../components/AuthModalProvider', () => ({ useAuthModal: () => ({ openLogin: vi.fn() }) }));
vi.mock('../lib/printJobRebuild', () => ({ rebuildPrintJobFromAlbum: async () => h.job }));
vi.mock('../lib/useIndexedDBPhotos', () => ({ useIndexedDBPhotos: () => ({ get: async () => null }) }));
vi.mock('../lib/myOrders', () => ({ getMyOrder: async () => null, openOrderForAlbum: async () => null, lastOrderForAlbum: async () => null }));
vi.mock('../components/AddressPicker', () => ({ default: () => null }));
vi.mock('./builder/CoverThumb', () => ({ default: () => createElement('div', { 'data-testid': 'cover-thumb' }) }));
vi.mock('../lib/memoryClips', () => ({
  uploadStagedClips: async () => {}, prefetchStagedClipUploads: () => {}, stagedClipBytes: async () => 0,
  removeStagedClip: async () => {}, currentClipQuality: () => 'standard',
}));
vi.mock('../lib/storeSettings', () => ({
  getPriceSchedule: () => h.schedule, isStoreSettingsReady: () => true, storeSettingsReady: () => Promise.resolve(),
  onStoreSettingsChange: () => () => {}, retryStoreSettings: () => {},
}));

import Order from './Order';
import { saveCheckoutForm } from '../lib/checkoutSession';
import { noteOrderHandoff } from '../lib/printQueue';
import { EMPTY_ADDRESS } from '../lib/contact';
import { priceOf, compareAtPriceOf, type PriceSchedule } from '../lib/pricing';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const SIZES = ['6x6', '8x8', '9x9', '6x4', '8x6', '6x8', '8.5x11', '11.5x8'];
const schedule = (extra: Partial<PriceSchedule>): PriceSchedule => ({
  min_pages: 40, sheet_rate: 66.25, hosting_reserve: 50, hosting_tiers: [{ years: 5, price: 0 }, { years: 10, price: 99 }],
  disabled_sizes: [],
  sizes: Object.fromEntries(SIZES.map((s) => [s, { pps: 4, soft_rate: 575, hard_rate: 1300 }])) as PriceSchedule['sizes'],
  ...extra,
});
const compareAt = (until: string) => ({
  until, sheet_rate: 106,
  sizes: Object.fromEntries(SIZES.map((s) => [s, { soft_rate: 650, hard_rate: 1720 }])) as NonNullable<PriceSchedule['compare_at']>['sizes'],
});
const page = (i: number) => ({ id: `p${i}`, layout: 'single', size: '9x9', templateId: 't99-solo', slotFills: [i], photos: [], textElements: [], background: { type: 'solid', solid: '#fff' } });
const photos = Array.from({ length: 41 }, (_, i) => ({ id: `ph${i}`, name: `${i}.jpg`, previewUrl: '', type: 'image/jpeg', size: 1, width: 1200, height: 1200 }));

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  sessionStorage.clear(); localStorage.clear();
  window.scrollTo = (() => {}) as typeof window.scrollTo;
  h.auth = { user: { id: 'user-1' }, loading: false };
  h.job = { albumId: 'album-1', albumSize: '9x9', pages: Array.from({ length: 41 }, (_, i) => page(i)), photos, coverFront: { ...page(99), id: 'cover' } };
  noteOrderHandoff({ albumId: 'album-1', saved: true });
  saveCheckoutForm({ albumId: 'album-1', name: 'Fe Freeship', phone: '0917 555 0133', address: EMPTY_ADDRESS, material: 'glossy', cover: 'hardboundLeather', userId: 'user-1' });
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

const render = () => act(async () => { root.render(createElement(MemoryRouter, null, createElement(Order))); });
const settle = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); });
const peso = (sel: string) => Number((host.querySelector(sel)?.textContent ?? '').replace(/[^\d]/g, ''));

describe('free shipping and the real was price at checkout', () => {
  it('says Shipping · Free, what it is worth, and what is included', async () => {
    h.schedule = schedule({ free_shipping_value: 200, compare_at: compareAt('2099-12-31') });
    await render(); await settle();
    expect(host.querySelector('[data-testid="order-shipping"]')?.textContent).toBe('Free');
    const included = host.querySelector('[data-testid="order-included"]')?.textContent ?? '';
    expect(included).toContain('Free shipping (₱200 value)');
    expect(included).toContain('7 living-memory QRs (₱140 value)');
    expect(included).toContain('5 years of memory hosting');
  });

  it('crosses out the price we really charged before, and the saving is exactly was − now', async () => {
    const s = schedule({ free_shipping_value: 200, compare_at: compareAt('2099-12-31') });
    h.schedule = s;
    await render(); await settle();
    const now = peso('[data-testid="order-total"]');
    const was = peso('[data-testid="order-was"]');
    // 41 pages of 9×9 hardbound, no add-ons: the print price IS the total.
    expect(now).toBe(priceOf(s, '9x9', 'hard', 41));
    expect(was).toBe(compareAtPriceOf(s, '9x9', 'hard', 41, '2026-10-08'));
    expect(was).toBeGreaterThan(now);
    expect(host.querySelector('[data-testid="order-was"]')?.tagName).toBe('S');
    expect(peso('[data-testid="order-savings"]')).toBe(was - now);
  });

  it('shows no was price once it has ended — the total is unchanged and shipping is still free', async () => {
    h.schedule = schedule({ free_shipping_value: 200, compare_at: compareAt('2000-01-01') });
    await render(); await settle();
    expect(host.querySelector('[data-testid="order-was"]')).toBeNull();
    expect(host.querySelector('[data-testid="order-savings"]')).toBeNull();
    expect(peso('[data-testid="order-total"]')).toBe(priceOf(h.schedule as PriceSchedule, '9x9', 'hard', 41));
    expect(host.querySelector('[data-testid="order-shipping"]')?.textContent).toBe('Free');
  });

  it('a schedule from before 0041 claims no shipping value and no was price', async () => {
    h.schedule = schedule({});
    await render(); await settle();
    expect(host.querySelector('[data-testid="order-was"]')).toBeNull();
    const included = host.querySelector('[data-testid="order-included"]')?.textContent ?? '';
    expect(included).toContain('Free shipping');
    expect(included).not.toContain('value)Free');
    expect(included).not.toMatch(/Free shipping \(₱/);
  });
});
