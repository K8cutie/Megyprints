// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { AlbumPage, UploadedPhoto } from './types';

/* ══════════════════════════════════════════════════════════════════════════
   ONE DEVICE, TWO ACCOUNTS (Kraken, 2026-10-05). A signs out; B signs in on
   the same phone. B used to get A's album (A's pages, A's photos) as their
   own, and A's occasion and photos-per-page carried into B's next album.
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({
  user: null as { id: string } | null,
  rows: new Map<string, Record<string, unknown>>(),
  writes: [] as Record<string, unknown>[],
}));
vi.mock('../../lib/authContext', () => ({ useAuth: () => ({ user: h.user }) }));
vi.mock('../../lib/supabase', () => {
  const from = () => {
    const q: { op: string; row?: Record<string, unknown>; filters: [string, unknown][] } = { op: 'select', filters: [] };
    const run = async (single: boolean) => {
      if (q.op === 'select') {
        const found = [...h.rows.values()].filter((r) => q.filters.every(([c, v]) => r[c] === v));
        return { data: single ? found[0] ?? null : found, error: null };
      }
      h.writes.push({ op: q.op, ...q.row });
      return { data: single ? { id: q.row?.id, updated_at: 'v1' } : [], error: null };
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
  return { supabase: { from, auth: { getSession: async () => ({ data: { session: h.user ? { user: h.user } : null } }) } } };
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
import { DRAFT_STORAGE_KEY } from '../../lib/localDraft';
import { readAlbumTheme, writeAlbumTheme } from '../../lib/albumTheme';

const photos: UploadedPhoto[] = Array.from({ length: 40 }, (_, i) => ({
  id: `photo-${i}`, name: `photo-${i}.jpg`, previewUrl: `https://photos.test/${i}.jpg`,
  type: 'image/jpeg', size: 1000, width: 1200, height: 1200,
}));
const page = (i: number): AlbumPage => ({
  id: `page-${i}`, layout: 'freeform', size: '8x8', background: { type: 'solid', solid: '#FFFFFF' },
  photos: [], textElements: [], templateId: 't88-fb-solo', slotFills: [i],
} as AlbumPage);
const draftOf = (accountId: string | null) => localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
  albumType: 'standard', albumSize: '8x8', selectedTemplate: 'classic', uploadedPhotos: photos,
  albumPages: Array.from({ length: 40 }, (_, i) => page(i)), currentPageIndex: 0, rejectedTemplateIds: [],
  photosPerPage: 2, title: "Ana's Baptism", albumId: 'album-a', accountId,
}));

let builder!: BuilderActions;
function Probe() {
  const b = useBuilderState();
  useEffect(() => { builder = b; });
  return null;
}
let root: Root | null = null;
const mount = async () => {
  root = createRoot(document.createElement('div'));
  await act(async () => { root!.render(createElement(Probe)); });
  await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
};

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); sessionStorage.clear();
  h.user = null; h.rows.clear(); h.writes = [];
});
afterEach(async () => { await act(async () => { root?.unmount(); }); root = null; });

describe('B signs in where A\'s album was left', () => {
  it('B gets a fresh album, not A\'s pages and photos', async () => {
    draftOf('user-a');
    writeAlbumTheme('Baptism');
    h.user = { id: 'user-b' };
    await mount();
    expect(builder.uploadedPhotos).toHaveLength(0);
    expect(builder.albumTitle).toBe('');
    expect(builder.getAlbumId()).not.toBe('album-a');
    expect(builder.photosPerPage).toBeUndefined();
    expect(readAlbumTheme()).toBe(''); // and not A's occasion either
    expect(h.writes.filter((w) => w.id === 'album-a')).toEqual([]);
  });

  it('B signing in while the builder is open: the same, and nothing of A\'s is saved as B\'s', async () => {
    draftOf('user-a');
    h.user = { id: 'user-a' };
    await mount();
    expect(builder.uploadedPhotos).toHaveLength(40); // A's own album, for A
    await act(async () => { root!.unmount(); });
    h.user = null; // A signs out …
    await mount();
    h.user = { id: 'user-b' }; // … and B signs in, builder open
    await act(async () => { root!.render(createElement(Probe)); });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(builder.uploadedPhotos).toHaveLength(0);
    expect(h.writes.some((w) => w.user_id === 'user-b' && JSON.stringify(w).includes("Ana's Baptism"))).toBe(false);
  });

  it('a GUEST\'s album is still theirs to keep when they sign in (the album they were making)', async () => {
    draftOf(null);
    h.user = { id: 'user-b' };
    await mount();
    expect(builder.uploadedPhotos).toHaveLength(40);
    expect(builder.getAlbumId()).toBe('album-a');
  });

  it('A coming back to their own device: their album is still there', async () => {
    draftOf('user-a');
    h.user = { id: 'user-a' };
    await mount();
    expect(builder.uploadedPhotos).toHaveLength(40);
    expect(builder.albumTitle).toBe("Ana's Baptism");
  });
});

describe('the occasion and photos-per-page belong to one album', () => {
  it('a new album starts without the last one\'s occasion', async () => {
    draftOf('user-a');
    writeAlbumTheme('Baptism');
    h.user = { id: 'user-a' };
    await mount();
    await act(async () => { builder.reset(); });
    expect(readAlbumTheme()).toBe('');
    expect(builder.photosPerPage).toBeUndefined();
  });

  it('opening an album saved without them: none, not this device\'s last ones', async () => {
    h.user = { id: 'user-a' };
    h.rows.set('album-old', {
      id: 'album-old', user_id: 'user-a', title: 'Old Album', album_size: '8x8', occasion: null, photos_per_page: null,
      pages: Array.from({ length: 40 }, (_, i) => page(i)), photos: photos.map((p) => ({ id: p.id, name: p.name })), updated_at: 'v0',
    });
    writeAlbumTheme('Baptism');
    await mount();
    await act(async () => { builder.setPhotosPerPage(2); });
    expect(builder.photosPerPage).toBe(2);
    await act(async () => { await builder.loadAlbum('album-old'); });
    expect(readAlbumTheme()).toBe('');
    expect(builder.photosPerPage).toBeUndefined();
  });
});
