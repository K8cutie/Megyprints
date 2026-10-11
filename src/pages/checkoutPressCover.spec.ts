// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

/* ══════════════════════════════════════════════════════════════════════════
   NO 9×9 HARDBOUND (owner, 2026-10-11). Its flat cover is about 20.2 in long
   and the shop's paper is 19 in, so checkout doesn't offer it — not even when
   the last order or a saved form picked Hardbound — and says why in plain
   words. The database refuses it too (0046).
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({ job: null as unknown, auth: { user: null as { id: string } | null, loading: true } }));
vi.mock('../lib/authContext', () => ({ useAuth: () => h.auth }));
vi.mock('../components/AuthModalProvider', () => ({ useAuthModal: () => ({ openLogin: vi.fn() }) }));
vi.mock('../lib/printJobRebuild', () => ({ rebuildPrintJobFromAlbum: async () => h.job }));
vi.mock('../lib/useIndexedDBPhotos', () => ({ useIndexedDBPhotos: () => ({ get: async () => null }) }));
vi.mock('../lib/myOrders', () => ({ getMyOrder: async () => null, openOrderForAlbum: async () => null, lastOrderForAlbum: async () => null }));
vi.mock('../components/AddressPicker', () => ({ default: () => null }));
vi.mock('./builder/CoverThumb', () => ({ default: () => createElement('div') }));
vi.mock('../lib/memoryClips', () => ({
  uploadStagedClips: async () => {}, prefetchStagedClipUploads: () => {}, stagedClipBytes: async () => 0,
  removeStagedClip: async () => {}, currentClipQuality: () => 'standard',
}));
vi.mock('../lib/storeSettings', () => {
  const sizes = Object.fromEntries(['6x6', '8x8', '9x9', '6x4', '8x6', '6x8', '8.5x11', '11.5x8'].map((s) => [s, { pps: 4, soft_rate: 1200, hard_rate: 2100 }]));
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
const page = (size: string, i: number) => ({ id: `p${i}`, layout: 'single', size, templateId: 't-solo', slotFills: [i], photos: [], textElements: [], background: { type: 'solid', solid: '#fff' } });
const photos = Array.from({ length: 41 }, (_, i) => ({ id: `ph${i}`, name: `${i}.jpg`, previewUrl: '', type: 'image/jpeg', size: 1, width: 1200, height: 1200 }));

let host: HTMLDivElement;
let root: Root;
const open = async (size: string) => {
  const albumId = `album-${size}`;
  h.job = { albumId, albumSize: size, pages: Array.from({ length: 41 }, (_, i) => page(size, i)), photos, coverFront: { ...page(size, 99), id: 'cover' } };
  noteOrderHandoff({ albumId, saved: true });
  // The customer had picked Hardbound before (a saved form).
  saveCheckoutForm({ albumId, name: 'Hana Hard', phone: '0917 555 0133', address: EMPTY_ADDRESS, material: 'matte', cover: 'hardboundLeather', userId: 'user-1' });
  // As after a reload: the session reads back a moment later (checkoutReload.spec).
  h.auth = { user: null, loading: true };
  await render();
  await settle();
  h.auth = { user: { id: 'user-1' }, loading: false };
  await render();
  await settle();
};
const render = () => act(async () => { root.render(createElement(MemoryRouter, null, createElement(Order))); });
const settle = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); });
const coverButton = (name: string) => [...host.querySelectorAll('button')].find((x) => x.querySelector('span')?.textContent === name);
const picked = (name: string) => ['#b85c38', 'rgb(184, 92, 56)'].includes((coverButton(name)?.style.borderColor ?? '').toLowerCase());

beforeEach(() => {
  clearPendingPrintJob(); // the last test's album stays in memory otherwise
  sessionStorage.clear(); localStorage.clear();
  window.scrollTo = (() => {}) as typeof window.scrollTo;
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe('checkout covers and the press sheet', () => {
  it('a 9×9 album: no Hardbound button, Softcover picked, and the reason in words', async () => {
    await open('9x9');
    expect(coverButton('Hardbound')).toBeUndefined();
    expect(picked('Softcover')).toBe(true);
    expect(host.querySelector('[data-testid="order-cover-note"]')?.textContent)
      .toBe('Hardbound is not available for 9×9 albums. The cover is too big for our printer.');
  });

  it('an 8×8 album keeps both covers and the Hardbound it had picked', async () => {
    await open('8x8');
    expect(coverButton('Softcover')).toBeDefined();
    expect(picked('Hardbound')).toBe(true);
    expect(host.querySelector('[data-testid="order-cover-note"]')).toBeNull();
  });
});
