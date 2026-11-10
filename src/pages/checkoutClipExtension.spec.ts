// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

/* ══════════════════════════════════════════════════════════════════════════
   A MEMORY VIDEO THE PHONE MADE SMALLER PLAYS AFTER CHECKOUT (found while
   porting QR videos to the 2.0 app, 2026-11-02). An iPhone recording is a
   .mov. The QR is placed at once, so its destination says <code>.mov; then
   the phone shrinks the video to an MP4 in the background, and checkout
   uploads <code>.mp4. The memory row used to keep <code>.mov, and the scan
   page (api/m.mjs) plays exactly the row's destination: the printed QR played
   nothing.

   The real checkout page with the real video and memory code (memoryClips,
   qrMemories). Only the database (a qr_memories table and the memory-clips
   bucket), the phone's video store and the encoder are faked. The video is
   staged the way the Add QR box stages it (stageClip, and a fill with the
   picked file's ext).
   ══════════════════════════════════════════════════════════════════════════ */

type Row = Record<string, unknown> & { code: string; destination: string };
const h = vi.hoisted(() => ({
  auth: { user: { id: 'user-1' } as { id: string } | null, loading: false },
  job: null as unknown,
  /** qr_memories, by code. */
  rows: new Map<string, Record<string, unknown> & { code: string; destination: string }>(),
  /** memory-clips object names. */
  bucket: new Set<string>(),
  uploads: [] as string[],
  /** What the encoder gives back (smaller = the phone keeps it). */
  encoded: 'mp4',
  placed: false,
}));

vi.mock('../lib/supabase', () => {
  const answer = <T,>(v: T) => Promise.resolve(v);
  // Every other table and call answers like a database this test can't
  // reach, which is what the other checkout specs see.
  const unreachable = { data: null, error: { message: 'not in this test' } };
  const anything = (): unknown => new Proxy(function () {}, {
    get: (_t, p) => (p === 'then'
      ? (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => answer(unreachable).then(ok, ko)
      : anything),
    apply: () => anything(),
  });
  const memories = () => ({
    upsert: (rows: Row[], opts?: { ignoreDuplicates?: boolean }) => {
      for (const r of rows) if (!h.rows.has(r.code) || !opts?.ignoreDuplicates) h.rows.set(r.code, { ...r });
      return answer({ data: null, error: null });
    },
    insert: (row: Row) => { h.rows.set(row.code, { ...row }); return answer({ data: null, error: null }); },
    update: (patch: Record<string, unknown>) => {
      const where: [string, unknown][] = [];
      const run = () => {
        const hit = [...h.rows.values()].filter((r) => where.every(([c, v]) => r[c] === v));
        for (const r of hit) Object.assign(r, patch);
        return answer({ data: hit.map((r) => ({ code: r.code })), error: null });
      };
      const q = {
        eq: (c: string, v: unknown) => { where.push([c, v]); return q; },
        select: () => run(),
        then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => run().then(ok, ko),
      };
      return q;
    },
  });
  const clips = {
    list: async (_folder: string, opts: { search: string }) =>
      ({ data: [...h.bucket].filter((n) => n.includes(opts.search)).map((name) => ({ name })), error: null }),
    upload: async (path: string, _blob: Blob, opts?: { upsert?: boolean }) => {
      h.uploads.push(path);
      if (h.bucket.has(path) && !opts?.upsert) return { data: null, error: { message: 'The resource already exists', statusCode: '409' } };
      h.bucket.add(path);
      return { data: { path }, error: null };
    },
  };
  return {
    supabaseConfigured: true,
    supabase: {
      auth: {
        getUser: async () => ({ data: { user: h.auth.user }, error: null }),
        getSession: async () => ({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
      from: (table: string) => (table === 'qr_memories' ? memories() : anything()),
      storage: { from: (bucket: string) => (bucket === 'memory-clips' ? clips : anything()) },
      rpc: () => answer(unreachable),
    },
  };
});
vi.mock('../lib/videoTranscode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/videoTranscode')>()),
  transcodeSupported: () => true,
  transcodeToMp4: async () => ({ blob: new Blob([h.encoded]), width: 720, height: 1280, hasAudio: true }),
}));
vi.mock('../lib/authContext', () => ({ useAuth: () => h.auth }));
vi.mock('../components/AuthModalProvider', () => ({ useAuthModal: () => ({ openLogin: vi.fn() }) }));
vi.mock('../lib/printJobRebuild', () => ({ rebuildPrintJobFromAlbum: async () => h.job }));
vi.mock('../lib/useIndexedDBPhotos', () => ({ useIndexedDBPhotos: () => ({ get: async () => null }) }));
vi.mock('../lib/myOrders', () => ({ getMyOrder: async () => null, openOrderForAlbum: async () => null, lastOrderForAlbum: async () => null }));
vi.mock('../components/AddressPicker', () => ({ default: () => null }));
vi.mock('./builder/CoverThumb', () => ({ default: () => createElement('div', { 'data-testid': 'cover-thumb' }) }));
vi.mock('../lib/report', () => ({ reportError: () => {} }));
vi.mock('../lib/orders', () => ({
  createOrderFromAlbum: async () => ({ id: 'order-1', order_number: 'MP-2026-TEST123', status: 'pending_payment', album_id: 'album-1' }),
  uploadOrderCoverPdfWithRetry: async () => {},
  uploadOrderPrintPdf: async () => { h.placed = true; },
}));
vi.mock('../lib/storeSettings', () => {
  const sizes = Object.fromEntries(['6x6', '8x8', '6x4', '8x6', '6x8', '8.5x11', '11.5x8'].map((s) => [s, { pps: 2, soft_rate: 1200, hard_rate: 2100 }]));
  const schedule = { min_pages: 40, sheet_rate: 24, hosting_reserve: 0, hosting_tiers: [], disabled_sizes: [], sizes };
  return {
    getPriceSchedule: () => schedule, isStoreSettingsReady: () => true, storeSettingsReady: () => Promise.resolve(),
    onStoreSettingsChange: () => () => {}, retryStoreSettings: () => {},
  };
});

/** The phone's video store: one IndexedDB store keyed by code, callbacks on a microtask. */
const idb = new Map<string, Record<string, unknown>>();
function request<T>(fn: () => T) {
  const r: { result?: T; error?: unknown; onsuccess?: () => void; onerror?: () => void } = {};
  queueMicrotask(() => { try { r.result = fn(); r.onsuccess?.(); } catch (e) { r.error = e; r.onerror?.(); } });
  return r;
}
const store = {
  get: (k: string) => request(() => idb.get(k)),
  put: (v: Record<string, unknown>) => request(() => { idb.set(v.code as string, v); return v.code; }),
  delete: (k: string) => request(() => { idb.delete(k); }),
  getAllKeys: () => request(() => [...idb.keys()]),
};
const db = {
  objectStoreNames: { contains: () => true },
  createObjectStore: () => store,
  close: () => {},
  transaction: () => {
    const tx: { objectStore: () => typeof store; oncomplete?: () => void } = { objectStore: () => store };
    queueMicrotask(() => queueMicrotask(() => tx.oncomplete?.()));
    return tx;
  },
};
(globalThis as unknown as { indexedDB: unknown }).indexedDB = { open: () => request(() => db) };

import Order from './Order';
import { saveCheckoutForm } from '../lib/checkoutSession';
import { noteOrderHandoff, clearPendingPrintJob } from '../lib/printQueue';
import { EMPTY_ADDRESS } from '../lib/contact';
import { stageClip, publicClipUrl, versionedClipUrl, type ClipExt } from '../lib/memoryClips';
import type { QrFill } from './builder/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const CODE = 'k7m2p9qz';
const page = (i: number) => ({ id: `p${i}`, layout: 'single', size: '6x6', templateId: 't88-solo-square', slotFills: [i], photos: [], textElements: [], background: { type: 'solid', solid: '#fff' } });
const photos = Array.from({ length: 41 }, (_, i) => ({ id: `ph${i}`, name: `${i}.jpg`, previewUrl: `blob:here/${i}`, type: 'image/jpeg', size: 1, width: 1200, height: 1200 }));
const ADDRESS = { ...EMPTY_ADDRESS, regionCode: 'r', regionName: 'NCR', provinceCode: 'p', provinceName: 'Metro Manila', cityCode: 'c', cityName: 'Quezon City', barangayCode: 'b', barangayName: 'Bagumbayan', street: '12 Mango St', zip: '1110' };
/** An iPhone recording, well over what the encoder gives back. */
const RECORDING = new Blob(['x'.repeat(5000)], { type: 'video/quicktime' });

/** The fill the Add QR box saves: the PICKED file's ext. */
const fillFor = (ext: ClipExt): QrFill => ({
  code: CODE, destination: publicClipUrl(CODE, ext), qrPngDataUrl: 'data:image/png;base64,', memoryUrl: `https://megyprints.test/m/${CODE}`,
  createdAt: 1, kind: 'clip', clipExt: ext,
});
const albumWith = (fill: QrFill) => {
  const pages = Array.from({ length: 41 }, (_, i) => page(i)) as Record<string, unknown>[];
  pages[3] = { ...pages[3], qrFills: [fill] };
  h.job = { albumId: 'album-1', albumSize: '6x6', pages, photos, coverFront: { ...page(99), id: 'cover', slotFills: [null] } };
};
/** What the Add QR box does on Use this video. */
const pickVideo = async (ext: ClipExt, over: Record<string, unknown> = {}) => {
  await stageClip({ code: CODE, ext, blob: RECORDING, size: RECORDING.size, durationSec: 40, name: `IMG_0042.${ext}`, quality: 'standard', ...over });
  albumWith(fillFor(ext));
};

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  sessionStorage.clear(); localStorage.clear();
  clearPendingPrintJob();
  window.scrollTo = (() => {}) as typeof window.scrollTo;
  Element.prototype.scrollIntoView = () => {};
  idb.clear(); h.rows.clear(); h.bucket.clear(); h.uploads.length = 0; h.encoded = 'mp4'; h.placed = false;
  noteOrderHandoff({ albumId: 'album-1', saved: true });
  saveCheckoutForm({ albumId: 'album-1', name: 'Maria Santos', phone: '0917 555 0133', address: ADDRESS, material: 'matte', cover: 'softcover', userId: 'user-1' });
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

const settle = () => act(async () => { for (let i = 0; i < 12; i++) await new Promise((r) => setTimeout(r, 0)); });
const $ = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const checkout = async () => {
  await act(async () => { root.render(createElement(MemoryRouter, null, createElement(Order))); });
  await settle();
  await act(async () => { $('order-place')!.click(); });
  await settle();
  expect(h.placed, 'the order went through').toBe(true);
};
const mp4 = publicClipUrl(CODE, 'mp4');
const mov = publicClipUrl(CODE, 'mov');

describe('a .mov the phone shrank to an MP4', () => {
  it('is uploaded as <code>.mp4, and its memory row points at <code>.mp4', async () => {
    await pickVideo('mov');
    await checkout();
    expect([...h.bucket]).toEqual([`${CODE}.mp4`]);
    expect(h.rows.get(CODE)?.destination).toBe(mp4);
    expect(h.rows.get(CODE)?.kind).toBe('clip');
  });

  it('a row an earlier checkout made at <code>.mov is moved to the .mp4 (the phone kept its copy, the order went unpaid)', async () => {
    await pickVideo('mov');
    h.rows.set(CODE, { code: CODE, user_id: 'user-1', destination: mov, kind: 'clip' });
    await checkout();
    expect(h.rows.get(CODE)?.destination).toBe(mp4);
  });

  it('a row re-pointed on purpose since (a new video from My Memories) is left alone', async () => {
    await pickVideo('mov');
    const replaced = versionedClipUrl(CODE, 'mov', 1762800000000);
    h.bucket.add(`${CODE}.mov`);
    h.rows.set(CODE, { code: CODE, user_id: 'user-1', destination: replaced, kind: 'clip' });
    await checkout();
    expect(h.rows.get(CODE)?.destination).toBe(replaced);
  });

  it('a REPLACED video (same QR, a new .mov picked in the builder) re-points the row at the .mp4 it uploaded', async () => {
    h.bucket.add(`${CODE}.mp4`);
    h.rows.set(CODE, { code: CODE, user_id: 'user-1', destination: mp4, kind: 'clip' });
    await pickVideo('mov', { replace: true });
    await checkout();
    expect(h.uploads).toContain(`${CODE}.mp4`);
    expect(h.rows.get(CODE)?.destination).toBe(mp4);
  });
});

describe('a video that keeps its own file', () => {
  it('a .mov the encoder could not make smaller stays <code>.mov, and so does its row', async () => {
    h.encoded = 'x'.repeat(9000);
    await pickVideo('mov');
    await checkout();
    expect([...h.bucket]).toEqual([`${CODE}.mov`]);
    expect(h.rows.get(CODE)?.destination).toBe(mov);
  });

  it('an MP4 picked: <code>.mp4 throughout', async () => {
    await pickVideo('mp4');
    await checkout();
    expect([...h.bucket]).toEqual([`${CODE}.mp4`]);
    expect(h.rows.get(CODE)?.destination).toBe(mp4);
  });
});
