/* ══════════════════════════════════════════════════════════════════════════
   WHY THIS TEST: a caption in a font style the app has no file for is drawn
   by Skia faking it (a slanted upright, a thickened regular), a different
   width from the website's real face, so it can break into different lines.
   The page plan must say so (notDrawn), never pass it off as the real thing;
   UNLESS the website has no file for that style either (Shrikhand has no
   bold, Dancing Script no italic): then both fake it, the Preview shows it,
   and it prints (2026-11-23: a Mini's Shrikhand-bold cover title could
   never be ordered);
   and a font the app does not bundle must fall back the way Chrome on
   Android does (down the CSS list to the phone's own serif / sans-serif),
   not to Skia's single default family.
   Georgia, the default text font, is in the app as Gelasio (same letter
   widths): drawn exactly. A text counts as drawn exactly only in its OWN
   font, the first it names, never in a fallback further down its list.
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_TEXT_FONT } from '@web/pages/builder/fontCatalog';
import { addDrawnFonts, BUNDLED_FONTS, fontFileFor, fontNotDrawn, forgetAddedFonts, hasExactFont, paragraphFamilies, websiteFakesStyle } from '../src/render/fontTable';
import { WEBSITE_STYLES } from '../src/render/websiteFontStyles';
import { planPage } from '../src/render/pagePlan';
import type { AlbumPage } from '@web/pages/builder/types';

const DM = '"DM Sans", sans-serif';
const PF = '"Playfair Display", serif';
const DS = '"Dancing Script", cursive';

describe('the bundled fonts', () => {
  it('have a real file for every style a page can ask of Playfair Display and DM Sans', () => {
    for (const family of [PF, DM]) {
      for (const bold of [false, true]) {
        for (const italic of [false, true]) {
          expect({ family, bold, italic, exact: hasExactFont({ family, bold, italic }) }).toEqual({ family, bold, italic, exact: true });
        }
      }
    }
    expect(fontFileFor({ family: DM, italic: true })?.file).toMatch(/DMSans_400Regular_Italic\.ttf$/);
    expect(fontFileFor({ family: PF, bold: true, italic: true })?.file).toMatch(/PlayfairDisplay_700Bold_Italic\.ttf$/);
  });

  it('are all installed (the files the app and the golden check load)', () => {
    for (const f of BUNDLED_FONTS) expect(fs.existsSync(path.join(__dirname, '..', 'node_modules', f.file))).toBe(true);
  });

  it('name a font the app does not have; a style the website has no file for either is not named', () => {
    // Dancing Script has no italic anywhere: the website slants it too.
    expect(fontNotDrawn({ family: DS, italic: true })).toBeNull();
    expect(fontNotDrawn({ family: DS, bold: true })).toBeNull();
    expect(fontNotDrawn({ family: '"Times New Roman", serif' })).toBe(`font "Times New Roman", serif (drawn in the phone's own font)`);
  });

  it('Georgia (the default text font) is drawn exactly, every style, with Gelasio', () => {
    for (const [bold, italic, file] of [[false, false, 'Gelasio_400Regular'], [true, false, 'Gelasio_700Bold'], [false, true, 'Gelasio_400Regular_Italic'], [true, true, 'Gelasio_700Bold_Italic']] as const) {
      const ask = { family: 'Georgia, "Times New Roman", serif', bold, italic };
      expect(fontNotDrawn(ask)).toBeNull();
      expect(hasExactFont(ask)).toBe(true);
      expect(fontFileFor(ask)?.file).toBe(`@expo-google-fonts/gelasio/${file.replace('Gelasio_', '')}/${file}.ttf`);
    }
  });

  it('a page with words in the default text font (Georgia) has nothing "not drawn": its print file can be made', () => {
    const page = {
      id: 'p', layout: 'freeform', size: '8x8', photos: [], background: { type: 'solid', solid: '#FFFFFF' },
      textElements: [
        { id: 't1', text: 'Our first trip', x: 10, y: 10, rotation: 0, opacity: 100, fontSize: 30, fontFamily: DEFAULT_TEXT_FONT, color: '#2D2D2D' },
        { id: 't2', text: 'Hong Kong', x: 10, y: 60, rotation: 0, opacity: 100, fontSize: 30, fontFamily: DEFAULT_TEXT_FONT, bold: true, italic: true, color: '#2D2D2D' },
      ],
    } as unknown as AlbumPage;
    expect(DEFAULT_TEXT_FONT).toBe('Georgia, "Times New Roman", serif');
    expect(planPage({ page, albumSize: '8x8', pageIndex: 6, photoCount: 0 }).notDrawn).toEqual([]);
  });

  it('a font not here yet is not passed off as drawn because a later face in its list is here', () => {
    // '"Lora", Georgia, serif' before Lora is downloaded: drawn in Georgia (Gelasio) meanwhile, but listed.
    expect(paragraphFamilies('"Lora", Georgia, serif')).toEqual(['Georgia']);
    expect(hasExactFont({ family: '"Lora", Georgia, serif' })).toBe(false);
    expect(fontNotDrawn({ family: '"Lora", Georgia, serif' })).toBe(`font "Lora", Georgia, serif (drawn in the phone's own font)`);
  });

  it('a page in a style the website fakes too (Dancing Script italic) has nothing "not drawn"', () => {
    const page = {
      id: 'p', layout: 'freeform', size: '8x8', photos: [], background: { type: 'solid', solid: '#FFFFFF' },
      textElements: [{ id: 't', text: 'Hi', x: 10, y: 10, rotation: 0, opacity: 100, fontSize: 30, fontFamily: DS, italic: true, color: '#2D2D2D' }],
    } as unknown as AlbumPage;
    expect(planPage({ page, albumSize: '8x8', pageIndex: 1, photoCount: 0 }).notDrawn).toEqual([]);
  });

  it('a font the app does not have falls back down its own list, generic last', () => {
    expect(paragraphFamilies('"Times New Roman", serif')).toEqual(['Times New Roman', 'serif']);
    expect(paragraphFamilies('Georgia, "Times New Roman", serif')).toEqual(['Georgia']);
    expect(paragraphFamilies(PF)).toEqual(['Playfair Display']);
    expect(paragraphFamilies(undefined)).toEqual(['serif']);
  });
});

/* ── 2026-11-23: a font with one weight, in bold (the Mini's cover title) ── */
describe('a font the website has in one weight only', () => {
  afterEach(() => forgetAddedFonts());
  const SHRIKHAND = '"Shrikhand", cursive';
  const ONE_WEIGHT = Object.entries(WEBSITE_STYLES).filter(([, st]) => !st.includes('700')).map(([f]) => f).sort();

  it('the 12 of the 74 with no bold anywhere', () => {
    expect(ONE_WEIGHT).toEqual(['Abril Fatface', 'Bebas Neue', 'Great Vibes', 'Lobster', 'Pacifico', 'Parisienne', 'Pinyon Script', 'Righteous', 'Sacramento', 'Satisfy', 'Shrikhand', 'Yeseva One']);
  });

  it("Shrikhand bold, once Shrikhand is on the phone: drawn the website's way (both thicken it), so it prints", () => {
    addDrawnFonts([{ face: 'Shrikhand', weight: 400, italic: false, file: 'google-fonts:shrikhand-400.ttf' }]);
    expect(websiteFakesStyle({ family: SHRIKHAND, bold: true })).toBe(true);
    expect(fontNotDrawn({ family: SHRIKHAND, bold: true })).toBeNull();
    expect(fontNotDrawn({ family: SHRIKHAND, bold: true, italic: true })).toBeNull();
    for (const face of ONE_WEIGHT) {
      addDrawnFonts([{ face, weight: 400, italic: false, file: `google-fonts:${face}-400.ttf` }]);
      expect({ face, said: fontNotDrawn({ family: `"${face}", cursive`, bold: true }) }).toEqual({ face, said: null });
    }
  });

  it('still named: Shrikhand not on the phone yet, and a bold the website DOES have that is still downloading', () => {
    expect(fontNotDrawn({ family: SHRIKHAND, bold: true })).toBe(`font ${SHRIKHAND} (drawn in the phone's own font)`);
    addDrawnFonts([{ face: 'Lora', weight: 400, italic: false, file: 'google-fonts:lora-400.ttf' }]);
    expect(websiteFakesStyle({ family: '"Lora", serif', bold: true })).toBe(false);
    expect(fontNotDrawn({ family: '"Lora", serif', bold: true })).toBe('font "Lora", serif bold (no bold file: faked by the app)');
  });

  it('a page with a Shrikhand-bold title has nothing "not drawn": its print file can be made', () => {
    addDrawnFonts([{ face: 'Shrikhand', weight: 400, italic: false, file: 'google-fonts:shrikhand-400.ttf' }]);
    const page = {
      id: 'p', layout: 'freeform', size: '5.8x8.3', photos: [], background: { type: 'solid', solid: '#FFFFFF' },
      textElements: [{ id: 't', text: 'Our Mini', x: 10, y: 10, rotation: 0, opacity: 100, fontSize: 40, fontFamily: SHRIKHAND, bold: true, color: '#2D2D2D' }],
    } as unknown as AlbumPage;
    expect(planPage({ page, albumSize: '5.8x8.3', pageIndex: 0, photoCount: 0 }).notDrawn).toEqual([]);
  });
});

/* ── Every one of the 74 caption fonts, in all four styles, once on the phone ── */
describe('every caption font prints in every style once it is on the phone', () => {
  afterEach(() => forgetAddedFonts());
  it('no font of the 74 is ever "not drawn" after its download, bold, italic or both', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { FONTS, fontFace } = require('@web/pages/builder/fontCatalog') as typeof import('@web/pages/builder/fontCatalog');
    const blocked: string[] = [];
    for (const f of FONTS) {
      const face = fontFace(f.family);
      if (!BUNDLED_FONTS.some((b) => b.face === face)) {
        const styles = WEBSITE_STYLES[face];
        if (!styles) { blocked.push(`${face}: not in WEBSITE_STYLES`); continue; }
        addDrawnFonts(styles.map((s) => ({ face, weight: s.startsWith('7') ? 700 : 400, italic: s.endsWith('i'), file: `google-fonts:${face}-${s}.ttf` })));
      }
      for (const bold of [false, true]) for (const italic of [false, true]) {
        const said = fontNotDrawn({ family: f.family, bold, italic });
        if (said) blocked.push(said);
      }
    }
    expect(FONTS.length).toBe(74);
    expect(blocked).toEqual([]);
  });
});

/* ── Place order gets the album's fonts first (lib/checkout/phoneSend.ts) ── */
describe('ensureAlbumFonts: every font the album uses, before its print file', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ensureAlbumFonts } = require('../src/editor/text/fonts/fontStore') as typeof import('../src/editor/text/fonts/fontStore');
  const page = (...fams: string[]) => ({ textElements: fams.map((fontFamily) => ({ fontFamily })) });
  it('asks once for each font on the pages, the words on photos, and the cover', async () => {
    const asked: string[] = [];
    const store = { ensure: async (f: string) => { asked.push(f); return { ok: true as const }; } };
    const r = await ensureAlbumFonts(store, [page('"Lora", serif', 'Georgia'), { slotTexts: [null, { fontFamily: '"Pacifico", cursive' }] }, page('"Lora", serif'), null, page('"Shrikhand", cursive')]);
    expect(r).toEqual({ ok: true });
    expect(asked.sort()).toEqual(['"Lora", serif', '"Pacifico", cursive', '"Shrikhand", cursive', 'Georgia'].sort());
  });
  it('says offline first when fonts could not be had, and never throws', async () => {
    const answers: Record<string, unknown> = { A: { ok: false, reason: 'failed' }, B: { ok: false, reason: 'offline' }, C: { ok: true } };
    const store = { ensure: async (f: string) => answers[f] as never };
    expect(await ensureAlbumFonts(store, [page('A', 'B', 'C')])).toEqual({ ok: false, reason: 'offline' });
    expect(await ensureAlbumFonts(store, [page('A', 'C')])).toEqual({ ok: false, reason: 'failed' });
    const throwing = { ensure: async () => { throw new Error('boom'); } };
    expect(await ensureAlbumFonts(throwing, [page('A')])).toEqual({ ok: false, reason: 'failed' });
    expect(await ensureAlbumFonts(throwing, [])).toEqual({ ok: true });
  });
});

/* ── The fonts and styles real albums use (live database, 2026-11-23: every
   distinct font and bold/italic on the pages, the words on photos and the
   covers). Each one, once its files are on the phone, must print. ── */
describe('the fonts real albums use all print', () => {
  afterEach(() => forgetAddedFonts());
  const REAL: [string, string][] = [
    ['"Abril Fatface", Georgia, serif', ''], ['"Anton", system-ui, sans-serif', ''], ['"Bebas Neue", sans-serif', ''],
    ['"Bubblegum Sans", system-ui, sans-serif', ''], ['"Caveat", cursive', ''], ['"Caveat", cursive', 'b'], ['"Chewy", system-ui, sans-serif', ''],
    ['"Cinzel", Georgia, serif', ''], ['"Cinzel", Georgia, serif', 'b'], ['"Cinzel", Georgia, serif', 'bi'],
    ['"Dancing Script", cursive', ''], ['"Dancing Script", cursive', 'b'], ['"Dancing Script", cursive', 'bi'],
    ['"DM Sans", sans-serif', ''], ['"DM Sans", sans-serif', 'b'], ['"DM Serif Display", Georgia, serif', ''],
    ['"Great Vibes", cursive', ''], ['"Great Vibes", cursive', 'b'], ['"Great Vibes", cursive', 'i'],
    ['"Indie Flower", cursive', 'b'], ['"Indie Flower", cursive', 'bi'], ['"Indie Flower", cursive', 'i'],
    ['"Libre Baskerville", Georgia, serif', 'b'], ['"Libre Baskerville", Georgia, serif', 'bi'],
    ['"Lobster", cursive', ''], ['"Lobster", cursive', 'b'],
    ['"Luckiest Guy", system-ui, sans-serif', ''], ['"Luckiest Guy", system-ui, sans-serif', 'b'], ['"Luckiest Guy", system-ui, sans-serif', 'i'],
    ['"Marcellus", Georgia, serif', ''], ['"Patrick Hand", cursive', ''],
    ['"Playfair Display", Georgia, serif', 'bi'], ['"Playfair Display", Georgia, serif', 'i'],
    ['"Playfair Display", serif', ''], ['"Playfair Display", serif', 'b'], ['"Playfair Display", serif', 'bi'], ['"Playfair Display", serif', 'i'],
    ['"Poppins", system-ui, sans-serif', ''], ['"Poppins", system-ui, sans-serif', 'b'], ['"Quicksand", system-ui, sans-serif', 'bi'],
    ['"Righteous", system-ui, sans-serif', ''], ['"Righteous", system-ui, sans-serif', 'b'], ['"Sacramento", cursive', 'bi'],
    ['"Satisfy", cursive', ''], ['"Satisfy", cursive', 'b'], ['"Satisfy", cursive', 'i'],
    ['"Shadows Into Light", cursive', ''], ['"Shadows Into Light", cursive', 'i'],
    ['"Shrikhand", cursive', ''], ['"Shrikhand", cursive', 'b'], ['"Yeseva One", Georgia, serif', 'b'], ['"Yeseva One", Georgia, serif', 'i'],
    ['Georgia, "Times New Roman", serif', ''], ['Georgia, "Times New Roman", serif', 'b'], ['Georgia, "Times New Roman", serif', 'bi'], ['Georgia, "Times New Roman", serif', 'i'],
  ];
  it('none is "not drawn" once its font is on the phone', () => {
    const blocked: string[] = [];
    for (const [family, st] of REAL) {
      const face = family.split(',')[0].replace(/"/g, '').trim();
      const styles = WEBSITE_STYLES[face];
      if (!BUNDLED_FONTS.some((b) => b.face === face)) {
        if (!styles) { blocked.push(`${face}: not one of the 74`); continue; }
        addDrawnFonts(styles.map((s) => ({ face, weight: s.startsWith('7') ? 700 : 400, italic: s.endsWith('i'), file: `google-fonts:${face}-${s}.ttf` })));
      }
      const said = fontNotDrawn({ family, bold: st.includes('b'), italic: st.includes('i') });
      if (said) blocked.push(said);
    }
    expect(blocked).toEqual([]);
  });
});
