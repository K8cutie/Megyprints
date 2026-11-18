// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

/* ══════════════════════════════════════════════════════════════════════════
   AN AFFILIATE CODE AT CHECKOUT (owner, 2026-11-15: "lets go with
   affiliates"). The same box as the tester code: a photographer's code takes
   ₱100 off, the real price stays crossed out, and the order carries the code
   for the database to check again. A link the customer opened (?ref=) puts
   the code on by itself, once, while it still counts. The real checkout
   page, real taps; the database's answers and the uploads are recorded.
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({
  auth: { user: { id: 'user-1' } as { id: string } | null, loading: false },
  job: null as unknown,
  steps: [] as string[],
  orders: [] as Record<string, unknown>[],
  checks: [] as string[],
  check: null as unknown,
  codeGone: false,
}));
vi.mock('../lib/nativeShell', () => ({ isNativeShell: () => false }));
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
  claimTesterOrder: async (id: string) => { h.steps.push(`claim ${id}`); },
}));
vi.mock('../lib/affiliates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/affiliates')>()),
  checkCheckoutCode: async (raw: string) => { h.checks.push(raw); return h.check; },
}));
vi.mock('../lib/orders', () => ({
  createOrderFromAlbum: async (opts: Record<string, unknown>) => {
    if (h.codeGone) {
      const { AffiliateCodeGoneError } = await import('../lib/affiliates');
      throw new AffiliateCodeGoneError("The code ANNA doesn't work any more. Remove it to order at the normal price.");
    }
    h.orders.push(opts); h.steps.push('order row');
    return { id: 'order-1', order_number: 'MP-2026-AFF0001', status: 'pending_payment', album_id: 'album-1' };
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
import { REF_KEY } from '../lib/affiliates';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const page = (i: number) => ({ id: `p${i}`, layout: 'single', size: '6x6', templateId: 't88-solo-square', slotFills: [i], photos: [], textElements: [], background: { type: 'solid', solid: '#fff' } });
const photos = Array.from({ length: 41 }, (_, i) => ({ id: `ph${i}`, name: `${i}.jpg`, previewUrl: `blob:here/${i}`, type: 'image/jpeg', size: 1, width: 1200, height: 1200 }));
const ADDRESS = { ...EMPTY_ADDRESS, regionCode: 'r', regionName: 'NCR', provinceCode: 'p', provinceName: 'Metro Manila', cityCode: 'c', cityName: 'Quezon City', barangayCode: 'b', barangayName: 'Bagumbayan', street: '12 Mango St', zip: '1110' };
// 41 pages at 2 a sheet: 21 sheets × ₱24 + ₱1,200 softcover = ₱1,704; ₱100 off = ₱1,604.
const REAL = '₱1,704';
const WITH_CODE = '₱1,604';
const ANNA = { ok: true, affiliate: { code: 'ANNA', discount: 100 }, windowDays: 30 };
const DAY = 86_400_000;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  sessionStorage.clear(); localStorage.clear();
  clearPendingPrintJob();
  window.scrollTo = (() => {}) as typeof window.scrollTo;
  Element.prototype.scrollIntoView = () => {};
  h.steps = []; h.orders = []; h.checks = []; h.codeGone = false;
  h.check = ANNA;
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
const keepLink = (code: string, ageDays: number) => localStorage.setItem(REF_KEY, JSON.stringify({ code, at: Date.now() - ageDays * DAY }));

describe('a typed affiliate code', () => {
  it('the box says "Have a code?"; the code takes ₱100 off, the real price crossed out, and Place order says the lower amount', async () => {
    await open();
    expect($('tester-code-open')?.textContent).toContain('Have a code?');
    expect($('order-total')?.textContent).toBe(REAL);
    await useCode('anna');
    expect(h.checks).toEqual(['anna']);
    expect($('affiliate-code-on')?.textContent).toContain('Code ANNA: ₱100 off');
    expect($('order-affiliate-line')?.textContent).toBe('Code ANNA: ₱100 off−₱100');
    expect($('order-real-price')?.textContent).toBe(REAL);
    expect($('order-total')?.textContent).toBe(WITH_CODE);
    expect($('order-place')?.textContent).toContain(`pay ${WITH_CODE}`);
    expect($('order-tester-line')).toBeNull();
  });

  it('Place order: the order carries the code and the lower amount; the customer pays by transfer (nothing is claimed free)', async () => {
    await open();
    await useCode('ANNA');
    await click('order-place');
    expect(h.orders).toHaveLength(1);
    expect(h.orders[0]).toMatchObject({ affiliateCode: 'ANNA', testerCode: null, amount: 1604 });
    expect(h.steps).toEqual(['order row', 'cover', 'album pages']);
    expect(host.textContent).toContain(`Send ${WITH_CODE}`);
  });

  it('Remove puts the real price back, forgets a kept link, and the order goes without a code', async () => {
    keepLink('ANNA', 1);
    await open();
    expect($('affiliate-code-on')).not.toBeNull();
    await click('affiliate-code-remove');
    expect(localStorage.getItem(REF_KEY)).toBeNull();
    expect($('order-total')?.textContent).toBe(REAL);
    await click('order-place');
    expect(h.orders[0]).toMatchObject({ affiliateCode: null, amount: 1704 });
  });

  it("your own code: the database's words, and the price stays", async () => {
    h.check = { ok: false, reason: 'own', message: "That's your own affiliate code. It can't take money off your own order." };
    await open();
    await useCode('ME');
    expect($('tester-code-error')?.textContent).toBe("That's your own affiliate code. It can't take money off your own order.");
    expect($('order-total')?.textContent).toBe(REAL);
  });

  it('paused between the check and Place order: nothing is ordered, the code comes off, and it says why', async () => {
    keepLink('ANNA', 1);
    await open();
    h.codeGone = true;
    await click('order-place');
    expect(h.steps).toEqual([]);
    expect(host.textContent).toContain("The code ANNA doesn't work any more. Remove it to order at the normal price.");
    expect($('affiliate-code-on')).toBeNull();
    expect($('order-total')?.textContent).toBe(REAL);
    expect(localStorage.getItem(REF_KEY)).toBeNull();
  });
});

describe('a kept ?ref= link', () => {
  it('puts its code on by itself, once, after the database says it works', async () => {
    keepLink('ANNA', 3);
    await open();
    expect(h.checks).toEqual(['ANNA']);
    expect($('affiliate-code-on')?.textContent).toContain('Code ANNA: ₱100 off');
    expect($('order-total')?.textContent).toBe(WITH_CODE);
  });

  it("older than the program's window: not applied, and forgotten", async () => {
    keepLink('ANNA', 31);
    await open();
    expect($('affiliate-code-on')).toBeNull();
    expect($('order-total')?.textContent).toBe(REAL);
    expect(localStorage.getItem(REF_KEY)).toBeNull();
  });

  it('a code that no longer works: nothing changes, and it is forgotten', async () => {
    keepLink('GONE', 1);
    h.check = { ok: false, reason: 'wrong', message: "That code doesn't work. Check the spelling." };
    await open();
    expect(h.checks).toEqual(['GONE']);
    expect($('affiliate-code-on')).toBeNull();
    expect($('tester-code-error')).toBeNull(); // no error for a code they never typed
    expect(localStorage.getItem(REF_KEY)).toBeNull();
  });

  it('a signed-out customer is not checked (the database needs an account); it waits for sign-in', async () => {
    h.auth = { user: null, loading: false };
    keepLink('ANNA', 1);
    try {
      await open();
      expect(h.checks).toEqual([]);
      expect(localStorage.getItem(REF_KEY)).not.toBeNull();
    } finally {
      h.auth = { user: { id: 'user-1' }, loading: false };
    }
  });
});

describe('a reload after the order was placed with a code (its files not in yet)', () => {
  it('the code line stays, it cannot be removed, and the total is what the order asked', async () => {
    saveCheckoutOrder({
      albumId: 'album-1', orderId: 'order-1', orderNumber: 'MP-2026-AFF0001', material: 'matte', cover: 'softcover', albumSize: '6x6',
      amount: 1604, stage: 'placed', albumEditedAt: 0, userId: 'user-1', tester: null, affiliate: { code: 'ANNA', discount: 100 },
    });
    await open();
    expect($('affiliate-code-on')?.textContent).toContain('Code ANNA: ₱100 off');
    expect($('affiliate-code-remove')).toBeNull();
    expect($('order-total')?.textContent).toBe(WITH_CODE);
    expect(h.checks).toEqual([]); // a placed order's code isn't asked about again
  });
});
