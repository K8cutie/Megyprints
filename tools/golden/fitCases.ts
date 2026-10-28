/* ══════════════════════════════════════════════════════════════════════════
   THE CAPTION-FIT CASES: the captions the website's textFit is asked about
   in Chromium (fitWeb.mjs) and the app's builder measurer is held to
   (mobile/test/textMeasurer.test.ts).

   1. Every boxed caption on the golden pages (goldenPages.ts), as it is.
   2. The same boxes with captions made to need the answer to be worked out:
      each bundled font in each style the website loads (regular, bold,
      italic, bold italic; Dancing Script has no italic file), a short line,
      a full sentence and a 160-letter memory (the 1-star tester's), at sizes
      from 18 to 48. Long ones don't fit and get a "fits at" size: that size
      is the number the website shows ("Make it fit (size 22)").
   3. Two cover titles (the front cover's box 0, coverMode).
   Deterministic: the same cases on every machine.
   ══════════════════════════════════════════════════════════════════════════ */
import type { AlbumPage, AlbumSizePreset, TextElement } from '../../src/pages/builder/types';
import { DEFAULT_COVER_TEMPLATE_ID } from '../../src/pages/builder/pageTemplates';
import { withNameTitle } from '../../src/pages/builder/useBuilderState';
import { buildGoldenSet } from './goldenPages';

export interface FitCase {
  name: string;
  page: AlbumPage;
  albumSize: AlbumSizePreset;
  pageIndex: number;
  boxIndex: number;
  cover?: boolean;
}

const FONTS = [
  { family: '"Playfair Display", serif', short: 'playfair', italic: true },
  { family: '"DM Sans", sans-serif', short: 'dmsans', italic: true },
  { family: '"Dancing Script", cursive', short: 'dancing', italic: false },
];
const TEXTS = [
  { short: 'short', text: 'Sunday lunch' },
  { short: 'sentence', text: 'The castle lights came on and none of us wanted this happy day to end' },
  { short: 'memory', text: 'We drove up before sunrise, Lola packed rice and adobo, the kids slept the whole way, and when the fog lifted we saw the whole valley below us for the first time' },
];
const SIZES = [18, 24, 34, 48];

export function buildFitCases(): FitCase[] {
  const set = buildGoldenSet();
  const out: FitCase[] = [];
  const boxed = set.cases.filter((c) => (c.page.textElements ?? []).some((t) => t.boxIndex != null && t.text.trim()));
  for (const c of boxed) {
    for (const t of c.page.textElements) {
      if (t.boxIndex == null || !t.text.trim()) continue;
      out.push({ name: `golden:${c.name}:box${t.boxIndex}`, page: c.page, albumSize: c.albumSize, pageIndex: c.pageIndex, boxIndex: t.boxIndex });
    }
  }
  // Made-up captions in two of those boxes: a wide one (8x8) and a small one (6x4).
  const hosts = ['caption-wraps-underlined', '64-caption-yellow'].map((n) => set.cases.find((c) => c.name === n)!).filter(Boolean);
  for (const host of hosts) {
    const base = host.page.textElements.find((t) => t.boxIndex === 0)!;
    for (const f of FONTS) {
      for (const style of [{ bold: false, italic: false }, { bold: true, italic: false }, { bold: false, italic: true }, { bold: true, italic: true }]) {
        if (style.italic && !f.italic) continue;
        for (const t of TEXTS) {
          for (const size of SIZES) {
            const el: TextElement = { ...base, text: t.text, fontFamily: f.family, fontSize: size, bold: style.bold, italic: style.italic, underline: false };
            out.push({
              name: `made:${host.name}:${f.short}${style.bold ? '-bold' : ''}${style.italic ? '-italic' : ''}:${t.short}:${size}`,
              page: { ...host.page, textElements: [el] }, albumSize: host.albumSize, pageIndex: host.pageIndex, boxIndex: 0,
            });
          }
        }
      }
    }
  }
  // Cover titles (the album's name on the front cover, as the builder puts it there).
  for (const [i, title] of ['Our Boracay Trip', 'The Dela Cruz and Santos Families Reunion in Batangas and Tagaytay, Summer of 2026, with Lola Nena and all the cousins'].entries()) {
    const blank: AlbumPage = {
      id: `fit-cover-${i}`, layout: 'freeform', templateId: DEFAULT_COVER_TEMPLATE_ID, size: '8x8', slotFills: [],
      background: { type: 'solid', solid: '#FFFFFF' }, photos: [], textElements: [],
    };
    // In a bundled font (the cover's default, Cinzel, is not in the app yet).
    const cover = withNameTitle(blank, title);
    cover.textElements = cover.textElements.map((t) => (t.boxIndex === 0 ? { ...t, fontFamily: '"Playfair Display", serif' } : t));
    out.push({ name: `cover:${i}`, page: cover, albumSize: '8x8', pageIndex: 0, boxIndex: 0, cover: true });
  }
  return out;
}
