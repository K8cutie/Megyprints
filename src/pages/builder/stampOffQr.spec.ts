// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { AlbumPage, QrFill, TextElement, UploadedPhoto } from './types';

/* ══════════════════════════════════════════════════════════════════════════
   A DATE STAMP NEVER SITS ON A VIDEO MEMORY'S QR. Megy's "Add Date Stamp"
   puts the date in a photo corner, bottom right first. "Add a video memory"
   puts its QR in the corner farthest from a face, bottom right when there is
   none. Stamp first, memory second: white text on the QR, which can stop it
   scanning. Now the stamp moves to a free corner when the QR arrives or moves
   onto it. These run the real hook in React, one act() per action, like taps.
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
import { getTemplatesForAlbum, getTemplateById, type QrCorner } from './pageTemplates';
import { marginForTemplate } from './binding';
import { getCanvasDimensions } from './layouts';
import { resolveSlotBox } from './slotGeometry';
import { DRAFT_STORAGE_KEY } from '../../lib/localDraft';
import { dateStampFor, isDateStamp } from '../../assistant/dateStamp';

const memory = (code: string): QrFill => ({
  code, destination: `https://example.test/${code}.mp4`, qrPngDataUrl: 'data:image/png;base64,AA',
  memoryUrl: `https://megyprints.vercel.app/m/${code}`, createdAt: 1791100000000, kind: 'clip',
});
const FULL = getTemplatesForAlbum('8x8').find((t) => t.name === 'Full Page')!;
const taken = new Date(2026, 9, 12, 14, 30).getTime();

const photos: UploadedPhoto[] = Array.from({ length: 42 }, (_, i) => ({
  id: `photo-${i}`, name: `photo-${i}.jpg`, previewUrl: `https://photos.test/${i}.jpg`,
  type: 'image/jpeg', size: 1000 + i, width: 1200, height: 1200, capturedAt: taken,
}));

/** 42 one-photo full pages, page 1 on screen. */
function seedDraft() {
  const pages: AlbumPage[] = Array.from({ length: 42 }, (_, i) => ({
    id: `page-${i}`, layout: 'freeform', size: '8x8', background: { type: 'solid', solid: '#FFFFFF' },
    photos: [], textElements: [], templateId: FULL.id, slotFills: [i],
    slotScales: [1], slotOffsetsX: [0], slotOffsetsY: [0], slotGeometries: [],
  }));
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
    albumType: 'standard', albumSize: '8x8', selectedTemplate: 'classic', uploadedPhotos: photos,
    albumPages: pages, currentPageIndex: 0, rejectedTemplateIds: [], title: 'Stamp and memory',
  }));
}

let builder!: BuilderActions;
function Probe({ onCommit }: { onCommit: (b: BuilderActions) => void }) {
  const b = useBuilderState();
  useEffect(() => { onCommit(b); });
  return null;
}
let root: Root | null = null;
beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  sessionStorage.clear();
  seedDraft();
  root = createRoot(document.createElement('div'));
  await act(async () => { root!.render(createElement(Probe, { onCommit: (b) => { builder = b; } })); });
});
afterEach(async () => {
  await act(async () => { root?.unmount(); });
  root = null;
});

const tap = (action: (b: BuilderActions) => unknown) => act(async () => { await action(builder); });

type R = { x: number; y: number; w: number; h: number };
const hits = (a: R, b: R) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const page = () => builder.albumPages[builder.currentPageIndex];
const stamp = () => page().textElements.find(isDateStamp) as TextElement | undefined;
const stampRect = (t: TextElement): R => ({ x: t.x, y: t.y, w: t.width ?? 0, h: t.fontSize * 1.25 });
/** Where the page's QR is, in design px (the renderers' arithmetic). */
function qrRect(): R | null {
  const p = page();
  const t = getTemplateById(p.templateId!)!;
  const i = t.slots.findIndex((s) => s.kind === 'qr');
  if (i < 0) return null;
  const m = marginForTemplate(t, t.margin, '8x8', builder.currentPageIndex);
  const { width: W, height: H } = getCanvasDimensions('8x8');
  const s = resolveSlotBox(t.slots[i], p.slotGeometries?.[i] ?? null);
  const sw = W * (1 - m.left - m.right), sh = H * (1 - m.top - m.bottom);
  return { x: W * m.left + s.x * sw, y: H * m.top + s.y * sh, w: s.width * sw, h: s.height * sh };
}

/** Megy's "Add Date Stamp" on the page on screen, as the panel does it. */
async function addStamp() {
  const s = dateStampFor(page(), builder.currentPageIndex, '8x8', builder.uploadedPhotos)!;
  expect(s.style).not.toBeNull();
  await tap((b) => b.addTextElement(undefined, undefined, s.text, s.style));
  return stamp()!;
}

describe('a date stamp and a video memory on the same full-page photo', () => {
  it('the stamp is marked as a stamp and starts bottom right', async () => {
    const s = await addStamp();
    expect(s.text).toBe('October 12, 2026');
    expect(s.alignment).toBe('right');
  });

  it('a memory whose QR goes bottom right: the stamp moves to a free corner, still on the photo', async () => {
    const was = await addStamp();
    await tap((b) => b.applyMemoryQr(memory('MEMBR'), 'br'));
    expect(page().templateId).toMatch(/^qr-badge-.*br$/);
    const now = stamp()!;
    expect(hits(stampRect(now), qrRect()!)).toBe(false);
    expect([now.x, now.y]).not.toEqual([was.x, was.y]);
    // The same stamp: its words, colour and shadow are kept.
    expect(now).toEqual(expect.objectContaining({ id: was.id, text: was.text, color: was.color, shadow: true }));
    expect(page().textElements.filter(isDateStamp)).toHaveLength(1);
  });

  it('moving the QR onto the stamp\'s new corner moves the stamp again', async () => {
    await addStamp();
    await tap((b) => b.applyMemoryQr(memory('MEMBR'), 'br'));
    const corners: QrCorner[] = ['bl', 'tr', 'tl', 'br'];
    for (const c of corners) {
      await tap((b) => b.setMemoryQrCorner(c));
      expect(page().templateId, c).toMatch(new RegExp(`${c}$`));
      expect(hits(stampRect(stamp()!), qrRect()!), `QR ${c}`).toBe(false);
    }
  });

  it('a QR in another corner: the stamp stays exactly where it was', async () => {
    const was = await addStamp();
    await tap((b) => b.applyMemoryQr(memory('MEMTL'), 'tl'));
    expect(stamp()).toEqual(was);
  });

  it('a stamp the customer moved somewhere clear stays where they put it', async () => {
    const was = await addStamp();
    await tap((b) => b.updateTextElement(was.id, { x: 250, y: 300 }));
    await tap((b) => b.applyMemoryQr(memory('MEMBR'), 'br'));
    expect(stamp()).toEqual(expect.objectContaining({ x: 250, y: 300 }));
  });

  it('other text on the page is never moved', async () => {
    await tap((b) => b.addTextElement(undefined, undefined, 'Our day'));
    const typed = page().textElements.find((t) => t.text === 'Our day')!;
    await addStamp();
    await tap((b) => b.applyMemoryQr(memory('MEMBR'), 'br'));
    expect(page().textElements.find((t) => t.text === 'Our day')).toEqual(typed);
  });
});
