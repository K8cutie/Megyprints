// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AlbumPage, UploadedPhoto } from './types';
import { seedMathRandom } from '../../test/seededRandom';

seedMathRandom(); // same albums every run (generateAlbum deals with Math.random)

/* ══════════════════════════════════════════════════════════════════════════
   "FOR TESTING PURPOSES" ON THE ALBUM PAGES, SCREEN ONLY (owner, 2026-10-28:
   "after album generates the image will have a time stamp 'For Testing
   purposes' then a date and time"; "some testers would just screenshot and
   not take an effort"). In the Android app, every page a tester looks at
   after the album is made (the phone page, the book preview, the cover, the
   desktop canvas) carries a small stamp in the corner away from the binding,
   with the time Megy made the album. The time is saved on the pages, so a
   reload or another phone shows the same time; making the album again gives
   a new time.
   It is drawn OVER the page views and is never part of the album: the owner
   sends test packs from test orders to the print shop, so no print file,
   sheet, cover file or share may carry it.
   ══════════════════════════════════════════════════════════════════════════ */

const NATIVE = { on: true };
vi.mock('../../lib/nativeShell', () => ({ isNativeShell: () => NATIVE.on }));
vi.mock('../../lib/authContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../../lib/supabase', () => ({
  supabase: { auth: {
    getSession: async () => ({ data: { session: null } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  } },
  supabaseConfigured: false,
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

import { PageView } from './BuilderPreview';
import TesterPageStamp from './TesterPageStamp';
import { useTesterStamp } from './useTesterStamp';
import { useBuilderState, type BuilderActions } from './useBuilderState';
import { getTemplatesForAlbum } from './pageTemplates';
import { renderPageForPrint } from './printPipeline';
import { DRAFT_STORAGE_KEY } from '../../lib/localDraft';
import { serializeAlbum, deserializeAlbum } from '../../lib/useAlbumSync';
import { albumMadeAt, testerStampLines } from '../../lib/testingPhase';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MADE = new Date(2026, 9, 28, 14, 5).getTime();
const LINES = testerStampLines(MADE);
const page = (extra: Partial<AlbumPage> = {}): AlbumPage => ({
  id: 'p1', layout: 'freeform', size: '8x8', background: { type: 'solid', solid: '#F4E9DD' },
  photos: [], textElements: [], ...extra,
} as AlbumPage);

let host: HTMLDivElement;
let root: Root;
const stamps = () => [...host.querySelectorAll<HTMLElement>('[data-testid="tester-page-stamp"]')];
const render = async (el: ReturnType<typeof createElement>) => { await act(async () => { root.render(el); }); };

beforeEach(() => {
  NATIVE.on = true;
  localStorage.clear();
  sessionStorage.clear();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe('on the page views', () => {
  const view = (pageIndex: number, extra: Record<string, unknown> = {}) =>
    createElement(PageView, { page: page({ madeAt: MADE }), photos: [], singleW: 340, H: 340, pageIndex, testerStamp: LINES, ...extra });

  it('shows "For Testing purposes" and when the album was made', async () => {
    await render(view(0));
    expect(stamps()).toHaveLength(1);
    expect(stamps()[0].textContent).toBe('For Testing purposesOct 28, 2026, 2:05 PM');
    expect([...stamps()[0].children].map((c) => c.textContent)).toEqual(['For Testing purposes', 'Oct 28, 2026, 2:05 PM']);
  });

  it('sits in the corner away from the binding: page 1 (a right-hand page) right, page 2 left, the cover right', async () => {
    await render(view(0));
    expect(stamps()[0].dataset.side).toBe('right');
    expect(stamps()[0].style.right).not.toBe('');
    await render(view(1));
    expect(stamps()[0].dataset.side).toBe('left');
    expect(stamps()[0].style.left).not.toBe('');
    await render(view(0, { coverMode: true }));
    expect(stamps()[0].dataset.side).toBe('right');
  });

  it('never takes a tap, and is small: a corner of the page, not over it', async () => {
    await render(view(0));
    const s = stamps()[0];
    expect(s.style.pointerEvents).toBe('none');
    expect(s.style.position).toBe('absolute');
    expect(s.style.bottom).not.toBe('');
    expect(parseFloat(s.style.fontSize)).toBeLessThanOrEqual(12);
  });

  it('is not drawn where it is not asked for (layout thumbnails, the cover thumbnail)', async () => {
    await render(createElement(PageView, { page: page({ madeAt: MADE }), photos: [], singleW: 120, H: 120, pageIndex: 0 }));
    expect(stamps()).toHaveLength(0);
  });

  it('every view a tester looks at asks for it: phone page, book preview (single, spread, turning leaf, closed cover), cover editor, desktop canvas', () => {
    const src = (f: string) => readFileSync(resolve(__dirname, f), 'utf8');
    const preview = src('BuilderPreview.tsx').slice(src('BuilderPreview.tsx').indexOf('export default function BuilderPreview'));
    expect(preview.match(/<PageView [^>]*testerStamp=\{testerStamp\}/g)).toHaveLength(6);
    expect(preview.match(/<PageView /g)).toHaveLength(6);
    expect(src('MobileReview.tsx')).toMatch(/<PageView [^>]*testerStamp=\{testerStamp\}/);
    expect(src('CoverEditor.tsx')).toMatch(/<PageView [^>]*testerStamp=\{testerStamp\}/);
    expect(src('BuilderEdit.tsx')).toMatch(/<canvas ref=\{canvasElRef\} \/>\s*\{\/\*[\s\S]*?\*\/\}\s*\{testerStamp && <TesterPageStamp/);
  });

  it('sizes to the page: never bigger than 12 px, never smaller than 8 px', async () => {
    await render(createElement('div', null,
      createElement(TesterPageStamp, { lines: LINES, side: 'right', pageW: 1000 }),
      createElement(TesterPageStamp, { lines: LINES, side: 'left', pageW: 100 })));
    expect(stamps().map((s) => s.style.fontSize)).toEqual(['12px', '8px']);
  });
});

describe('who sees it', () => {
  let seen: readonly [string, string] | null | undefined;
  function Probe({ pages }: { pages: { madeAt?: unknown }[] }) {
    const s = useTesterStamp(pages);
    useEffect(() => { seen = s; });
    return null;
  }

  it('a tester in the Android app, once the album is made', async () => {
    await render(createElement(Probe, { pages: [{ madeAt: MADE }, {}] }));
    expect(seen).toEqual(['For Testing purposes', 'Oct 28, 2026, 2:05 PM']);
  });

  it('nobody on the website', async () => {
    NATIVE.on = false;
    await render(createElement(Probe, { pages: [{ madeAt: MADE }] }));
    expect(seen).toBeNull();
  });

  it('nobody before the album is made', async () => {
    await render(createElement(Probe, { pages: [{}, {}] }));
    expect(seen).toBeNull();
  });
});

describe('the time is when Megy made the album, saved with it', () => {
  const PHOTOS: UploadedPhoto[] = Array.from({ length: 44 }, (_, i) => ({
    id: `photo-${i}`, name: `photo-${i}.jpg`, previewUrl: `https://photos.test/${i}.jpg`,
    type: 'image/jpeg', size: 1000 + i, width: i % 3 ? 4032 : 3024, height: i % 3 ? 3024 : 4032, capturedAt: i * 60_000,
  }));
  let builder!: BuilderActions;
  function Builder({ onCommit }: { onCommit: (b: BuilderActions) => void }) {
    const b = useBuilderState();
    useEffect(() => { onCommit(b); });
    return null;
  }
  const mountBuilder = () => render(createElement(Builder, { onCommit: (b) => { builder = b; } }));
  const tap = (action: (b: BuilderActions) => unknown) => act(async () => { await action(builder); });
  const draftPages = () => (JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) ?? '{}').albumPages ?? []) as AlbumPage[];

  beforeEach(() => {
    const quad = getTemplatesForAlbum('8x8').find((t) => t.slots.length === 4)!;
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
      albumType: 'standard', albumSize: '8x8', selectedTemplate: 'classic', uploadedPhotos: PHOTOS,
      albumPages: Array.from({ length: 40 }, (_, i) => ({
        id: `page-${i}`, layout: 'freeform', size: '8x8', background: { type: 'solid', solid: '#FFFFFF' },
        photos: [], textElements: [], templateId: quad.id, slotFills: [null, null, null, null],
        slotScales: [1, 1, 1, 1], slotOffsetsX: [0, 0, 0, 0], slotOffsetsY: [0, 0, 0, 0], slotGeometries: [],
      })),
      currentPageIndex: 0, rejectedTemplateIds: [], title: 'Stamp',
    }));
  });

  it('no time before the album is made; every page gets the moment it is made', async () => {
    await mountBuilder();
    expect(albumMadeAt(builder.albumPages)).toBeNull();
    vi.spyOn(Date, 'now').mockReturnValue(MADE);
    await tap((b) => b.generateAlbum());
    expect(builder.albumPages.length).toBeGreaterThanOrEqual(40);
    expect(new Set(builder.albumPages.map((p) => p.madeAt))).toEqual(new Set([MADE]));
  });

  it('a reload on the same phone shows the same time', async () => {
    await mountBuilder();
    vi.spyOn(Date, 'now').mockReturnValue(MADE);
    await tap((b) => b.generateAlbum());
    vi.restoreAllMocks();
    // What the app does as the phone closes it (pagehide).
    await tap((b) => b.saveDraftNow());
    expect(albumMadeAt(draftPages())).toBe(MADE);
    // The app opens again from the saved draft.
    act(() => root.unmount());
    root = createRoot(host);
    await mountBuilder();
    expect(albumMadeAt(builder.albumPages)).toBe(MADE);
  });

  it('another phone shows the same time: it rides in the account copy of the pages', async () => {
    await mountBuilder();
    vi.spyOn(Date, 'now').mockReturnValue(MADE);
    await tap((b) => b.generateAlbum());
    const row = serializeAlbum({ title: 'Stamp', sizePreset: '8x8', pages: builder.albumPages as never });
    const back = deserializeAlbum(JSON.parse(JSON.stringify({ ...row, id: 'a1' })));
    expect(albumMadeAt(back.pages)).toBe(MADE);
  });

  it('making the album again gives a new time', async () => {
    await mountBuilder();
    vi.spyOn(Date, 'now').mockReturnValue(MADE);
    await tap((b) => b.generateAlbum());
    const later = MADE + 2 * 24 * 60 * 60 * 1000;
    vi.spyOn(Date, 'now').mockReturnValue(later);
    await tap((b) => b.generateAlbum());
    expect(albumMadeAt(builder.albumPages)).toBe(later);
    expect(testerStampLines(albumMadeAt(builder.albumPages)!)).toEqual(['For Testing purposes', 'Oct 30, 2026, 2:05 PM']);
  });
});

describe('never in print', () => {
  /* The print renderer, on a canvas that writes down every call: a page with
     the made time draws exactly what the same page without it draws, and no
     word of the stamp. */
  const recordPrint = async (p: AlbumPage) => {
    const log: string[] = [];
    const show = (a: unknown) => (a && typeof a === 'object' ? (a as object).constructor?.name ?? 'object' : String(a));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
      const state: Record<string | symbol, unknown> = { canvas: this };
      return new Proxy(state, {
        get(t, k) {
          if (k in t) return t[k];
          if (k === 'measureText') return (s: string) => ({ width: s.length * 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 });
          if (k === 'getImageData') return (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h });
          if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop() {} });
          return (...args: unknown[]) => { log.push(`${String(k)}(${args.map(show).join(',')})`); };
        },
        set(t, k, v) { t[k] = v; log.push(`${String(k)}=${show(v)}`); return true; },
      }) as unknown as CanvasRenderingContext2D;
    } as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (cb: BlobCallback) { cb(new Blob(['x'], { type: 'image/jpeg' })); });
    const out = await renderPageForPrint({ page: p, photos: [], albumSize: '8x8', pageIndex: 0, bakeWords: true });
    vi.restoreAllMocks();
    return { log, out };
  };

  it('the print renderer draws a page with the made time exactly as one without it', async () => {
    const tmpl = getTemplatesForAlbum('8x8').find((t) => t.slots.length === 4)!;
    const base = page({ templateId: tmpl.id, slotFills: [null, null, null, null], textElements: [
      { id: 't1', text: 'Our day', x: 0.5, y: 0.5, fontSize: 48, fontFamily: 'Playfair Display', color: '#222222' },
    ] as never });
    const without = await recordPrint(base);
    const withTime = await recordPrint({ ...base, madeAt: MADE });
    expect(without.log.length).toBeGreaterThan(5);
    expect(withTime.log).toEqual(without.log);
    expect(withTime.log.join('\n')).not.toMatch(/For Testing|Oct 28, 2026|2:05 PM/);
    expect(withTime.out.words).toEqual([]);
  });

  it('no print, sheet, cover-file or share code knows the stamp or the made time', () => {
    const root = resolve(__dirname, '../..');
    const files = [
      'pages/builder/printPipeline.ts', 'pages/builder/generateAlbumPdf.ts', 'pages/builder/printSheet.ts',
      'pages/builder/printSheetPdf.ts', 'lib/pressSheetFiles.ts', 'lib/pressSheetJpeg.ts', 'lib/orders.ts',
      'lib/printQueue.ts', 'pages/builder/textPainter.ts', 'lib/canvasTextPainter.ts',
    ];
    for (const f of files) {
      const code = readFileSync(resolve(root, f), 'utf8');
      expect(code, f).not.toMatch(/TesterPageStamp|testingPhase|madeAt|For Testing/);
    }
    // And the stamp itself is only ever mounted by on-screen views.
    const users = readdirSync(resolve(root, 'pages/builder'))
      .filter((f) => /\.tsx?$/.test(f) && !f.includes('.spec.'))
      .filter((f) => /TesterPageStamp|useTesterStamp/.test(readFileSync(resolve(root, 'pages/builder', f), 'utf8')))
      .sort();
    expect(users).toEqual(['BuilderEdit.tsx', 'BuilderPreview.tsx', 'CoverEditor.tsx', 'MobileReview.tsx', 'TesterPageStamp.tsx', 'useTesterStamp.ts']);
  });
});
