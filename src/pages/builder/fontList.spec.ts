// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FontList, FontSelect } from './FontList';
import { FONTS, FONT_GROUPS, fontName, fontFace, DEFAULT_TEXT_FONT, DEFAULT_TITLE_FONT, loadFontFaces } from './fonts';

/* ══════════════════════════════════════════════════════════════════════════
   EVERY FONT NAME IS WRITTEN IN ITS OWN FONT — on the cover too (owner,
   2026-10-02: in the cover editor "the fonts don't look like how the fonts
   look … it's not like the text feature inside the pages"). The cover used a
   <select>; Android draws a <select>'s list in the system font, so all 27
   names looked the same. Both editors now show FontList.

   MORE FONTS, ONE LIST (owner, 2026-10-08, after a customer comment about the
   "lack of font and color choices": "how many fonts currently and how many
   fonts after the change. I ask you to add more fonts"). The phone and cover
   had 27, desktop its own 31 — no screen showed more than 31. Now every
   editor offers the same 74, grouped by mood.
   ══════════════════════════════════════════════════════════════════════════ */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

const options = () => [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')];
const src = (f: string) => readFileSync(resolve(__dirname, f), 'utf8');
const ORIGINAL_27 = ['Georgia', 'Playfair', 'Lora', 'Merriweather', 'Cormorant', 'Baskerville', 'Cinzel', 'Yeseva One', 'Abril Fatface', 'DM Sans', 'Montserrat', 'Poppins', 'Raleway', 'Nunito', 'Quicksand', 'Work Sans', 'Fredoka', 'Dancing Script', 'Pacifico', 'Caveat', 'Great Vibes', 'Sacramento', 'Parisienne', 'Pinyon Script', 'Lobster', 'Shrikhand', 'Bebas Neue'];

describe('the font list', () => {
  it('is 74 fonts, every name and face once, the original 27 all still there', () => {
    expect(FONTS).toHaveLength(74);
    expect(new Set(FONTS.map((f) => f.name)).size).toBe(74);
    expect(new Set(FONTS.map((f) => fontFace(f.family).toLowerCase())).size).toBe(74);
    for (const n of ORIGINAL_27) expect(FONTS.some((f) => f.name === n), n).toBe(true);
    // what desktop offered (minus system fonts that don't exist on phones)
    for (const n of ['Inter', 'Open Sans', 'Lato', 'Source Sans', 'Outfit', 'Crimson Text', 'Satisfy', 'Amatic SC', 'Righteous']) expect(FONTS.some((f) => f.name === n), n).toBe(true);
  });

  it('every font sits in one of the seven groups, and every group has fonts', () => {
    expect(FONT_GROUPS.map((g) => g.label)).toEqual(['Elegant serif', 'Script', 'Handwriting', 'Clean & modern', 'Fun & kids', 'Bold headline', 'Typewriter']);
    for (const f of FONTS) expect(FONT_GROUPS.some((g) => g.id === f.group), f.name).toBe(true);
    for (const g of FONT_GROUPS) expect(FONTS.filter((f) => f.group === g.id).length, g.label).toBeGreaterThan(0);
  });

  it('the defaults did not move: new page text in Georgia, a new cover title in Cinzel', () => {
    expect(fontName(DEFAULT_TEXT_FONT)).toBe('Georgia');
    expect(fontName(DEFAULT_TITLE_FONT)).toBe('Cinzel');
    // the old positional picks would now land elsewhere — nothing may use them
    for (const f of ['CoverEditor.tsx', 'useBuilderState.ts', 'MobileTextEditor.tsx']) expect(src(f), f).not.toMatch(/FONTS\[\d+\]/);
  });

  it('every web font is actually loaded by the app (index.html links or index.css)', () => {
    const loaded = (readFileSync(resolve(__dirname, '../../../index.html'), 'utf8') + readFileSync(resolve(__dirname, '../../index.css'), 'utf8'))
      .match(/family=[^&"')]+/g)!.map((s) => decodeURIComponent(s.slice(7).split(':')[0]).replace(/\+/g, ' ').toLowerCase());
    for (const f of FONTS) {
      const face = fontFace(f.family);
      if (face === 'Georgia') continue; // a system font
      expect(loaded, `${f.name} (${face}) is never loaded`).toContain(face.toLowerCase());
    }
  });
});

describe('FontList', () => {
  it('shows all 74 under their group headings, each name in its own face', () => {
    act(() => root.render(createElement(FontList, { value: DEFAULT_TITLE_FONT, onPick: () => {} })));
    const rows = options();
    expect(rows).toHaveLength(74);
    // grouped order: each group's fonts under its heading
    const expected = FONT_GROUPS.flatMap((g) => FONTS.filter((f) => f.group === g.id).map((f) => f.name));
    expect(rows.map((r) => r.textContent?.trim())).toEqual(expected);
    for (const r of rows) {
      const f = FONTS.find((x) => x.name === r.textContent?.trim())!;
      expect(r.querySelector('span')!.style.fontFamily).toContain(fontFace(f.family));
      expect(r.closest('[role="group"]')!.getAttribute('aria-label')).toBe(FONT_GROUPS.find((g) => g.id === f.group)!.label);
    }
    expect([...host.querySelectorAll('[data-font-group]')].map((h) => h.textContent)).toEqual(FONT_GROUPS.map((g) => g.label));
  });

  it('a row draws only once it scrolls near view (so opening the list doesn\'t fetch 74 fonts)', () => {
    act(() => root.render(createElement(FontList, { value: DEFAULT_TITLE_FONT, onPick: () => {} })));
    for (const r of options()) expect(r.style.contentVisibility).toBe('auto');
  });

  it('marks the current font and hands back the family you tap — old and new fonts alike', () => {
    const onPick = vi.fn();
    act(() => root.render(createElement(FontList, { value: DEFAULT_TITLE_FONT, onPick })));
    expect(options().filter((r) => r.getAttribute('aria-selected') === 'true').map((r) => r.textContent?.trim())).toEqual(['Cinzel']);
    act(() => options().find((r) => r.textContent?.trim() === 'Dancing Script')!.click());
    act(() => options().find((r) => r.textContent?.trim() === 'Alex Brush')!.click());
    expect(onPick.mock.calls).toEqual([[FONTS.find((f) => f.name === 'Dancing Script')!.family], [FONTS.find((f) => f.name === 'Alex Brush')!.family]]);
  });
});

describe('FontSelect (the cover font box)', () => {
  const render = (value: string, onChange = vi.fn()) => {
    act(() => root.render(createElement(FontSelect, { value, onChange })));
    return { onChange, box: host.querySelector<HTMLButtonElement>('[data-testid="font-select"]')! };
  };

  it('the box shows the current font by name, in that font', () => {
    const { box } = render(DEFAULT_TITLE_FONT);
    expect(box.textContent?.trim()).toBe('Cinzel');
    expect(box.querySelector('span')!.style.fontFamily).toContain('Cinzel');
    expect(options()).toHaveLength(0); // closed
  });

  it('tap → the same 74, every name in its own face → pick → closes', () => {
    const { box, onChange } = render(DEFAULT_TITLE_FONT);
    act(() => box.click());
    expect(box.getAttribute('aria-expanded')).toBe('true');
    const rows = options();
    expect(rows).toHaveLength(74);
    for (const r of rows) expect(r.querySelector('span')!.style.fontFamily).toContain(fontFace(FONTS.find((f) => f.name === r.textContent?.trim())!.family));
    act(() => rows.find((r) => r.textContent?.trim() === 'Great Vibes')!.click());
    expect(onChange).toHaveBeenCalledWith(FONTS.find((f) => f.name === 'Great Vibes')!.family);
    expect(options()).toHaveLength(0);
  });

  it('closes without changing anything on Escape or a tap outside', () => {
    const { box, onChange } = render(DEFAULT_TEXT_FONT);
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
    expect(fontName('"Source Sans 3", sans-serif')).toBe('Source Sans'); // a desktop-saved family
    expect(fontName('"Nope", serif')).toBe('Nope'); // never another font's name
  });

  it('ticks the matching font for a stored string that differs from the list', () => {
    act(() => root.render(createElement(FontList, { value: '"Inter", sans-serif', onPick: () => {} })));
    expect(options().filter((r) => r.getAttribute('aria-selected') === 'true').map((r) => r.textContent?.trim())).toEqual(['Inter']);
  });
});

describe('loadFontFaces — a canvas never draws the fallback', () => {
  const load = vi.fn<(spec: string) => Promise<unknown[]>>(async () => []);
  beforeEach(() => { load.mockClear(); Object.defineProperty(document, 'fonts', { value: { load }, configurable: true }); });

  it('asks for each face once, however the family was stored, with its bold/italic', async () => {
    await loadFontFaces([
      { fontFamily: '"Allura", cursive' },
      { fontFamily: "'Great Vibes', cursive", bold: true },
      { fontFamily: 'Great Vibes, cursive', bold: true }, // the same face again
      { fontFamily: 'Lato', italic: true },
      { fontFamily: 'serif' }, { fontFamily: '' }, {}, // nothing to load
    ]);
    expect(load.mock.calls.map((c) => c[0]).sort()).toEqual(['32px "Allura"', 'bold 32px "Great Vibes"', 'italic 32px "Lato"']);
  });

  it('gives up after the timeout instead of holding a print forever', async () => {
    load.mockImplementation(() => new Promise(() => {}));
    vi.useFakeTimers();
    const p = loadFontFaces([{ fontFamily: '"Allura", cursive' }], 4000);
    await vi.advanceTimersByTimeAsync(4000);
    await expect(p).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});

describe('every editor picks from the one list, and every renderer loads the font first', () => {
  it('the cover editor uses FontSelect, not a <select>', () => {
    const s = src('CoverEditor.tsx');
    expect(s).toContain('<FontSelect');
    expect(s).not.toMatch(/<select[\s>]/);
  });
  it('the page text editor uses FontList', () => {
    expect(src('MobileTextEditor.tsx')).toContain('<FontList');
  });
  it('both desktop text panels use FontList — no font list of their own', () => {
    for (const f of ['PropertiesPanel.tsx', '../../assistant/MegyAssistant.tsx']) {
      const s = src(f);
      expect(s, f).toContain('<FontList');
      expect(s, f).not.toMatch(/FONT_FAMILIES/);
    }
  });
  it('on desktop a text box opens its editor even in Studio (the only way to its fonts there)', () => {
    // Studio's container mode is always on (since 2026-09-30); text-box clicks
    // used to bail out on it, so clicking a caption on desktop did nothing.
    const s = src('BuilderEdit.tsx');
    const body = (name: string) => {
      const at = s.indexOf(`${name}: useCallback(`);
      expect(at, name).toBeGreaterThan(-1);
      return s.slice(at, s.indexOf('}, [', at));
    };
    for (const h of ['onTextSlotClick', 'onSlotTextClick', 'onTextSlotEmptyClick', 'onTextSlotChooserClick']) expect(body(h), h).not.toMatch(/containerMode/);
    // a PHOTO frame still selects (to move it) in Studio — by design
    expect(body('onSlotClick')).toMatch(/if \(containerMode\) return/);
  });
  it('print loads the fonts of page text, text/quote boxes and the cover before drawing; the editor refits when they land', () => {
    const print = src('printPipeline.ts');
    expect(print).toMatch(/await loadFontFaces\(page\.textElements/);
    expect(print).toMatch(/await loadFontFaces\(\[st\]\)/);
    expect(print).toMatch(/await loadFontFaces\(\[\.\.\.branded\.texts/);
    expect(print).toMatch(/await loadFontFaces\(layout\.panels/);
    expect(print).not.toMatch(/fam\.match\(\/"\(\[\^"\]\+\)"\//); // the double-quote-only lookup is gone
    expect(src('useCanvasEngine.ts')).toMatch(/refitTextWhenFontsArrive\(fab, canvas, page, thisRenderId\)/);
  });
});
