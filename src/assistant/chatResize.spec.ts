// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AlbumPage, UploadedPhoto } from '../pages/builder/types';

/* ══════════════════════════════════════════════════════════════════════════
   A NEW SIZE RE-LAYS OUT THE ALBUM; "REGENERATE MY ALBUM" IS THE ALBUM
   (1-star testers, 2026-10-04, the Penny-Pincher): on a made 6×8 album,
   "change size to 6x4" answered "Album size changed to 6x4." and left the
   6×8 layout squashed onto 6×4 — blank areas, a photo squeezed into the
   middle, no warning. "regenerate my album" answered "This page has been
   regenerated" and redid page 1 only. Now a size change on a made album asks
   once and lays every page out again for the new shape, and "regenerate my
   album" rebuilds the album (asking first, like "generate").
   ══════════════════════════════════════════════════════════════════════════ */

vi.mock('../lib/authContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
vi.mock('../lib/useAlbumSync', () => {
  const sync = { save: async () => ({ success: true }), load: async () => null, loadAll: async () => [], deleteAlbum: async () => ({ success: true }), loading: false, error: null, clearError: () => {} };
  return { useAlbumSync: () => sync };
});
vi.mock('../lib/useIndexedDBPhotos', () => {
  const idb = { store: async () => null, get: async () => null, getMany: async () => new Map(), deletePhoto: async () => {}, deleteMany: async () => {}, list: async () => [], loading: false, error: null, clearError: () => {} };
  return { useIndexedDBPhotos: () => idb, getImageDimensions: async () => ({ width: 0, height: 0 }) };
});
vi.mock('../pages/builder/faceDetection', () => ({ initFaceApi: async () => {}, detectFaceCenter: async () => null }));
vi.mock('../lib/quotes', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/quotes')>()), ensureThemeQuotes: async () => [] }));

import { parseIntent } from './intentParser';
import { ActionEngine } from './actionEngine';
import { rebuildQuestion } from './rebuildQuestion';
import { useBuilderState, type BuilderActions } from '../pages/builder/useBuilderState';
import { getTemplatesForAlbum } from '../pages/builder/pageTemplates';
import { DRAFT_STORAGE_KEY } from '../lib/localDraft';

const madePage = (i: number, size = '6x8'): AlbumPage => ({
  id: `page-${i}`, layout: 'freeform', size, background: { type: 'solid', solid: '#FFFFFF' },
  photos: [], textElements: [], templateId: 'unknown', slotFills: [i],
} as unknown as AlbumPage);
const made = Array.from({ length: 40 }, (_, i) => madePage(i));
const empty = Array.from({ length: 40 }, (_, i) => ({ ...madePage(i), slotFills: [null] }));

describe('what Megy hears', () => {
  it.each([
    ['regenerate my album', 'generate_album'],
    ['regenerate the whole album', 'generate_album'],
    ['redo my album', 'generate_album'],
    ['rebuild the album', 'generate_album'],
    ['regenerate every page', 'generate_album'],
    ['regenerate', 'regenerate_page'],
    ['regenerate page', 'regenerate_page'],
    ['regenerate this page', 'regenerate_page'],
    ['generate album', 'generate_album'],
  ])('"%s" → %s', (text, intent) => {
    expect(parseIntent(text).intent.type).toBe(intent);
  });
  it('"change size to 6x4" → change_size 6x4', () => {
    expect(parseIntent('change size to 6x4').intent).toMatchObject({ type: 'change_size', payload: { size: '6x4' } });
  });
});

describe('Megy asks before a typed command rebuilds a made album', () => {
  const size = (s: string) => ({ type: 'change_size' as const, payload: { size: s }, rawMessage: `change size to ${s}` });
  it('a new size on a made album: asks, and says what it does', () => {
    expect(rebuildQuestion(size('6x4'), { albumPages: made, albumSize: '6x8' }))
      .toBe('That makes your album 6×4 and lays out every page again for the new shape. Your photos stay; your layout changes are replaced, Studio pages too. Say "yes" to go ahead, or keep editing.');
  });
  it('generate on a made album: asks', () => {
    expect(rebuildQuestion({ type: 'generate_album', rawMessage: 'regenerate my album' }, { albumPages: made, albumSize: '6x8' })).toMatch(/^That rebuilds your whole album/);
  });
  it('"Surprise me" on a made album: asks first — it rebuilds every page too (1-star testers round 2, the Perfectionist)', () => {
    expect(parseIntent('Surprise me').intent.type).toBe('surprise_me');
    expect(rebuildQuestion({ type: 'surprise_me', rawMessage: 'Surprise me' }, { albumPages: made, albumSize: '6x8' }))
      .toBe('That gives every page a fresh, surprise layout: your layout changes and the text you wrote in caption boxes are replaced (Studio pages stay). Say "yes" to go ahead, or keep editing.');
    expect(rebuildQuestion({ type: 'surprise_me', rawMessage: 'Surprise me' }, { albumPages: empty, albumSize: '6x8' })).toBeNull();
  });
  it('nothing made yet, or the same size, or another command: no question', () => {
    expect(rebuildQuestion(size('6x4'), { albumPages: empty, albumSize: '6x8' })).toBeNull();
    expect(rebuildQuestion({ type: 'generate_album', rawMessage: 'generate' }, { albumPages: empty, albumSize: '6x8' })).toBeNull();
    expect(rebuildQuestion(size('6x8'), { albumPages: made, albumSize: '6x8' })).toBeNull();
    expect(rebuildQuestion({ type: 'next_page', rawMessage: 'next' }, { albumPages: made, albumSize: '6x8' })).toBeNull();
  });
});

describe('change_size: a made album is laid out again for the new size', () => {
  const photos = Array.from({ length: 40 }, (_, i) => ({ id: `p${i}`, previewUrl: '', name: `p${i}.jpg`, type: 'image/jpeg', size: 1, width: 1200, height: 1200 }));
  const builder = (pages: AlbumPage[]) => ({
    albumPages: pages, albumSize: '6x8', uploadedPhotos: photos, currentPage: pages[0],
    setAlbumSize: vi.fn(), generateAlbum: vi.fn(async () => {}),
  });
  it('made album, new size → re-laid out at that size (one step), and Megy says so', async () => {
    const b = builder(made);
    const r = await new ActionEngine(b as unknown as BuilderActions).execute({ type: 'change_size', payload: { size: '6x4' }, rawMessage: 'yes' });
    expect(b.generateAlbum).toHaveBeenCalledWith(made[0].background, { size: '6x4' });
    expect(b.setAlbumSize).not.toHaveBeenCalled();
    expect(r).toMatchObject({ success: true, message: 'Album size changed to 6×4. Every page is laid out again for the new shape.' });
  });
  it('before the album is made (the wizard\'s size step) → just the size', async () => {
    const b = builder(empty);
    await new ActionEngine(b as unknown as BuilderActions).execute({ type: 'change_size', payload: { size: '6x4' }, rawMessage: 'change size to 6x4' });
    expect(b.setAlbumSize).toHaveBeenCalledWith('6x4');
    expect(b.generateAlbum).not.toHaveBeenCalled();
  });
  it('a made album short of 40 photos is not rebuilt (the 40-photo gate)', async () => {
    const b = { ...builder(made), uploadedPhotos: photos.slice(0, 20) };
    const r = await new ActionEngine(b as unknown as BuilderActions).execute({ type: 'change_size', payload: { size: '6x4' }, rawMessage: 'yes' });
    expect(r.success).toBe(false);
    expect(b.generateAlbum).not.toHaveBeenCalled();
    expect(b.setAlbumSize).not.toHaveBeenCalled();
  });
});

describe('the builder: generateAlbum({ size }) lays the album out at the new size', () => {
  const photos: UploadedPhoto[] = Array.from({ length: 40 }, (_, i) => ({
    id: `photo-${i}`, name: `photo-${i}.jpg`, previewUrl: `https://photos.test/${i}.jpg`, type: 'image/jpeg', size: 1000 + i, width: 1200, height: 900,
  }));
  let b!: BuilderActions;
  function Probe() { const s = useBuilderState(); useEffect(() => { b = s; }); return null; }
  let root: Root | null = null;
  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear(); sessionStorage.clear();
    const sixByEight = getTemplatesForAlbum('6x8').find((t) => t.slots.length === 1)!;
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
      albumType: 'standard', albumSize: '6x8', selectedTemplate: 'classic', uploadedPhotos: photos,
      albumPages: photos.map((_, i) => ({ ...madePage(i), templateId: sixByEight.id, ...(i === 3 ? { studio: true } : {}) })),
      currentPageIndex: 5, rejectedTemplateIds: [], title: 'HK',
    }));
    root = createRoot(document.createElement('div'));
    await act(async () => { root!.render(createElement(Probe)); });
  });
  afterEach(async () => { await act(async () => { root?.unmount(); }); root = null; });

  it('every page is a 6×4 page on a 6×4 layout, the Studio page too; the size and cover follow; undo puts it back', async () => {
    const before = b.albumPages;
    await act(async () => { await b.generateAlbum(undefined, { size: '6x4' }); });
    const ids = new Set(getTemplatesForAlbum('6x4').map((t) => t.id));
    expect(b.albumSize).toBe('6x4');
    expect(b.coverFront.size).toBe('6x4');
    expect(b.albumPages.length).toBeGreaterThanOrEqual(40);
    expect(b.albumPages.every((p) => p.size === '6x4' && ids.has(p.templateId!))).toBe(true);
    expect(b.albumPages.some((p) => p.studio)).toBe(false);
    const placed = new Set(b.albumPages.flatMap((p) => (p.slotFills ?? []).filter((f): f is number => f != null)));
    expect(placed.size).toBe(40); // every photo still in the album
    await act(async () => { b.undo(); });
    expect(b.albumSize).toBe('6x8');
    expect(b.albumPages).toEqual(before);
  });

  it('without a size it stays the size it is (and keeps the Studio page)', async () => {
    await act(async () => { await b.generateAlbum(); });
    expect(b.albumSize).toBe('6x8');
    expect(b.albumPages.some((p) => p.studio)).toBe(true);
  });
});

describe('the chat asks with rebuildQuestion (source guard)', () => {
  it('a yes runs what was asked about; asking the same again runs it', () => {
    const src = readFileSync(resolve(__dirname, 'MegyAssistant.tsx'), 'utf8');
    expect(src).toMatch(/if \(pending && yes\) intent = pending;/);
    expect(src).toMatch(/else if \(!\(pending && pending\.type === intent\.type\)\) \{\s*const ask = rebuildQuestion\(intent, builderRef\.current\);/);
  });
});
