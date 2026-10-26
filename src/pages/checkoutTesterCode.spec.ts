// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

/* ══════════════════════════════════════════════════════════════════════════
   THE TESTER CODE AT CHECKOUT (owner, 2026-10-26): "Testers see the real
   price, type the code, and the album is free: no pay step, straight to
   thank-you, order arrives Paid and marked as a tester order." The real
   checkout page, real taps; the database's answers (check, claim) and the
   uploads are recorded.
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({
  auth: { user: { id: 'user-1' } as { id: string } | null, loading: false },
  job: null as unknown,
  steps: [] as string[],
  orders: [] as Record<string, unknown>[],
  checks: [] as string[],
  check: { ok: true, tester: { code: 'MEGYTEST' } } as unknown,
  codeGone: false,
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
vi.mock('../lib/report', () => ({ reportError: () => {} }));
vi.mock('../lib/testerCode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/testerCode')>()),
  checkTesterCode: async (raw: string) => { h.checks.push(raw); return h.check; },
  claimTesterOrder: async (id: string) => { h.steps.push(`claim ${id}`); },
}));
vi.mock('../lib/orders', () => ({
  createOrderFromAlbum: async (opts: Record<string, unknown>) => {
    if (h.codeGone) { const { TesterCodeGoneError } = await import('../lib/testerCode'); throw new TesterCodeGoneError(String(opts.testerCode)); }
    h.orders.push(opts); h.steps.push('order row');
    return { id: 'order-1', order_number: 'MP-2026-TEST123', status: 'pending_payment', album_id: 'album-1' };
  },
  uploadOrderPrintPdf: async () => { h.steps.push('album pages'); },
  uploadOrderCoverPdfWithRetry: async () => { h.steps.push('cover'); },
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
import { saveCheckoutForm, saveCheckoutOrder } from '../lib/checkoutSession';
import { noteOrderHandoff, clearPendingPrintJob } from '../lib/printQueue';
import { EMPTY_ADDRESS } from '../lib/contact';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const page = (i: number) => ({ id: `p${i}`, layout: 'single', size: '6x6', templateId: 't88-solo-square', slotFills: [i], photos: [], textElements: [], background: { type: 'solid', solid: '#fff' } });
const photos = Array.from({ length: 41 }, (_, i) => ({ id: `ph${i}`, name: `${i}.jpg`, previewUrl: `blob:here/${i}`, type: 'image/jpeg', size: 1, width: 1200, height: 1200 }));
const ADDRESS = { ...EMPTY_ADDRESS, regionCode: 'r', regionName: 'NCR', provinceCode: 'p', provinceName: 'Metro Manila', cityCode: 'c', cityName: 'Quezon City', barangayCode: 'b', barangayName: 'Bagumbayan', street: '12 Mango St', zip: '1110' };
// 41 pages at 2 a sheet: 21 sheets × ₱24 + ₱1,200 softcover.
const REAL = '₱1,704';

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  sessionStorage.clear(); localStorage.clear();
  clearPendingPrintJob();
  window.scrollTo = (() => {}) as typeof window.scrollTo;
  Element.prototype.scrollIntoView = () => {};
  h.steps = []; h.orders = []; h.checks = []; h.codeGone = false;
  h.check = { ok: true, tester: { code: 'MEGYTEST' } };
  h.job = { albumId: 'album-1', albumSize: '6x6', pages: Array.from({ length: 41 }, (_, i) => page(i)), photos, coverFront: { ...page(99), id: 'cover', slotFills: [null] } };
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
const $ = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const click = async (id: string) => { expect($(id), id).not.toBeNull(); await act(async () => { $(id)!.click(); }); await settle(); };
const typeCode = async (v: string) => {
  const input = $('tester-code-input') as HTMLInputElement;
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => { set.call(input, v); input.dispatchEvent(new Event('input', { bubbles: true })); });
};
const useCode = async (v: string) => { await click('tester-code-open'); await typeCode(v); await click('tester-code-apply'); };

describe('a tester code that makes the album free', () => {
  it('the real price shows first, then crossed out under the code, and the total is ₱0', async () => {
    await open();
    expect($('order-total')?.textContent).toBe(REAL);
    expect($('order-place')?.textContent).toContain(`pay ${REAL}`);
    await useCode('megytest');
    expect(h.checks).toEqual(['megytest']);
    expect($('tester-code-on')?.textContent).toContain('Tester code MEGYTEST: free');
    expect($('order-tester-line')?.textContent).toBe(`Tester code MEGYTEST: free−${REAL}`);
    expect($('order-real-price')?.textContent).toBe(REAL);
    expect($('order-total')?.textContent).toBe('₱0');
    expect($('order-place')?.textContent).toContain('Place order · free with tester code');
  });

  it('Place order: the order carries the code, the files go in, it pays itself, and the thank-you comes next (no pay step)', async () => {
    await open();
    await useCode('MEGYTEST');
    await click('order-place');
    expect(h.orders).toHaveLength(1);
    expect(h.orders[0]).toMatchObject({ testerCode: 'MEGYTEST', amount: 0 });
    expect(h.steps).toEqual(['order row', 'cover', 'album pages', 'claim order-1']);
    expect($('order-paid-by-tester')?.textContent).toBe('Your tester code MEGYTEST paid for this album. Thank you for testing Megy Prints.');
    expect(host.textContent).not.toMatch(/Send exactly|I've sent/);
    expect(host.textContent).toContain('MP-2026-TEST123');
  });

  it('Remove puts the real price back, and the order goes without a code', async () => {
    await open();
    await useCode('MEGYTEST');
    await click('tester-code-remove');
    expect($('order-total')?.textContent).toBe(REAL);
    expect($('order-tester-line')).toBeNull();
    await click('order-place');
    expect(h.orders[0]).toMatchObject({ testerCode: null, amount: 1704 });
    expect(h.steps).not.toContain('claim order-1');
    expect(host.textContent).toContain(`Send ${REAL}`);
  });
});

describe('when the code does not work', () => {
  it('a wrong code says so, and the price stays', async () => {
    h.check = { ok: false, message: "That code doesn't work. Check the spelling." };
    await open();
    await useCode('NOPE1');
    expect($('tester-code-error')?.textContent).toBe("That code doesn't work. Check the spelling.");
    expect($('order-total')?.textContent).toBe(REAL);
    expect($('tester-code-on')).toBeNull();
  });

  it('switched off between the check and Place order: nothing is ordered, the code comes off, and it says why', async () => {
    await open();
    await useCode('MEGYTEST');
    h.codeGone = true;
    await click('order-place');
    expect(h.steps).toEqual([]);
    expect(host.textContent).toContain("The tester code MEGYTEST doesn't work any more, so nothing was ordered. Remove the code to order at the normal price.");
    expect($('tester-code-on')).toBeNull();
    expect($('order-total')?.textContent).toBe(REAL);
  });
});

describe('a reload after the free order was placed (its files not in yet)', () => {
  it('the code stays on the order, it cannot be removed, and Place order finishes it free on the same order', async () => {
    saveCheckoutOrder({
      albumId: 'album-1', orderId: 'order-1', orderNumber: 'MP-2026-TEST123', material: 'matte', cover: 'softcover', albumSize: '6x6',
      amount: 0, stage: 'placed', albumEditedAt: 0, userId: 'user-1', tester: { code: 'MEGYTEST' },
    });
    await open();
    expect($('tester-code-on')?.textContent).toContain('Tester code MEGYTEST: free');
    expect($('tester-code-remove')).toBeNull();
    expect($('order-total')?.textContent).toBe('₱0');
    await click('order-place');
    expect(h.orders).toEqual([]); // the same order row, not a second one
    expect(h.steps).toEqual(['cover', 'album pages', 'claim order-1']);
    expect($('order-paid-by-tester')).not.toBeNull();
  });
});
