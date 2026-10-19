// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

/* ══════════════════════════════════════════════════════════════════════════
   MORE TEXT COLOURS (owner, 2026-10-11: "color selection on the cover page
   which is very limited i thought thats been dealt with apparently it
   hasnt"). A customer's "lack of font and color choices" (2026-10-08) got
   the fonts (74, #127) but the colours stayed at 7 on the phone and the
   cover. Now: the 28 from that day's sheet + Any color, ONE list in every
   text editor, and the 7 the app had are all still there.
   ══════════════════════════════════════════════════════════════════════════ */

import { TEXT_COLOR_GROUPS, TEXT_COLORS, TEXT_COLOR_HEXES, sameColor, textColorName, toColorInputValue } from './textColors';
import TextColorPicker from './TextColorPicker';
import MobileTextEditor from './MobileTextEditor';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });
const all = (id: string) => [...host.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
const one = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;

/** The 7 the phone and the cover offered before. */
const OLD_SEVEN = ['#2D2D2D', '#FFFFFF', '#E8A598', '#C9A24B', '#2E7D4A', '#3A6EA5', '#9B5DE5'];

describe('the text colours', () => {
  it('28, in the six families of the sheet the owner saw', () => {
    expect(TEXT_COLORS).toHaveLength(28);
    expect(TEXT_COLOR_GROUPS.map((g) => g.group)).toEqual(['Neutrals', 'Browns & golds', 'Reds & pinks', 'Oranges', 'Greens', 'Blues & purples']);
    for (const c of TEXT_COLORS) expect(c.hex).toMatch(/^#[0-9A-F]{6}$/);
    expect(new Set(TEXT_COLOR_HEXES.map((h) => h.toLowerCase())).size).toBe(28);
    expect(new Set(TEXT_COLORS.map((c) => c.name)).size).toBe(28);
  });

  it('the 7 the app had are all still there (a saved album\'s colour still shows as chosen)', () => {
    for (const hex of OLD_SEVEN) expect(textColorName(hex), hex).not.toBeNull();
  });

  it('the same colour however it was written', () => {
    expect(sameColor('#fff', '#FFFFFF')).toBe(true);
    expect(sameColor('#b85c38', '#B85C38')).toBe(true);
    expect(sameColor('#B85C38', '#B85C39')).toBe(false);
    expect(sameColor('', '#FFFFFF')).toBe(false);
    expect(textColorName('#b85c38')).toBe('Terracotta');
    expect(textColorName('#123456')).toBeNull();
    expect(toColorInputValue('#FFF')).toBe('#ffffff');
    expect(toColorInputValue('rgb(1,2,3)')).toBe('#2d2d2d'); // the picker only takes #rrggbb
  });
});

describe('TextColorPicker', () => {
  const show = (value: string) => {
    const onChange = vi.fn();
    const onPicked = vi.fn();
    act(() => root.render(createElement(TextColorPicker, { value, onChange, onPicked })));
    return { onChange, onPicked };
  };

  it('all 28 as swatches with their names, then "Any color" in words', () => {
    show('#2D2D2D');
    const swatches = all('text-color');
    expect(swatches).toHaveLength(28);
    expect(swatches.map((s) => s.getAttribute('aria-label'))).toEqual(TEXT_COLORS.map((c) => c.name));
    expect(one('text-color-any').textContent).toContain('Any color');
    expect(one('text-color-any').querySelector('input')!.getAttribute('type')).toBe('color');
  });

  it('the chosen one is ticked and named; a tap picks another', () => {
    const { onChange, onPicked } = show('#2d2d2d');
    expect(all('text-color').filter((s) => s.getAttribute('aria-checked') === 'true').map((s) => s.getAttribute('aria-label'))).toEqual(['Charcoal']);
    expect(one('text-color-name').textContent).toBe('Charcoal');
    const navy = all('text-color').find((s) => s.getAttribute('aria-label') === 'Navy')!;
    act(() => navy.click());
    expect(onChange).toHaveBeenCalledWith('#1F3A5F');
    expect(onPicked).toHaveBeenCalledTimes(1);
  });

  it('any other colour: Any color is the chosen one, and says "Your own color"', () => {
    const { onChange } = show('#123456');
    expect(all('text-color').some((s) => s.getAttribute('aria-checked') === 'true')).toBe(false);
    expect(one('text-color-name').textContent).toBe('Your own color');
    const input = one('text-color-any').querySelector('input')!;
    expect(input.value).toBe('#123456');
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(input, '#abcdef');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith('#abcdef');
  });

  it('every swatch is big enough to tap (36 px)', () => {
    show('#2D2D2D');
    for (const s of all('text-color')) expect(s.className).toMatch(/\bw-9\b.*\bh-9\b/);
  });
});

describe('text on a phone (MobileTextEditor)', () => {
  const initial = { text: 'Lola', fontSize: 28, fontFamily: 'Georgia, serif', color: '#2D2D2D', bold: false, italic: false, underline: false, alignment: 'center' as const };

  it('"Color" opens the 28 + Any color; a pick colours the text and closes them', () => {
    const onSave = vi.fn();
    act(() => root.render(createElement(MobileTextEditor, { initial, onSave, onClose: () => {} })));
    expect(all('text-color')).toHaveLength(0); // not crowding the bar
    act(() => one('text-color-open').click());
    expect(all('text-color')).toHaveLength(28);
    const plum = all('text-color').find((s) => s.getAttribute('aria-label') === 'Plum')!;
    act(() => plum.click());
    expect(one('text-color-panel' as string)).toBeNull();
    expect(host.querySelector('textarea')!.style.color).toBe('rgb(106, 44, 112)');
    const done = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Done'))!;
    act(() => done.click());
    expect(onSave.mock.calls[0][0].color).toBe('#6A2C70');
  });
});

describe('ONE list in every text editor', () => {
  const SRC = resolve(__dirname, '../..');
  const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

  it('the cover title and the phone use the picker; desktop\'s presets are the same list', () => {
    expect(read('pages/builder/CoverEditor.tsx')).toMatch(/<TextColorPicker value=\{title\.color\}/);
    expect(read('pages/builder/MobileTextEditor.tsx')).toMatch(/<TextColorPicker value=\{color\}/);
    expect(read('pages/builder/PropertiesPanel.tsx')).toMatch(/const COLOR_PRESETS = TEXT_COLOR_HEXES;/);
    expect(read('assistant/MegyAssistant.tsx')).toMatch(/const COLOR_PRESETS = TEXT_COLOR_HEXES;/);
  });

  it('no old short colour list is left anywhere', () => {
    const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = join(dir, e.name);
      return e.isDirectory() ? files(p) : /\.(ts|tsx)$/.test(e.name) && !/\.spec\.ts$/.test(e.name) ? [p] : [];
    });
    const offenders = files(SRC).filter((f) => {
      const s = readFileSync(f, 'utf8');
      return s.includes("'#2D2D2D', '#FFFFFF', '#E8A598'") || s.includes("'#2D2D2D', '#FFFFFF', '#F4C2A1'");
    }).map((f) => relative(SRC, f));
    expect(offenders).toEqual([]);
  });
});
