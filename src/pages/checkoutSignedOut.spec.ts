// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

/* ══════════════════════════════════════════════════════════════════════════
   SIGNED OUT WITH THE ORDER PAGE OPEN (the 2.0 app's beta test, Mother, round
   2, 2026-11-04): the sign-in ran out, or Sign out on another device, while
   the checkout form was open. Sign out forgot the form, then the page saved
   it again as a guest's, and a guest's form comes back to whoever signs in
   next. The details go with the account; a guest who signs in keeps theirs.
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
import { saveCheckoutForm, readCheckoutForm, forgetCheckoutOnDevice } from '../lib/checkoutSession';
import { noteOrderHandoff, clearPendingPrintJob, setPendingPrintJob, type PrintJob } from '../lib/printQueue';
import { EMPTY_ADDRESS } from '../lib/contact';
import type { PriceSchedule } from '../lib/pricing';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const SIZES = ['6x6', '8x8', '6x4', '8x6', '6x8', '8.5x11', '11.5x8'];
const schedule = (extra: Partial<PriceSchedule>): PriceSchedule => ({
  min_pages: 40, sheet_rate: 66.25, hosting_reserve: 50, hosting_tiers: [{ years: 5, price: 0 }, { years: 10, price: 99 }],
  disabled_sizes: [],
  sizes: Object.fromEntries(SIZES.map((s) => [s, { pps: 4, soft_rate: 575, hard_rate: 1300 }])) as PriceSchedule['sizes'],
  ...extra,
});
const page = (i: number) => ({ id: `p${i}`, layout: 'single', size: '8x8', templateId: 't88-solo-square', slotFills: [i], photos: [], textElements: [], background: { type: 'solid', solid: '#fff' } });
const photos = Array.from({ length: 41 }, (_, i) => ({ id: `ph${i}`, name: `${i}.jpg`, previewUrl: '', type: 'image/jpeg', size: 1, width: 1200, height: 1200 }));

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  sessionStorage.clear(); localStorage.clear();
  window.scrollTo = (() => {}) as typeof window.scrollTo;
  h.auth = { user: { id: 'user-1' }, loading: false };
  h.job = { albumId: 'album-1', albumSize: '8x8', pages: Array.from({ length: 41 }, (_, i) => page(i)), photos, coverFront: { ...page(99), id: 'cover' } };
  clearPendingPrintJob();
  noteOrderHandoff({ albumId: 'album-1', saved: true });
  saveCheckoutForm({ albumId: 'album-1', name: 'Fe Freeship', phone: '0917 555 0133', address: EMPTY_ADDRESS, material: 'glossy', cover: 'hardboundLeather', userId: 'user-1' });
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

const render = () => act(async () => { root.render(createElement(MemoryRouter, null, createElement(Order))); });
const settle = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); });

const nameBox = () => host.querySelector<HTMLInputElement>('#order-name')!;

describe('signed out with the order page open', () => {
  it('the typed details go, and the next account never gets them', async () => {
    h.schedule = schedule({});
    await render(); await settle();
    expect(nameBox().value).toBe('Fe Freeship');
    // What authContext does on SIGNED_OUT, with the page still open.
    forgetCheckoutOnDevice();
    h.auth = { user: null, loading: false };
    await render(); await settle();
    expect(nameBox().value).toBe('');
    expect(readCheckoutForm('album-1', 'user-2')?.name ?? '').toBe('');
  });

  it('a guest who signs in on the page keeps what they typed', async () => {
    h.schedule = schedule({});
    sessionStorage.clear();
    h.auth = { user: null, loading: false };
    saveCheckoutForm({ albumId: 'album-1', name: 'Gina Guest', phone: '', address: EMPTY_ADDRESS, material: 'matte', cover: 'softcover', userId: null });
    // A guest's album comes from the builder, not the account.
    setPendingPrintJob(h.job as PrintJob);
    await render(); await settle();
    expect(nameBox().value).toBe('Gina Guest');
    h.auth = { user: { id: 'user-1' }, loading: false };
    await render(); await settle();
    expect(nameBox().value).toBe('Gina Guest');
  });
});
