// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { AlbumPage, PageTemplate, QrFill, UploadedPhoto } from './types';

/* ══════════════════════════════════════════════════════════════════════════
   A VIDEO MEMORY ONLY EVER SITS ON A FULL-BLEED, ONE-PHOTO PAGE (owner,
   2026-10-08). On a memory page, "Choose a layout" showed Three Squares and
   Four Squares with the memory's QR as a whole photo square: the QR rode
   along by slot number into the second frame. Tapping one put it there for
   real, and so did Megy's "change layout", "regenerate page" and "use
   template". The QR-in-a-square look was retired on 2026-10-02 (PR #43).
   These run the real hook in React, one act() per action, like taps.
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
import { getTemplatesForAlbum, qrBadgeTemplate, photoSlotCount } from './pageTemplates';
import { DRAFT_STORAGE_KEY } from '../../lib/localDraft';
import { ActionEngine } from '../../assistant/actionEngine';
import type { AssistantIntent } from '../../assistant/types';

const memory = (code: string): QrFill => ({
  code, destination: `https://example.test/${code}.mp4`, qrPngDataUrl: 'data:image/png;base64,AA',
  memoryUrl: `https://megyprints.vercel.app/m/${code}`, createdAt: 1791100000000, kind: 'clip',
});
const squares = getTemplatesForAlbum('8x8');
const named = (name: string) => squares.find((t) => t.name === name)!;
const THREE_BOX_BL = named('Three Squares, Box Bottom Left');
const FOUR = named('Four Squares');
const FULL = named('Full Page');
const BADGE = qrBadgeTemplate('8x8', 'tr')!;

const photos: UploadedPhoto[] = Array.from({ length: 48 }, (_, i) => ({
  id: `photo-${i}`, name: `photo-${i}.jpg`, previewUrl: `https://photos.test/${i}.jpg`,
  type: 'image/jpeg', size: 1000 + i, width: 1200, height: 1200,
}));

const on = (i: number, t: PageTemplate, slotFills: (number | null)[], over: Partial<AlbumPage> = {}): AlbumPage => ({
  id: `page-${i}`, layout: 'freeform', size: '8x8', background: { type: 'solid', solid: '#FFFFFF' },
  photos: [], textElements: [], templateId: t.id, slotFills,
  slotScales: slotFills.map(() => 1), slotOffsetsX: slotFills.map(() => 0), slotOffsetsY: slotFills.map(() => 0),
  slotGeometries: [], ...over,
});

/** 42 pages. Page 1: photo 0 full page with its memory badge (top right).
 *  Page 2: Four Squares, no memory. Page 3: a memory placed in a caption box
 *  before box QRs were retired (photos 5–7). The rest: a photo each. */
function seedDraft() {
  const pages = Array.from({ length: 42 }, (_, i) => {
    if (i === 0) return on(0, BADGE, [0, null], { qrFills: [null, memory('MEMBADGE')] });
    if (i === 1) return on(1, FOUR, [1, 2, 3, 4]);
    if (i === 2) return on(2, THREE_BOX_BL, [5, 6, 7], { textSlotQr: [memory('MEMINBOX')] });
    if (i === 3) return on(3, FULL, [8], { slotMasks: ['heart'], slotLooks: ['bw'], slotGeometries: [{ x: 0.2, y: 0.2, width: 0.5, height: 0.5 }] });
    return on(i, FOUR, [5 + i, null, null, null]); // photos 8–46

  });
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
    albumType: 'standard', albumSize: '8x8', selectedTemplate: 'classic', uploadedPhotos: photos,
    albumPages: pages, currentPageIndex: 0, rejectedTemplateIds: [], title: 'Memory rule',
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
const megy = async (type: AssistantIntent['type'], payload?: Record<string, unknown>) => {
  let out!: Awaited<ReturnType<ActionEngine['execute']>>;
  await act(async () => { out = await new ActionEngine(builder).execute({ type, payload, rawMessage: type } as AssistantIntent); });
  return out;
};

/** A full-bleed, one-photo layout with no box: the only kind a memory may sit on. */
const fullPageOnly = (t: PageTemplate) => photoSlotCount(t) === 1 && !(t.textSlots?.length) && !!t.fullBleed;
/** Where the page's memories are: 'badge' when each is in a QR-badge slot, else what holds it. */
function memorySpots(p: AlbumPage): string[] {
  const t = squares.find((x) => x.id === p.templateId) ?? (p.templateId?.startsWith('qr-badge-') ? qrBadgeTemplate('8x8', p.templateId.slice(-2) as 'tl')! : undefined);
  const spots: string[] = [];
  (p.qrFills ?? []).forEach((q, i) => { if (q) spots.push(t?.slots[i]?.kind === 'qr' ? `badge:${q.code}` : `frame:${q.code}`); });
  (p.textSlotQr ?? []).forEach((q) => { if (q) spots.push(`box:${q.code}`); });
  return spots;
}

describe('"Choose a layout" on a page with a video memory', () => {
  it('offers no layout with more than one photo — the memory page stays a full page', () => {
    const offered = builder.availableTemplatesForCurrentPage();
    expect(offered.length).toBeGreaterThan(0);
    expect(offered.filter((t) => !fullPageOnly(t)).map((t) => t.name)).toEqual([]);
  });

  it('the page offers itself as it is (the full photo with its QR), marked as the current one', () => {
    expect(builder.availableTemplatesForCurrentPage().map((t) => t.id)).toEqual([BADGE.id]);
  });

  it('a memory placed in a box before (an old album) is offered only full-page layouts too', async () => {
    await tap((b) => b.goToPage(2));
    const offered = builder.availableTemplatesForCurrentPage();
    expect(offered.length).toBeGreaterThan(0);
    expect(offered.filter((t) => !fullPageOnly(t)).map((t) => t.name)).toEqual([]);
  });

  it('a page without a memory still gets every layout', async () => {
    await tap((b) => b.goToPage(1));
    expect(builder.availableTemplatesForCurrentPage().some((t) => photoSlotCount(t) >= 3)).toBe(true);
  });
});

describe('no layout change moves a memory off its full page', () => {
  const before = () => JSON.parse(JSON.stringify(builder.albumPages[0])) as AlbumPage;

  it('applying Three Squares (the old sheet offered it): the page stays the full photo with its badge', async () => {
    const was = before();
    await tap((b) => b.applyPageLayout(THREE_BOX_BL.id));
    expect(builder.albumPages[0]).toEqual(was);
    expect(memorySpots(builder.albumPages[0])).toEqual(['badge:MEMBADGE']);
  });

  it.each([
    ['change layout', 'shuffle_layout' as const],
    ['regenerate page', 'regenerate_page' as const],
  ])('Megy "%s": the page stays as it is, and Megy says why', async (_said, type) => {
    const was = before();
    const r = await megy(type);
    expect(builder.albumPages[0]).toEqual(was);
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/video memory/i);
  });

  it('Megy "use template Four Squares": the page stays as it is, and Megy says why', async () => {
    const was = before();
    const r = await megy('change_template', { templateId: FOUR.id });
    expect(builder.albumPages[0]).toEqual(was);
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/video memory/i);
  });

  it.each([
    ['shuffleLayout', (b: BuilderActions) => b.shuffleLayout()],
    ['cycleLayout', (b: BuilderActions) => b.cycleLayout()],
    ['regeneratePage', (b: BuilderActions) => b.regeneratePage()],
    ['setPageTemplate', (b: BuilderActions) => b.setPageTemplate(FOUR.id)],
  ])('%s (called directly): the page stays as it is, and there is nothing to undo', async (_name, run) => {
    const was = before();
    await tap(run);
    expect(builder.albumPages[0]).toEqual(was);
    expect(builder.canUndo).toBe(false);
  });

  it('an old album\'s box memory → Full Page: the memory becomes the corner badge on the first photo; the other photos go on a new page', async () => {
    await tap((b) => b.goToPage(2));
    const full = builder.availableTemplatesForCurrentPage()[0];
    const pagesBefore = builder.albumPages.length;
    await tap((b) => b.applyPageLayout(full.id, 'new-page'));
    const p = builder.albumPages[2];
    expect(p.templateId).toMatch(/^qr-badge-8x8-(tl|tr|bl|br)$/);
    expect(p.slotFills?.[0]).toBe(5);
    expect(memorySpots(p)).toEqual(['badge:MEMINBOX']);
    expect(builder.albumPages.length).toBe(pagesBefore + 1);
    expect(builder.albumPages[3].slotFills?.filter((f) => f != null).sort()).toEqual([6, 7]);
    expect(memorySpots(builder.albumPages[3])).toEqual([]);
  });

  it('tapping "✓ Current" on the memory page: nothing changes, nothing to undo', async () => {
    const was = before();
    await tap((b) => b.applyPageLayout(BADGE.id));
    expect(builder.albumPages[0]).toEqual(was);
    expect(builder.canUndo).toBe(false);
  });

  it('adding a video memory to a masked, Studio-moved full page makes the photo full bleed again (its filter stays)', async () => {
    await tap((b) => b.goToPage(3));
    expect(builder.canAddMemoryQr).toBe(true);
    await tap((b) => b.applyMemoryQr(memory('MEMNEW'), 'bl'));
    const p = builder.albumPages[3];
    expect(p.templateId).toBe(qrBadgeTemplate('8x8', 'bl')!.id);
    expect(memorySpots(p)).toEqual(['badge:MEMNEW']);
    expect(p.slotGeometries ?? []).toEqual([]);
    expect(p.slotMasks ?? []).toEqual([]);
    expect(p.slotLooks).toEqual(['bw']);
  });

  it('a page without a memory changes layout exactly as before', async () => {
    await tap((b) => b.goToPage(1));
    await tap((b) => b.applyPageLayout(THREE_BOX_BL.id, 'new-page'));
    expect(builder.albumPages[1].templateId).toBe(THREE_BOX_BL.id);
    expect(builder.albumPages[1].slotFills).toEqual([1, 2, 3]);
  });
});
