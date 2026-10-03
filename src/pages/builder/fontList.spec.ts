// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FontList, FontSelect } from './FontList';
import { FONTS, fontName } from './fonts';

/* ══════════════════════════════════════════════════════════════════════════
   EVERY FONT NAME IS WRITTEN IN ITS OWN FONT — on the cover too (owner,
   2026-10-02: in the cover editor "the fonts don't look like how the fonts
   look … it's not like the text feature inside the pages"). The cover used a
   <select>; Android draws a <select>'s list in the system font, so all 27
   names looked the same. Both editors now show FontList.
   ══════════════════════════════════════════════════════════════════════════ */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

/** The face a family asks for first, e.g. '"Dancing Script", cursive' → Dancing Script. */
const face = (family: string) => family.split(',')[0].replace(/["']/g, '').trim();
const options = () => [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')];

describe('FontList', () => {
  it('shows all 27 fonts, each name in its own face', () => {
    act(() => root.render(createElement(FontList, { value: FONTS[6].family, onPick: () => {} })));
    const rows = options();
    expect(rows.map((r) => r.textContent?.trim())).toEqual(FONTS.map((f) => f.name));
    rows.forEach((r, i) => {
      const label = r.querySelector('span')!;
      expect(label.style.fontFamily).toContain(face(FONTS[i].family));
    });
  });

  it('marks the current font and hands back the family you tap', () => {
    const onPick = vi.fn();
    act(() => root.render(createElement(FontList, { value: FONTS[6].family, onPick })));
    expect(options().filter((r) => r.getAttribute('aria-selected') === 'true').map((r) => r.textContent?.trim())).toEqual(['Cinzel']);
    act(() => options().find((r) => r.textContent?.trim() === 'Dancing Script')!.click());
    expect(onPick).toHaveBeenCalledWith(FONTS.find((f) => f.name === 'Dancing Script')!.family);
  });
});

describe('FontSelect (the cover font box)', () => {
  const render = (value: string, onChange = vi.fn()) => {
    act(() => root.render(createElement(FontSelect, { value, onChange })));
    return { onChange, box: host.querySelector<HTMLButtonElement>('[data-testid="font-select"]')! };
  };

  it('the box shows the current font by name, in that font', () => {
    const { box } = render(FONTS[6].family);
    expect(box.textContent?.trim()).toBe('Cinzel');
    expect(box.querySelector('span')!.style.fontFamily).toContain('Cinzel');
    expect(options()).toHaveLength(0); // closed
  });

  it('tap → the same list, every name in its own face → pick → closes', () => {
    const { box, onChange } = render(FONTS[6].family);
    act(() => box.click());
    expect(box.getAttribute('aria-expanded')).toBe('true');
    const rows = options();
    expect(rows).toHaveLength(27);
    rows.forEach((r, i) => expect(r.querySelector('span')!.style.fontFamily).toContain(face(FONTS[i].family)));
    act(() => rows.find((r) => r.textContent?.trim() === 'Great Vibes')!.click());
    expect(onChange).toHaveBeenCalledWith(FONTS.find((f) => f.name === 'Great Vibes')!.family);
    expect(options()).toHaveLength(0);
  });

  it('closes without changing anything on Escape or a tap outside', () => {
    const { box, onChange } = render(FONTS[0].family);
    act(() => box.click());
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(options()).toHaveLength(0);
    act(() => box.click());
    const backdrop = document.querySelector<HTMLDivElement>('[data-testid="font-list"]')!.previousElementSibling as HTMLDivElement;
    act(() => backdrop.click());
    expect(options()).toHaveLength(0);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('names the font you have even when the stored string differs from the list', () => {
    // the cover / page default — not the list's exact string
    expect(fontName('"Playfair Display", serif')).toBe('Playfair');
    expect(fontName("'Dancing Script', cursive")).toBe('Dancing Script');
    expect(fontName('"Nope", serif')).toBe('Nope'); // never another font's name
  });

  it('ticks the matching font for a stored string that differs from the list', () => {
    act(() => root.render(createElement(FontList, { value: '"Playfair Display", serif', onPick: () => {} })));
    expect(options().filter((r) => r.getAttribute('aria-selected') === 'true').map((r) => r.textContent?.trim())).toEqual(['Playfair']);
  });
});

describe('both text editors pick fonts from FontList', () => {
  const src = (f: string) => readFileSync(resolve(__dirname, f), 'utf8');
  it('the cover editor uses FontSelect, not a <select>', () => {
    const s = src('CoverEditor.tsx');
    expect(s).toContain('<FontSelect');
    expect(s).not.toMatch(/<select[\s>]/);
  });
  it('the page text editor uses FontList', () => {
    expect(src('MobileTextEditor.tsx')).toContain('<FontList');
  });
});
