// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { AlbumPage } from './types';

/* ══════════════════════════════════════════════════════════════════════════
   THE COVER PHOTO SURVIVES CLOSING THE APP — the real useBuilderState, in
   React. Picking a cover photo keeps the FILE in the device's photo store;
   opening the builder again (a fresh tab: every blob: link dead) points the
   cover at a live link for it. A guest's "new album" forgets it like the
   album's own photos.
   ══════════════════════════════════════════════════════════════════════════ */

// The device's photo store: id → a live object URL for the bytes it holds.
const device = vi.hoisted(() => ({ photos: new Map<string, string>(), deleted: [] as string[][], stored: [] as string[] }));

vi.mock('../../lib/authContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));
vi.mock('../../lib/useAlbumSync', async (importOriginal) => {
  const sync = {
    save: async () => ({ success: true }), load: async () => null, loadAll: async () => [],
    deleteAlbum: async () => ({ success: true }), loading: false, error: null, clearError: () => {},
  };
  return { ...(await importOriginal<Record<string, unknown>>()), useAlbumSync: () => sync };
});
vi.mock('../../lib/useIndexedDBPhotos', () => {
  const idb = {
    store: async (file: File, id?: string) => {
      const key = id ?? `local-${device.photos.size}`;
      device.photos.set(key, `blob:stored/${key}`);
      device.stored.push(key);
      return { id: key, name: file.name, type: file.type, size: file.size, width: 1200, height: 1200, storedAt: '' };
    },
    get: async (id: string) => {
      const url = device.photos.get(id);
      return url ? { id, url, name: id, type: 'image/jpeg', size: 1000, width: 1200, height: 1200, storedAt: '', blob: new Blob() } : null;
    },
    getMany: async () => new Map(),
    deletePhoto: async () => {},
    deleteMany: async (ids: string[]) => { device.deleted.push(ids); },
    list: async () => [],
    loading: false, error: null, clearError: () => {},
  };
  return { useIndexedDBPhotos: () => idb, getImageDimensions: async () => ({ width: 0, height: 0 }) };
});
vi.mock('./faceDetection', () => ({ initFaceApi: async () => {}, detectFaceCenter: async () => null }));

import { useBuilderState, type BuilderActions } from './useBuilderState';
import { DRAFT_STORAGE_KEY } from '../../lib/localDraft';

let builder!: BuilderActions;
function Probe({ onCommit }: { onCommit: (b: BuilderActions) => void }) {
  const b = useBuilderState();
  useEffect(() => { onCommit(b); });
  return null;
}
let root: Root | null = null;
async function openBuilder() {
  root = createRoot(document.createElement('div'));
  await act(async () => { root!.render(createElement(Probe, { onCommit: (b) => { builder = b; } })); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); // let the mount effects' reads land
}
async function closeBuilder() {
  await act(async () => { root?.unmount(); });
  root = null;
}

/** The draft as the cover step leaves it: no album photos yet, a cover. */
function seedDraft(coverBg: AlbumPage['background']) {
  const coverFront = { id: 'cover-front-1', layout: 'freeform', size: '8x8', background: coverBg, photos: [], textElements: [] };
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
    albumType: 'standard', albumSize: '8x8', selectedTemplate: 'classic', uploadedPhotos: [], albumPages: [],
    currentPageIndex: 0, rejectedTemplateIds: [], title: "Maria's Debut", albumId: 'album-1', coverFront,
  }));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  let n = 0;
  Object.defineProperty(URL, 'createObjectURL', { value: () => `blob:session/${++n}`, configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: () => {}, configurable: true });
  localStorage.clear();
  sessionStorage.clear();
  device.photos.clear();
  device.deleted = [];
  device.stored = [];
});
afterEach(closeBuilder);

const coverBg = () => builder.coverFront.background as AlbumPage['background'] & { localPhotoId?: string };

describe('a cover photo the customer picks', () => {
  it('is kept on the device, and the cover remembers which one', async () => {
    seedDraft({ type: 'solid', solid: '#FFFBF7' });
    await openBuilder();
    const file = new File([new Uint8Array([1, 2, 3])], 'beach.jpg', { type: 'image/jpeg' });
    await act(async () => { await builder.setCoverPhoto(file); });
    const bg = coverBg();
    expect(bg.type).toBe('image');
    expect(bg.localPhotoId).toMatch(/^cover-/);
    expect(device.stored).toEqual([bg.localPhotoId]);
    expect(bg.image).toBe(device.photos.get(bg.localPhotoId!)); // shows the stored copy
  });

  it('opening the app again (every old blob: link dead) brings it back from the device', async () => {
    device.photos.set('cover-album-1-x', 'blob:fresh/cover-album-1-x');
    seedDraft({ type: 'image', image: 'blob:from-the-closed-tab', localPhotoId: 'cover-album-1-x' });
    await openBuilder();
    expect(coverBg()).toMatchObject({ type: 'image', image: 'blob:fresh/cover-album-1-x', localPhotoId: 'cover-album-1-x' });
  });

  it('not on this device (cleared storage, another phone): the cover is left as saved, no crash', async () => {
    seedDraft({ type: 'image', image: 'blob:from-the-closed-tab', localPhotoId: 'cover-album-1-x' });
    await openBuilder();
    expect(coverBg()).toMatchObject({ image: 'blob:from-the-closed-tab', localPhotoId: 'cover-album-1-x' });
  });

  it('a guest starting a new album forgets the cover photo, like the album photos', async () => {
    device.photos.set('cover-album-1-x', 'blob:fresh/cover-album-1-x');
    seedDraft({ type: 'image', image: 'blob:from-the-closed-tab', localPhotoId: 'cover-album-1-x' });
    await openBuilder();
    await act(async () => { builder.reset(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(device.deleted.flat()).toContain('cover-album-1-x');
  });
});
