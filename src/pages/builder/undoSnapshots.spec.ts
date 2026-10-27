// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { AlbumPage, OrnamentFill, QrFill, SlotText, UploadedPhoto } from './types';

/* ══════════════════════════════════════════════════════════════════════════
   UNDO GIVES BACK THE ALBUM AS IT WAS RIGHT BEFORE THE LAST ACTION.
   Every action saves the album for undo through pushSnapshot. Most actions
   are useCallbacks that did not list pushSnapshot, so they kept the copy from
   the render they were made in and saved the album as it was THEN (for some,
   when the builder opened). Fill two slots, remove a third, say "undo": the
   two fills vanished along with the removal.
   These run the real hook in React. One act() per action, so each action
   lands in its own commit, like separate taps.
   ══════════════════════════════════════════════════════════════════════════ */

// Quote fetches can be held open to edit "during the wait" (see the async cases).
const quoteGate = vi.hoisted(() => ({ wait: null as Promise<void> | null }));
// The photos this device holds in IndexedDB: id → a live object URL for it.
const device = vi.hoisted(() => ({ photos: new Map<string, string>() }));

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
    store: async () => null,
    get: async (id: string) => {
      const url = device.photos.get(id);
      return url ? { id, url, name: id, type: 'image/jpeg', size: 1000, width: 1200, height: 1200, storedAt: 0 } : null;
    },
    getMany: async () => new Map(),
    deletePhoto: async () => {}, deleteMany: async () => {}, list: async () => [],
    loading: false, error: null, clearError: () => {},
  };
  return { useIndexedDBPhotos: () => idb, getImageDimensions: async () => ({ width: 0, height: 0 }) };
});
vi.mock('./faceDetection', () => ({ initFaceApi: async () => {}, detectFaceCenter: async () => null }));
// "Megy finishes it" is off while bank quotes are off (DEAL_BANK_QUOTES,
// 2026-10-21); its undo is still proven here for when they come back.
vi.mock('./generateAlbum', async (importOriginal) => ({ ...(await importOriginal<typeof import('./generateAlbum')>()), DEAL_BANK_QUOTES: true }));
vi.mock('../../lib/quotes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/quotes')>()),
  ensureThemeQuotes: async () => {
    if (quoteGate.wait) await quoteGate.wait;
    return [];
  },
}));

import { useBuilderState, type BuilderActions } from './useBuilderState';
import { getTemplatesForAlbum } from './pageTemplates';
import { DRAFT_STORAGE_KEY } from '../../lib/localDraft';
import { clampStickerGeom } from './stickers';

const [QUAD, OTHER_QUAD] = getTemplatesForAlbum('8x8').filter((t) => t.slots.length === 4);

// Square photos for the square grid. Not blob: URLs, so nothing rehydrates
// (the reload case below seeds blob: ones).
const photos = (url: (i: number) => string): UploadedPhoto[] => Array.from({ length: 12 }, (_, i) => ({
  id: `photo-${i}`, name: `photo-${i}.jpg`, previewUrl: url(i),
  type: 'image/jpeg', size: 1000 + i, width: 1200, height: 1200,
}));

const page = (i: number, slotFills: (number | null)[]): AlbumPage => ({
  id: `page-${i}`, layout: 'freeform', size: '8x8', background: { type: 'solid', solid: '#FFFFFF' },
  photos: [], textElements: [], templateId: QUAD.id,
  slotFills, slotScales: slotFills.map(() => 1), slotOffsetsX: slotFills.map(() => 0),
  slotOffsetsY: slotFills.map(() => 0), slotGeometries: [],
});

/** 42 pages (two over the minimum, so a page can be deleted): page 1 holds
 *  photos 0–3, page 3 holds 4–7, photos 8–11 are not placed yet. */
function seedDraft(url = (i: number) => `https://photos.test/${i}.jpg`) {
  const pages = Array.from({ length: 42 }, (_, i) =>
    page(i, i === 0 ? [0, 1, 2, 3] : i === 2 ? [4, 5, 6, 7] : [null, null, null, null]));
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
    albumType: 'standard', albumSize: '8x8', selectedTemplate: 'classic', uploadedPhotos: photos(url),
    albumPages: pages, currentPageIndex: 0, rejectedTemplateIds: [], title: 'Undo test',
  }));
}

/** The hook's value as of the last commit (act() flushes the effect). */
let builder!: BuilderActions;
function Probe({ onCommit }: { onCommit: (b: BuilderActions) => void }) {
  const b = useBuilderState();
  useEffect(() => { onCommit(b); });
  return null;
}

let root: Root | null = null;
/** Open the builder on whatever draft is in localStorage. */
async function openBuilder() {
  root = createRoot(document.createElement('div'));
  await act(async () => { root!.render(createElement(Probe, { onCommit: (b) => { builder = b; } })); });
}
async function closeBuilder() {
  await act(async () => { root?.unmount(); });
  root = null;
}
beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom has no object URLs; removePhoto revokes one.
  Object.defineProperty(URL, 'revokeObjectURL', { value: () => {}, configurable: true });
  localStorage.clear();
  sessionStorage.clear();
  quoteGate.wait = null;
  device.photos.clear();
  seedDraft();
  await openBuilder();
});
afterEach(closeBuilder);

/** One user action = one event = one commit (a tap, a chat command). */
const tap = (action: (b: BuilderActions) => unknown) => act(async () => { await action(builder); });

/** Everything an undo step puts back (useBuilderState's Snapshot). */
const undoable = () => ({
  albumPages: builder.albumPages,
  uploadedPhotos: builder.uploadedPhotos,
  currentPageIndex: builder.currentPageIndex,
  albumSize: builder.albumSize,
  photosPerPage: builder.photosPerPage,
  selectedTemplate: builder.selectedTemplate,
});
const fills = (pageIndex: number) => builder.albumPages[pageIndex].slotFills;

const QR: QrFill = {
  code: 'abc123', destination: 'https://clips.test/abc123.mp4', qrPngDataUrl: 'data:image/png;base64,',
  memoryUrl: 'https://megyprints.test/m/abc123', createdAt: 1, kind: 'clip', clipExt: 'mp4',
};
const TEXT: SlotText = {
  text: 'Our day', fontSize: 28, fontFamily: 'Georgia', color: '#333333',
  bold: false, italic: false, underline: false, alignment: 'center',
};
const ORNAMENT: OrnamentFill = { pack: 'florals', id: 'rose', pngDataUrl: 'data:image/png;base64,', appliedAt: 1 };

describe('undo after a slot edit', () => {
  it('seeds the album the tests expect', () => {
    expect(OTHER_QUAD).toBeDefined();
    expect(builder.albumPages).toHaveLength(42);
    expect(builder.albumPages[0].templateId).toBe(QUAD.id);
    expect(fills(0)).toEqual([0, 1, 2, 3]);
  });

  it('a photo picked from ANOTHER page comes here and leaves that page; one undo puts both back (owner, 2026-10-20)', async () => {
    // page 1 slot 2 cleared, then photo 5 (page 3's second frame) picked for it
    await tap((b) => b.clearSlot(1));
    await tap((b) => b.fillSlot(1, 5));
    expect(fills(0)).toEqual([0, 5, 2, 3]);
    expect(fills(2)).toEqual([4, null, 6, 7]);

    await tap((b) => b.undo());
    expect(fills(0)).toEqual([0, null, 2, 3]);
    expect(fills(2)).toEqual([4, 5, 6, 7]);

    // straight swap, no clearing first: the two photos trade frames
    await tap((b) => b.fillSlot(0, 6));
    expect(fills(0)).toEqual([6, null, 2, 3]);
    expect(fills(2)).toEqual([4, 5, 0, 7]);
  });

  it('fill two slots, remove a third, undo: only the removal comes back, the fills stay', async () => {
    await tap((b) => b.fillSlot(0, 8));
    await tap((b) => b.fillSlot(1, 9));
    await tap((b) => b.clearSlot(2));
    expect(fills(0)).toEqual([8, 9, null, 3]);

    await tap((b) => b.undo());
    expect(fills(0)).toEqual([8, 9, 2, 3]);
    await tap((b) => b.undo());
    expect(fills(0)).toEqual([8, 1, 2, 3]);
    await tap((b) => b.undo());
    expect(fills(0)).toEqual([0, 1, 2, 3]);
  });
});

/* Every action that saves an undo step, one per way its useCallback was
   memoized: [updateCurrentPage] (only changes with the page), [currentPageIndex],
   [] (made once when the builder opened), [albumPages.length], [idbPhotos]… */
const OTHER = () => OTHER_QUAD.id;
const ACTIONS: [string, (b: BuilderActions) => unknown][] = [
  ['clearSlot', (b) => b.clearSlot(1)],
  ['setSlotScale', (b) => b.setSlotScale(0, 1.4)],
  ['setSlotOffset', (b) => b.setSlotOffset(0, 12, -8)],
  ['setQrFill', (b) => b.setQrFill(1, QR)],
  ['setSlotText', (b) => b.setSlotText(1, TEXT)],
  ['setOrnamentFill', (b) => b.setOrnamentFill(1, ORNAMENT)],
  ['setTextSlotPhoto', (b) => b.setTextSlotPhoto(0, 10)],
  ['clearAllSlots', (b) => b.clearAllSlots()],
  ['setPageBackground', (b) => b.setPageBackground({ type: 'solid', solid: '#222222' })],
  ['setPageTemplate', (b) => b.setPageTemplate(OTHER())],
  ['applyPageLayout', (b) => b.applyPageLayout(OTHER())],
  ['shuffleLayout', (b) => b.shuffleLayout()],
  ['regeneratePage', (b) => b.regeneratePage()],
  ['addPage', (b) => b.addPage()],
  ['deletePage', (b) => b.deletePage(5)],
  ['deletePages (the end-of-album "Delete 2 blank pages")', (b) => b.deletePages([5, 7])],
  ['duplicatePage', (b) => b.duplicatePage(2)],
  ['addTextElement', (b) => b.addTextElement(120, 120, 'Hello')],
  ['applyBackgroundToAllPages', (b) => b.applyBackgroundToAllPages({ type: 'solid', solid: '#333333' })],
  ['applyPhotoFrameToAllPages', (b) => b.applyPhotoFrameToAllPages({ color: '#000000', width: 6 })],
  ['applyFrameToAllPages', (b) => b.applyFrameToAllPages('polaroid')],
  ['applyCornersToAllPages', (b) => b.applyCornersToAllPages('floral')],
  ['removePhoto', (b) => b.removePhoto('photo-11')],
  ['generateAlbum (Surprise me)', (b) => b.generateAlbum()],
];

describe('undo restores the album exactly as it was right before the action', () => {
  for (const [name, action] of ACTIONS) {
    it(name, async () => {
      // Open a page and change it first: the edit a stale snapshot loses.
      await tap((b) => b.goToPage(2));
      await tap((b) => b.fillSlot(0, 8));
      const before = undoable();

      await tap(action);
      expect(undoable()).not.toEqual(before); // the action did change the album

      await tap((b) => b.undo());
      expect(undoable()).toEqual(before);
    });
  }
});

describe('undo walks back through every state, one step at a time', () => {
  it('a mixed run of edits undoes in order, and redoes back to the end', async () => {
    const seen = [undoable()];
    const run: ((b: BuilderActions) => unknown)[] = [
      (b) => b.goToPage(2), // not an undo step
      (b) => b.fillSlot(0, 8),
      (b) => b.setSlotScale(1, 1.3),
      (b) => b.clearSlot(2),
      (b) => b.applyFrameToAllPages('matte'),
      (b) => b.setPageBackground({ type: 'solid', solid: '#EEEEEE' }),
      (b) => b.fillSlot(3, 9),
    ];
    for (const step of run) {
      await tap(step);
      seen.push(undoable());
    }
    const last = seen.pop()!;
    // Six undo steps (goToPage is not one), back down to the page as opened.
    for (let i = seen.length - 1; i >= 1; i--) {
      await tap((b) => b.undo());
      expect(undoable()).toEqual(seen[i]);
    }
    expect(builder.canUndo).toBe(false);
    // The page visit itself is not undone: undo leaves you on page 3.
    expect(builder.currentPageIndex).toBe(2);

    for (let i = 2; i < seen.length; i++) {
      await tap((b) => b.redo());
      expect(undoable()).toEqual(seen[i]);
    }
    await tap((b) => b.redo());
    expect(undoable()).toEqual(last);
    expect(builder.canRedo).toBe(false);
  });
});

describe('after a reload', () => {
  it('undo never brings back the dead photo links the draft was saved with', async () => {
    // A reload: the draft's blob: links are dead; the photos come back from
    // IndexedDB with new links after the builder opens.
    await closeBuilder();
    localStorage.clear();
    seedDraft((i) => `blob:http://localhost/dead-${i}`);
    photos(() => '').forEach((p, i) => device.photos.set(p.id, `blob:http://localhost/live-${i}`));
    await openBuilder();
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    const live = builder.uploadedPhotos.map((p) => p.previewUrl);
    expect(live.every((u) => u.includes('/live-'))).toBe(true);

    await tap((b) => b.clearSlot(2));
    await tap((b) => b.undo());
    expect(fills(0)).toEqual([0, 1, 2, 3]);
    // Not the dead links: those showed every photo in the album as a broken image.
    expect(builder.uploadedPhotos.map((p) => p.previewUrl)).toEqual(live);
  });
});

describe('an action that waits before saving its undo step', () => {
  it('"Megy finishes it": an edit made during the quote wait is not lost by the undo', async () => {
    let release!: () => void;
    quoteGate.wait = new Promise<void>((resolve) => { release = resolve; });

    let sweep!: Promise<unknown>;
    await tap((b) => { sweep = b.finishBoxesWithQuotes(); });
    await tap((b) => b.fillSlot(0, 8)); // the customer keeps editing while Megy fetches quotes
    const beforeSweep = undoable();

    await act(async () => { release(); await sweep; });
    await tap((b) => b.undo());
    expect(undoable()).toEqual(beforeSweep);
    expect(fills(0)).toEqual([8, 1, 2, 3]);
  });
});

/* DELETING PAGES — the end-of-album reminder's "Delete 2 blank pages"
   (blankPages.ts). This album is 42 pages, two over the minimum. */
describe('deletePages — never under 40 pages, one undo step', () => {
  const ids = () => builder.albumPages.map((p) => p.id);

  it('asked to delete 4 of 42, only the LAST 2 go; one undo brings both back', async () => {
    const before = ids();
    let n = 0;
    await tap((b) => { n = b.deletePages([10, 20, 30, 41]); });
    expect(n).toBe(2);
    expect(builder.albumPages).toHaveLength(40);
    expect(ids()).not.toContain('page-30');
    expect(ids()).not.toContain('page-41');
    expect(ids()).toContain('page-10');
    expect(ids()).toContain('page-20');

    await tap((b) => b.undo());
    expect(ids()).toEqual(before);
  });

  it('at 40 pages nothing goes, and no undo step is spent on it', async () => {
    await tap((b) => b.deletePages([40, 41]));
    expect(builder.albumPages).toHaveLength(40);
    let n = -1;
    await tap((b) => { n = b.deletePages([5, 6]); });
    expect(n).toBe(0);
    expect(builder.albumPages).toHaveLength(40);
    await tap((b) => b.undo()); // the one real delete
    expect(builder.albumPages).toHaveLength(42);
    expect(builder.canUndo).toBe(false);
  });

  it('the page on screen stays on screen; landOnLast opens the new last page', async () => {
    await tap((b) => b.goToPage(25));
    await tap((b) => b.deletePages([3]));
    expect(builder.currentPageIndex).toBe(24);
    expect(builder.currentPage.id).toBe('page-25');

    await tap((b) => b.deletePages([30], { landOnLast: true }));
    expect(builder.albumPages).toHaveLength(40);
    expect(builder.currentPageIndex).toBe(39);
    expect(builder.currentPage.id).toBe('page-41');
  });

  it('a page that moves to the other side of the book keeps its sticker out of the spine', async () => {
    // Page 11 (index 10) binds on the LEFT; the sticker hugs its outer RIGHT edge.
    const geom = { cx: 0.92, cy: 0.5, w: 0.1, h: 0.1, rot: 0 }; // its right edge 7.76" in: inside the 3/8" spine on a right-bound page
    const ctx = (pageIndex: number) => ({ albumSize: '8x8', pageIndex, template: QUAD });
    expect(clampStickerGeom(geom, ctx(10)).geom).toEqual(geom); // fine where it is
    const onRight = clampStickerGeom(geom, ctx(9)).geom;
    expect(onRight.cx).toBeLessThan(geom.cx); // would sit in the spine one page earlier

    await closeBuilder();
    const draft = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY)!);
    draft.albumPages[10].stickers = [{ uid: 's1', pack: 'florals', id: 'rose', pngDataUrl: 'data:image/png;base64,', appliedAt: 1, geom }];
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    await openBuilder();
    const sticker = () => builder.albumPages.find((p) => p.id === 'page-10')!.stickers![0].geom;
    expect(sticker()).toEqual(geom);

    // Two pages before it go: same side of the book, the sticker is untouched.
    await tap((b) => b.deletePages([3, 5]));
    expect(sticker()).toEqual(geom);
    await tap((b) => b.undo());

    // One page before it goes: it is now page 10, a left-hand page, spine on its right.
    await tap((b) => b.deletePages([3]));
    expect(builder.albumPages.findIndex((p) => p.id === 'page-10')).toBe(9);
    expect(sticker()).toEqual(onRight);
  });
});
