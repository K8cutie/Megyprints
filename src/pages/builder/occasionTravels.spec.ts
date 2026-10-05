// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { AlbumPage, UploadedPhoto } from './types';

/* ══════════════════════════════════════════════════════════════════════════
   THE OCCASION TRAVELS WITH THE ALBUM (1-star testers round 2, N4): resumed
   on a fresh browser, the album came back with its name and size but no
   occasion — "Generate Album" bounced to Step 1 ("Choose an occasion to
   continue") — and the "2 · Dynamic pair" pick was back to Surprise. The
   occasion lived in one key per device; photos-per-page wasn't saved.
   ══════════════════════════════════════════════════════════════════════════ */

const cloud = vi.hoisted(() => ({ rows: new Map<string, Record<string, unknown>>(), tick: 0, lacks: new Set<string>() }));
vi.mock('../../lib/authContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('../../lib/supabase', () => {
  const stamp = () => `2026-10-05T02:00:${String(cloud.tick++).padStart(2, '0')}.000001+00:00`;
  const from = () => {
    const q: { op: string; row?: Record<string, unknown>; filters: [string, unknown][] } = { op: 'select', filters: [] };
    const matches = (r: Record<string, unknown>) => q.filters.every(([c, v]) => r[c] === v);
    const run = async (single: boolean) => {
      if (q.op === 'select') {
        const found = [...cloud.rows.values()].filter(matches).map((r) => JSON.parse(JSON.stringify(r)));
        return { data: single ? found[0] ?? null : found, error: null };
      }
      // A database without a column refuses the whole write over it (PGRST204).
      const missing = Object.keys(q.row!).find((k) => cloud.lacks.has(k));
      if (missing) return { data: null, error: { code: 'PGRST204', message: `Could not find the '${missing}' column of 'albums' in the schema cache` } };
      if (q.op === 'insert') {
        const row = q.row!;
        if (cloud.rows.has(row.id as string)) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "albums_pkey"' } };
        const saved = JSON.parse(JSON.stringify({ ...row, updated_at: stamp() }));
        cloud.rows.set(row.id as string, saved);
        return { data: { id: saved.id, updated_at: saved.updated_at }, error: null };
      }
      if (q.op === 'upsert') {
        const row = q.row!;
        const before = cloud.rows.get(row.id as string);
        const saved = JSON.parse(JSON.stringify({ ...before, ...row, updated_at: before ? stamp() : (row.updated_at ?? stamp()) }));
        cloud.rows.set(row.id as string, saved);
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
import { serializeAlbum, deserializeAlbum, missingOptionalColumn } from '../../lib/useAlbumSync';
import { readAlbumTheme, writeAlbumTheme, ALBUM_THEME_EVENT, ALBUM_THEME_KEY } from '../../lib/albumTheme';
import { DRAFT_STORAGE_KEY } from '../../lib/localDraft';

const photos: UploadedPhoto[] = Array.from({ length: 40 }, (_, i) => ({
  id: `photo-${i}`, name: `photo-${i}.jpg`, previewUrl: `https://photos.test/${i}.jpg`, type: 'image/jpeg', size: 1000, width: 1200, height: 1200,
}));
const page = (i: number): AlbumPage => ({
  id: `page-${i}`, layout: 'freeform', size: '8x8', background: { type: 'solid', solid: '#FFFFFF' },
  photos: [], textElements: [], templateId: 't88-fb-solo', slotFills: [i],
} as AlbumPage);

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
  cloud.rows.clear(); cloud.tick = 0; cloud.lacks.clear();
});
afterEach(async () => { await act(async () => { root?.unmount(); }); root = null; });

describe('saved with the album', () => {
  it('the occasion and photos-per-page are in the album row', () => {
    const row = serializeAlbum({ id: 'a1', title: 'HK', sizePreset: '8x8', pages: [], occasion: 'Vacation', photosPerPage: 2 });
    expect(row).toMatchObject({ occasion: 'Vacation', photos_per_page: 2 });
    const back = deserializeAlbum({ ...JSON.parse(JSON.stringify(row)), id: 'a1' });
    expect(back).toMatchObject({ occasion: 'Vacation', photosPerPage: 2 });
    expect(deserializeAlbum({ id: 'old', title: 'x' })).toMatchObject({ occasion: null, photosPerPage: null }); // saved before 0038
  });
  it('the builder saves the album\'s occasion and pick', async () => {
    writeAlbumTheme('Vacation');
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
      albumType: 'standard', albumSize: '8x8', selectedTemplate: 'classic', uploadedPhotos: photos,
      albumPages: Array.from({ length: 40 }, (_, i) => page(i)), currentPageIndex: 0, rejectedTemplateIds: [],
      photosPerPage: 2, title: 'Quinn HK Trip', albumId: 'album-1', accountId: 'user-1',
    }));
    await mount();
    await act(async () => { await builder.manualSave(); });
    expect(cloud.rows.get('album-1')).toMatchObject({ occasion: 'Vacation', photos_per_page: 2 });
  });
  it('a database without the occasion column yet (deploy before db:push): saved without it, not refused', async () => {
    cloud.lacks.add('occasion');
    writeAlbumTheme('Vacation');
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
      albumType: 'standard', albumSize: '8x8', selectedTemplate: 'classic', uploadedPhotos: photos,
      albumPages: Array.from({ length: 40 }, (_, i) => page(i)), currentPageIndex: 0, rejectedTemplateIds: [],
      title: 'Quinn HK Trip', albumId: 'album-1', accountId: 'user-1',
    }));
    await mount();
    let ok = false;
    await act(async () => { ok = await builder.manualSave(); });
    expect(ok).toBe(true);
    expect(cloud.rows.get('album-1')?.occasion).toBeUndefined();
    expect(missingOptionalColumn({ code: 'PGRST204', message: "Could not find the 'occasion' column of 'albums' in the schema cache" })).toBe('occasion');
    expect(missingOptionalColumn({ code: '23505', message: 'duplicate' })).toBeNull();
  });
});

describe('a fresh browser opening the album gets them back', () => {
  it('opening it from the account restores the occasion (and tells the steps) and the photos-per-page pick', async () => {
    cloud.rows.set('album-1', {
      id: 'album-1', user_id: 'user-1', title: 'Quinn HK Trip', album_size: '9x9', occasion: 'Vacation', photos_per_page: 2,
      pages: Array.from({ length: 40 }, (_, i) => ({ ...page(i), size: '9x9', templateId: 't99-fb-solo' })),
      photos: photos.map((p) => ({ id: p.id, name: p.name, size: p.size, width: p.width, height: p.height })),
      updated_at: '2026-10-05T01:00:00.000001+00:00',
    });
    expect(localStorage.getItem(ALBUM_THEME_KEY)).toBeNull(); // a fresh browser
    const heard = vi.fn();
    window.addEventListener(ALBUM_THEME_EVENT, heard);
    await mount();
    await act(async () => { await builder.loadAlbum('album-1'); });
    window.removeEventListener(ALBUM_THEME_EVENT, heard);
    expect(readAlbumTheme()).toBe('Vacation');
    expect(heard).toHaveBeenCalled();
    expect(builder.photosPerPage).toBe(2);
    expect(builder.albumTitle).toBe('Quinn HK Trip');
  });
  it('ANOTHER album saved before they travelled has none: the last album\'s occasion does not carry into it (Kraken)', async () => {
    writeAlbumTheme('Birthday');
    cloud.rows.set('album-2', {
      id: 'album-2', user_id: 'user-1', title: 'Old', album_size: '8x8',
      pages: [page(0)], photos: [], updated_at: '2026-10-05T01:00:00.000001+00:00',
    });
    await mount();
    await act(async () => { await builder.loadAlbum('album-2'); });
    expect(readAlbumTheme()).toBe('');
  });
  it('the SAME album reopened, saved before they travelled, keeps what this device has for it', async () => {
    writeAlbumTheme('Birthday');
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
      albumType: 'standard', albumSize: '8x8', selectedTemplate: 'classic', uploadedPhotos: photos,
      albumPages: Array.from({ length: 40 }, (_, i) => page(i)), currentPageIndex: 0, rejectedTemplateIds: [],
      title: 'Old', albumId: 'album-2', accountId: 'user-1',
    }));
    cloud.rows.set('album-2', {
      id: 'album-2', user_id: 'user-1', title: 'Old', album_size: '8x8',
      pages: Array.from({ length: 40 }, (_, i) => page(i)), photos: [], updated_at: '2026-10-05T01:00:00.000001+00:00',
    });
    await mount();
    await act(async () => { await builder.loadAlbum('album-2', { replace: true }); });
    expect(readAlbumTheme()).toBe('Birthday');
  });
});
