// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { AlbumPage, UploadedPhoto } from './types';

/* ══════════════════════════════════════════════════════════════════════════
   A 9×9 ALBUM OPENS AS 8×8 (9×9 removed, owner 2026-10-24). The builder
   itself, not just the readers: an album from the account and the draft on
   this device both come back as 8×8 albums, every page on its 8×8 twin with
   its photos and video memory, and the next save writes them as 8×8.
   ══════════════════════════════════════════════════════════════════════════ */

const cloud = vi.hoisted(() => ({ rows: new Map<string, Record<string, unknown>>(), tick: 0 }));
vi.mock('../../lib/authContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('../../lib/supabase', () => {
  const stamp = () => `2026-10-24T02:00:${String(cloud.tick++).padStart(2, '0')}.000001+00:00`;
  const from = () => {
    const q: { op: string; row?: Record<string, unknown>; filters: [string, unknown][] } = { op: 'select', filters: [] };
    const matches = (r: Record<string, unknown>) => q.filters.every(([c, v]) => r[c] === v);
    const run = async (single: boolean) => {
      if (q.op === 'select') {
        const found = [...cloud.rows.values()].filter(matches).map((r) => JSON.parse(JSON.stringify(r)));
        return { data: single ? found[0] ?? null : found, error: null };
      }
      if (q.op === 'insert' || q.op === 'upsert') {
        const before = cloud.rows.get(q.row!.id as string);
        const saved = JSON.parse(JSON.stringify({ ...before, ...q.row, updated_at: stamp() }));
        cloud.rows.set(saved.id, saved);
        return { data: { id: saved.id, updated_at: saved.updated_at }, error: null };
      }
      const out = [...cloud.rows.values()].filter(matches).map((r) => {
        const saved = JSON.parse(JSON.stringify({ ...r, ...q.row, updated_at: stamp() }));
        cloud.rows.set(r.id as string, saved);
        return { id: saved.id, updated_at: saved.updated_at };
      });
      return { data: out, error: null };
    };
    const api: Record<string, unknown> = {
      select: () => api, eq: (c: string, v: unknown) => { q.filters.push([c, v]); return api; },
      order: () => api, limit: () => api,
      upsert: (row: Record<string, unknown>) => { q.op = 'upsert'; q.row = row; return api; },
      insert: (row: Record<string, unknown>) => { q.op = 'insert'; q.row = row; return api; },
      update: (row: Record<string, unknown>) => { q.op = 'update'; q.row = row; return api; },
      single: () => run(true), maybeSingle: () => run(true),
      then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => run(false).then(ok, bad),
    };
    return api;
  };
  return { supabase: { from, auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) } } };
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

import { useBuilderState, type BuilderActions } from './useBuilderState';
import { getTemplateById } from './pageTemplates';
import { DRAFT_STORAGE_KEY } from '../../lib/localDraft';

const photos: UploadedPhoto[] = Array.from({ length: 120 }, (_, i) => ({
  id: `photo-${i}`, name: `photo-${i}.jpg`, previewUrl: `https://photos.test/${i}.jpg`, type: 'image/jpeg', size: 1000, width: 1200, height: 1200,
}));
// The layouts the saved 9×9 albums use most (production, 2026-10-24), and
// what each one is on 8×8.
const LAYOUTS: [string, string, number][] = [
  ['t99-fb-quad-grid-gap', 't88-fb-quad-grid-gap', 4],
  ['t99-fb-sq-box-br-gap', 't88-fb-sq-box-br-gap', 3],
  ['t99-fb-solo', 't88-fb-solo', 1],
  ['t99-fb-duo-exact-v-gap', 't88-fb-duo-exact-v-gap', 2],
];
let next = 0;
const page9 = (i: number): AlbumPage => {
  const [templateId, , n] = LAYOUTS[i % LAYOUTS.length];
  const slotFills = Array.from({ length: n }, () => next++);
  return {
    id: `page-${i}`, layout: 'freeform', size: '9x9', background: { type: 'solid', solid: '#FFFFFF' },
    photos: [], textElements: [{ id: `t${i}`, text: `Day ${i}` }], templateId, slotFills,
  } as unknown as AlbumPage;
};
/** 40 pages, page 2 carrying a video memory on its full photo. */
function album9() {
  next = 0;
  const pages = Array.from({ length: 40 }, (_, i) => page9(i));
  pages[2] = { ...pages[2], templateId: 'qr-badge-9x9-br', slotFills: [pages[2].slotFills![0], null], qrFills: [null, { kind: 'clip', code: 'MEM9' }] } as AlbumPage;
  return pages;
}
const twinOf = (id: string) => id === 'qr-badge-9x9-br' ? 'qr-badge-8x8-br' : LAYOUTS.find(([nine]) => nine === id)![1];

let builder!: BuilderActions;
function Probe() { const b = useBuilderState(); useEffect(() => { builder = b; }); return null; }
let root: Root | null = null;
const mount = async () => {
  root = createRoot(document.createElement('div'));
  await act(async () => { root!.render(createElement(Probe)); });
  await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
};
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); sessionStorage.clear();
  cloud.rows.clear(); cloud.tick = 0;
});
afterEach(async () => { await act(async () => { root?.unmount(); }); root = null; });

/** The album is now 8×8: every page on the twin of its 9×9 layout, with the
 *  same photos, words and memory. */
function expectEightByEight(before: AlbumPage[]) {
  expect(builder.albumSize).toBe('8x8');
  expect(builder.albumPages).toHaveLength(before.length);
  builder.albumPages.forEach((p, i) => {
    expect(p.size, `page ${i}`).toBe('8x8');
    expect(p.templateId, `page ${i}`).toBe(twinOf(before[i].templateId!));
    expect(getTemplateById(p.templateId!)!.albumSizes, `page ${i}`).toContain('8x8');
    expect(p.slotFills, `page ${i}`).toEqual(before[i].slotFills);
    // (Restoring the device draft also ties loose words to the page's box.)
    expect(p.textElements.map((t) => t.text), `page ${i}`).toEqual(before[i].textElements.map((t) => t.text));
  });
  expect(builder.albumPages[2].qrFills).toEqual([null, { kind: 'clip', code: 'MEM9' }]);
}

describe('a 9×9 album saved in the account', () => {
  it('opens as 8×8, every page on its twin, and saves back as 8×8', async () => {
    const pages = album9();
    cloud.rows.set('album-1', {
      id: 'album-1', user_id: 'user-1', title: 'Quinn HK Trip', album_size: '9x9', pages,
      photos: photos.map((p) => ({ id: p.id, name: p.name, size: p.size, width: p.width, height: p.height })),
      updated_at: '2026-10-10T01:34:18.774006+00:00',
    });
    await mount();
    await act(async () => { await builder.loadAlbum('album-1'); });
    expectEightByEight(pages);

    let ok = false;
    await act(async () => { ok = await builder.manualSave(); });
    expect(ok).toBe(true);
    const row = cloud.rows.get('album-1')!;
    expect(row.album_size).toBe('8x8');
    expect((row.pages as AlbumPage[]).map((p) => [p.size, p.templateId])).toEqual(pages.map((p) => ['8x8', twinOf(p.templateId!)]));
  });
});

describe('a 9×9 album left on this device', () => {
  it('opens as 8×8 — its pages and its cover', async () => {
    const pages = album9();
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
      albumType: 'standard', albumSize: '9x9', selectedTemplate: 'classic', currentPageIndex: 0, rejectedTemplateIds: [],
      uploadedPhotos: photos.map((p) => ({ ...p, previewUrl: 'blob:gone' })), albumPages: pages,
      coverFront: { id: 'cover-front', size: '9x9', templateId: 'cover-hero', background: { type: 'solid', solid: '#FFFFFF' }, photos: [], textElements: [] },
      title: 'Quinn HK Trip', editedAt: 1,
    }));
    await mount();
    expectEightByEight(pages);
    expect(builder.coverFront.size).toBe('8x8');
  });
});
