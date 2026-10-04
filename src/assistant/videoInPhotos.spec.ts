// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* ══════════════════════════════════════════════════════════════════════════
   A VIDEO IN THE PHOTO PICKER IS NEVER DROPPED WITHOUT A WORD (1-star
   testers, 2026-10-04, the Rule-Breaker): at Step 4 they picked
   hk-clip-12s.mp4 — "Nothing happens. No toast, no error, the step doesn't
   change, and no photo is added." Two other upload buttons didn't filter at
   all (a video would go in as a broken "photo"). Now addPhotos keeps the
   photos, counts what it left out, and Megy says where a video does go.
   ══════════════════════════════════════════════════════════════════════════ */

vi.mock('../lib/authContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
vi.mock('../lib/useAlbumSync', () => {
  const sync = { save: async () => ({ success: true }), load: async () => null, loadAll: async () => [], deleteAlbum: async () => ({ success: true }), loading: false, error: null, clearError: () => {} };
  return { useAlbumSync: () => sync };
});
vi.mock('../lib/useIndexedDBPhotos', () => {
  const idb = { store: async () => null, get: async () => null, getMany: async () => new Map(), deletePhoto: async () => {}, deleteMany: async () => {}, list: async () => [], loading: false, error: null, clearError: () => {} };
  return { useIndexedDBPhotos: () => idb, getImageDimensions: async () => ({ width: 1200, height: 900 }) };
});
vi.mock('../pages/builder/faceDetection', () => ({ initFaceApi: async () => {}, detectFaceCenter: async () => null }));

import { kindOfPick, leftOutNote } from '../lib/pickedFiles';
import { ActionEngine } from './actionEngine';
import { useBuilderState, type BuilderActions } from '../pages/builder/useBuilderState';

const file = (name: string, type: string) => new File(['x'], name, { type });

describe('what was picked', () => {
  it.each([
    ['IMG_1.jpg', 'image/jpeg', 'photo'],
    ['a.png', 'image/png', 'photo'],
    ['hk-clip-12s.mp4', 'video/mp4', 'video'],
    ['clip.MOV', '', 'video'],
    ['shot.JPG', '', 'photo'],
    ['notes.pdf', 'application/pdf', 'other'],
  ])('%s (%s) → %s', (name, type, kind) => {
    expect(kindOfPick({ name, type })).toBe(kind);
  });
});

describe('Megy says what was left out', () => {
  const engine = (r: { added: number; skipped: number; videos: number; others: number }) =>
    new ActionEngine({ addPhotos: () => r } as unknown as BuilderActions);
  const run = (e: ActionEngine) => e.execute({ type: 'add_photos', payload: { files: [file('a.jpg', 'image/jpeg')] }, rawMessage: 'add photos' });

  it('only a video (the tester\'s pick): where a video goes — and it is not a success', async () => {
    const r = await run(engine({ added: 0, skipped: 0, videos: 1, others: 0 }));
    expect(r).toMatchObject({ success: false, message: "Videos can't go on a page. Open a photo page and tap “Add a video memory”: it plays when someone scans the printed QR." });
  });
  it('photos and videos: both counts', async () => {
    const r = await run(engine({ added: 38, skipped: 0, videos: 2, others: 0 }));
    expect(r).toMatchObject({ success: true, message: '38 photos added · 2 videos left out: add those with “Add a video memory” on a photo page.' });
  });
  it('another kind of file', async () => {
    expect((await run(engine({ added: 5, skipped: 1, videos: 0, others: 1 }))).message).toBe('5 photos added · 1 already in your album · 1 file left out: not a photo (JPG or PNG).');
  });
  it('nothing left out: as before', async () => {
    expect((await run(engine({ added: 3, skipped: 0, videos: 0, others: 0 }))).message).toBe('3 photos added.');
    expect(leftOutNote(0, 0, true)).toBe('');
  });
});

describe('the builder: addPhotos keeps only the photos', () => {
  let b!: BuilderActions;
  function Probe() { const s = useBuilderState(); useEffect(() => { b = s; }); return null; }
  let root: Root | null = null;
  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:test', configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: () => {}, configurable: true });
    localStorage.clear(); sessionStorage.clear();
    root = createRoot(document.createElement('div'));
    await act(async () => { root!.render(createElement(Probe)); });
  });
  afterEach(async () => { await act(async () => { root?.unmount(); }); root = null; });

  it('a photo, a video and a PDF → 1 photo in, the video and the PDF counted', async () => {
    let r!: ReturnType<BuilderActions['addPhotos']>;
    await act(async () => { r = b.addPhotos([file('IMG_1.jpg', 'image/jpeg'), file('hk-clip-12s.mp4', 'video/mp4'), file('notes.pdf', 'application/pdf')]); });
    expect(r).toEqual({ added: 1, skipped: 0, videos: 1, others: 1, restored: 0, otherCopies: 0 });
    expect(b.uploadedPhotos.map((p) => p.name)).toEqual(['IMG_1.jpg']);
  });
});

describe('no upload button drops a pick silently (source guards)', () => {
  const src = (f: string) => readFileSync(resolve(__dirname, f), 'utf8');
  it('Megy\'s upload and the phone review pass every pick to add_photos and show its answer', () => {
    for (const f of ['MegyAssistant.tsx', '../pages/builder/MobileReview.tsx']) {
      expect(src(f)).not.toMatch(/filter\(\(f\) => f\.type\.startsWith\('image\/'\)\)/);
      expect(src(f)).toMatch(/payload: \{ files: picked \}/);
    }
  });
  it("Megy's answer shows on the center stage (Step 4) too, not only in the side panel", () => {
    const m = src('MegyAssistant.tsx');
    expect(m.match(/data-testid="megy-toast"/g)?.length).toBe(2);
    const center = m.slice(m.indexOf('if (centerStage) {'), m.indexOf('if (centerStage) {') + 2500);
    expect(center).toMatch(/\{toast && \(\s*<div role="status" data-testid="megy-toast"/);
  });
});
