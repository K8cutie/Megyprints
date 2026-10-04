// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { AlbumPage, UploadedPhoto } from './types';

/* ══════════════════════════════════════════════════════════════════════════
   "ALL YOUR PROJECTS ARE AUTOMATICALLY SAVED TO THE CLOUD" — NOW TRUE
   (1-star testers, 2026-10-04: a generated, edited album was not in Your
   Projects until checkout, so when the page died it was gone). Signed in,
   the album now goes to the account 15 s after it stops changing, and at
   least every 2 minutes while it keeps changing. Turning pages saves nothing.
   ══════════════════════════════════════════════════════════════════════════ */

const sync = vi.hoisted(() => ({ save: vi.fn<(userId: string, album: unknown) => Promise<{ success: boolean }>>(async () => ({ success: true })) }));
vi.mock('../../lib/authContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) } },
}));
vi.mock('../../lib/useAlbumSync', () => {
  const api = {
    save: sync.save, load: async () => null, loadAll: async () => [],
    deleteAlbum: async () => ({ success: true }), loading: false, error: null, clearError: () => {},
  };
  return { useAlbumSync: () => api };
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

import { useBuilderState, CLOUD_SAVE_QUIET_MS, CLOUD_SAVE_MAX_WAIT_MS, type BuilderActions } from './useBuilderState';
import { DRAFT_STORAGE_KEY } from '../../lib/localDraft';

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

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  localStorage.clear(); sessionStorage.clear();
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
    albumType: 'standard', albumSize: '8x8', selectedTemplate: 'classic', uploadedPhotos: photos,
    albumPages: Array.from({ length: 40 }, (_, i) => page(i)), currentPageIndex: 0, rejectedTemplateIds: [],
    title: 'HK Trip', albumId: 'album-1', accountId: 'user-1',
  }));
  root = createRoot(document.createElement('div'));
  await act(async () => { root!.render(createElement(Probe)); });
  await advance(2000); // the opening load settles
  sync.save.mockClear();
});
afterEach(async () => {
  await act(async () => { root?.unmount(); });
  root = null;
  vi.useRealTimers();
});

describe('signed in, the album is saved to the account soon after a change', () => {
  it(`${CLOUD_SAVE_QUIET_MS / 1000} s after it stops changing — once`, async () => {
    await act(async () => { builder.setAlbumTitle('HK Trip 2026'); });
    await advance(CLOUD_SAVE_QUIET_MS - 1000);
    expect(sync.save).not.toHaveBeenCalled();
    await advance(1500);
    expect(sync.save).toHaveBeenCalledTimes(1);
    expect(sync.save.mock.calls[0][0]).toBe('user-1');
    expect(sync.save.mock.calls[0][1]).toMatchObject({ id: 'album-1', title: 'HK Trip 2026' });
    await advance(CLOUD_SAVE_QUIET_MS * 2);
    expect(sync.save).toHaveBeenCalledTimes(1); // nothing new → no second write
  });

  it(`while it keeps changing, at least every ${CLOUD_SAVE_MAX_WAIT_MS / 60000} minutes`, async () => {
    for (let t = 0; t < CLOUD_SAVE_MAX_WAIT_MS + 10_000; t += 10_000) {
      await act(async () => { builder.setAlbumTitle(`HK Trip ${t}`); });
      await advance(10_000);
    }
    expect(sync.save.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('turning pages alone writes nothing', async () => {
    for (let i = 1; i < 6; i++) { await act(async () => { builder.goToPage(i); }); await advance(1000); }
    await advance(CLOUD_SAVE_QUIET_MS * 3);
    expect(sync.save).not.toHaveBeenCalled();
  });
});
