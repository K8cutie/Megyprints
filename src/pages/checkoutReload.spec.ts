// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

/* ══════════════════════════════════════════════════════════════════════════
   A RELOAD AT CHECKOUT KEEPS WHAT WAS PICKED AND TYPED (1-star testers
   round 3, the Quitter): picked Glossy + Hardbound, typed name and phone,
   reloaded → back to Matte + Softcover at the lower price, name and phone
   empty, the cover gone from the summary, and nothing said so. After a
   reload the session is read for a moment; checkout decided in that moment,
   with no account yet, so the form saved under the account wasn't "theirs"
   and the album came from the device draft, without its cover. It waits.
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({
  auth: { user: null as { id: string } | null, loading: true },
  job: null as unknown,
  rebuilt: [] as unknown[][],
}));
vi.mock('../lib/authContext', () => ({ useAuth: () => h.auth }));
vi.mock('../components/AuthModalProvider', () => ({ useAuthModal: () => ({ openLogin: vi.fn() }) }));
vi.mock('../lib/printJobRebuild', () => ({ rebuildPrintJobFromAlbum: async (...a: unknown[]) => { h.rebuilt.push(a); return h.job; } }));
vi.mock('../lib/useIndexedDBPhotos', () => ({ useIndexedDBPhotos: () => ({ get: async () => null }) }));
vi.mock('../lib/myOrders', () => ({ getMyOrder: async () => null, openOrderForAlbum: async () => null, lastOrderForAlbum: async () => null }));
vi.mock('../components/AddressPicker', () => ({ default: () => null }));
vi.mock('./builder/CoverThumb', () => ({ default: () => createElement('div', { 'data-testid': 'cover-thumb' }) }));
vi.mock('../lib/memoryClips', () => ({
  uploadStagedClips: async () => {}, prefetchStagedClipUploads: () => {}, stagedClipBytes: async () => 0,
  removeStagedClip: async () => {}, currentClipQuality: () => 'standard',
}));
vi.mock('../lib/storeSettings', () => {
  const sizes = Object.fromEntries(['6x6', '8x8', '9x9', '6x4', '8x6', '6x8', '8.5x11', '11.5x8'].map((s) => [s, { pps: 2, soft_rate: 1200, hard_rate: 2100 }]));
  const schedule = { min_pages: 40, sheet_rate: 24, hosting_reserve: 0, hosting_tiers: [], disabled_sizes: [], sizes };
  return {
    getPriceSchedule: () => schedule, isStoreSettingsReady: () => true, storeSettingsReady: () => Promise.resolve(),
    onStoreSettingsChange: () => () => {}, retryStoreSettings: () => {},
  };
});

import Order from './Order';
import { saveCheckoutForm } from '../lib/checkoutSession';
import { noteOrderHandoff } from '../lib/printQueue';
import { EMPTY_ADDRESS } from '../lib/contact';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const page = (i: number) => ({ id: `p${i}`, layout: 'single', size: '9x9', templateId: 't99-solo', slotFills: [i], photos: [], textElements: [], background: { type: 'solid', solid: '#fff' } });
const photos = Array.from({ length: 41 }, (_, i) => ({ id: `ph${i}`, name: `${i}.jpg`, previewUrl: '', type: 'image/jpeg', size: 1, width: 1200, height: 1200 }));

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  sessionStorage.clear(); localStorage.clear();
  window.scrollTo = (() => {}) as typeof window.scrollTo;
  h.auth = { user: null, loading: true };
  h.rebuilt = [];
  h.job = { albumId: 'album-1', albumSize: '9x9', pages: Array.from({ length: 41 }, (_, i) => page(i)), photos, coverFront: { ...page(99), id: 'cover' } };
  // What the Quitter had picked and typed before reloading, saved by checkout.
  noteOrderHandoff({ albumId: 'album-1', saved: true });
  saveCheckoutForm({ albumId: 'album-1', name: 'Quinn Quitter', phone: '0917 555 0133', address: EMPTY_ADDRESS, material: 'glossy', cover: 'hardboundLeather', userId: 'user-1' });
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

const render = () => act(async () => { root.render(createElement(MemoryRouter, null, createElement(Order))); });
const settle = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); });
const picked = (name: string) => {
  const b = [...host.querySelectorAll('button')].find((x) => x.querySelector('span')?.textContent === name);
  return ['#b85c38', 'rgb(184, 92, 56)'].includes((b?.style.borderColor ?? '').toLowerCase());
};
const nameBox = () => host.querySelector<HTMLInputElement>('input[placeholder="Juan Dela Cruz"]');

describe('a reload at checkout, signed in (the session reads back a moment later)', () => {
  it('brings back the paper, cover, name and phone, and the album with its cover', async () => {
    await render();          // the reload: no session yet
    await settle();
    h.auth = { user: { id: 'user-1' }, loading: false };
    await render();          // the session is back
    await settle();
    expect(h.rebuilt.map((a) => a[0])).toEqual(['user-1']); // the album, rebuilt from the account
    expect(nameBox()?.value).toBe('Quinn Quitter');
    expect(host.querySelector<HTMLInputElement>('input[placeholder="+63 9XX XXX XXXX"]')?.value).toMatch(/917/);
    expect(picked('Glossy')).toBe(true);
    expect(picked('Hardbound')).toBe(true);
    expect(host.textContent).toContain('Your cover');
    expect(host.textContent).toContain('41 pages inside');
  });

  it('nothing is decided while the session is still being read', async () => {
    await render();
    await settle();
    expect(h.rebuilt).toEqual([]);
    expect(nameBox()?.value ?? '').toBe('');
  });
});

describe('a guest (no session at all) is not held up', () => {
  it('checkout goes on with the device draft', async () => {
    sessionStorage.clear();
    localStorage.setItem('megy-album-v5', JSON.stringify({ albumId: 'album-1', albumSize: '9x9', editedAt: 1, albumPages: Array.from({ length: 41 }, (_, i) => page(i)), uploadedPhotos: [] }));
    h.auth = { user: null, loading: false };
    await render();
    await settle();
    expect(h.rebuilt).toEqual([]);
    expect(host.querySelector('[data-testid="order-album-size"]')?.textContent).toMatch(/9×9/);
  });
});
