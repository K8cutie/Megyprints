// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/* ══════════════════════════════════════════════════════════════════════════
   THE PAGE TURN IN THE PREVIEW (owner, 2026-10-09: "I'm going through the
   Megyprints preview but I don't feel the page turning action"). The preview
   swapped pages instantly. Now Next lifts the right page at the spine and
   lays it on the left; the page changes at once underneath, as before, so
   the caption, Megy and the end-of-album prompt never wait on an animation
   (the prompt waits for the last turn to land, so it doesn't cover it).
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({ ctx: null as unknown }));
vi.mock('./BuilderContext', () => ({ useBuilderContext: () => h.ctx }));
vi.mock('./CoverEditor', () => ({ default: () => null }));

import BuilderPreview from './BuilderPreview';
import type { AlbumPage } from './types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// Each photo's address names its page, so a face in the turn says which page it is.
const photos = Array.from({ length: 40 }, (_, i) => ({ id: `p${i}`, previewUrl: `https://photos.test/page-${i}.jpg`, name: `p${i}.jpg`, type: 'image/jpeg', size: 1, width: 1200, height: 1200 }));
const pages = Array.from({ length: 40 }, (_, i) => ({
  id: `page-${i}`, layout: 'single', size: '8x8', templateId: 't88-solo-square', slotFills: [i], photos: [], textElements: [],
  background: { type: 'solid', solid: '#FFFFFF' },
})) as unknown as AlbumPage[];
const coverFront = {
  id: 'cover-front', layout: 'freeform', size: '8x8', templateId: 'cover-plain', slotFills: [], photos: [],
  background: { type: 'solid', solid: '#1F2A44' },
  textElements: [{ id: 't', boxIndex: 0, text: 'Our Year', fontSize: 64, fontFamily: 'Georgia', color: '#FFFFFF', bold: true, italic: false, underline: false, alignment: 'center', x: 0, y: 0 }],
} as unknown as AlbumPage;

let host: HTMLDivElement;
let root: Root;
let reduceMotion = false;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] });
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  reduceMotion = false;
  window.matchMedia = ((q: string) => ({ matches: reduceMotion && q.includes('reduced-motion'), media: q, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
  h.ctx = {
    setBoxText: vi.fn(), updateTextElement: vi.fn(), setQrFill: vi.fn(), coverDesign: undefined, coverFront,
    finishBoxesWithQuotes: vi.fn(async () => ({ filled: 0, remaining: 0, heldBack: 0, noLine: 0 })), getAlbumId: () => 'album-1',
  };
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers(); });

function Preview({ start, turnAnimation }: { start: number; turnAnimation?: boolean }) {
  const [index, setIndex] = useState(start);
  return createElement(BuilderPreview, { pages, currentIndex: index, photos, albumSize: '8x8', onGoToPage: setIndex, onBack: vi.fn(), onOrder: vi.fn(), turnAnimation } as never);
}
const q = (sel: string) => host.querySelector(sel);
const tap = (id: string) => act(() => { (q(`[data-testid="${id}"]`) as HTMLButtonElement).click(); });
const caption = () => q('[data-testid="preview-caption"]')?.textContent;
/** Which page a part of the turn shows (by its photo), or 'blank'/'cover'. */
const shows = (el: Element | null | undefined) => {
  if (!el) return null;
  const src = el.querySelector('img')?.getAttribute('src') ?? '';
  const m = src.match(/page-(\d+)\.jpg/);
  if (m) return Number(m[1]);
  return el.textContent?.includes('Our Year') ? 'cover' : 'blank';
};
const leafFaces = () => [...(q('[data-turn-part="leaf"]')?.children ?? [])].filter((c) => c.tagName === 'DIV');
const frame = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
/** The turn starts on the next frames, then lands (its finish is timed from the start). */
const land = () => { frame(40); frame(1000); };

describe('Next turns the page', () => {
  it('the right page lifts at the spine and lands on the left; under it the old left page stays until it lands', () => {
    act(() => root.render(createElement(Preview, { start: 2, turnAnimation: true }))); // pages 3–4
    tap('spread-next');
    // The preview is already on 5–6 underneath.
    expect(caption()).toBe('Pages 5–6 of 40');
    expect(q('[data-testid="preview-page-turn"]')).not.toBeNull();
    expect(shows(q('[data-turn-part="patch"]'))).toBe(2); // page 3 still on the left
    const [front, back] = leafFaces();
    expect(shows(front)).toBe(3); // page 4 is the leaf…
    expect(shows(back)).toBe(4);  // …with page 5 on its back
    expect(q('[data-turn-part="leaf"]')!.getAttribute('data-turn-angle')).toBe('0');
    frame(40); // next frames: it turns
    expect(q('[data-turn-part="leaf"]')!.getAttribute('data-turn-angle')).toBe('-180');
    frame(900); // landed: just the new spread
    expect(q('[data-testid="preview-page-turn"]')).toBeNull();
    expect(caption()).toBe('Pages 5–6 of 40');
  });

  it('Previous turns the left page back over to the right', () => {
    act(() => root.render(createElement(Preview, { start: 4, turnAnimation: true }))); // pages 5–6
    tap('spread-prev');
    expect(caption()).toBe('Pages 3–4 of 40');
    expect(shows(q('[data-turn-part="patch"]'))).toBe(5); // page 6 stays on the right
    const [front, back] = leafFaces();
    expect(shows(front)).toBe(3);
    expect(shows(back)).toBe(4);
    expect(q('[data-turn-part="leaf"]')!.getAttribute('data-turn-angle')).toBe('-180');
    frame(40);
    expect(q('[data-turn-part="leaf"]')!.getAttribute('data-turn-angle')).toBe('0');
  });

  it('the cover swings open over an empty left side, and back shut', () => {
    act(() => root.render(createElement(Preview, { start: 0, turnAnimation: true })));
    expect(caption()).toBe('Front cover');
    tap('spread-next');
    expect(caption()).toBe('Pages 1–2 of 40');
    expect(q('[data-testid="preview-page-turn"]')!.getAttribute('data-turn-layout')).toBe('spread');
    expect(shows(leafFaces()[0])).toBe('cover');
    expect((q('[data-testid="preview-book"]') as HTMLElement).style.clipPath).toContain('50%');
    land();
    expect((q('[data-testid="preview-book"]') as HTMLElement).style.clipPath).toBe('');
    tap('spread-prev');
    expect(caption()).toBe('Front cover');
    expect(q('[data-testid="preview-page-turn"]')!.getAttribute('data-turn-layout')).toBe('closed');
    expect(shows(leafFaces()[0])).toBe('cover');
    expect(shows(q('[data-turn-part="patch"]'))).toBe(1); // page 2 until the cover lands on it
  });

  it('quick taps: each starts from where the book already is', () => {
    act(() => root.render(createElement(Preview, { start: 2, turnAnimation: true })));
    tap('spread-next'); tap('spread-next'); tap('spread-next');
    expect(caption()).toBe('Pages 9–10 of 40');
    expect(shows(q('[data-turn-part="patch"]'))).toBe(6); // the last turn: from 7–8
    land();
    expect(q('[data-testid="preview-page-turn"]')).toBeNull();
  });

  it('the end-of-album prompt waits for the last page to land', () => {
    act(() => root.render(createElement(Preview, { start: 36, turnAnimation: true }))); // pages 37–38
    tap('spread-next');
    expect(caption()).toBe('Pages 39–40 of 40');
    expect(q('[data-testid="end-prompt"]')).toBeNull();
    land();
    expect(q('[data-testid="end-prompt"]')).not.toBeNull();
  });

  it('a device that asks for reduced motion just changes the page, as before', () => {
    reduceMotion = true;
    act(() => root.render(createElement(Preview, { start: 2, turnAnimation: true })));
    tap('spread-next');
    expect(caption()).toBe('Pages 5–6 of 40');
    expect(q('[data-testid="preview-page-turn"]')).toBeNull();
  });

  it('the old page under the leaf is its own layer, so its photos and captions never show through the page that lands on it', () => {
    // Seen filming the turn: the old left page's photo and caption sat ABOVE
    // the leaf after it landed (their z-index escaped into the turn's layer).
    act(() => root.render(createElement(Preview, { start: 2, turnAnimation: true })));
    tap('spread-next');
    const patch = q('[data-turn-part="patch"]') as HTMLElement;
    expect(patch.style.isolation).toBe('isolate');
    for (const face of leafFaces()) expect((face as HTMLElement).style.isolation).toBe('isolate');
  });

  it('the turn never takes a tap meant for the page', () => {
    act(() => root.render(createElement(Preview, { start: 2, turnAnimation: true })));
    tap('spread-next');
    expect((q('[data-testid="preview-page-turn"]') as HTMLElement).style.pointerEvents).toBe('none');
  });
});
