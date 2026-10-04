// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* ══════════════════════════════════════════════════════════════════════════
   THE PREVIEW SHOWS THE COVER (1-star testers, 2026-10-04, the Perfectionist:
   Step 3 says "you can revisit the cover any time from the Preview screen",
   but the preview opened on Pages 1–2 with no cover, no Previous and no cover
   button, and checkout never showed it either — "I paid without ever seeing
   the finished front of the book"). It now opens on the closed book's front
   cover, "Next" opens pages 1–2, "Previous" from there comes back, and "Edit
   cover" opens the cover editor.
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({ ctx: null as unknown }));
vi.mock('./BuilderContext', () => ({ useBuilderContext: () => h.ctx }));
vi.mock('./CoverEditor', () => ({ default: () => createElement('div', { 'data-testid': 'cover-editor-open' }) }));

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
  textElements: [{ id: 't', boxIndex: 0, text: 'Hong Kong, Exactly Right', fontSize: 64, fontFamily: 'Georgia', color: '#FFFFFF', bold: true, italic: false, underline: false, alignment: 'center', x: 0, y: 0 }],
} as unknown as AlbumPage;

const context = (cover: AlbumPage | undefined) => ({
  setBoxText: vi.fn(), updateTextElement: vi.fn(), setQrFill: vi.fn(), coverDesign: undefined, coverFront: cover,
  finishBoxesWithQuotes: vi.fn(async () => ({ filled: 0, remaining: 0, heldBack: 0, noLine: 0 })), getAlbumId: () => 'album-1',
});

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

function Preview({ start }: { start: number }) {
  const [index, setIndex] = useState(start);
  return createElement('div', null,
    createElement('span', { 'data-testid': 'at' }, String(index)),
    createElement(BuilderPreview, { pages, currentIndex: index, photos, albumSize: '8x8', onGoToPage: setIndex, onBack: vi.fn(), onOrder: vi.fn() } as never));
}
const q = (id: string) => host.querySelector(`[data-testid="${id}"]`);
const tap = (id: string) => act(() => { (q(id) as HTMLButtonElement).click(); });
const caption = () => q('preview-caption')?.textContent;

describe('the preview opens on the cover', () => {
  it('cover first; Next → pages 1–2; Previous → the cover again', () => {
    h.ctx = context(coverFront);
    act(() => root.render(createElement(Preview, { start: 0 })));
    expect(q('preview-cover')).not.toBeNull();
    expect(caption()).toBe('Front cover');
    expect(q('spread-prev')).toBeNull(); // nothing before the cover
    expect(host.textContent).toContain('Hong Kong, Exactly Right'); // the cover as it prints

    tap('spread-next');
    expect(q('preview-cover')).toBeNull();
    expect(caption()).toBe('Pages 1–2 of 40');

    tap('spread-prev');
    expect(q('preview-cover')).not.toBeNull();
    expect(caption()).toBe('Front cover');
  });

  it('"Edit cover" opens the cover editor', () => {
    h.ctx = context(coverFront);
    act(() => root.render(createElement(Preview, { start: 0 })));
    expect(q('cover-editor-open')).toBeNull();
    tap('preview-edit-cover');
    expect(q('cover-editor-open')).not.toBeNull();
  });

  it('opened on a later page, it shows that page (and the cover is still one Previous away from 1–2)', () => {
    h.ctx = context(coverFront);
    act(() => root.render(createElement(Preview, { start: 10 })));
    expect(q('preview-cover')).toBeNull();
    expect(caption()).toBe('Pages 11–12 of 40');
    for (let i = 0; i < 5; i++) tap('spread-prev');
    expect(caption()).toBe('Pages 1–2 of 40');
    tap('spread-prev');
    expect(caption()).toBe('Front cover');
  });

  it('an old draft with no cover page opens on pages 1–2 with no Previous, as before', () => {
    h.ctx = context(undefined);
    act(() => root.render(createElement(Preview, { start: 0 })));
    expect(q('preview-cover')).toBeNull();
    expect(caption()).toBe('Pages 1–2 of 40');
    expect(q('spread-prev')).toBeNull();
  });
});

describe('checkout shows the cover (source guard)', () => {
  it('the order summary renders the front cover from the print job', () => {
    const src = readFileSync(resolve(__dirname, '../Order.tsx'), 'utf8');
    expect(src).toMatch(/cover: j\.coverFront \? \{ page: j\.coverFront, photos: j\.photos \} : undefined/);
    expect(src).toMatch(/<CoverThumb page=\{info\.cover\.page\} photos=\{info\.cover\.photos\} albumSize=\{albumSize\} \/>/);
    expect(src).toMatch(/const CoverThumb = lazy\(\(\) => import\('\.\/builder\/CoverThumb'\)\);/);
  });
});
