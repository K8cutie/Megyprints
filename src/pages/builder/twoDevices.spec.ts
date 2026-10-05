// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { AlbumPage, UploadedPhoto } from './types';

/* ══════════════════════════════════════════════════════════════════════════
   ONE ALBUM, TWO DEVICES (1-star testers round 2, TD-3 / TD-4). The laptop
   changed page 4 to "Four Squares" and saved; the phone reloaded, opened its
   own older copy without a word and saved it over the laptop's — the laptop's
   page 4 was gone. Last save won.

   The real builder and the real album sync run against a fake albums table
   that behaves like the database: every write gets a new updated_at from the
   SERVER, and jsonb hands objects back in its own key order. "The other
   device" writes straight into that table.
   ══════════════════════════════════════════════════════════════════════════ */

type Row = Record<string, unknown>;
const cloud = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(),
  tick: 0,
  offline: false,
  writes: 0,
}));

vi.mock('../../lib/authContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('../../lib/supabase', () => {
  const stamp = () => `2026-10-05T01:00:${String(cloud.tick++).padStart(2, '0')}.123456+00:00`;
  // jsonb: the same values, keys in another order.
  const jsonb = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(jsonb);
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      return Object.fromEntries(Object.keys(o).sort().reverse().map((k) => [k, jsonb(o[k])]));
    }
    return v;
  };
  const store = (r: Record<string, unknown>) => jsonb(JSON.parse(JSON.stringify(r))) as Record<string, unknown>;
  const from = () => {
    const q: { op: string; row?: Record<string, unknown>; filters: [string, unknown][] } = { op: 'select', filters: [] };
    const matches = (r: Record<string, unknown>) => q.filters.every(([c, v]) => r[c] === v);
    const run = async (single: boolean) => {
      if (cloud.offline) return { data: null, error: { message: 'Failed to fetch' } };
      if (q.op === 'select') {
        const found = [...cloud.rows.values()].filter(matches).map((r) => JSON.parse(JSON.stringify(r)));
        return { data: single ? found[0] ?? null : found, error: null };
      }
      if (q.op === 'upsert') {
        cloud.writes++;
        const row = q.row!;
        const before = cloud.rows.get(row.id as string);
        // The database stamps updates (trigger); a new row keeps what was sent.
        const saved = store({ ...before, ...row, updated_at: before ? stamp() : (row.updated_at ?? stamp()) });
        cloud.rows.set(row.id as string, saved);
        return { data: { id: saved.id, updated_at: saved.updated_at }, error: null };
      }
      // update … where <filters>
      const hit = [...cloud.rows.values()].filter(matches);
      if (hit.length) cloud.writes++;
      const out = hit.map((r) => {
        const saved = store({ ...r, ...q.row, updated_at: stamp() });
        cloud.rows.set(r.id as string, saved);
        return { id: saved.id, updated_at: saved.updated_at };
      });
      return { data: out, error: null };
    };
    const api: Record<string, unknown> = {
      select: () => api,
      eq: (c: string, v: unknown) => { q.filters.push([c, v]); return api; },
      order: () => api,
      limit: () => api,
      upsert: (row: Record<string, unknown>) => { q.op = 'upsert'; q.row = row; return api; },
      update: (row: Record<string, unknown>) => { q.op = 'update'; q.row = row; return api; },
      single: () => run(true),
      maybeSingle: () => run(true),
      then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => run(false).then(ok, bad),
    };
    return api;
  };
  return {
    supabase: {
      from,
      auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
    },
  };
});
vi.mock('../../lib/useIndexedDBPhotos', () => {
  const idb = {
    store: async () => null, get: async () => null, getMany: async () => new Map(),
    deletePhoto: async () => {}, deleteMany: async () => {}, list: async () => [],
    loading: false, error: null, clearError: () => {},
  };
  return { useIndexedDBPhotos: () => idb, getImageDimensions: async () => ({ width: 0, height: 0 }) };
});
vi.mock('./faceDetection', () => ({ initFaceApi: async () => {}, detectFaceCenter: async () => null }));

import { useBuilderState, CLOUD_SAVE_QUIET_MS, type BuilderActions } from './useBuilderState';
import { DRAFT_STORAGE_KEY } from '../../lib/localDraft';
import { conflictMessage } from '../../lib/albumSyncRecord';

const photos: UploadedPhoto[] = Array.from({ length: 40 }, (_, i) => ({
  id: `photo-${i}`, name: `photo-${i}.jpg`, previewUrl: `https://photos.test/${i}.jpg`,
  type: 'image/jpeg', size: 1000, width: 1200, height: 1200,
}));
const page = (i: number): AlbumPage => ({
  id: `page-${i}`, layout: 'freeform', size: '8x8', background: { type: 'solid', solid: '#FFFFFF' },
  photos: [], textElements: [], templateId: 't88-fb-solo', slotFills: [i],
} as AlbumPage);

let builder!: BuilderActions;
function Probe() {
  const b = useBuilderState();
  useEffect(() => { builder = b; });
  return null;
}
let root: Root | null = null;
const advance = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

/** The phone opens the album (a reload, or coming back to it). */
async function openPhone() {
  root = createRoot(document.createElement('div'));
  await act(async () => { root!.render(createElement(Probe)); });
  await advance(2000);
}
/** The phone app closes (its last saves go out as it does). */
async function closePhone() {
  await act(async () => { root?.unmount(); });
  root = null;
  await advance(100);
}
/** The laptop changes page 4 to Four Squares and saves it. */
function laptopChangesPage4() {
  const row = cloud.rows.get('album-1')!;
  const pages = JSON.parse(JSON.stringify(row.pages)) as Row[];
  pages[3] = { ...pages[3], templateId: 't88-fb-quad-grid-gap', slotFills: [3, null, null, null] };
  cloud.rows.set('album-1', { ...row, pages, updated_at: `2026-10-05T01:30:${String(cloud.tick++).padStart(2, '0')}.000001+00:00` });
}
const cloudPage4 = () => ((cloud.rows.get('album-1')!.pages as Row[])[3]).templateId;

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(new Date('2026-10-05T01:00:00Z'));
  localStorage.clear(); sessionStorage.clear();
  cloud.rows.clear(); cloud.tick = 0; cloud.offline = false; cloud.writes = 0;
  // The phone made the album: on this device, then saved to the account.
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
    albumType: 'standard', albumSize: '8x8', selectedTemplate: 'classic', uploadedPhotos: photos,
    albumPages: Array.from({ length: 40 }, (_, i) => page(i)), currentPageIndex: 0, rejectedTemplateIds: [],
    title: 'HK Trip', albumId: 'album-1', accountId: 'user-1', editedAt: Date.now(),
  }));
  await openPhone();
  await act(async () => { await builder.manualSave(); });
  expect(cloud.rows.get('album-1')).toBeTruthy();
});
afterEach(async () => {
  await act(async () => { root?.unmount(); });
  root = null;
  vi.useRealTimers();
});

describe('TD-3: the phone reloads after the laptop changed the album', () => {
  it('nothing changed on the phone: it opens the laptop\'s newer page 4, says so, and never saves its old copy over it', async () => {
    await closePhone();
    laptopChangesPage4();
    const writes = cloud.writes;
    await openPhone(); // the reload
    await advance(1000);
    expect(builder.albumPages[3].templateId).toBe('t88-fb-quad-grid-gap');
    expect(builder.cloudNotice).toMatch(/changed on your other device/);
    expect(builder.cloudConflict).toBeNull();
    // Turning pages, a quiet spell, hiding the app: the laptop's page 4 stays.
    for (let i = 1; i < 5; i++) { await act(async () => { builder.goToPage(i); }); }
    await advance(CLOUD_SAVE_QUIET_MS * 3);
    await closePhone();
    expect(cloudPage4()).toBe('t88-fb-quad-grid-gap');
    expect(cloud.writes).toBe(writes); // only looking writes nothing
  });

  it('on main this lost the laptop\'s change: the phone kept and re-saved its own copy (the bug, as a guard)', async () => {
    // The phone's own copy must never win silently over a newer cloud one.
    await closePhone();
    laptopChangesPage4();
    await openPhone();
    await act(async () => { builder.setAlbumTitle('HK Trip!'); }); // and then it edits
    await advance(CLOUD_SAVE_QUIET_MS + 1000);
    expect(cloudPage4()).toBe('t88-fb-quad-grid-gap');
    expect((cloud.rows.get('album-1')!).title).toBe('HK Trip!'); // its edit lands ON the laptop's version
  });
});

describe('both devices changed it: asked, never picked', () => {
  async function phoneEditsOffline() {
    cloud.offline = true;
    await act(async () => { builder.setAlbumTitle('HK Trip — phone'); });
    await advance(CLOUD_SAVE_QUIET_MS + 1000); // its save fails: offline
    await closePhone();
    cloud.offline = false;
    laptopChangesPage4();
    await openPhone();
    await advance(1000);
  }

  it('the phone asks which version to keep, and saves nothing over the laptop\'s meanwhile', async () => {
    await phoneEditsOffline();
    expect(builder.cloudConflict).toEqual({ updatedAt: expect.any(String) });
    expect(builder.albumTitle).toBe('HK Trip — phone'); // its own work is still on screen
    expect(conflictMessage(builder.cloudConflict!.updatedAt)).toMatch(/also changed on another device \(saved at .+\)\. Which version do you want to keep\?/);
    const writes = cloud.writes;
    await advance(CLOUD_SAVE_QUIET_MS * 3);
    await act(async () => { await builder.manualSave(); }); // checkout's save, too
    await closePhone();
    expect(cloud.writes).toBe(writes);
    expect(cloudPage4()).toBe('t88-fb-quad-grid-gap');
    expect(cloud.rows.get('album-1')!.title).toBe('HK Trip');
  });

  it('"Open the other device\'s version": the laptop\'s page 4 is on screen', async () => {
    await phoneEditsOffline();
    await act(async () => { await builder.openNewerVersion(); });
    await advance(1000);
    expect(builder.cloudConflict).toBeNull();
    expect(builder.albumPages[3].templateId).toBe('t88-fb-quad-grid-gap');
    expect(builder.albumTitle).toBe('HK Trip');
  });

  it('"Keep this device\'s version": the phone\'s album replaces the laptop\'s', async () => {
    await phoneEditsOffline();
    let kept = false;
    await act(async () => { kept = await builder.keepThisVersion(); });
    expect(kept).toBe(true);
    expect(builder.cloudConflict).toBeNull();
    expect(cloud.rows.get('album-1')!.title).toBe('HK Trip — phone');
    expect(cloudPage4()).toBe('t88-fb-solo');
  });
});

describe('both open at the same time', () => {
  it('the laptop saved meanwhile: the phone\'s next save does not land, it asks', async () => {
    laptopChangesPage4();
    await act(async () => { builder.setAlbumTitle('HK Trip — phone'); });
    await advance(CLOUD_SAVE_QUIET_MS + 1000);
    expect(builder.cloudConflict).toEqual({ updatedAt: expect.any(String) });
    expect(cloudPage4()).toBe('t88-fb-quad-grid-gap');
    expect(cloud.rows.get('album-1')!.title).toBe('HK Trip');
  });

  it('back to the phone with nothing changed on it: the laptop\'s version opens', async () => {
    laptopChangesPage4();
    await advance(20_000);
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await advance(1500);
    expect(builder.albumPages[3].templateId).toBe('t88-fb-quad-grid-gap');
    expect(builder.cloudNotice).toMatch(/changed on your other device/);
  });
});

describe('this device\'s own saves never look like another device\'s', () => {
  it('a save that landed as the app closed (its reply lost) is recognised on the next open', async () => {
    await act(async () => { builder.setAlbumTitle('HK Trip 2026'); });
    // Its save lands, the reply never comes back: the phone still has the old version.
    const rec = JSON.parse(localStorage.getItem('megy-album-sync-v1')!)['album-1'];
    await act(async () => { await builder.manualSave(); });
    const after = JSON.parse(localStorage.getItem('megy-album-sync-v1')!)['album-1'];
    localStorage.setItem('megy-album-sync-v1', JSON.stringify({ 'album-1': { ...after, base: rec.base, key: rec.key } }));
    await closePhone();
    await openPhone();
    await advance(1000);
    expect(builder.cloudConflict ?? null).toBeNull();
    expect(builder.albumTitle).toBe('HK Trip 2026');
  });

  it('a new album saves, then saves again (onto its own version)', async () => {
    await act(async () => { builder.setAlbumTitle('Second title'); });
    await act(async () => { await builder.manualSave(); });
    await act(async () => { builder.setAlbumTitle('Third title'); });
    await act(async () => { await builder.manualSave(); });
    expect(builder.cloudConflict ?? null).toBeNull();
    expect(cloud.rows.get('album-1')!.title).toBe('Third title');
  });
});

describe('a draft from before this change (no record of its version)', () => {
  it('cloud saved after the last change on this device: asks', async () => {
    await closePhone();
    localStorage.removeItem('megy-album-sync-v1');
    vi.setSystemTime(new Date('2026-10-05T02:00:00Z'));
    laptopChangesPage4(); // stamped 01:30 — but the draft below was changed at 01:00
    await openPhone();
    await advance(1000);
    expect(builder.cloudConflict).toEqual({ updatedAt: expect.any(String) });
  });
});
