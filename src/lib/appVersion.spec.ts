import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ensureLatestApp, liveBuild, readUpdateNote, BUILD_ID, UPDATED_PLACE_ORDER, type AppUpdateEnv } from './appVersion';

/* ══════════════════════════════════════════════════════════════════════════
   THE NEWEST APP MAKES THE PRINT FILES (owner, 2026-10-25: "before checkout
   makes the print files, check the phone has the latest app; if not, save the
   album and reload first"). MP-2026-XNWRQT9 was ordered on 25 Oct with the ½"
   binding edge that became 3/8" on 22 Oct: its phone ran an old copy.
   ══════════════════════════════════════════════════════════════════════════ */

function memoryStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
}
const json = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response;

function env(live: unknown, over: Partial<AppUpdateEnv> = {}) {
  const storage = memoryStore();
  const calls: string[] = [];
  let now = 1_000_000;
  const reg = {
    update: vi.fn(async () => { calls.push('sw.update'); }),
    installing: null as unknown, waiting: null as unknown,
    unregister: vi.fn(async () => { calls.push('sw.unregister'); return true; }),
  };
  const e: AppUpdateEnv = {
    fetch: vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`fetch ${url.split('?')[0]} ${init?.cache}`);
      if (live instanceof Error) throw live;
      return json(live);
    }),
    storage,
    reload: () => void calls.push('reload'),
    serviceWorker: {
      getRegistration: async () => reg, getRegistrations: async () => [reg], addEventListener: () => {},
    } as unknown as ServiceWorkerContainer,
    caches: { keys: async () => ['workbox-precache', 'app-shell'], delete: async (k: string) => { calls.push(`cache.delete ${k}`); return true; } } as unknown as CacheStorage,
    now: () => now,
    build: 'build-A',
    ...over,
  };
  return { e, storage, calls, tick: (ms: number) => { now += ms; }, reg };
}

describe('ensureLatestApp', () => {
  it('this copy IS the live one: go, nothing reloads', async () => {
    const { e, calls } = env({ build: 'build-A' });
    expect(await ensureLatestApp(UPDATED_PLACE_ORDER, e)).toBe('latest');
    expect(calls).toEqual(['fetch ./version.json no-store']);
  });

  it('an older copy: leaves the note, asks the offline cache for the new copy, reloads', async () => {
    const { e, calls, storage } = env({ build: 'build-B' });
    expect(await ensureLatestApp(UPDATED_PLACE_ORDER, e)).toBe('reloading');
    expect(calls).toEqual(['fetch ./version.json no-store', 'sw.update', 'reload']);
    // The note stays while the screen loads (it may draw twice), for 10 minutes …
    expect(readUpdateNote(storage, 1_000_000)).toBe(UPDATED_PLACE_ORDER);
    expect(readUpdateNote(storage, 1_000_000 + 60_000)).toBe(UPDATED_PLACE_ORDER);
    expect(readUpdateNote(storage, 1_000_000 + 11 * 60_000)).toBeNull();
    expect(readUpdateNote(storage, 1_000_000)).toBeNull(); // … then it is gone
  });

  it('the note goes once the customer taps again on the newest copy', async () => {
    const { e, storage } = env({ build: 'build-B' });
    await ensureLatestApp(UPDATED_PLACE_ORDER, e);
    expect(readUpdateNote(storage, 1_000_000)).toBe(UPDATED_PLACE_ORDER);
    const fresh = env({ build: 'build-B' }, { storage, build: 'build-B' });
    expect(await ensureLatestApp(UPDATED_PLACE_ORDER, fresh.e)).toBe('latest');
    expect(readUpdateNote(storage, 1_000_000)).toBeNull();
  });

  it('still old right after that reload: drops the offline cache and reloads once more', async () => {
    const { e, calls, tick } = env({ build: 'build-B' });
    await ensureLatestApp(UPDATED_PLACE_ORDER, e);
    tick(20_000);
    calls.length = 0;
    expect(await ensureLatestApp(UPDATED_PLACE_ORDER, e)).toBe('reloading');
    expect(calls).toEqual(['fetch ./version.json no-store', 'sw.unregister', 'cache.delete workbox-precache', 'cache.delete app-shell', 'reload']);
  });

  it('still old after two reloads in a row: goes ahead with this copy rather than loop', async () => {
    const { e, calls, tick } = env({ build: 'build-B' });
    await ensureLatestApp(UPDATED_PLACE_ORDER, e);
    tick(20_000);
    await ensureLatestApp(UPDATED_PLACE_ORDER, e);
    tick(20_000);
    calls.length = 0;
    expect(await ensureLatestApp(UPDATED_PLACE_ORDER, e)).toBe('unknown');
    expect(calls).not.toContain('reload');
  });

  it('a later visit, long after: a fresh first try again', async () => {
    const { e, calls, tick } = env({ build: 'build-B' });
    await ensureLatestApp(UPDATED_PLACE_ORDER, e);
    tick(20_000);
    await ensureLatestApp(UPDATED_PLACE_ORDER, e);
    tick(10 * 60 * 1000);
    calls.length = 0;
    expect(await ensureLatestApp(UPDATED_PLACE_ORDER, e)).toBe('reloading');
    expect(calls).toContain('sw.update');
  });

  it('once it is the newest, the try count clears', async () => {
    const live = { build: 'build-B' };
    const { e, storage } = env(live);
    await ensureLatestApp(UPDATED_PLACE_ORDER, e);
    expect(storage.m.has('megy-update-reload')).toBe(true);
    const fresh = env(live, { storage, build: 'build-B' });
    expect(await ensureLatestApp(UPDATED_PLACE_ORDER, fresh.e)).toBe('latest');
    expect(storage.m.has('megy-update-reload')).toBe(false);
  });

  it('never blocks an order: offline, a missing or odd version.json → go', async () => {
    for (const live of [new Error('offline'), { nope: 1 }, { build: '' }]) {
      const { e, calls } = env(live);
      expect(await ensureLatestApp(UPDATED_PLACE_ORDER, e)).toBe('unknown');
      expect(calls).not.toContain('reload');
    }
    const notFound = env({ build: 'build-B' }, { fetch: async () => json({}, false) });
    expect(await liveBuild(notFound.e)).toBeNull();
    expect(await ensureLatestApp(UPDATED_PLACE_ORDER, notFound.e)).toBe('unknown');
  });

  it('a phone with no offline cache still reloads into the new copy', async () => {
    const { e, calls } = env({ build: 'build-B' }, { serviceWorker: undefined, caches: undefined });
    expect(await ensureLatestApp(UPDATED_PLACE_ORDER, e)).toBe('reloading');
    expect(calls).toEqual(['fetch ./version.json no-store', 'reload']);
  });

  it('outside a build (tests, dev) the id is "dev"', () => {
    expect(BUILD_ID).toBe('dev');
  });
});

describe('wired in before every print file', () => {
  const src = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');

  it('checkout: Place order checks first, before any order row or file', () => {
    const order = src('../pages/Order.tsx');
    const place = order.slice(order.indexOf('const placeOrder = async () => {'));
    const check = place.indexOf('ensureLatestApp(UPDATED_PLACE_ORDER)');
    expect(check).toBeGreaterThan(0);
    for (const later of ['createOrderFromAlbum(', 'uploadOrderPrintPdf(', 'uploadOrderCoverPdfWithRetry(']) {
      expect(place.indexOf(later), later).toBeGreaterThan(check);
    }
    expect(order).toContain('data-testid="order-app-updated"');
  });

  it('Your orders: Send the cover checks first', () => {
    const mine = src('../pages/MyOrders.tsx');
    const send = mine.slice(mine.indexOf('const send = async () => {'));
    expect(send.indexOf('ensureLatestApp(UPDATED_SEND_COVER)')).toBeGreaterThan(0);
    expect(send.indexOf('sendOrderCover(')).toBeGreaterThan(send.indexOf('ensureLatestApp(UPDATED_SEND_COVER)'));
  });

  it('every build stamps its id into the app and into /version.json (not precached)', () => {
    const vite = src('../../vite.config.ts');
    expect(vite).toContain("define: { __MEGY_BUILD__: JSON.stringify(BUILD_ID) }");
    expect(vite).toContain("fileName: 'version.json'");
    expect(vite).toContain("globPatterns: ['**/*.{js,css,html,png,svg,woff,woff2}']");
  });
});
