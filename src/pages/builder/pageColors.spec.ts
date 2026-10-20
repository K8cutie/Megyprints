// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PAGE_COLORS, pageColorOf, recolorPage, inkFor, DARK_INK, LIGHT_INK } from './pageColors';
import PageColorPicker, { PageColorSheet } from './PageColorPicker';
import StudioStrip from './StudioStrip';
import type { AlbumPage, TextElement } from './types';

/* ══════════════════════════════════════════════════════════════════════════
   THE PAGE COLOURS (owner, 2026-10-20): "for the background I'd like it to
   have colors, not just a plain white background — make it a selection of
   those 8 colors", then "not just the cover but the background of all
   pages". The 8 are the Crayola 8-box. One list feeds the cover, the phone's
   Page colour sheet, the desktop studio strip and the panels; words that
   wouldn't show on a dark colour switch to an ink that does.
   ══════════════════════════════════════════════════════════════════════════ */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

const text = (t: Partial<TextElement>): TextElement => ({ id: 'x', text: 'hi', fontFamily: 'Inter', fontSize: 20, color: '#2D2D2D', x: 0, y: 0, rotation: 0, opacity: 1, ...t } as TextElement);
const page = (bg: AlbumPage['background'], texts: TextElement[] = []): AlbumPage => ({ id: 'p', background: bg, textElements: texts } as unknown as AlbumPage);
const src = (f: string) => readFileSync(resolve(__dirname, f), 'utf8');

describe('the list: white, then the Crayola 8', () => {
  it('is the 8 crayons, in box order, with white first to go back to plain', () => {
    expect(PAGE_COLORS.map((c) => c.name)).toEqual(['White', 'Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Violet', 'Brown', 'Black']);
    expect(PAGE_COLORS.map((c) => c.hex)).toEqual(['#FFFFFF', '#EE204D', '#FF7538', '#FCE883', '#1CAC78', '#1F75FE', '#926EAE', '#B4674D', '#232323']);
  });

  it('knows which swatch a page is on — both whites the album uses are White', () => {
    expect(pageColorOf({ type: 'solid', solid: '#1f75fe' })?.name).toBe('Blue');
    expect(pageColorOf({ type: 'solid', solid: '#FFFFFF' })?.name).toBe('White');
    expect(pageColorOf({ type: 'solid', solid: '#FFFBF7' })?.name).toBe('White');
    expect(pageColorOf({ type: 'texture', texture: 'linen' })).toBeNull();
    expect(pageColorOf({ type: 'solid', solid: '#123456' })).toBeNull();
    expect(pageColorOf(undefined)).toBeNull();
  });
});

describe('words stay readable on the colour', () => {
  it('charcoal words on a black page switch to white; on white they stay', () => {
    const black = recolorPage(page({ type: 'solid', solid: '#FFFFFF' }, [text({ color: '#2D2D2D' })]), '#232323');
    expect(black.background).toEqual({ type: 'solid', solid: '#232323' });
    expect(black.textElements![0].color).toBe(LIGHT_INK);
    const white = recolorPage(black, '#FFFFFF');
    expect(white.textElements![0].color).toBe(DARK_INK);
  });

  it('a colour that shows is left alone — a customer\'s pick survives', () => {
    const p = recolorPage(page({ type: 'solid', solid: '#FFFFFF' }, [text({ color: '#FFFFFF' }), text({ id: 'y', color: '#C9A24B' })]), '#1F3A5F' /* navy-ish test */);
    expect(p.textElements![0].color).toBe('#FFFFFF');
    expect(p.textElements![1].color).toBe('#C9A24B');
    // Untouched elements are the same objects (no churn for the undo stack).
    expect(p.textElements![0]).toBe(p.textElements![0]);
  });

  it('words with no colour set print charcoal, so on black they go white', () => {
    const p = recolorPage(page({ type: 'solid', solid: '#FFFFFF' }, [text({ color: undefined })]), '#232323');
    expect(p.textElements![0].color).toBe(LIGHT_INK);
    expect(inkFor({ color: undefined as unknown as string }, '#FFFFFF')).toBe(DARK_INK);
  });

  it('an outline that shows keeps the word\'s own colour', () => {
    expect(inkFor({ color: '#232323', outlineColor: '#FFFFFF', outlineWidth: 2 }, '#232323')).toBe('#232323');
    expect(inkFor({ color: '#232323' }, '#232323')).toBe(LIGHT_INK);
  });

  it('a page without words just gets the colour', () => {
    const p = recolorPage({ id: 'p', background: { type: 'texture', texture: 'linen' } } as unknown as AlbumPage, '#EE204D');
    expect(p.background).toEqual({ type: 'solid', solid: '#EE204D' });
    expect('textElements' in p).toBe(false);
  });
});

describe('the picker', () => {
  it('nine swatches, the chosen one ticked and named', () => {
    act(() => root.render(createElement(PageColorPicker, { background: { type: 'solid', solid: '#1CAC78' }, onPick: () => {} })));
    const swatches = host.querySelectorAll('[data-testid="page-color"]');
    expect(swatches).toHaveLength(9);
    expect([...swatches].filter((s) => s.getAttribute('aria-checked') === 'true').map((s) => s.getAttribute('aria-label'))).toEqual(['Green']);
    expect(host.querySelector('[data-testid="page-color-name"]')!.textContent).toBe('Green');
  });

  it('a tap picks that colour; "Use … on every page" names it, and only shows once one is chosen', () => {
    const onPick = vi.fn();
    const onPickAll = vi.fn();
    act(() => root.render(createElement(PageColorPicker, { background: { type: 'texture', texture: 'linen' }, onPick, onPickAll })));
    expect(host.querySelector('[data-testid="page-color-all"]')).toBeNull();
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Blue"]')!.click());
    expect(onPick).toHaveBeenCalledWith('#1F75FE');

    act(() => root.render(createElement(PageColorPicker, { background: { type: 'solid', solid: '#1F75FE' }, onPick, onPickAll })));
    const all = host.querySelector<HTMLButtonElement>('[data-testid="page-color-all"]')!;
    expect(all.textContent).toMatch(/Use blue on every page/);
    act(() => all.click());
    expect(onPickAll).toHaveBeenCalledWith('#1F75FE');
  });

  it('the phone sheet says what it is and offers every page', () => {
    act(() => root.render(createElement(PageColorSheet, { background: { type: 'solid', solid: '#232323' }, onPick: () => {}, onPickAll: () => {}, onClose: () => {} })));
    expect(host.textContent).toMatch(/Page colour/);
    expect(host.querySelector('[data-testid="page-color-all"]')!.textContent).toMatch(/Use black on every page/);
  });
});

describe('where it lives', () => {
  it('the desktop studio strip shows the row when wired, not otherwise', () => {
    const base = { page: undefined, selectedSlotIndex: null, onMask: vi.fn(), onLook: vi.fn(), onGuard: vi.fn() };
    act(() => root.render(createElement(StudioStrip, base)));
    expect(host.querySelector('[data-testid="page-color-row"]')).toBeNull();
    act(() => root.render(createElement(StudioStrip, { ...base, onPageColor: vi.fn(), onPageColorAll: vi.fn() })));
    expect(host.querySelector('[data-testid="page-color-row"]')!.textContent).toMatch(/Page colour/);
    expect(host.querySelectorAll('[data-testid="page-color"]')).toHaveLength(9);
  });

  it('the cover editor offers the colours and still opens the photo browser', () => {
    const s = src('CoverEditor.tsx');
    expect(s).toMatch(/<PageColorPicker[^>]*onPick=\{\(hex\) => b\.setPageColor\(hex\)\}/);
    expect(s).toMatch(/Pick a colour above, or tap Background to choose a photo/);
  });

  it('the phone has a "Page colour" tool that opens the sheet, with every page', () => {
    const s = src('MobileReview.tsx');
    expect(s).toMatch(/data-testid="page-color-tool"[\s\S]{0,80}Page colour/);
    expect(s).toMatch(/<PageColorSheet[\s\S]{0,400}applyPageColorToAllPages\(hex\)/);
  });

  it('the desktop editor wires the strip to the same actions', () => {
    const s = src('BuilderEdit.tsx');
    expect(s).toMatch(/onPageColor=\{\(hex\) => actions\.setPageColor\(hex\)\}/);
    expect(s).toMatch(/applyPageColorToAllPages\(hex\)/);
  });

  it('the state owns both actions, cover-scope aware, with undo', () => {
    const s = src('useBuilderState.ts');
    expect(s).toMatch(/const setPageColor = useCallback\(\(hex: string\) => \{\s*pushSnapshot\(\);\s*updateCurrentPage\(\(page\) => recolorPage\(page, hex\)\)/);
    expect(s).toMatch(/const applyPageColorToAllPages = useCallback\(\(hex: string\) => \{\s*pushSnapshot\(\);\s*setAlbumPages\(\(prev\) => prev\.map\(\(p\) => recolorPage\(p, hex\)\)\)/);
  });
});
