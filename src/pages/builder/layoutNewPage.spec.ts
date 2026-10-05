// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { AlbumPage, UploadedPhoto } from './types';

/* ══════════════════════════════════════════════════════════════════════════
   THE PHOTOS A LAYOUT CAN'T HOLD STAY IN THE ALBUM (1-star testers round 3,
   the Indecisive One): the real builder, a 50-photo album, "Full Page" on the
   3-photo page 37. "Put them on a new page" keeps all 50 placed (41 pages);
   "Take them out" is the customer's choice; Undo puts the page back.
   ══════════════════════════════════════════════════════════════════════════ */

vi.mock('../../lib/authContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: () => ({}), auth: { getSession: async () => ({ data: { session: null } }) } } }));
vi.mock('../../lib/useIndexedDBPhotos', () => {
  const idb = {
    store: async () => null, get: async () => null, getMany: async () => new Map(),
    deletePhoto: async () => {}, deleteMany: async () => {}, list: async () => [],
    loading: false, error: null, clearError: () => {},
  };
  return { useIndexedDBPhotos: () => idb, getImageDimensions: async () => ({ width: 0, height: 0 }) };
});
vi.mock('./faceDetection', () => ({ initFaceApi: async () => {}, detectFaceCenter: async () => null }));

import { useBuilderState, relayPageOnTemplate, type BuilderActions } from './useBuilderState';
import { getTemplateById, getTemplatesForAlbum, photoSlotCount } from './pageTemplates';
import { DRAFT_STORAGE_KEY } from '../../lib/localDraft';

const solo = getTemplateById('t88-fb-solo')!;
const three = getTemplatesForAlbum('8x8').find((t) => photoSlotCount(t) === 3 && (t.textSlots?.length ?? 0) > 0 && !t.slots.some((s) => s.kind === 'qr'))!;
const photos: UploadedPhoto[] = Array.from({ length: 50 }, (_, i) => ({
  id: `photo-${i}`, name: `photo-${i}.jpg`, previewUrl: `https://photos.test/${i}.jpg`, type: 'image/jpeg', size: 1000, width: 1200, height: 1200,
}));
const base = (i: number): AlbumPage => ({ id: `page-${i}`, layout: 'freeform', size: '8x8', background: { type: 'solid', solid: '#FFFFFF' }, photos: [], textElements: [] } as unknown as AlbumPage);
/** 40 pages: page 37 has 3 photos (36, 37, 38) and a quote; the others one each. */
function album(): AlbumPage[] {
  let next = 0;
  return Array.from({ length: 40 }, (_, i) => {
    if (i === 36) return relayPageOnTemplate({ ...base(i), templateId: three.id, slotFills: [next++, next++, next++],
      textElements: [{ id: 'q', boxIndex: 0, text: 'Taking the scenic route', x: 0, y: 0, fontSize: 28, fontFamily: 'Georgia', color: '#2D2D2D', bold: false, italic: true, underline: false, alignment: 'center' }] } as unknown as AlbumPage, three);
    return relayPageOnTemplate({ ...base(i), templateId: solo.id, slotFills: [next++] } as unknown as AlbumPage, solo);
  });
}
/** Photos on the album's pages: 39 one-photo pages + 3 on page 37 = 42 to start. */
const placed = (pages: AlbumPage[]) => new Set(pages.flatMap((p) => (p.slotFills ?? []).filter((f): f is number => f != null))).size;

let builder!: BuilderActions;
function Probe() {
  const b = useBuilderState();
  useEffect(() => { builder = b; });
  return null;
}
let root: Root | null = null;
beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); sessionStorage.clear();
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
    albumType: 'standard', albumSize: '8x8', selectedTemplate: 'classic', uploadedPhotos: photos,
    albumPages: album(), currentPageIndex: 36, rejectedTemplateIds: [], title: 'Indecisive Trip', albumId: 'album-1', accountId: null,
  }));
  root = createRoot(document.createElement('div'));
  await act(async () => { root!.render(createElement(Probe)); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
});
afterEach(async () => { await act(async () => { root?.unmount(); }); root = null; });

describe('"Full Page" on the 3-photo page, in the real builder', () => {
  it('the album as it starts: 40 pages, page 37 holds 3 photos', () => {
    expect(builder.albumPages).toHaveLength(40);
    expect(builder.albumPages[36].slotFills).toEqual([36, 37, 38]);
    expect(placed(builder.albumPages)).toBe(42);
  });

  it('"Put them on a new page": page 37 is the full-page photo, the other 2 on a new page 38, nothing left out', async () => {
    expect(builder.layoutChangeLoses(solo.id)).toEqual({ photos: 2, captions: 1 });
    await act(async () => { builder.applyPageLayout(solo.id, 'new-page'); });
    expect(builder.albumPages).toHaveLength(41);
    expect(builder.albumPages[36].slotFills).toEqual([36]);
    expect(builder.albumPages[36].textElements).toEqual([]); // the quote went with its box
    expect((builder.albumPages[37].slotFills ?? []).filter((f) => f != null).sort()).toEqual([37, 38]);
    expect(placed(builder.albumPages)).toBe(42);
  });

  it('"Take them out of the album": the customer\'s choice, and Undo brings the page back', async () => {
    await act(async () => { builder.applyPageLayout(solo.id, 'leave-out'); });
    expect(builder.albumPages).toHaveLength(40);
    expect(placed(builder.albumPages)).toBe(40);
    await act(async () => { builder.undo(); });
    expect(builder.albumPages[36].slotFills).toEqual([36, 37, 38]);
    expect(placed(builder.albumPages)).toBe(42);
  });
});
