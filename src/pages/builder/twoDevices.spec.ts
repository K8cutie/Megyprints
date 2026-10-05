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
  /** Every row the app sent in an insert or upsert, as sent. */
  sent: [] as Record<string, unknown>[],
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
  // RLS: the signed-in customer (user-1) sees and writes only their own rows.
  const mine = (r: Record<string, unknown>) => r.user_id === undefined || r.user_id === 'user-1';
  const RLS = { code: '42501', message: 'new row violates row-level security policy (USING expression) for table "albums"' };
  const from = () => {
    const q: { op: string; row?: Record<string, unknown>; filters: [string, unknown][] } = { op: 'select', filters: [] };
    const matches = (r: Record<string, unknown>) => mine(r) && q.filters.every(([c, v]) => r[c] === v);
    const run = async (single: boolean) => {
      if (cloud.offline) return { data: null, error: { message: 'Failed to fetch' } };
      if (q.op === 'select') {
        const found = [...cloud.rows.values()].filter(matches).map((r) => JSON.parse(JSON.stringify(r)));
        return { data: single ? found[0] ?? null : found, error: null };
      }
      if (q.op === 'insert') {
        const row = q.row!;
        cloud.sent.push(JSON.parse(JSON.stringify(row)));
        // The id is taken (by anyone: the primary key does not care whose).
        if (cloud.rows.has(row.id as string)) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "albums_pkey"' } };
        cloud.writes++;
        // The database stamps it (0040). Without 0040 it kept what was sent.
        const saved = store({ ...row, updated_at: stamp() });
        cloud.rows.set(row.id as string, saved);
        return { data: { id: saved.id, updated_at: saved.updated_at }, error: null };
      }
      if (q.op === 'upsert') {
        const row = q.row!;
        cloud.sent.push(JSON.parse(JSON.stringify(row)));
        const before = cloud.rows.get(row.id as string);
        // ON CONFLICT DO UPDATE on a row RLS hides: refused.
        if (before && !mine(before)) return { data: null, error: RLS };
        cloud.writes++;
        // The database stamps updates (trigger); a new row kept what was sent.
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
      insert: (row: Record<string, unknown>) => { q.op = 'insert'; q.row = row; return api; },
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
import { conflictMessage, DELETED_ELSEWHERE_MESSAGE } from '../../lib/albumSyncRecord';

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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const storedDraft = (): any => JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY)!);

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(new Date('2026-10-05T01:00:00Z'));
  localStorage.clear(); sessionStorage.clear();
  cloud.rows.clear(); cloud.tick = 0; cloud.offline = false; cloud.writes = 0; cloud.sent = [];
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
    await act(async () => { builder.saveDraftNow(); });
    const before = storedDraft().sync;
    await act(async () => { builder.setAlbumTitle('HK Trip 2026'); });
    await act(async () => { await builder.manualSave(); });
    await closePhone();
    // Its save landed, the reply never came back: the draft still names the
    // old version, and the save it sent.
    const d = storedDraft();
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ ...d, sync: { base: before.base, key: before.key, sentKey: d.sync.key } }));
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

describe('a draft with no record of its version', () => {
  /** A draft from before records, or one whose record was lost. */
  const forgetVersion = () => {
    const d = storedDraft();
    delete d.sync;
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(d));
    localStorage.removeItem('megy-album-sync-v1');
  };

  it('cloud saved after the last change on this device: asks', async () => {
    await closePhone();
    forgetVersion();
    vi.setSystemTime(new Date('2026-10-05T02:00:00Z'));
    laptopChangesPage4(); // stamped 01:30, the draft was changed at 01:00
    await openPhone();
    await advance(1000);
    expect(builder.cloudConflict).toEqual({ updatedAt: expect.any(String) });
  });

  it('Kraken: even when this device\'s clock says it changed later, it asks; it never saves over the laptop\'s page 4', async () => {
    // Photos waking up after a reload used to stamp the draft "edited now", so
    // a stale phone always looked newer than the laptop's save and kept its
    // own copy, then saved it over the laptop's.
    await closePhone();
    forgetVersion();
    laptopChangesPage4(); // stamped 01:30
    vi.setSystemTime(new Date('2026-10-05T02:00:00Z'));
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ ...storedDraft(), editedAt: Date.now() })); // "edited" at 02:00
    await openPhone();
    await advance(CLOUD_SAVE_QUIET_MS * 2);
    await closePhone();
    expect(cloudPage4()).toBe('t88-fb-quad-grid-gap');
  });
});

describe('when the album last changed here (editedAt)', () => {
  it('turning pages and a reload do not move it; a real change does', async () => {
    await act(async () => { builder.saveDraftNow(); });
    const at = storedDraft().editedAt;
    vi.setSystemTime(new Date('2026-10-05T03:00:00Z'));
    for (let i = 1; i < 6; i++) { await act(async () => { builder.goToPage(i); }); }
    await closePhone();
    await openPhone();
    await act(async () => { builder.saveDraftNow(); });
    expect(storedDraft().editedAt).toBe(at);
    await act(async () => { builder.setAlbumTitle('HK Trip, edited'); });
    await act(async () => { builder.saveDraftNow(); });
    expect(storedDraft().editedAt).toBeGreaterThanOrEqual(Date.parse('2026-10-05T03:00:00Z'));
  });
});

describe('two tabs, one draft (Kraken: a stale tab saved its old album over the other tab\'s)', () => {
  let builderB!: BuilderActions;
  let rootB: Root | null = null;
  function ProbeB() {
    const b = useBuilderState();
    useEffect(() => { builderB = b; });
    return null;
  }
  async function openTabB() {
    rootB = createRoot(document.createElement('div'));
    await act(async () => { rootB!.render(createElement(ProbeB)); });
    await advance(2000);
  }
  afterEach(async () => { await act(async () => { rootB?.unmount(); }); rootB = null; });

  it('tab B only turned pages: tab A\'s save stays, and coming back to B opens it', async () => {
    await act(async () => { builder.saveDraftNow(); });
    await openTabB();
    await act(async () => { builder.setAlbumTitle('Saved from tab A'); });
    await act(async () => { await builder.manualSave(); });
    await act(async () => { builder.saveDraftNow(); }); // tab A's draft, with its version, on disk
    for (let i = 1; i < 4; i++) { await act(async () => { builderB.goToPage(i); }); }
    await act(async () => { window.dispatchEvent(new Event('pagehide')); }); // tab B hidden
    await advance(1000);
    expect(cloud.rows.get('album-1')!.title).toBe('Saved from tab A');
    await advance(20_000);
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await advance(1500);
    expect(builderB.albumTitle).toBe('Saved from tab A');
  });

  it('tab B changed it too: its save does not land, it asks', async () => {
    await act(async () => { builder.saveDraftNow(); });
    await openTabB();
    await act(async () => { builder.setAlbumTitle('Saved from tab A'); });
    await act(async () => { await builder.manualSave(); });
    await act(async () => { builder.saveDraftNow(); });
    await act(async () => { builderB.setAlbumTitle('Typed in tab B'); });
    await act(async () => { await builderB.manualSave(); });
    expect(builderB.cloudConflict).toEqual({ updatedAt: expect.any(String) });
    expect(cloud.rows.get('album-1')!.title).toBe('Saved from tab A');
  });
});

describe('deleted on another device (Kraken: it came back from the phone)', () => {
  it('the phone\'s next save does not put it back; it asks', async () => {
    cloud.rows.delete('album-1'); // deleted on the laptop
    await act(async () => { builder.setAlbumTitle('HK Trip — phone'); });
    await advance(CLOUD_SAVE_QUIET_MS + 1000);
    await act(async () => { await builder.manualSave(); });
    expect(cloud.rows.has('album-1')).toBe(false);
    expect(cloud.rows.size).toBe(0);
    expect(builder.cloudGone).toBe(true);
    expect(DELETED_ELSEWHERE_MESSAGE).toMatch(/deleted on another device/);
  });

  it('coming back to the phone with nothing changed: it asks too, and writes nothing', async () => {
    cloud.rows.delete('album-1');
    await advance(20_000);
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await advance(1500);
    expect(builder.cloudGone).toBe(true);
    await advance(CLOUD_SAVE_QUIET_MS * 2);
    expect(cloud.rows.size).toBe(0);
  });

  it('"Keep it as a new album": what is on the phone saves under a NEW id; the deleted one stays deleted', async () => {
    cloud.rows.delete('album-1');
    await act(async () => { builder.setAlbumTitle('HK Trip — kept'); });
    await act(async () => { await builder.manualSave(); });
    let kept = false;
    await act(async () => { kept = await builder.saveAsNewAlbum(); });
    expect(kept).toBe(true);
    expect(builder.cloudGone).toBe(false);
    expect(cloud.rows.has('album-1')).toBe(false);
    const id = builder.getAlbumId()!;
    expect(id).not.toBe('album-1');
    expect(cloud.rows.get(id)!.title).toBe('HK Trip — kept');
  });

  it('"Let it go": a fresh start, and nothing is re-created', async () => {
    cloud.rows.delete('album-1');
    await act(async () => { await builder.manualSave(); });
    await act(async () => { builder.letDeletedAlbumGo(); });
    await advance(CLOUD_SAVE_QUIET_MS * 2);
    expect(builder.cloudGone).toBe(false);
    expect(builder.albumTitle).toBe('');
    expect(cloud.rows.size).toBe(0);
  });
});

describe('an album id already used by a row this account cannot see (Kraken)', () => {
  it('saves as a new album under a new id: no 42501 forever, the other row untouched', async () => {
    await closePhone();
    const other = { id: 'album-squat', user_id: 'user-2', title: 'Not yours', pages: [], updated_at: '2026-10-05T00:00:00.000000+00:00' };
    cloud.rows.set('album-squat', other);
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ ...storedDraft(), albumId: 'album-squat', sync: null, title: 'Mine' }));
    localStorage.removeItem('megy-album-sync-v1');
    await openPhone();
    let ok = false;
    await act(async () => { ok = await builder.manualSave(); });
    expect(ok).toBe(true);
    expect(cloud.rows.get('album-squat')).toEqual(other);
    const id = builder.getAlbumId()!;
    expect(id).not.toBe('album-squat');
    expect(cloud.rows.get(id)).toMatchObject({ title: 'Mine', user_id: 'user-1' });
  });
});

describe('saves go one at a time', () => {
  it('two saves at once: both land in turn, neither is taken for another device\'s', async () => {
    await act(async () => { builder.setAlbumTitle('Twice'); });
    let results: boolean[] = [];
    await act(async () => { results = await Promise.all([builder.manualSave(), builder.manualSave()]); });
    expect(results).toEqual([true, true]);
    expect(builder.cloudConflict ?? null).toBeNull();
    expect(cloud.rows.get('album-1')!.title).toBe('Twice');
  });
});

describe('what a save sends', () => {
  it('never this device\'s clock as the version: the database stamps updated_at', () => {
    expect(cloud.sent.length).toBeGreaterThan(0); // the first save, in beforeEach
    for (const row of cloud.sent) expect('updated_at' in row).toBe(false);
  });

  it('the occasion is capped at Step 1\'s length, so the database check never refuses the save', async () => {
    localStorage.setItem('megy-album-theme', 'A very long occasion typed into the quote picker '.repeat(3));
    await act(async () => { builder.setAlbumTitle('With occasion'); });
    await act(async () => { await builder.manualSave(); });
    const occasion = cloud.rows.get('album-1')!.occasion as string;
    expect(occasion.length).toBeLessThanOrEqual(40);
    expect(occasion).toMatch(/^A very long occasion/);
  });
});
