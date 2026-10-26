// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

/* ══════════════════════════════════════════════════════════════════════════
   THE BAR UNDER PLACE ORDER, ON THE REAL CHECKOUT PAGE (owner, 2026-10-26:
   "Making your print file…" sat still for minutes on the live tester walk).
   The print file is held at each step so the page can be read mid-order: the
   page being made and the bar, then sending with its moving band, then gone.
   The screen is kept on while it works, and let go after.
   ══════════════════════════════════════════════════════════════════════════ */

type OnPrintFile = (p: { phase: 'pages'; done: number; total: number; smaller: boolean } | { phase: 'sending' }) => void;
const h = vi.hoisted(() => ({
  auth: { user: { id: 'user-1' } as { id: string } | null, loading: false },
  job: null as unknown,
  steps: [] as string[],
  resume: null as null | (() => void),
  paused: '',
  fail: false,
}));
const pause = (name: string) => new Promise<void>((r) => { h.paused = name; h.resume = () => { h.paused = ''; r(); }; });

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
vi.mock('../lib/orders', () => ({
  createOrderFromAlbum: async () => { h.steps.push('order row'); return { id: 'order-1', order_number: 'MP-2026-TEST123', status: 'pending_payment', album_id: 'album-1' }; },
  uploadOrderCoverPdfWithRetry: async () => { h.steps.push('cover'); },
  uploadOrderPrintPdf: async (_id: string, _job: unknown, _cover: unknown, onProgress?: OnPrintFile) => {
    onProgress?.({ phase: 'pages', done: 22, total: 70, smaller: false });
    await pause('pages');
    onProgress?.({ phase: 'pages', done: 70, total: 70, smaller: false });
    onProgress?.({ phase: 'sending' });
    await pause('sending');
    if (h.fail) throw new Error('Print file upload failed: network');
    h.steps.push('album pages');
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
import { pagesAt, PLACE_AT } from '../lib/placeProgress';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const page = (i: number) => ({ id: `p${i}`, layout: 'single', size: '6x6', templateId: 't88-solo-square', slotFills: [i], photos: [], textElements: [], background: { type: 'solid', solid: '#fff' } });
const photos = Array.from({ length: 41 }, (_, i) => ({ id: `ph${i}`, name: `${i}.jpg`, previewUrl: `blob:here/${i}`, type: 'image/jpeg', size: 1, width: 1200, height: 1200 }));
const ADDRESS = { ...EMPTY_ADDRESS, regionCode: 'r', regionName: 'NCR', provinceCode: 'p', provinceName: 'Metro Manila', cityCode: 'c', cityName: 'Quezon City', barangayCode: 'b', barangayName: 'Bagumbayan', street: '12 Mango St', zip: '1110' };

// The screen lock, as a phone with the Screen Wake Lock API gives it.
const locks: { released: boolean }[] = [];
const nav = navigator as unknown as { wakeLock?: unknown };

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  sessionStorage.clear(); localStorage.clear();
  clearPendingPrintJob();
  window.scrollTo = (() => {}) as typeof window.scrollTo;
  Element.prototype.scrollIntoView = () => {};
  h.steps = []; h.resume = null; h.paused = ''; h.fail = false;
  locks.length = 0;
  nav.wakeLock = { request: async () => { const l = { released: false, release: async () => { l.released = true; } }; locks.push(l); return l; } };
  h.job = { albumId: 'album-1', albumSize: '6x6', pages: Array.from({ length: 41 }, (_, i) => page(i)), photos, coverFront: { ...page(99), id: 'cover', slotFills: [null] } };
  noteOrderHandoff({ albumId: 'album-1', saved: true });
  saveCheckoutForm({ albumId: 'album-1', name: 'Maria Santos', phone: '0917 555 0133', address: ADDRESS, material: 'matte', cover: 'softcover', userId: 'user-1' });
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); delete nav.wakeLock; });

const settle = () => act(async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); });
const open = async () => {
  await act(async () => { root.render(createElement(MemoryRouter, null, createElement(Order))); });
  await settle();
};
const $ = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const bar = () => host.querySelector('[role="progressbar"]');
const resume = async () => { expect(h.resume, 'held').not.toBeNull(); await act(async () => { h.resume!(); }); await settle(); };

describe('Place order shows how far along it is', () => {
  it('no bar before Place order', async () => {
    await open();
    expect($('order-progress')).toBeNull();
  });

  it('the page being made and the bar; then sending with a moving band; then gone at the payment step', async () => {
    await open();
    await act(async () => { $('order-place')!.click(); });
    await settle();
    expect(h.paused).toBe('pages');
    expect(h.steps).toEqual(['order row', 'cover']);
    expect($('order-place')?.textContent).toContain('Making page 23 of 70…');
    expect(bar()?.getAttribute('aria-valuenow')).toBe(String(Math.round(pagesAt(22, 70) * 100)));
    expect($('order-progress-fill')?.style.width).toBe(`${Math.round(pagesAt(22, 70) * 100)}%`);
    expect($('order-progress-note')?.textContent).toBe('Keep this screen open. This can take a few minutes.');
    expect($('order-progress-sending')).toBeNull();

    await resume();
    expect(h.paused).toBe('sending');
    expect($('order-place')?.textContent).toContain('Sending your print file…');
    expect(bar()?.getAttribute('aria-valuenow')).toBe(String(Math.round(PLACE_AT.sending * 100)));
    expect($('order-progress-sending')).not.toBeNull();

    await resume();
    expect(h.steps).toEqual(['order row', 'cover', 'album pages']);
    expect($('order-progress')).toBeNull();
    expect(host.textContent).toContain('Send ₱1,704');
  });

  it('keeps the screen on while it works, and lets it go after', async () => {
    await open();
    await act(async () => { $('order-place')!.click(); });
    await settle();
    expect(locks).toHaveLength(1);
    expect(locks[0].released).toBe(false);
    await resume();
    await resume();
    expect(locks[0].released).toBe(true);
  });

  it('a failure: the bar goes, the error shows, the screen is let go, Place order is back', async () => {
    h.fail = true;
    await open();
    await act(async () => { $('order-place')!.click(); });
    await settle();
    await resume();
    await resume();
    expect($('order-progress')).toBeNull();
    expect(host.textContent).toContain('Print file upload failed: network');
    expect(locks[0].released).toBe(true);
    expect($('order-place')?.textContent).toContain('Place order');
  });
});
