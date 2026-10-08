// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AlbumPage, AlbumSizePreset, QrFill, UploadedPhoto } from './types';
import { seedMathRandom } from '../../test/seededRandom';

seedMathRandom(); // same albums every run (generateAlbum deals with Math.random)

/* ══════════════════════════════════════════════════════════════════════════
   A NEW ALBUM SIZE KEEPS THE VIDEO MEMORIES (2026-10-08, adversarial review).
   A memory is the customer's video and its printed QR. Changing the size of
   a made album re-laid out every page fresh and the generator never carried
   a QR over: Setup → tap 6×6 on an 8×8 album with memories, and every page
   was new and the album had 0 memories. No question, no word.
   Now each memory goes onto a full page of the new size, as its corner badge
   on the same photo, in the same corner. A memory whose photo can't fill a
   page of the new size (a landscape on a portrait page) is never dropped
   without asking: nothing changes, and Megy asks, saying how many would come
   off. Every way to change the size (Setup's grid, the wizard's size step,
   "Switch to …", "Best fit", typing it) runs the same change_size.
   These run the real hook in React, one act() per action (one tap each).
   ══════════════════════════════════════════════════════════════════════════ */

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
    store: async () => null, get: async () => null, getMany: async () => new Map(),
    deletePhoto: async () => {}, deleteMany: async () => {}, list: async () => [],
    loading: false, error: null, clearError: () => {},
  };
  return { useIndexedDBPhotos: () => idb, getImageDimensions: async () => ({ width: 0, height: 0 }) };
});
vi.mock('./faceDetection', () => ({ initFaceApi: async () => {}, detectFaceCenter: async () => null }));
vi.mock('../../lib/quotes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/quotes')>()),
  ensureThemeQuotes: async () => [],
}));

import { useBuilderState, type BuilderActions } from './useBuilderState';
import { ActionEngine } from '../../assistant/actionEngine';
import { rebuildQuestion } from '../../assistant/rebuildQuestion';
import ResizeAlbumAsk from '../../assistant/ResizeAlbumAsk';
import { getTemplateById, getTemplatesForAlbum } from './pageTemplates';
import { canTakeMemoryQr } from './generateAlbum';
import { DRAFT_STORAGE_KEY } from '../../lib/localDraft';

/* A 48-photo phone roll: landscapes, squares and portraits, in capture order. */
const shape = (i: number): [number, number] => (i % 4 === 3 ? [3024, 4032] : i % 4 === 2 ? [3000, 3000] : [4032, 3024]);
const PHOTOS: UploadedPhoto[] = Array.from({ length: 48 }, (_, i) => ({
  id: `photo-${i}`, name: `photo-${i}.jpg`, previewUrl: `https://photos.test/${i}.jpg`,
  type: 'image/jpeg', size: 1000 + i, width: shape(i)[0], height: shape(i)[1], capturedAt: i * 60_000,
}));
const isLandscape = (i: number) => PHOTOS[i].width > PHOTOS[i].height;
const isSquare = (i: number) => PHOTOS[i].width === PHOTOS[i].height;

const memory = (code: string): QrFill => ({
  code, destination: `https://clips.test/${code}.mp4`, qrPngDataUrl: 'data:image/png;base64,',
  memoryUrl: `https://megyprints.test/m/${code}`, createdAt: 1, kind: 'clip', clipExt: 'mp4',
});

/** Where each memory is: page, photo under it, the page's layout. */
function memoriesIn(pages: AlbumPage[]) {
  const out: { code: string; page: number; photo: number | null; templateId?: string; size?: string }[] = [];
  pages.forEach((p, i) => {
    for (const q of [...(p.qrFills ?? []), ...(p.textSlotQr ?? [])]) {
      if (!q) continue;
      out.push({ code: q.code, page: i, photo: (p.slotFills ?? []).find((f): f is number => f != null) ?? null, templateId: p.templateId, size: p.size });
    }
  });
  return out.sort((a, b) => a.code.localeCompare(b.code));
}
const placedPhotos = (pages: AlbumPage[]) => pages
  .flatMap((p) => [...(p.slotFills ?? []), ...(p.textSlotFills ?? [])])
  .filter((f): f is number => f != null).sort((a, b) => a - b);

/** The hook's value as of the last commit. */
let builder!: BuilderActions;
function Probe({ onCommit }: { onCommit: (b: BuilderActions) => void }) {
  const b = useBuilderState();
  useEffect(() => { onCommit(b); });
  return null;
}
let root: Root | null = null;
const tap = (action: (b: BuilderActions) => unknown) => act(async () => { await action(builder); });
/** What a tap on a size does (Setup's grid, the wizard's size step,
 *  "Switch to …", "Best fit"): the builder's dispatch → ActionEngine. */
const engine = () => new ActionEngine(builder);
const changeSize = async (size: AlbumSizePreset, payload: Record<string, unknown> = {}) => {
  let result!: Awaited<ReturnType<ActionEngine['execute']>>;
  await act(async () => { result = await engine().execute({ type: 'change_size', payload: { size, ...payload }, rawMessage: `change size to ${size}` }); });
  return result;
};

/** The memories this album was given, by code → [photo, corner]. */
let given: Record<string, { photo: number; corner: 'tl' | 'tr' | 'bl' | 'br' }> = {};

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  sessionStorage.clear();
  // An 8×8 album before it is made: the photos, 40 empty pages.
  const quad = getTemplatesForAlbum('8x8').find((t) => t.slots.length === 4)!;
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
    albumType: 'standard', albumSize: '8x8', selectedTemplate: 'classic', uploadedPhotos: PHOTOS,
    albumPages: Array.from({ length: 40 }, (_, i) => ({
      id: `page-${i}`, layout: 'freeform', size: '8x8', background: { type: 'solid', solid: '#FFFFFF' },
      photos: [], textElements: [], templateId: quad.id, slotFills: [null, null, null, null],
      slotScales: [1, 1, 1, 1], slotOffsetsX: [0, 0, 0, 0], slotOffsetsY: [0, 0, 0, 0], slotGeometries: [],
    })),
    currentPageIndex: 0, rejectedTemplateIds: [], title: 'Size change',
  }));
  root = createRoot(document.createElement('div'));
  await act(async () => { root!.render(createElement(Probe, { onCommit: (b) => { builder = b; } })); });

  // Make it (Generate Album), then add three memories the way a customer
  // does: open a full-page photo, "Add a video memory", pick a corner.
  await tap((b) => b.generateAlbum());
  const ready = builder.albumPages.map((p, i) => ({ p, i })).filter(({ p }) => canTakeMemoryQr(p));
  const photoOf = (p: AlbumPage) => (p.slotFills ?? []).find((f): f is number => f != null)!;
  const landscapes = ready.filter(({ p }) => isLandscape(photoOf(p)));
  const square = ready.find(({ p }) => isSquare(photoOf(p)));
  expect(landscapes.length).toBeGreaterThanOrEqual(2);
  expect(square).toBeDefined();
  const picks: [string, { p: AlbumPage; i: number }, 'tl' | 'tr' | 'bl' | 'br'][] = [
    ['memlnd01', landscapes[0], 'tl'], ['memsqr02', square!, 'br'], ['memlnd03', landscapes[1], 'tr'],
  ];
  given = {};
  for (const [code, { p, i }, corner] of picks) {
    await tap((b) => b.goToPage(i));
    await tap((b) => b.applyMemoryQr(memory(code), corner));
    given[code] = { photo: photoOf(p), corner };
  }
});
afterEach(async () => {
  await act(async () => { root?.unmount(); });
  root = null;
});

describe('the made 8×8 album the tests start from', () => {
  it('has its three memories, each a badge on a full-page photo', () => {
    expect(builder.albumSize).toBe('8x8');
    expect(memoriesIn(builder.albumPages).map((m) => [m.code, m.photo, m.templateId])).toEqual(
      Object.entries(given).sort().map(([code, g]) => [code, g.photo, `qr-badge-8x8-${g.corner}`]),
    );
  });
});

describe('Setup → tap 6×6: every memory comes along, on its own photo, in its corner', () => {
  it('the bug: tapping 6×6 kept 0 of 3 memories and asked nothing', async () => {
    const r = await changeSize('6x6');
    expect(r.success).toBe(true);
    expect(builder.albumSize).toBe('6x6');
    expect(builder.resizeAsk ?? null).toBeNull(); // nothing to ask: nothing is lost
    const now = memoriesIn(builder.albumPages);
    expect(now.map((m) => m.code)).toEqual(Object.keys(given).sort());
    for (const m of now) {
      expect(m.photo, m.code).toBe(given[m.code].photo);
      expect(m.templateId, m.code).toBe(`qr-badge-6x6-${given[m.code].corner}`);
      expect(m.size, m.code).toBe('6x6');
    }
    // A 6×6 album: every page on a 6×6 layout, every photo once.
    expect(builder.albumPages.every((p) => p.size === '6x6' && getTemplateById(p.templateId!)?.albumSizes.includes('6x6'))).toBe(true);
    expect(placedPhotos(builder.albumPages)).toEqual(PHOTOS.map((_, i) => i));
    // Megy says the memories came along.
    expect(r.message).toMatch(/3 video memories came along/);
  });

  it('9×9 too, and back to 8×8: the same memories on the same photos', async () => {
    await changeSize('9x9');
    await changeSize('8x8');
    expect(builder.albumSize).toBe('8x8');
    expect(memoriesIn(builder.albumPages).map((m) => [m.code, m.photo, m.templateId])).toEqual(
      Object.entries(given).sort().map(([code, g]) => [code, g.photo, `qr-badge-8x8-${g.corner}`]),
    );
  });

  it('a memory photo the photo check left out still comes along (left-out photos stay out, not memories)', async () => {
    const id = PHOTOS[given.memsqr02.photo].id;
    await tap((b) => b.leaveOutPhotos([id]));
    expect(builder.uploadedPhotos.find((p) => p.id === id)?.leftOut).toBe(true);
    await changeSize('6x6');
    expect(memoriesIn(builder.albumPages).map((m) => [m.code, m.photo])).toEqual(
      Object.entries(given).sort().map(([code, g]) => [code, g.photo]),
    );
  });

  it('undo puts the 8×8 album back as it was', async () => {
    const before = builder.albumPages;
    await changeSize('6x6');
    await tap((b) => b.undo());
    expect(builder.albumSize).toBe('8x8');
    expect(builder.albumPages).toEqual(before);
  });
});

describe('a memory that can\'t come along is never dropped without asking', () => {
  // 6×8 pages are portrait: a landscape photo can't fill one without losing
  // half of it, so its memory can't sit on it. The square one can.
  it('tapping 6×8 changes nothing and asks, saying how many memories would come off', async () => {
    const before = builder.albumPages;
    const r = await changeSize('6x8');
    expect(r.success).toBe(false);
    expect(builder.albumSize).toBe('8x8');
    expect(builder.albumPages).toBe(before);
    expect(builder.resizeAsk).toMatchObject({ size: '6x8', memories: 3, lost: 2 });
    expect(r.message).toMatch(/2 of your 3 video memories can't come along/);
  });

  it('a yes changes the size: the square photo keeps its memory, the two landscapes\' come off', async () => {
    await changeSize('6x8');
    const r = await changeSize('6x8', { confirmed: true });
    expect(r.success).toBe(true);
    expect(builder.albumSize).toBe('6x8');
    expect(builder.resizeAsk ?? null).toBeNull();
    expect(memoriesIn(builder.albumPages).map((m) => [m.code, m.photo, m.templateId])).toEqual([
      ['memsqr02', given.memsqr02.photo, 'qr-badge-6x8-br'],
    ]);
    expect(placedPhotos(builder.albumPages)).toEqual(PHOTOS.map((_, i) => i));
    expect(r.message).toMatch(/2 video memories came off/);
  });

  it('Setup moving off a hidden size (no tap) asks the same way, and says why', async () => {
    const r = await changeSize('6x8', { reason: 'size_hidden' });
    expect(r.success).toBe(false);
    expect(builder.albumSize).toBe('8x8');
    expect(builder.resizeAsk).toEqual({ size: '6x8', memories: 3, lost: 2, reason: 'size_hidden' });
  });

  it('typing it asks first, with the same numbers (and a yes is the confirmed change)', () => {
    const megy = readFileSync(resolve(__dirname, '../../assistant/MegyAssistant.tsx'), 'utf8');
    expect(megy).toMatch(/rebuildAskedRef\.current = \{ \.\.\.intent, payload: \{ \.\.\.intent\.payload, confirmed: true \} \};/);
    const ask = rebuildQuestion({ type: 'change_size', payload: { size: '6x8' }, rawMessage: 'change size to 6x8' }, builder);
    expect(ask).toMatch(/2 of your 3 video memories can't come along/);
    const keeps = rebuildQuestion({ type: 'change_size', payload: { size: '6x6' }, rawMessage: 'change size to 6x6' }, builder);
    expect(keeps).toMatch(/Your 3 video memories come along/);
  });
});

describe('the question on screen (ResizeAlbumAsk)', () => {
  it('says how many come off, keeps the size by default, and changes only on its own button', async () => {
    const onKeep = vi.fn(), onChange = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const r = createRoot(host);
    await act(async () => { r.render(createElement(ResizeAlbumAsk, { ask: { size: '6x8', memories: 3, lost: 2 }, from: '8x8', onKeep, onChange })); });
    const text = host.textContent ?? '';
    expect(text).toContain('Change to 6×8?');
    expect(text).toContain("2 of your 3 video memories can't come along: their photos don't fit a full 6×8 page, so they'd come off the album (you'd add them again).");
    const keep = host.querySelector<HTMLButtonElement>('[data-testid="resize-keep"]')!;
    const change = host.querySelector<HTMLButtonElement>('[data-testid="resize-confirm"]')!;
    expect(keep.textContent).toBe('Keep 8×8');
    expect(change.textContent).toBe('Change to 6×8 without them');
    expect(keep.className).toContain('bg-peach'); // the one filled button is keeping
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(onKeep).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
    await act(async () => { change.click(); });
    expect(onChange).toHaveBeenCalledTimes(1);
    await act(async () => { r.unmount(); });
    host.remove();
  });
  it('Setup\'s switch away from a hidden size says why it asks', async () => {
    const host = document.createElement('div');
    const r = createRoot(host);
    await act(async () => { r.render(createElement(ResizeAlbumAsk, { ask: { size: '8x8', memories: 1, lost: 1, reason: 'size_hidden' }, from: '6x4', onKeep: () => {}, onChange: () => {} })); });
    expect(host.querySelector('[data-testid="resize-ask-why"]')?.textContent).toBe("6×4 albums aren't offered any more.");
    expect(host.querySelector('[data-testid="resize-confirm"]')?.textContent).toBe('Change to 8×8 without it');
    await act(async () => { r.unmount(); });
  });
});

describe('every way to change the size runs the same change_size', () => {
  const src = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
  it('only the action engine rebuilds an album at a new size', () => {
    const files = ['useBuilderState.ts', 'BuilderSetup.tsx', 'BuilderEdit.tsx', 'MobileReview.tsx', '../Builder.tsx', '../../assistant/MegyAssistant.tsx', '../../assistant/actionEngine.ts'];
    const callers = files.filter((f) => /\.generateAlbum\([^)]*\bsize\b/.test(src(f)));
    expect(callers).toEqual(['../../assistant/actionEngine.ts']);
  });
  it('Setup\'s grid (and its switch away from a hidden size), the wizard\'s size step, "Switch to …" and "Best fit" all dispatch change_size', () => {
    expect(src('../Builder.tsx')).toMatch(/onSizeChange=\{\(size, reason\) => \{ void actions\.dispatch\(\{ type: 'change_size', payload: \{ size, reason \}/);
    expect(src('BuilderSetup.tsx')).toMatch(/if \(first\) onSizeChange\(first\.preset, 'size_hidden'\);/);
    const megy = src('../../assistant/MegyAssistant.tsx');
    expect(megy.match(/dispatch\(\{ type: 'change_size'/g)?.length).toBe(3);
  });
  it('the question that asks before memories come off is on screen wherever the tap was', () => {
    expect(src('../Builder.tsx')).toMatch(/\{actions\.resizeAsk && \(\s*<ResizeAlbumAsk/);
  });
});
