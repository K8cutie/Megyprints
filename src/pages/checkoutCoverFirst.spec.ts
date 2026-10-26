// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

/* ══════════════════════════════════════════════════════════════════════════
   PLACE ORDER MAKES THE COVER FIRST, AND STOPS WITHOUT ONE (MP-2026-KGCFSQN,
   2026-10-22): the cover used to be made after the album pages and skipped
   when it failed, so a paid order had no cover. The real checkout page, a
   real tap on Place order; the uploads are recorded in the order they happen.
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({
  auth: { user: { id: 'user-1' } as { id: string } | null, loading: false },
  job: null as unknown,
  steps: [] as string[],
  coverFails: false as false | 'send' | 'make',
  reports: [] as Record<string, unknown>[],
}));
vi.mock('../lib/authContext', () => ({ useAuth: () => h.auth }));
vi.mock('../components/AuthModalProvider', () => ({ useAuthModal: () => ({ openLogin: vi.fn() }) }));
vi.mock('../lib/printJobRebuild', () => ({ rebuildPrintJobFromAlbum: async () => h.job }));
vi.mock('../lib/useIndexedDBPhotos', () => ({ useIndexedDBPhotos: () => ({ get: async () => null }) }));
vi.mock('../lib/myOrders', () => ({ getMyOrder: async () => null, openOrderForAlbum: async () => null, lastOrderForAlbum: async () => null }));
vi.mock('../components/AddressPicker', () => ({ default: () => null }));
vi.mock('./builder/CoverThumb', () => ({ default: () => createElement('div', { 'data-testid': 'cover-thumb' }) }));
vi.mock('../lib/memoryClips', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/memoryClips')>()),
  uploadStagedClips: async () => ({ replaced: [] }), prefetchStagedClipUploads: () => {}, stagedClipBytes: async () => 0,
  removeStagedClip: async () => {}, currentClipQuality: () => 'standard', findMissingClips: async () => [],
}));
vi.mock('../lib/report', () => ({ reportError: (_e: unknown, ctx: Record<string, unknown>) => { h.reports.push(ctx); } }));
vi.mock('../lib/orders', () => ({
  createOrderFromAlbum: async () => { h.steps.push('order row'); return { id: 'order-1', order_number: 'MP-2026-TEST123', status: 'pending_payment', album_id: 'album-1' }; },
  uploadOrderPrintPdf: async () => { h.steps.push('album pages'); },
  uploadOrderCoverPdfWithRetry: async (_id: string, input: { pageCount: number }, onFail?: (e: unknown, n: number) => void) => {
    h.steps.push(`cover (${input.pageCount} pages)`);
    if (h.coverFails) {
      const err = h.coverFails === 'send'
        ? new Error('Cover file upload failed: Failed to fetch')
        : new TypeError("Cannot read properties of null (reading 'fillStyle')");
      for (const n of [1, 2, 3]) onFail?.(err, n);
      throw err;
    }
  },
}));
vi.mock('../lib/storeSettings', () => {
  const sizes = Object.fromEntries(['6x6', '8x8', '6x4', '8x6', '6x8', '8.5x11', '11.5x8'].map((s) => [s, { pps: 2, soft_rate: 1200, hard_rate: 2100 }]));
  const schedule = { min_pages: 40, sheet_rate: 24, hosting_reserve: 0, hosting_tiers: [], disabled_sizes: [], sizes };
  return {
    getPriceSchedule: () => schedule, isStoreSettingsReady: () => true, storeSettingsReady: () => Promise.resolve(),
    onStoreSettingsChange: () => () => {}, retryStoreSettings: () => {},
  };
});

import Order from './Order';
import { saveCheckoutForm } from '../lib/checkoutSession';
import { noteOrderHandoff, clearPendingPrintJob } from '../lib/printQueue';
import { EMPTY_ADDRESS } from '../lib/contact';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const page = (i: number) => ({ id: `p${i}`, layout: 'single', size: '6x6', templateId: 't88-solo-square', slotFills: [i], photos: [], textElements: [], background: { type: 'solid', solid: '#fff' } });
// 41 pages use photos 0-40; photo 41 is only on the cover.
const photos = Array.from({ length: 42 }, (_, i) => ({ id: `ph${i}`, name: `${i}.jpg`, previewUrl: `blob:here/${i}`, type: 'image/jpeg', size: 1, width: 1200, height: 1200 }));
// MP-2026-KGCFSQN's cover: an album photo as the whole background.
const coverOn = (photoId: string) => ({ ...page(99), id: 'cover', slotFills: [null], background: { type: 'image', image: 'blob:dead', photoId } });
const ADDRESS = { ...EMPTY_ADDRESS, regionCode: 'r', regionName: 'NCR', provinceCode: 'p', provinceName: 'Metro Manila', cityCode: 'c', cityName: 'Quezon City', barangayCode: 'b', barangayName: 'Bagumbayan', street: '12 Mango St', zip: '1110' };

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  sessionStorage.clear(); localStorage.clear();
  clearPendingPrintJob();
  window.scrollTo = (() => {}) as typeof window.scrollTo;
  Element.prototype.scrollIntoView = () => {};
  h.steps = []; h.reports = []; h.coverFails = false;
  h.job = { albumId: 'album-1', albumSize: '6x6', pages: Array.from({ length: 41 }, (_, i) => page(i)), photos, coverFront: coverOn('ph41') };
  noteOrderHandoff({ albumId: 'album-1', saved: true });
  saveCheckoutForm({ albumId: 'album-1', name: 'Maria Santos', phone: '0917 555 0133', address: ADDRESS, material: 'matte', cover: 'softcover', userId: 'user-1' });
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

const settle = () => act(async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); });
const open = async () => {
  await act(async () => { root.render(createElement(MemoryRouter, null, createElement(Order))); });
  await settle();
};
const placeOrder = async () => {
  const btn = host.querySelector<HTMLButtonElement>('[data-testid="order-place"]');
  expect(btn?.textContent).toMatch(/Place order/);
  await act(async () => { btn!.click(); });
  await settle();
};

describe('Place order', () => {
  it('makes the cover first, then the album pages, then shows the payment', async () => {
    await open();
    await placeOrder();
    expect(h.steps).toEqual(['order row', 'cover (41 pages)', 'album pages']);
    expect(host.textContent).toMatch(/MP-2026-TEST123/);
    expect(host.textContent).not.toMatch(/couldn't (make|send) your album's cover/);
  });

  it('a cover that fails to send 3 times stops checkout: no album pages, no payment screen, and every try reported', async () => {
    h.coverFails = 'send';
    await open();
    await placeOrder();
    expect(h.steps).toEqual(['order row', 'cover (41 pages)']);
    expect(host.textContent).toContain("We couldn't send your album's cover. Your order is saved: check your internet, then tap Place order again.");
    expect(host.querySelector('[data-testid="order-place"]')).not.toBeNull(); // still on the form, to try again
    expect(h.reports.filter((r) => r.step === 'cover_pdf').map((r) => r.attempt)).toEqual([1, 2, 3]);
  });

  it("a cover this phone can't make says so, not \"check your internet\" (red-team)", async () => {
    h.coverFails = 'make';
    await open();
    await placeOrder();
    expect(h.steps).toEqual(['order row', 'cover (41 pages)']);
    expect(host.textContent).toContain("We couldn't make your album's cover on this phone. Your order is saved: close your other apps, then tap Place order again. If it keeps happening, message us.");
    expect(host.textContent).not.toMatch(/check your internet/);
  });

  it('tapping again after a failure reuses the order and goes on', async () => {
    h.coverFails = 'send';
    await open();
    await placeOrder();
    h.coverFails = false;
    await placeOrder();
    expect(h.steps).toEqual(['order row', 'cover (41 pages)', 'cover (41 pages)', 'album pages']);
  });

  it("a cover photo that isn't on this device stops before any order is placed", async () => {
    h.job = { ...(h.job as object), photos: photos.map((p, i) => (i === 41 ? { ...p, previewUrl: '' } : p)) };
    await open();
    await placeOrder();
    expect(h.steps).toEqual([]);
    expect(host.textContent).toMatch(/1 photo on the cover isn't on this device/);
  });
});
