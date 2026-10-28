// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, Component, createElement, useEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/* ══════════════════════════════════════════════════════════════════════════
   THE BUILDER RUNS ON THE DEVICE IT IS GIVEN (2.0 native app, Phase 0b).
   The real useBuilderState, wrapped in a BuilderPlatformContext with a
   made-up device: its own key-value stores, photo store, photo intake, face
   finder, photo check and app lifecycle, all in memory. The builder's
   default is the app's (none, defaultBuilderPlatform.native.ts), every
   browser piece the website uses (IndexedDB, face-api, the HEIC converter,
   the EXIF reader) is replaced by one that FAILS the test if the builder
   reaches for it, and the browser's localStorage holds a different album
   that must never open. So each thing
   checked here can only have come through the platform: that is what lets
   the native app hand the builder its own pieces.
   (The website's own path, with nothing provided, is what every other
   builder spec runs.) Test photos are made-up bytes, never real pictures.
   ══════════════════════════════════════════════════════════════════════════ */

const touched: string[] = [];
/** Who the saved sign-in says is signed in (reset() asks it), and the
 *  account saves the builder makes (the cloud itself is not reached). */
const cloud = vi.hoisted(() => ({
  session: null as null | { user: { id: string } },
  saved: [] as Array<{ userId: string; data: { id?: string; occasion?: string | null } }>,
}));
vi.mock('../../lib/authContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../../lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: cloud.session } }) } } }));
vi.mock('../../lib/useAlbumSync', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../lib/useAlbumSync')>();
  const sync = {
    save: async (userId: string, data: { id?: string; occasion?: string | null }) => {
      cloud.saved.push({ userId, data });
      return { success: true, updatedAt: '2026-10-28T00:00:00Z' };
    },
    load: async () => null,
  };
  return { ...real, useAlbumSync: () => sync };
});
vi.mock('../../lib/useIndexedDBPhotos', () => ({
  useIndexedDBPhotos: () => { touched.push('IndexedDB'); throw new Error('the browser photo store was used'); },
  getImageDimensions: async () => { touched.push('getImageDimensions'); return { width: 0, height: 0 }; },
}));
vi.mock('./faceDetection', () => ({
  initFaceApi: async () => { touched.push('face-api'); },
  detectFaceCenter: async () => { touched.push('face-api'); return null; },
}));
vi.mock('./exif', () => ({
  readCaptureTime: async () => { touched.push('EXIF'); return null; },
}));
// The builder's default here is the APP's (defaultBuilderPlatform.native.ts:
// none), so nothing can quietly fall back to the browser's pieces.
vi.mock('../../lib/defaultBuilderPlatform', () => import('../../lib/defaultBuilderPlatform.native'));

import { useBuilderState, type BuilderActions } from './useBuilderState';
import { BuilderPlatformContext, type BuilderPlatform, type KeyValueStore, type PickedPhoto, type StoredPhoto } from '../../shared/platform';
import { heicConverters } from '../../lib/heicPhoto';
import { DRAFT_STORAGE_KEY } from '../../lib/localDraft';
import { ALBUM_THEME_KEY } from '../../lib/albumTheme';
import type { AlbumPage, UploadedPhoto } from './types';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, v); },
    removeItem: (k) => { data.delete(k); },
  };
}

/** When every photo on the made-up device was taken (2026-09-12, noon UTC). */
const TAKEN_AT = Date.UTC(2026, 8, 12, 12);

/** The made-up device. Photos are kept by id. A picture's URL is mem://…:
 *  mem://kept/… is the photo store's own copy (it lasts), mem://shown/… is
 *  what a pick showed (like a picker's URI, it may be gone next time). */
function makeDevice() {
  const kept = new Map<string, StoredPhoto>();
  const calls = { faces: [] as string[], sizes: [] as string[], checks: [] as string[], converted: [] as string[], released: [] as string[], dated: [] as string[], init: 0 };
  let convertNow!: () => void;
  const converting = new Promise<void>((r) => { convertNow = r; });
  let leave: (() => void) | null = null;
  let back: (() => void) | null = null;
  const platform: BuilderPlatform = {
    deviceStore: memoryStore(),
    sessionStore: memoryStore(),
    usePhotoStore: () => ({
      store: async (photo: PickedPhoto, id?: string) => {
        const key = id ?? `kept-${kept.size}`;
        const record = { id: key, name: photo.name, type: photo.type, size: photo.size, width: 1000, height: 2000, url: `mem://kept/${key}` };
        kept.set(key, record);
        return record;
      },
      get: async (id: string) => kept.get(id) ?? null,
      deletePhoto: async (id: string) => { kept.delete(id); },
      deleteMany: async (ids: string[]) => { ids.forEach((id) => kept.delete(id)); },
    }),
    photos: {
      // This device converts its ".pic" photos (the browser's HEIC rule says no to them).
      looksHeic: (p) => p.name.endsWith('.pic'),
      toAlbumPhoto: async (p) => {
        if (!p.name.endsWith('.pic')) return p;
        await converting; // held until the test lets it finish
        calls.converted.push(p.name);
        return { name: p.name.replace('.pic', '.jpg'), size: p.size, type: 'image/jpeg' };
      },
      getImageDimensions: async () => ({ width: 1000, height: 2000 }),
      // The gallery's own date for a picked photo (no EXIF read on this device).
      captureTime: async (p) => { calls.dated.push(p.name); return TAKEN_AT; },
      previewUrlOf: (p) => `mem://shown/${p.name}`,
      releasePreviewUrl: (url) => { calls.released.push(url); },
      urlNeedsReload: (url) => !url.startsWith('mem://kept/'),
      pictureSize: async (url) => { calls.sizes.push(url); return { width: 1000, height: 2000 }; },
      convertingPreview: 'mem://converting',
    },
    faces: {
      init: async () => { calls.init++; },
      detectFaceCenter: async (url) => { calls.faces.push(url); return { x: 0.5, y: 0.1 }; },
    },
    photoCheck: {
      available: () => true,
      facesForAllPhotos: () => false,
      readable: (photo) => photo.url.startsWith('mem://kept/'),
      check: async (photo) => {
        // Two different fingerprints, so the two test photos are not repeats.
        const hash = (calls.checks.length % 2 ? 'f' : '0').repeat(16);
        calls.checks.push(photo.id);
        return { v: 1, sharp: 50, hash, faces: null, eyesClosed: false };
      },
    },
    lifecycle: {
      onLeave: (fn) => { leave = fn; return () => { leave = null; }; },
      onReturn: (fn) => { back = fn; return () => { back = null; }; },
    },
  };
  return { platform, kept, calls, convertNow: () => convertNow(), leave: () => leave?.(), listening: () => ({ leave: !!leave, back: !!back }), store: platform.deviceStore as ReturnType<typeof memoryStore>, session: platform.sessionStore as ReturnType<typeof memoryStore> };
}

const page = (i: number, fill: number | null): AlbumPage => ({
  id: `page-${i}`, layout: 'freeform', size: '8x8', templateId: 't88-solo-square', slotFills: [fill], photos: [], textElements: [],
  background: { type: 'solid', solid: '#FFFFFF' },
});
const photo = (i: number, previewUrl: string): UploadedPhoto => ({ id: `p${i}`, name: `p${i}.jpg`, previewUrl, type: 'image/jpeg', size: 100 + i, width: 1000, height: 2000 });
const draft = (title: string, photos: UploadedPhoto[]) => JSON.stringify({
  albumType: 'standard', albumSize: '8x8', selectedTemplate: 'classic', uploadedPhotos: photos,
  albumPages: Array.from({ length: 40 }, (_, i) => page(i, i < photos.length ? i : null)), currentPageIndex: 0,
  rejectedTemplateIds: [], title, albumId: 'album-device', accountId: null,
});
/** Made-up bytes, not a picture. */
const file = (name: string, type = 'image/jpeg') => new File([new Uint8Array([1, 2, 3, 4, 5])], name, { type });

let builder!: BuilderActions;
let device: ReturnType<typeof makeDevice>;
let root: Root | null = null;
function Probe() {
  const b = useBuilderState();
  useEffect(() => { builder = b; });
  return null;
}
/** Catches what a child throws while drawing, so a test can read it. */
class Catch extends Component<{ children?: ReactNode; onError: (e: unknown) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: unknown) { this.props.onError(e); }
  render() { return this.state.failed ? null : this.props.children; }
}
const settle = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); });
async function open() {
  root = createRoot(document.createElement('div'));
  await act(async () => {
    root!.render(createElement(BuilderPlatformContext.Provider, { value: device.platform }, createElement(Probe)));
  });
  await settle();
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  touched.length = 0;
  localStorage.clear(); sessionStorage.clear();
  // The browser's own album and occasion: they must never open on this device.
  localStorage.setItem(DRAFT_STORAGE_KEY, draft('The browser album', [photo(0, 'blob:browser/p0')]));
  localStorage.setItem(ALBUM_THEME_KEY, 'Birthday');
  cloud.session = null;
  cloud.saved.length = 0;
  device = makeDevice();
});
afterEach(async () => {
  await act(async () => { root?.unmount(); });
  root = null;
  vi.restoreAllMocks();
});

describe('the album builder on a device of its own (no browser pieces)', () => {
  it('in the app, with no device pieces given, the builder says so plainly instead of using the browser\'s', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {}); // React reports the caught error
    let caught: unknown = null;
    const r = createRoot(document.createElement('div'));
    await act(async () => { r.render(createElement(Catch, { onError: (e) => { caught = e; } }, createElement(Probe))); });
    await act(async () => { r.unmount(); });
    expect(String(caught)).toMatch(/needs its device pieces: wrap it in <BuilderPlatformContext\.Provider>/);
    expect(touched).toEqual([]);
  });

  it('opens the album saved on THIS device, its photos found again in this device\'s photo store', async () => {
    // p0 and p1 were shown from a pick last time (that URL may be gone now),
    // p2 from the store's own copy (it lasts). The store still has p0 only.
    device.store.setItem(DRAFT_STORAGE_KEY, draft('Device album', [photo(0, 'mem://shown/p0.jpg'), photo(1, 'mem://shown/p1.jpg'), photo(2, 'mem://kept/p2')]));
    device.kept.set('p0', { id: 'p0', name: 'p0.jpg', type: 'image/jpeg', size: 100, width: 1000, height: 2000, url: 'mem://kept/p0' });
    await open();
    expect(builder.albumTitle).toBe('Device album');
    // p0: the store's copy. p1: not on this device, so it shows as missing
    // (picking it again puts it back), never a dead picture. p2: as it was.
    expect(builder.uploadedPhotos.map((p) => p.previewUrl)).toEqual(['mem://kept/p0', '', 'mem://kept/p2']);
    expect(device.calls.init).toBe(1); // the face model is got ready on this device's finder
    expect(touched).toEqual([]);
  });

  it('a "start a new album" signal on this device opens an empty album', async () => {
    device.store.setItem(DRAFT_STORAGE_KEY, draft('Device album', [photo(0, 'mem://kept/p0')]));
    device.session.setItem('megy-fresh-start', '1');
    await open();
    expect(builder.albumTitle).toBe('');
    expect(builder.uploadedPhotos).toEqual([]);
  });

  it('added photos are shown, converted, kept and checked by the device', async () => {
    await open();
    const native = vi.spyOn(heicConverters, 'native');
    const libheif = vi.spyOn(heicConverters, 'libheif');
    let added!: ReturnType<BuilderActions['addPhotos']>;
    await act(async () => { added = builder.addPhotos([file('beach.jpg'), file('party.pic', 'image/x-pic')]); });
    await settle();
    // While it converts, the device's own "converting" picture shows.
    expect(builder.uploadedPhotos.map((p) => p.previewUrl)).toEqual(['mem://shown/beach.jpg', 'mem://converting']);
    expect(builder.heicProgress).toEqual({ done: 0, total: 1 });
    let heic: Awaited<NonNullable<typeof added.heic>> | undefined;
    await act(async () => { device.convertNow(); heic = await added.heic; });
    await settle();
    expect(heic).toEqual({ converted: 1, unreadable: [], unreadableNew: 0 });
    const [beach, party] = builder.uploadedPhotos;
    expect(device.calls.converted).toEqual(['party.pic']);
    expect(party.previewUrl).toBe('mem://shown/party.jpg');
    expect(party.name).toBe('party.pic'); // the original's name: picking it again is "already in your album"
    expect(device.kept.get(beach.id)?.name).toBe('beach.jpg');
    expect(device.kept.get(party.id)?.name).toBe('party.jpg');
    expect([beach.width, beach.height]).toEqual([1000, 2000]);
    // When each was taken comes from the device, read from the photo as picked.
    expect(device.calls.dated.sort()).toEqual(['beach.jpg', 'party.pic']);
    expect([beach.capturedAt, party.capturedAt]).toEqual([TAKEN_AT, TAKEN_AT]);
    expect(device.calls.checks.sort()).toEqual([beach.id, party.id].sort());
    expect(builder.uploadedPhotos.every((p) => p.check?.sharp === 50)).toBe(true);
    // Neither the browser's HEIC converter nor its photo store was asked.
    expect(native).not.toHaveBeenCalled();
    expect(libheif).not.toHaveBeenCalled();
    expect(touched).toEqual([]);
  });

  it('removing a photo lets go of its picture on the device', async () => {
    device.store.setItem(DRAFT_STORAGE_KEY, draft('Device album', [photo(0, 'mem://kept/p0')]));
    await open();
    await act(async () => { builder.removePhoto('p0'); });
    expect(device.calls.released).toEqual(['mem://kept/p0']);
  });

  it('a photo put in a frame is centred on the face this device found', async () => {
    device.store.setItem(DRAFT_STORAGE_KEY, draft('Device album', [photo(0, 'mem://kept/p0'), photo(1, 'mem://kept/p1')]));
    await open();
    await act(async () => { builder.fillSlot(0, 1); });
    await settle();
    expect(device.calls.faces).toEqual(['mem://kept/p1']);
    expect(device.calls.sizes).toEqual(['mem://kept/p1']);
    const pan = builder.albumPages[0].slotOffsetsY?.[0] ?? 0;
    expect(pan).toBeGreaterThan(0); // a tall photo with the face near the top moves down
    expect(touched).toEqual([]);
  });

  it('going to the background saves the album on this device, not in the browser', async () => {
    await open();
    await act(async () => { builder.setAlbumTitle('Saved on leaving'); });
    await act(async () => { device.leave(); });
    expect(JSON.parse(device.store.getItem(DRAFT_STORAGE_KEY)!).title).toBe('Saved on leaving');
    expect(JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY)!).title).toBe('The browser album');
  });

  it('listens for the app leaving and coming back while open, and stops when closed', async () => {
    await open();
    expect(device.listening()).toEqual({ leave: true, back: true });
    await act(async () => { root?.unmount(); });
    root = null;
    expect(device.listening()).toEqual({ leave: false, back: false });
  });

  it('the occasion is kept on this device: the album saved to the account carries it, and a new album clears it', async () => {
    device.store.setItem(DRAFT_STORAGE_KEY, draft('Device album', [photo(0, 'mem://kept/p0')]));
    device.store.setItem(ALBUM_THEME_KEY, 'Wedding');
    cloud.session = { user: { id: 'user-1' } };
    await open();
    // A new album: the one being put away is saved to the account first.
    await act(async () => { builder.reset(); });
    await settle();
    expect(cloud.saved.map((s) => [s.userId, s.data.id, s.data.occasion])).toEqual([['user-1', 'album-device', 'Wedding']]);
    expect(device.store.getItem(ALBUM_THEME_KEY)).toBeNull(); // Step 1 asks it again
    expect(localStorage.getItem(ALBUM_THEME_KEY)).toBe('Birthday'); // the browser's, untouched
  });

  it('a new album clears this device\'s draft', async () => {
    device.store.setItem(DRAFT_STORAGE_KEY, draft('Device album', [photo(0, 'mem://kept/p0')]));
    device.store.setItem('megy_wizard_state', '{}');
    await open();
    await act(async () => { builder.reset(); });
    expect(device.store.getItem(DRAFT_STORAGE_KEY)).toBeNull();
    expect(device.store.getItem('megy_wizard_state')).toBeNull();
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).not.toBeNull();
  });
});
