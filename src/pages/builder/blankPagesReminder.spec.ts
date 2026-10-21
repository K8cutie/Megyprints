// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/* ══════════════════════════════════════════════════════════════════════════
   THE END OF THE PREVIEW SAYS WHICH PAGES ARE BLANK (tester, 2026-10-21: 50
   pages, 45 filled after photos were deleted and moved, 5 blank, no way to
   remove them). Owner: "it becomes a reminder at the end with an option to
   further edit the pages or delete them"; 42 pages with 4 blank → delete 2,
   add photos to the other 2. The real preview, phone and desktop.
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({ ctx: null as unknown, mobile: false }));
vi.mock('./BuilderContext', () => ({ useBuilderContext: () => h.ctx }));
vi.mock('./CoverEditor', () => ({ default: () => null }));
vi.mock('../../hooks/use-mobile', () => ({ useIsMobile: () => h.mobile, useIsPortrait: () => h.mobile }));

import BuilderPreview from './BuilderPreview';
import { getTemplatesForAlbum } from './pageTemplates';
import type { AlbumPage } from './types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const photos = Array.from({ length: 60 }, (_, i) => ({ id: `p${i}`, previewUrl: GIF, name: `p${i}.jpg`, type: 'image/jpeg', size: 1, width: 1200, height: 1200 }));
/** `n` pages of one photo each; the indexes in `blanks` have nothing on them. */
const album = (n: number, blanks: number[]) => Array.from({ length: n }, (_, i) => ({
  id: `page-${i}`, layout: 'single', size: '8x8', templateId: 't88-solo-square', slotFills: [blanks.includes(i) ? null : i],
  photos: [], textElements: [], background: { type: 'solid', solid: '#FFFFFF' },
})) as unknown as AlbumPage[];
const coverFront = {
  id: 'cover-front', layout: 'freeform', size: '8x8', templateId: 'cover-plain', slotFills: [], photos: [],
  background: { type: 'solid', solid: '#1F2A44' },
  textElements: [{ id: 't', boxIndex: 0, text: 'Hong Kong', fontSize: 64, fontFamily: 'Georgia', color: '#FFFFFF', bold: true, italic: false, underline: false, alignment: 'center', x: 0, y: 0 }],
} as unknown as AlbumPage;

let host: HTMLDivElement;
let root: Root;
let clock = 0;
let onOrder: ReturnType<typeof vi.fn>;
let onBack: ReturnType<typeof vi.fn>;
let wentTo: number[];
let deleted: [readonly number[], { landOnLast?: boolean } | undefined][];
beforeEach(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  h.mobile = false;
  clock = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => (clock += 10_000));
  onOrder = vi.fn(); onBack = vi.fn(); wentTo = []; deleted = [];
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); });

/** The builder's side, as useBuilderState.deletePages does it (its own spec
 *  covers the floor, undo and the spine). */
function Preview({ initial, start }: { initial: AlbumPage[]; start: number }) {
  const [pages, setPages] = useState(initial);
  const [index, setIndex] = useState(start);
  h.ctx = {
    setBoxText: vi.fn(), updateTextElement: vi.fn(), setQrFill: vi.fn(), coverDesign: undefined, coverFront,
    finishBoxesWithQuotes: vi.fn(async () => ({ filled: 0, remaining: 0, heldBack: 0, noLine: 0 })), getAlbumId: () => 'album-1',
    deletePages: (idx: readonly number[], opts?: { landOnLast?: boolean }) => {
      deleted.push([idx, opts]);
      const going = new Set(idx);
      const next = pages.filter((_, i) => !going.has(i));
      setPages(next);
      setIndex(opts?.landOnLast ? next.length - 1 : Math.min(index, next.length - 1));
      return going.size;
    },
  };
  return createElement(BuilderPreview, {
    pages, currentIndex: index, photos, albumSize: '8x8', onBack, onOrder,
    onGoToPage: (i: number) => { wentTo.push(i); setIndex(i); },
  } as never);
}
const q = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const tap = (id: string) => act(() => { q(id)!.click(); });
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const card = () => q('end-prompt');
const cardButtons = () => [...card()!.querySelectorAll('button')].map((b) => text(b)).filter(Boolean);
const render = (pages: AlbumPage[], start = pages.length - 1) => act(() => { root.render(createElement(Preview, { initial: pages, start })); });

for (const mobile of [false, true]) {
  describe(mobile ? 'on a phone' : 'on a computer', () => {
    beforeEach(() => { h.mobile = mobile; });

    it('the tester: 50 pages, 5 blank → the end says so; Delete leaves 45 and the usual end card', () => {
      render(album(50, [3, 17, 30, 41, 49]));
      expect(card()).not.toBeNull();
      expect(text(card()!.querySelector('h3'))).toBe('5 pages are blank');
      expect(text(q('end-prompt-blank-body'))).toBe('They print as empty pages. Delete them, or add photos to them.');
      expect(cardButtons()).toEqual(['Delete 5 blank pages', 'Edit the blank pages', 'Order with blank pages']);
      // ONE filled button: Delete (label-actions-in-words).
      expect(q('end-prompt-delete-blank')!.className).toContain('bg-blush-pink');
      expect(q('end-prompt-edit-blank')!.className).not.toContain('bg-blush-pink');

      tap('end-prompt-delete-blank');
      expect(deleted).toEqual([[[3, 17, 30, 41, 49], { landOnLast: true }]]);
      // Still at the end, now the usual card, with what happened said on top.
      expect(card()).not.toBeNull();
      expect(text(card()!.querySelector('h3'))).toBe("You've reached the end");
      expect(text(q('end-prompt-note'))).toBe('✓ Deleted 5 blank pages. Your album has 45 pages.');
      expect(cardButtons()).toEqual(['🎨 Check your cover', 'ORDER ALBUM', 'Continue editing']);
      expect(text(q('preview-counter'))).toMatch(/45/);
    });

    it('42 pages, 38 filled: delete 2 (the last two), then the other 2 must be filled', () => {
      render(album(42, [5, 12, 20, 33]));
      expect(text(card()!.querySelector('h3'))).toBe('4 pages are blank');
      expect(text(q('end-prompt-blank-body'))).toBe('Albums need at least 40 pages, so you can delete 2. Add photos to the other 2, or they print blank.');
      expect(cardButtons()).toEqual(['Delete 2 blank pages', 'Edit the blank pages', 'Order with blank pages']);

      tap('end-prompt-delete-blank');
      expect(deleted).toEqual([[[20, 33], { landOnLast: true }]]);
      expect(text(q('end-prompt-note'))).toBe('✓ Deleted 2 blank pages. Your album has 40 pages.');
      expect(text(card()!.querySelector('h3'))).toBe('2 pages are blank');
      expect(text(q('end-prompt-blank-body'))).toBe("Albums need at least 40 pages, so these can't be deleted. Add photos to them, or they print blank.");
      // No Delete now: Edit is the filled button.
      expect(cardButtons()).toEqual(['Edit the blank pages', 'Order with blank pages']);
      expect(q('end-prompt-edit-blank')!.className).toContain('bg-blush-pink');
    });

    it('"Edit the blank pages" opens the first blank page in the editor', () => {
      render(album(50, [3, 17, 30, 41, 49]));
      tap('end-prompt-edit-blank');
      expect(wentTo).toEqual([3]);
      expect(onBack).toHaveBeenCalledTimes(1);
      expect(deleted).toEqual([]);
    });

    it('"Order with blank pages" orders without asking about them again', () => {
      render(album(50, [3, 17, 30, 41, 49]));
      tap('end-prompt-order-blank');
      // Anything else still asks first (none expected here); never the blank pages.
      expect(host.textContent).not.toMatch(/Before you order: your album has \d+ blank page/);
      if (!onOrder.mock.calls.length) tap('order-not-ready-anyway');
      expect(onOrder).toHaveBeenCalledTimes(1);
      expect(deleted).toEqual([]);
    });
  });
}

describe('the Order button in the toolbar', () => {
  it('its warning names the blank pages and offers to delete them, without leaving the page you are on', () => {
    render(album(50, [3, 17, 30, 41, 49]), 10);
    expect(card()).toBeNull(); // page 11: not the end
    tap('preview-order');
    expect(onOrder).not.toHaveBeenCalled();
    expect(text(q('order-not-ready'))).toMatch(/Before you order: your album has 5 blank pages/);
    expect(text(q('order-not-ready-delete-blank'))).toBe('Delete 5 blank pages');

    tap('order-not-ready-delete-blank');
    expect(deleted).toEqual([[[3, 17, 30, 41, 49], { landOnLast: false }]]);
    expect(q('order-not-ready')).toBeNull();
    expect(text(q('preview-deleted-note'))).toBe('✓ Deleted 5 blank pages. Your album has 45 pages.');
    expect(onOrder).not.toHaveBeenCalled(); // deleting never orders
  });

  it('at 40 pages with 38 photos the 40-photo minimum answers first', () => {
    render(album(40, [8, 9]), 10);
    tap('preview-order');
    expect(q('order-too-few-photos')).not.toBeNull();
    expect(q('order-not-ready-delete-blank')).toBeNull();
  });

  it('at 40 pages (40 photos) the warning has no Delete (nothing can go)', () => {
    // Two pages hold more than one photo, so 38 filled pages carry 40+ photos.
    const multi = getTemplatesForAlbum('8x8').find((t) => t.slots.length === 2 && t.slots.every((s) => !s.kind || s.kind === 'photo'))
      ?? getTemplatesForAlbum('8x8').find((t) => t.slots.length > 1 && t.slots.every((s) => !s.kind || s.kind === 'photo'))!;
    const pages = album(40, [8, 9]).map((p, i) => (i < 2
      ? { ...p, templateId: multi.id, slotFills: multi.slots.map((_, k) => (k === 0 ? i : 50 + i * 4 + k)) }
      : p));
    render(pages, 10);
    tap('preview-order');
    expect(text(q('order-not-ready'))).toMatch(/2 blank pages/);
    expect(q('order-not-ready-delete-blank')).toBeNull();
    expect(q('order-not-ready-show')).not.toBeNull();
  });

  it('no blank pages → the end card is the usual one', () => {
    render(album(45, []));
    expect(text(card()!.querySelector('h3'))).toBe("You've reached the end");
    expect(q('end-prompt-delete-blank')).toBeNull();
  });
});
