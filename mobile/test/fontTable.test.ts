/* ══════════════════════════════════════════════════════════════════════════
   WHY THIS TEST: a caption in a font style the app has no file for is drawn
   by Skia faking it (a slanted upright, a thickened regular), a different
   width from the website's real face, so it can break into different lines.
   The page plan must say so (notDrawn), never pass it off as the real thing;
   and a font the app does not bundle must fall back the way Chrome on
   Android does (down the CSS list to the phone's own serif / sans-serif),
   not to Skia's single default family.
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { BUNDLED_FONTS, fontFileFor, fontNotDrawn, hasExactFont, paragraphFamilies } from '../src/render/fontTable';
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

  it('name a style that would be faked, and a font the app does not have', () => {
    expect(fontNotDrawn({ family: DS, italic: true })).toBe('font "Dancing Script", cursive italic (no italic file: faked by the app)');
    expect(fontNotDrawn({ family: DS, bold: true })).toBeNull();
    expect(fontNotDrawn({ family: 'Georgia, "Times New Roman", serif' })).toBe(`font Georgia, "Times New Roman", serif (drawn in the phone's own font)`);
  });

  it('a page with a faked style lists it in notDrawn', () => {
    const page = {
      id: 'p', layout: 'freeform', size: '8x8', photos: [], background: { type: 'solid', solid: '#FFFFFF' },
      textElements: [{ id: 't', text: 'Hi', x: 10, y: 10, rotation: 0, opacity: 100, fontSize: 30, fontFamily: DS, italic: true, color: '#2D2D2D' }],
    } as unknown as AlbumPage;
    expect(planPage({ page, albumSize: '8x8', pageIndex: 1, photoCount: 0 }).notDrawn).toEqual(['font "Dancing Script", cursive italic (no italic file: faked by the app)']);
  });

  it('a font the app does not have falls back down its own list, generic last', () => {
    expect(paragraphFamilies('Georgia, "Times New Roman", serif')).toEqual(['Georgia', 'Times New Roman', 'serif']);
    expect(paragraphFamilies(PF)).toEqual(['Playfair Display']);
    expect(paragraphFamilies(undefined)).toEqual(['serif']);
  });
});
