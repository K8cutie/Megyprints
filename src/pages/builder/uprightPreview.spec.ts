// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/* ══════════════════════════════════════════════════════════════════════════
   AN UPRIGHT PHONE SHOWS ONE PAGE AT A TIME (owner, 2026-10-05). The preview
   turned itself 90° in code on an upright phone and asked the customer to
   turn the phone: "Preview forces the phone sideways" (6 of 16 testers,
   round 2). Now one page, as wide as the phone, turned under it in words or
   with a swipe; the open book on "See it as an open book", or when the phone
   is really turned.
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({ ctx: null as unknown, portrait: true }));
vi.mock('./BuilderContext', () => ({ useBuilderContext: () => h.ctx }));
vi.mock('./CoverEditor', () => ({ default: () => null }));
vi.mock('../../hooks/use-mobile', () => ({ useIsMobile: () => true, useIsPortrait: () => h.portrait }));

import BuilderPreview from './BuilderPreview';
import type { AlbumPage } from './types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const photos = Array.from({ length: 40 }, (_, i) => ({ id: `p${i}`, previewUrl: GIF, name: `p${i}.jpg`, type: 'image/jpeg', size: 1, width: 1200, height: 1200 }));
const pages = Array.from({ length: 40 }, (_, i) => ({
  id: `page-${i}`, layout: 'single', size: '8x8', templateId: 't88-solo-square', slotFills: [i], photos: [], textElements: [],
  background: { type: 'solid', solid: '#FFFFFF' },
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
beforeEach(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  h.portrait = true;
  h.ctx = {
    setBoxText: vi.fn(), updateTextElement: vi.fn(), setQrFill: vi.fn(), coverDesign: undefined, coverFront,
    finishBoxesWithQuotes: vi.fn(async () => ({ filled: 0, remaining: 0, heldBack: 0, noLine: 0 })), getAlbumId: () => 'album-1',
  };
  // Every tap well after the last turn (the double-tap guard is its own test).
  clock = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => (clock += 10_000));
  onOrder = vi.fn();
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); });

function Preview({ start }: { start: number }) {
  const [index, setIndex] = useState(start);
  return createElement(BuilderPreview, { pages, currentIndex: index, photos, albumSize: '8x8', onGoToPage: setIndex, onBack: vi.fn(), onOrder } as never);
}
const q = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const tap = (id: string) => act(() => { q(id)!.click(); });
const caption = () => q('preview-caption')?.textContent;
const render = (start = 0) => act(() => { root.render(createElement(Preview, { start })); });

describe('an upright phone', () => {
  it('nothing is turned sideways in code, and no "hold your phone sideways"', () => {
    render();
    const turned = [...host.querySelectorAll<HTMLElement>('*')].filter((el) => /rotate\(\s*90deg\)/.test(el.style.transform));
    expect(turned).toEqual([]);
    expect(q('preview-rotate-hint')).toBeNull();
    expect(host.textContent).not.toMatch(/Hold your phone sideways/);
  });

  it('opens on the cover, then ONE page at a time, turned in words under the book', () => {
    render();
    expect(q('preview-cover')).not.toBeNull();
    expect(q('preview-prev')).toBeNull(); // nothing before the cover
    expect(q('preview-next')!.textContent).toMatch(/Next page/);
    tap('preview-next');
    expect(q('preview-single-page')).not.toBeNull();
    expect(q('preview-gutter')).toBeNull(); // not the open book
    expect(caption()).toBe('Page 1 of 40');
    expect(q('preview-counter')!.textContent).toBe('1 / 40');
    tap('preview-next');
    expect(caption()).toBe('Page 2 of 40');
    expect(q('preview-prev')!.textContent).toMatch(/Previous page/);
    tap('preview-prev');
    tap('preview-prev');
    expect(q('preview-cover')).not.toBeNull();
  });

  it('each page shows the side it is bound on (pages pair 1–2: page 1 bound on its right)', () => {
    render(0);
    tap('preview-next'); // off the cover
    expect(q('preview-spine')!.dataset.spine).toBe('right');
    tap('preview-next');
    expect(q('preview-spine')!.dataset.spine).toBe('left');
  });

  it('the last page: the way forward is "Order this album", and it orders the ONE way (handleOrder)', () => {
    render(39); // opened at page 40 (the cover shows first only from page 1)
    expect(caption()).toBe('Page 40 of 40');
    expect(q('preview-next')).toBeNull();
    const order = q('preview-turn-order')!;
    expect(order.textContent).toMatch(/Order this album/);
    act(() => { order.click(); });
    // Straight to checkout, or first the "before you order" note with Order anyway.
    if (!onOrder.mock.calls.length) tap('order-not-ready-anyway');
    expect(onOrder).toHaveBeenCalledTimes(1);
  });

  it('a double tap on the last "Next page" turns ONE page: the second tap does not order', () => {
    vi.spyOn(performance, 'now').mockImplementation(() => 1_000_000);
    render(38); // page 39
    tap('preview-next'); // first tap: page 40
    expect(caption()).toBe('Page 40 of 40');
    tap('preview-turn-order'); // the second tap, the same instant, lands on "Order this album"
    expect(onOrder).not.toHaveBeenCalled();
    expect(q('order-not-ready')).toBeNull();
  });

  it('"See it as an open book": the two facing pages, fitted to the phone; "One page at a time" back', () => {
    render(0);
    tap('preview-next');
    tap('preview-next'); // page 2
    expect(q('preview-open-book')!.textContent).toMatch(/See it as an open book/);
    tap('preview-open-book');
    expect(q('preview-gutter')).not.toBeNull();
    expect(caption()).toBe('Pages 1–2 of 40');
    expect(q('preview-next')!.textContent).toMatch(/Next pages/);
    expect(q('spread-next')).toBeNull(); // still the turn under the book, not at the sides
    tap('preview-next');
    expect(caption()).toBe('Pages 3–4 of 40');
    tap('preview-open-book');
    expect(q('preview-single-page')).not.toBeNull();
  });

  it('a swipe across the page turns it, right to left forward, left to right back', () => {
    render(0);
    tap('preview-next');
    const stage = q('preview-stage')!;
    const swipe = (fromX: number, toX: number) => act(() => {
      stage.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: fromX, clientY: 400 }));
      stage.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: toX, clientY: 405 }));
    });
    swipe(300, 120);
    expect(caption()).toBe('Page 2 of 40');
    swipe(100, 300);
    expect(caption()).toBe('Page 1 of 40');
    swipe(200, 190); // a tap, not a turn
    expect(caption()).toBe('Page 1 of 40');
  });
});

describe('the phone really turned (a landscape screen)', () => {
  it('the open book with the turn at its sides, as on a computer', () => {
    h.portrait = false;
    render(0);
    act(() => { q('spread-next')!.click(); });
    expect(q('preview-gutter')).not.toBeNull();
    expect(caption()).toBe('Pages 1–2 of 40');
    expect(q('preview-turn')).toBeNull();
    expect(q('preview-open-book')).toBeNull();
  });
});
