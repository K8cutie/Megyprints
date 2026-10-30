// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/* ══════════════════════════════════════════════════════════════════════════
   ONE OF THE ALBUM'S PHOTOS ON THE COVER (setCoverToPhoto) — the real
   useBuilderState. What a tap on a photo in the cover step does, which the
   testing phase's "Make a sample album" uses for its cover, with a white
   title so the album's name reads over the photo.
   ══════════════════════════════════════════════════════════════════════════ */

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


const title = () => builder.coverFront.textElements?.find((t) => t.boxIndex === 0);
async function withPhoto() {
  // A new album: the builder makes its default cover (with the title box).
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
    albumType: 'standard', albumSize: '8x8', selectedTemplate: 'classic', uploadedPhotos: [], albumPages: [],
    currentPageIndex: 0, rejectedTemplateIds: [], title: '', albumId: 'album-1',
  }));
  await openBuilder();
  await act(async () => { builder.setAlbumTitle('Sample Album'); });
  await act(async () => { builder.addPhotos([new File([new Uint8Array([1, 2, 3])], 'megy-sample-03.jpg', { type: 'image/jpeg' })]); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  expect(builder.uploadedPhotos).toHaveLength(1);
  return builder.uploadedPhotos[0];
}

describe('setCoverToPhoto', () => {
  it("puts the album's photo on the cover the way a tap in the cover step does", async () => {
    const photo = await withPhoto();
    await act(async () => { builder.setCoverToPhoto(photo.id); });
    expect(builder.coverFront.background).toEqual({ type: 'image', image: photo.previewUrl, photoId: photo.id, opacity: 100 });
    // The title keeps its own colour unless one is asked for.
    expect(title()?.text).toBe('Sample Album');
    expect(title()?.color).toBe('#2D2D2D');
  });

  it('with titleColor: the title in that colour, still the album name (it follows a new name)', async () => {
    const photo = await withPhoto();
    await act(async () => { builder.setCoverToPhoto(photo.id, { titleColor: '#FFFFFF' }); });
    expect(title()).toMatchObject({ text: 'Sample Album', color: '#FFFFFF', fromAlbumName: true });
    await act(async () => { builder.setAlbumTitle('Our Sunday'); });
    expect(title()).toMatchObject({ text: 'Our Sunday', color: '#FFFFFF' });
  });

  it('a photo that is not in the album changes nothing', async () => {
    await withPhoto();
    const before = builder.coverFront;
    await act(async () => { builder.setCoverToPhoto('no-such-photo', { titleColor: '#FFFFFF' }); });
    expect(builder.coverFront).toBe(before);
  });
});
