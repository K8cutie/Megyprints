// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* ══════════════════════════════════════════════════════════════════════════
   THE SAME ALBUM ON ANOTHER DEVICE (1-star testers round 2, 2026-10-05: the
   two-device parent, the Memory Maker, the Commuter, the Quitter). Photos stay
   on the device that took them until an order — uploading every visitor's
   photos would cost a fortune; only the album's layout is in the cloud. So:
     • an album opened where its photos aren't says so (it showed blank pages);
     • adding the same photos there puts each one back in its place (they were
       added AGAIN — "90 photos ready … no repeats");
     • it can't be ordered with photos missing (it printed blank frames).
   ══════════════════════════════════════════════════════════════════════════ */

const idb = vi.hoisted(() => ({ stored: [] as string[] }));
vi.mock('./authContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('./supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
vi.mock('./useAlbumSync', async (orig) => {
  const real = await orig<typeof import('./useAlbumSync')>();
  const sync = { save: async () => ({ success: true }), load: async () => null, loadAll: async () => [], deleteAlbum: async () => ({ success: true }), loading: false, error: null, clearError: () => {} };
  return { ...real, useAlbumSync: () => sync };
});
vi.mock('./useIndexedDBPhotos', () => {
  const api = {
    store: async (_f: File, id: string) => { idb.stored.push(id); return { width: 1200, height: 900 }; },
    get: async () => null, // THIS device has none of the album's photos
    getMany: async () => new Map(), deletePhoto: async () => {}, deleteMany: async () => {}, list: async () => [],
    loading: false, error: null, clearError: () => {},
  };
  return { useIndexedDBPhotos: () => api, getImageDimensions: async () => ({ width: 1200, height: 900 }) };
});
vi.mock('../pages/builder/faceDetection', () => ({ initFaceApi: async () => {}, detectFaceCenter: async () => null }));

import { planRelink, copyQuality } from './photoRelink';
import { missingPhotos, missingPhotosMessage, usedPhotoIndexes, copyNotesMessage } from './photoPresence';
import { serializeAlbum, deserializeAlbum } from './useAlbumSync';
import { ActionEngine } from '../assistant/actionEngine';
import { useBuilderState, type BuilderActions } from '../pages/builder/useBuilderState';
import { DRAFT_STORAGE_KEY } from './localDraft';
import type { AlbumPage, UploadedPhoto } from '../pages/builder/types';

const photo = (i: number, over: Partial<UploadedPhoto> = {}): UploadedPhoto => ({
  id: `photo-${i}`, name: `IMG_${1000 + i}.jpg`, previewUrl: '', type: 'image/jpeg', size: 2_000_000 + i, width: 4000, height: 3000, ...over,
});
const page = (i: number, fills: (number | null)[]): AlbumPage => ({
  id: `page-${i}`, layout: 'freeform', size: '8x8', background: { type: 'solid', solid: '#FFFFFF' }, photos: [], textElements: [], templateId: 't88-fb-solo', slotFills: fills,
} as AlbumPage);

describe('planRelink — which picked file is which missing photo', () => {
  const album = [photo(0), photo(1), photo(2, { previewUrl: 'blob:here' })]; // 0 and 1 missing here; 2 is here
  it('the same files (name + size) go back in their places; one already here is a repeat', () => {
    const plan = planRelink([{ name: 'IMG_1001.jpg', size: 2_000_001 }, { name: 'IMG_1000.jpg', size: 2_000_000 }, { name: 'IMG_1002.jpg', size: 2_000_002 }], album);
    expect(plan.relink).toEqual([{ file: 0, photo: 1, sameCopy: true }, { file: 1, photo: 0, sameCopy: true }]);
    expect(plan.duplicate).toEqual([2]);
    expect(plan.fresh).toEqual([]);
  });
  it('same name, another size → a different copy: it goes back with a note', () => {
    expect(planRelink([{ name: 'IMG_1000.jpg', size: 900_000 }], album).relink).toEqual([{ file: 0, photo: 0, sameCopy: false }]);
  });
  it('an album saved before sizes were recorded matches by name alone', () => {
    expect(planRelink([{ name: 'IMG_1000.jpg', size: 123 }], [photo(0, { size: 0 })]).relink).toEqual([{ file: 0, photo: 0, sameCopy: true }]);
  });
  it('a photo the album never had is new; the same file twice in one pick counts once', () => {
    const plan = planRelink([{ name: 'NEW.jpg', size: 5 }, { name: 'NEW.jpg', size: 5 }], album);
    expect(plan.fresh).toEqual([0]);
    expect(plan.duplicate).toEqual([1]);
  });
});

describe('copyQuality — a re-added copy against the original', () => {
  it.each([
    [{ width: 4000, height: 3000 }, { width: 4000, height: 3000 }, null],
    [{ width: 4000, height: 3000 }, { width: 1600, height: 1200 }, 'smaller'],
    [{ width: 4000, height: 3000 }, { width: 3000, height: 4000 }, 'mismatch'],
    [{ width: 0, height: 0 }, { width: 1600, height: 1200 }, null],
  ] as const)('%o vs %o → %s', (orig, copy, note) => {
    expect(copyQuality(orig, copy)).toBe(note);
  });
});

describe('missingPhotos — what the album prints that isn\'t here', () => {
  const photos = [photo(0), photo(1, { previewUrl: 'blob:here' }), photo(2)];
  const pages = [page(0, [1]), page(1, [0]), page(2, [2, 1])];
  it('counts photos the pages and the cover print, not unused ones', () => {
    expect(usedPhotoIndexes(pages)).toEqual(new Set([1, 0, 2]));
    expect(missingPhotos(pages, photos)).toEqual({ count: 2, pages: [2, 3], cover: false, names: ['IMG_1000.jpg', 'IMG_1002.jpg'] });
  });
  it('says where, and the two ways on', () => {
    expect(missingPhotosMessage(missingPhotos(pages, photos))).toBe(
      "2 photos on pages 2 and 3 aren't on this device. They're on the phone or computer you made this album on: order from there, or add the same photos here and Megy puts each one back in its place.");
  });
  it('nothing missing → nothing said', () => {
    expect(missingPhotosMessage(missingPhotos(pages, photos.map((p) => ({ ...p, previewUrl: 'blob:x' }))))).toBe('');
  });
});

describe('copies put back are said before ordering (not blocking)', () => {
  it('smaller or different copies, and a wrong shape', () => {
    const pages = [page(0, [0]), page(1, [1]), page(2, [2]), page(3, [3])];
    const photos = [photo(0, { copyNote: 'smaller' }), photo(1, { copyNote: 'differentCopy' }), photo(2, { copyNote: 'mismatch' }), photo(3)];
    expect(copyNotesMessage(pages, photos)).toBe("2 photos were put back from a different, smaller copy and may print softer; 1 photo put back doesn't have the original's shape — check it's the right picture");
    expect(copyNotesMessage(pages, [photo(0)])).toBe('');
  });
});

describe('the cloud record knows each photo again', () => {
  it('size, pixels and capture time travel with the album (bytes, not files)', () => {
    const row = serializeAlbum({ title: 'HK', sizePreset: '8x8', pages: [], photos: [{ id: 'p0', name: 'IMG_1.jpg', size: 2_000_000, width: 4000, height: 3000, capturedAt: 1_700_000_000_000 }] });
    expect(row.photos).toEqual([{ id: 'p0', name: 'IMG_1.jpg', size: 2_000_000, width: 4000, height: 3000, capturedAt: 1_700_000_000_000 }]);
    expect(deserializeAlbum({ ...row, id: 'a1' }).photos?.[0]).toMatchObject({ size: 2_000_000, width: 4000, height: 3000, capturedAt: 1_700_000_000_000 });
  });
});

describe('Megy says what came back', () => {
  const engine = (r: Record<string, number>) => new ActionEngine({ addPhotos: () => ({ added: 0, skipped: 0, videos: 0, others: 0, restored: 0, otherCopies: 0, ...r }) } as unknown as BuilderActions);
  const run = (e: ActionEngine) => e.execute({ type: 'add_photos', payload: { files: [new File(['x'], 'a.jpg')] }, rawMessage: 'add photos' });
  it('put back, and the different copies flagged', async () => {
    expect((await run(engine({ restored: 40 }))).message).toBe('40 photos put back in their places.');
    expect((await run(engine({ restored: 3, otherCopies: 1 }))).message).toBe('3 photos put back in their places (1 from a different copy — check it, it may print softer).');
  });
});

describe('the builder on a device without the album\'s photos', () => {
  let b!: BuilderActions;
  function Probe() { const s = useBuilderState(); useEffect(() => { b = s; }); return null; }
  let root: Root | null = null;
  const files = Array.from({ length: 40 }, (_, i) => new File([new Uint8Array(10 + i)], `IMG_${1000 + i}.jpg`, { type: 'image/jpeg' }));
  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:here', configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: () => {}, configurable: true });
    localStorage.clear(); sessionStorage.clear(); idb.stored = [];
    // The album as the cloud / another device's draft has it: every photo with
    // its recorded size, none of their files on THIS device (a dead link).
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
      albumType: 'standard', albumSize: '8x8', selectedTemplate: 'classic', title: 'HK',
      uploadedPhotos: files.map((f, i) => photo(i, { size: f.size, previewUrl: 'blob:from-the-other-device' })),
      albumPages: files.map((_, i) => page(i, [i])), currentPageIndex: 0, rejectedTemplateIds: [],
    }));
    root = createRoot(document.createElement('div'));
    await act(async () => { root!.render(createElement(Probe)); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  });
  afterEach(async () => { await act(async () => { root?.unmount(); }); root = null; });

  it('it knows the photos are missing (not "here with a dead link")', () => {
    expect(missingPhotos(b.albumPages, b.uploadedPhotos).count).toBe(40);
  });

  it('adding the same 40 photos puts each back in its own place — no doubling, no layout change', async () => {
    const pagesBefore = b.albumPages;
    let r!: ReturnType<BuilderActions['addPhotos']>;
    await act(async () => { r = b.addPhotos(files); });
    await act(async () => { await new Promise((res) => setTimeout(res, 0)); });
    expect(r).toMatchObject({ added: 0, restored: 40, otherCopies: 0 });
    expect(b.uploadedPhotos).toHaveLength(40); // not 80
    expect(b.albumPages).toBe(pagesBefore); // every frame keeps its photo
    expect(missingPhotos(b.albumPages, b.uploadedPhotos).count).toBe(0);
    // The writes are paced (a few at a time); wait for all of them.
    for (let i = 0; i < 100 && idb.stored.length < 40; i++) await act(async () => { await new Promise((res) => setTimeout(res, 20)); });
    expect(new Set(idb.stored)).toEqual(new Set(files.map((_, i) => `photo-${i}`))); // stored under their OWN ids → found on the next reload
    let again!: ReturnType<BuilderActions['addPhotos']>;
    await act(async () => { again = b.addPhotos(files); });
    expect(again).toMatchObject({ added: 0, restored: 0, skipped: 40 }); // a second pick is a repeat
    expect(b.uploadedPhotos).toHaveLength(40);
  });

  it('a different copy (same name, another size) goes back with a note', async () => {
    await act(async () => { b.addPhotos([new File([new Uint8Array(3)], 'IMG_1005.jpg', { type: 'image/jpeg' })]); });
    expect(b.uploadedPhotos[5]).toMatchObject({ previewUrl: 'blob:here', copyNote: 'differentCopy' });
  });
});

describe('no order with photos missing (source guards; the walk proves it)', () => {
  const src = (f: string) => readFileSync(resolve(__dirname, f), 'utf8');
  it('the preview — the one order entry — stops and says why, with no "Order anyway"', () => {
    const p = src('../pages/builder/BuilderPreview.tsx');
    expect(p).toMatch(/const gone = missingPhotos\(pages, photos, coverFront\);\s*if \(gone\.count > 0\) \{ setNotHere\(missingPhotosMessage\(gone\)\); return; \}/);
    expect(p.indexOf('const gone = missingPhotos')).toBeLessThan(p.indexOf('const warning = [readinessMessage(readiness)'));
  });
  it('checkout refuses a print job with photos missing; the rebuild uses the same rule', () => {
    expect(src('../pages/Order.tsx')).toMatch(/const gone = handed \? missingPhotos\(handed\.pages, handed\.photos, handed\.coverFront\) : null;\s*if \(gone && gone\.count > 0\) \{/);
    expect(src('./printJobRebuild.ts')).toMatch(/if \(missingPhotos\(pages, photos\)\.count > 0\) return null;/);
  });
  it('the builder says it the moment the album opens', () => {
    expect(src('../pages/Builder.tsx')).toMatch(/\(actions\.phase === 'edit' \|\| actions\.phase === 'preview'\) && <MissingPhotosBar actions=\{actions\} \/>/);
  });
});
