// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* ══════════════════════════════════════════════════════════════════════════
   THE COVER COMES AFTER THE PHOTOS (tester, 2026-10-27: "why can I only
   submit one photo?"). The cover step came first and its Background button
   opened a picker that takes ONE photo, so the first photo picker a customer
   met said "one photo" about the whole album. Archie had read it the same
   way. Now: photos (a picker that takes many), then the cover, which lists
   those photos best first to tap. Its phone picker is the second choice, and
   the screen says it's 1 photo for the front cover. The album is made on the
   cover step ("Make my album →").
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({ ctx: null as unknown }));
vi.mock('./BuilderContext', () => ({ useBuilderContext: () => h.ctx }));
// The canvas-drawn parts, not under test here.
vi.mock('./BuilderPreview', () => ({ PageView: () => null }));
vi.mock('./FontList', () => ({ FontSelect: () => null }));
vi.mock('./textFit', () => ({ coverTitleFit: () => null }));
vi.mock('./coverLayout', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  deriveSpine: () => ({ bg: '#FFFFFF', text: { text: '', fontFamily: 'serif', color: '#2D2D2D' }, shortened: false, shrunk: false, inkChanged: false }),
  measureSpineText: () => 10,
}));
// "Best first" by a score the test sets (Megy's photo check ranks the real ones).
vi.mock('../../lib/photoCheck', () => ({
  medianSharpness: () => 0,
  photoQuality: (p: { q: number }) => p.q,
}));

import CoverEditor, { COVER_PHOTOS_SHOWN } from './CoverEditor';
import { coverStepNext, MAKE_ALBUM, COVER_TO_PAGES, COVER_TO_PHOTOS, WIZARD_ORDER } from '../../assistant/wizard';
import { ActionEngine } from '../../assistant/actionEngine';
import type { BuilderActions } from './useBuilderState';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
/** n photos, p0 the best, p(n-1) the worst. */
const photos = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `p${i}.jpg`, previewUrl: GIF, q: n - i }));

function stub(n: number, background: Record<string, unknown> = { type: 'solid', solid: '#FFFFFF' }) {
  return {
    setEditScope: vi.fn(), albumSize: '8x8', albumPages: [], uploadedPhotos: photos(n),
    coverFront: { id: 'cover', layout: 'freeform', size: '8x8', background, photos: [], textElements: [] },
    setCoverPhoto: vi.fn(async () => {}), setPageBackground: vi.fn(), setPageColor: vi.fn(),
    applyPageColorToAllPages: vi.fn(), setBackgroundCrop: vi.fn(), setBoxText: vi.fn(), setBoxTextOffset: vi.fn(),
  };
}

let host: HTMLDivElement;
let root: Root;
let pickerOpened: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  // The phone's picker opening = a click on the hidden file input.
  pickerOpened = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); });

const onNext = vi.fn();
const open = (ctx: ReturnType<typeof stub>, nextLabel = MAKE_ALBUM) => {
  h.ctx = ctx;
  act(() => root.render(createElement(CoverEditor, { mode: 'step', nextLabel, onNext, onBack: () => {} })));
};
const byText = (t: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === t) ?? null;
const tap = (el: Element | null) => { expect(el).not.toBeNull(); act(() => { (el as HTMLElement).click(); }); };
const shown = () => [...host.querySelectorAll('[data-testid="cover-your-photos"] img')].map((i) => i.getAttribute('alt')?.replace('.jpg', ''));

describe('the order', () => {
  it('photos, then the cover, then the pages', () => {
    expect(WIZARD_ORDER.indexOf('upload_photos')).toBeLessThan(WIZARD_ORDER.indexOf('design_cover'));
    expect(WIZARD_ORDER.indexOf('design_cover')).toBeLessThan(WIZARD_ORDER.indexOf('review_pages'));
  });
  it('the first picker a customer meets takes many photos; the cover\'s takes one', () => {
    const builder = readFileSync(resolve(__dirname, '../Builder.tsx'), 'utf8');
    expect(builder).toMatch(/ref=\{fileInputRef\}\s+type="file"\s+accept="image\/\*"\s+multiple/);
    const cover = readFileSync(resolve(__dirname, 'CoverEditor.tsx'), 'utf8');
    expect(cover).toMatch(/<input ref=\{bgFileRef\} type="file" accept="image\/\*" className="hidden"/);
  });
});

describe('the cover step\'s filled button (coverStepNext)', () => {
  it('40 photos in, not made: makes the album', () => {
    expect(coverStepNext(false, 40)).toEqual({ label: MAKE_ALBUM, go: 'make' });
    expect(MAKE_ALBUM).toBe('Make my album →');
  });
  it('made already: back to the pages, never made again (that wipes edits and memories)', () => {
    expect(coverStepNext(true, 45)).toEqual({ label: COVER_TO_PAGES, go: 'pages' });
    expect(coverStepNext(true, 3).go).toBe('pages');
  });
  it('short of 40 (an old journey saved on the cover, or photos left out): to the photos', () => {
    expect(coverStepNext(false, 39)).toEqual({ label: COVER_TO_PHOTOS, go: 'photos' });
    expect(coverStepNext(false, 0).go).toBe('photos');
  });
});

describe('the cover screen with the album\'s photos', () => {
  it('says it is 1 photo for the front cover', () => {
    open(stub(12));
    expect(host.querySelector('[data-testid="cover-one-photo"]')?.textContent).toBe('Pick 1 photo for the front cover');
  });

  it('lists the best photos first, 10 of them, and "Show all" shows the rest', () => {
    open(stub(12));
    expect(COVER_PHOTOS_SHOWN).toBe(10);
    expect(shown()).toEqual(['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9']);
    tap(byText('Show all 12 photos'));
    expect(shown()).toHaveLength(12);
    tap(byText('Show fewer'));
    expect(shown()).toHaveLength(10);
  });

  it('a few photos: all of them, no "Show all"', () => {
    open(stub(4));
    expect(shown()).toEqual(['p0', 'p1', 'p2', 'p3']);
    expect(host.querySelector('[data-testid="cover-show-all-photos"]')).toBeNull();
  });

  it('the photo on the cover is always among those shown, ticked', () => {
    open(stub(12, { type: 'image', image: GIF, photoId: 'p11' }));
    expect(shown()).toHaveLength(10);
    expect(shown()[0]).toBe('p11');
  });

  it('tapping a photo puts it on the cover', () => {
    const ctx = stub(12);
    open(ctx);
    tap(host.querySelector('[data-testid="cover-your-photos"] img')!.closest('button'));
    expect(ctx.setPageBackground).toHaveBeenCalledWith(expect.objectContaining({ type: 'image', photoId: 'p0' }));
  });

  it('the Background tab does NOT open the phone\'s picker; "Or choose a photo from your phone" does', () => {
    open(stub(12));
    tap(byText('Text'));
    tap(byText('Background'));
    expect(pickerOpened).not.toHaveBeenCalled();
    tap(host.querySelector('[data-testid="cover-photo-from-phone"]'));
    expect(pickerOpened).toHaveBeenCalledTimes(1);
  });

  it('the filled button says what it does ("Make my album →") and goes on', () => {
    onNext.mockClear();
    open(stub(45));
    const next = host.querySelector('[data-testid="cover-step-next"]');
    expect(next?.textContent).toBe('Make my album →');
    tap(next);
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});

describe('the cover with no album photos (owner, 2026-10-04: Background opens the browser)', () => {
  it('no photo list; the Background tab opens the phone\'s picker straight away', () => {
    open(stub(0), COVER_TO_PHOTOS);
    expect(host.querySelector('[data-testid="cover-your-photos"]')).toBeNull();
    tap(byText('Text'));
    tap(byText('Background'));
    expect(pickerOpened).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[data-testid="cover-step-next"]')?.textContent).toBe('Next: add your photos →');
  });
});

describe('making the album from the cover step', () => {
  it('lays the pages on a PAGE\'s background, never the cover\'s photo (currentPage IS the cover there)', async () => {
    const generateAlbum = vi.fn(async () => ({ made: true }));
    const coverPage = { background: { type: 'image', image: GIF, photoId: 'p0' } };
    const builder = {
      uploadedPhotos: photos(45), albumPages: [{ background: { type: 'solid', solid: '#FFFFFF' } }], currentPageIndex: 0,
      currentPage: coverPage, generateAlbum,
    } as unknown as BuilderActions;
    const r = await new ActionEngine(builder).execute({ type: 'generate_album', rawMessage: 'generate album' });
    expect(r.success).toBe(true);
    expect(generateAlbum).toHaveBeenCalledWith({ type: 'solid', solid: '#FFFFFF' });
  });
  it('"Surprise me" typed to Megy with the cover open: a page\'s background too', async () => {
    const generateAlbum = vi.fn(async () => ({ made: true }));
    const builder = {
      uploadedPhotos: photos(45), albumPages: [{ background: { type: 'solid', solid: '#FFFFFF' } }], currentPageIndex: 0,
      currentPage: { background: { type: 'image', image: GIF, photoId: 'p0' } }, generateAlbum,
    } as unknown as BuilderActions;
    await new ActionEngine(builder).execute({ type: 'surprise_me', rawMessage: 'surprise me' });
    expect(generateAlbum).toHaveBeenCalledWith({ type: 'solid', solid: '#FFFFFF' }, { randomize: true });
  });
  it('nothing that (re)makes the album reads the page being edited (it can be the cover)', () => {
    const src = readFileSync(resolve(__dirname, '../../assistant/actionEngine.ts'), 'utf8');
    expect(src).not.toMatch(/generateAlbum\(\s*this\.builder\.currentPage/);
    expect(src).not.toMatch(/currentPage\??\.background;/);
    expect(src.match(/generateAlbum\(pagesBackground\(this\.builder\)/g)).toHaveLength(3); // make, new size, surprise
  });
  it('no pages yet: no background is passed (the album maker\'s plain white)', async () => {
    const generateAlbum = vi.fn(async () => ({ made: true }));
    const builder = {
      uploadedPhotos: photos(45), albumPages: [], currentPageIndex: 0,
      currentPage: { background: { type: 'image', image: GIF } }, generateAlbum,
    } as unknown as BuilderActions;
    await new ActionEngine(builder).execute({ type: 'generate_album', rawMessage: 'generate album' });
    expect(generateAlbum).toHaveBeenCalledWith(undefined);
  });
});
