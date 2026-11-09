// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PAGE_COLORS, PAGE_COLOR_GROUPS, PAGE_GRADIENTS, colorAt, gradientPage, pageColorOf, pageFillOf, pageFillOfKey, recolorPage, inkFor, DARK_INK, LIGHT_INK } from './pageColors';
import { TEXT_COLORS } from './textColors';
import { mixColors } from './colorGradients';
import PageColorPicker, { PageColorSheet } from './PageColorPicker';
import StudioStrip from './StudioStrip';
import type { AlbumPage, TextElement } from './types';

/* ══════════════════════════════════════════════════════════════════════════
   THE PAGE COLOURS (owner, 2026-10-20): "for the background I'd like it to
   have colors, not just a plain white background — make it a selection of
   those 8 colors", then "not just the cover but the background of all
   pages". Owner, 2026-11-08: "make it have the same color palette as the
   fonts. The add gradients also": the words' 28, then 12 gradients. One list feeds the cover, the phone's
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

describe('the list: the words\' 28 colours, then 12 gradients (owner, 2026-11-08)', () => {
  it('is the same 28 colours as the words, in the same families', () => {
    expect(PAGE_COLORS.map((c) => c.name)).toEqual(TEXT_COLORS.map((c) => c.name));
    expect(PAGE_COLORS.map((c) => c.hex)).toEqual(TEXT_COLORS.map((c) => c.hex));
    expect(PAGE_COLOR_GROUPS.map((g) => g.group)).toEqual(['Neutrals', 'Browns & golds', 'Reds & pinks', 'Oranges', 'Greens', 'Blues & purples']);
  });

  it('knows which swatch a page is on — both whites the album uses are White', () => {
    expect(pageColorOf({ type: 'solid', solid: '#3a6ea5' })?.name).toBe('Blue');
    expect(pageColorOf({ type: 'solid', solid: '#FFFFFF' })?.name).toBe('White');
    expect(pageColorOf({ type: 'solid', solid: '#FFFBF7' })?.name).toBe('White');
    expect(pageColorOf({ type: 'texture', texture: 'linen' })).toBeNull();
    expect(pageColorOf({ type: 'solid', solid: '#123456' })).toBeNull();
    expect(pageColorOf(undefined)).toBeNull();
  });

  it('12 gradients, each from two of the words\' colours, top to bottom, named by a key', () => {
    expect(PAGE_GRADIENTS).toHaveLength(12);
    const hexes = TEXT_COLORS.map((c) => c.hex);
    for (const f of PAGE_GRADIENTS) {
      expect(hexes).toContain(f.gradient!.top);
      expect(hexes).toContain(f.gradient!.bottom);
      expect(f.key).toBe(`gradient:${f.gradient!.id}`);
      expect(f.background).toEqual(gradientPage(f.gradient!));
      expect(pageFillOf(f.background)?.key).toBe(f.key); // a page in it shows it chosen
      expect(pageFillOfKey(f.key)?.name).toBe(f.name);
    }
    expect(gradientPage({ top: '#111111', bottom: '#222222' })).toEqual({ type: 'gradient', gradient: { type: 'linear', angle: 180, stops: [{ offset: 0, color: '#111111' }, { offset: 1, color: '#222222' }] } });
    // another gradient (an older album's) is no swatch
    expect(pageFillOf({ type: 'gradient', gradient: { type: 'linear', angle: 135, stops: [{ offset: 0, color: '#F07F5F' }, { offset: 1, color: '#F48FB1' }] } })).toBeNull();
    // a colour that left the list (the old Crayola red) still names itself
    expect(pageFillOfKey('#EE204D')?.background).toEqual({ type: 'solid', solid: '#EE204D' });
    expect(pageFillOfKey('gradient:nope')).toBeNull();
    expect(pageFillOfKey('nonsense')).toBeNull();
  });
});

describe('the colour behind the words (colorAt)', () => {
  const ocean = gradientPage({ top: '#6FA8DC', bottom: '#1F3A5F' });
  it('a plain page is its colour everywhere; a gradient fades top to bottom', () => {
    expect(colorAt({ type: 'solid', solid: '#C62828' }, 0.2, 0.9)).toBe('#C62828');
    expect(colorAt(ocean, 0.5, 0)).toBe('#6FA8DC');
    expect(colorAt(ocean, 0.1, 1)).toBe('#1F3A5F');
    expect(colorAt(ocean, 0.9, 0.5)).toBe(mixColors('#6FA8DC', '#1F3A5F', 0.5));
  });
  it('other angles and a radial wash (older albums), as CSS draws them', () => {
    const across = { type: 'gradient', gradient: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#000000' }, { offset: 1, color: '#FFFFFF' }] } } as const;
    expect(colorAt(across as never, 0, 0.3)).toBe('#000000');
    expect(colorAt(across as never, 1, 0.3)).toBe('#FFFFFF');
    const round = { type: 'gradient', gradient: { type: 'radial', angle: 0, stops: [{ offset: 0, color: '#FFFFFF' }, { offset: 1, color: '#000000' }] } } as const;
    expect(colorAt(round as never, 0.5, 0.5)).toBe('#FFFFFF');
    expect(colorAt(round as never, 0, 0)).toBe('#000000');
  });
});

describe('on a gradient, each word is judged where it sits', () => {
  const OCEAN = 'gradient:ocean'; // sky blue at the top, navy at the bottom
  const words = (over: Partial<TextElement>) => text({ color: '#2D2D2D', ...over });
  it('a caption box at the top keeps charcoal (it reads on the sky); one at the bottom turns white (on the navy)', () => {
    const top = recolorPage({ ...page({ type: 'solid', solid: '#FFFFFF' }, [words({ boxIndex: 0 })]), templateId: 'tile-title-banner-8x8', size: '8x8' } as AlbumPage, OCEAN);
    expect(top.textElements![0].color).toBe('#2D2D2D');
    const bottom = recolorPage({ ...page({ type: 'solid', solid: '#FFFFFF' }, [words({ boxIndex: 0 })]), templateId: 'tile-banner-cap-8x8', size: '8x8' } as AlbumPage, OCEAN);
    expect(bottom.textElements![0].color).toBe(LIGHT_INK);
    expect(bottom.background).toEqual(gradientPage({ top: '#6FA8DC', bottom: '#1F3A5F' }));
  });
  it('a free title is judged at its own height on the page', () => {
    const high = recolorPage({ ...page({ type: 'solid', solid: '#FFFFFF' }, [words({ x: 100, y: 20, width: 500 })]), size: '8x8' } as AlbumPage, OCEAN);
    expect(high.textElements![0].color).toBe('#2D2D2D');
    const low = recolorPage({ ...page({ type: 'solid', solid: '#FFFFFF' }, [words({ x: 100, y: 690, width: 500 })]), size: '8x8' } as AlbumPage, OCEAN);
    expect(low.textElements![0].color).toBe(LIGHT_INK);
  });
  it('two-colour words stay as they are while both colours show; else they become one clean ink (never half a fade)', () => {
    const plum = { color: '#9B5DE5', fillTo: '#6A2C70' }; // the Plum night gradient
    const onCream = recolorPage({ ...page({ type: 'solid', solid: '#FFFFFF' }, [words({ ...plum, boxIndex: 0 })]), templateId: 'tile-title-banner-8x8', size: '8x8' } as AlbumPage, 'gradient:cream-blush');
    expect(onCream.textElements![0]).toMatchObject(plum);
    const onBlack = recolorPage({ ...page({ type: 'solid', solid: '#FFFFFF' }, [words({ ...plum, boxIndex: 0 })]), templateId: 'tile-title-banner-8x8', size: '8x8' } as AlbumPage, '#1A1A1A');
    expect(onBlack.textElements![0].color).toBe(LIGHT_INK);
    expect(onBlack.textElements![0].fillTo).toBeUndefined();
  });

  it('words placed on a photo (Add text) keep their colour: they sit on the photo, not the page', () => {
    const p = recolorPage({ ...page({ type: 'solid', solid: '#FFFFFF' }, [words({ color: '#FFFFFF', placed: true, boxIndex: undefined, x: 100, y: 100 })]), size: '8x8' } as AlbumPage, '#FFFFFF');
    expect(p.textElements![0].color).toBe('#FFFFFF');
  });
  it('words in a photo frame (a quote) switch too when they would not show', () => {
    const p = recolorPage({ ...page({ type: 'solid', solid: '#FFFFFF' }, []), templateId: 't88-fb-quad-grid-gap', size: '8x8', slotTexts: [{ text: 'Home', color: '#2D2D2D' }, null] } as unknown as AlbumPage, '#1A1A1A');
    expect(p.slotTexts![0]!.color).toBe(LIGHT_INK);
    expect(p.slotTexts![1]).toBeNull();
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
  it('28 colours and 12 gradients, the chosen one ticked and named', () => {
    act(() => root.render(createElement(PageColorPicker, { background: { type: 'solid', solid: '#2E7D4A' }, onPick: () => {} })));
    expect(host.querySelectorAll('[data-testid="page-color"]')).toHaveLength(28);
    expect(host.querySelectorAll('[data-testid="page-gradient"]')).toHaveLength(12);
    const ticked = () => [...host.querySelectorAll('[role="radio"]')].filter((s) => s.getAttribute('aria-checked') === 'true').map((s) => s.getAttribute('aria-label'));
    expect(ticked()).toEqual(['Forest']);
    expect(host.querySelector('[data-testid="page-color-name"]')!.textContent).toBe('Forest');
    // a gradient page: that gradient ticked and named
    act(() => root.render(createElement(PageColorPicker, { background: gradientPage({ top: '#6FA8DC', bottom: '#1F3A5F' }), onPick: () => {} })));
    expect(ticked()).toEqual(['Ocean']);
    expect(host.querySelector('[data-testid="page-color-name"]')!.textContent).toBe('Ocean');
  });

  it('a tap picks that colour; "Use … on every page" names it, and only shows once one is chosen', () => {
    const onPick = vi.fn();
    const onPickAll = vi.fn();
    act(() => root.render(createElement(PageColorPicker, { background: { type: 'texture', texture: 'linen' }, onPick, onPickAll })));
    expect(host.querySelector('[data-testid="page-color-all"]')).toBeNull();
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Blue"]')!.click());
    expect(onPick).toHaveBeenCalledWith('#3A6EA5');
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Peach sunset"]')!.click());
    expect(onPick).toHaveBeenCalledWith('gradient:peach-sunset');

    act(() => root.render(createElement(PageColorPicker, { background: { type: 'solid', solid: '#3A6EA5' }, onPick, onPickAll })));
    const all = host.querySelector<HTMLButtonElement>('[data-testid="page-color-all"]')!;
    expect(all.textContent).toMatch(/Use blue on every page/);
    act(() => all.click());
    expect(onPickAll).toHaveBeenCalledWith('#3A6EA5');
    act(() => root.render(createElement(PageColorPicker, { background: gradientPage({ top: '#F07F5F', bottom: '#F48FB1' }), onPick, onPickAll })));
    expect(host.querySelector('[data-testid="page-color-all"]')!.textContent).toMatch(/Use peach sunset on every page/);
    act(() => host.querySelector<HTMLButtonElement>('[data-testid="page-color-all"]')!.click());
    expect(onPickAll).toHaveBeenCalledWith('gradient:peach-sunset');
  });

  it('the phone sheet says what it is and offers every page', () => {
    act(() => root.render(createElement(PageColorSheet, { background: { type: 'solid', solid: '#1A1A1A' }, onPick: () => {}, onPickAll: () => {}, onClose: () => {} })));
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
    expect(host.querySelectorAll('[data-testid="page-color"]')).toHaveLength(28);
    expect(host.querySelectorAll('[data-testid="page-gradient"]')).toHaveLength(12);
  });

  it('the cover editor offers the colours and still opens the photo browser', () => {
    const s = src('CoverEditor.tsx');
    expect(s).toMatch(/<PageColorPicker[^>]*onPick=\{\(hex\) => b\.setPageColor\(hex\)\}[^>]*onPickAll=\{\(hex\) => b\.applyPageColorToAllPages\(hex\)\}/);
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
    expect(s).toMatch(/const applyPageColorToAllPages = useCallback\(\(hex: string\) => \{\s*pushSnapshot\(\);\s*setAlbumPages\(\(prev\) => prev\.map\(\(p\) => recolorPage\(p, hex\)\)\);\s*setCoverFrontPage\(\(p\) => recolorPage\(p, hex\)\)/);
  });
});
