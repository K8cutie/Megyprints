import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deriveSpine, fitSpineLine, spineInk, contrastRatio, SPINE_DARK_INK, SPINE_LIGHT_INK, type SpineMeasure } from './coverLayout';
import { coverWrapGeometry } from './coverGeometry';
import type { AlbumBackground, AlbumPage, TextStyle } from './types';

/* ══════════════════════════════════════════════════════════════════════════
   THE SPINE FITS, AND READS (1-star testers, 2026-10-04).
   The Rule-Breaker's long title ran off both ends of the spine — only its
   middle showed, in a 320-px strip holding an 896-px line. The Perfectionist
   picked white for the title on a photo cover: the spine printed white on
   cream (#FFFBF7). Now the title shrinks to fit the spine, is shortened with
   "…" only past a floor, and prints in an ink that shows.
   ══════════════════════════════════════════════════════════════════════════ */

/** A stand-in for the canvas measure: every character 0.6 em wide. */
const measure: SpineMeasure = (text, _style, size) => Array.from(text).length * size * 0.6;

const g = coverWrapGeometry('8x8', 40, 'hardboundLinen');
const spineLength = g.panels.spine.height - 2 * g.safeInsetPx;
const photoBg: AlbumBackground = { type: 'image', image: 'blob:cover-photo' } as AlbumBackground;
const solidBg = (solid: string): AlbumBackground => ({ type: 'solid', solid });
const cover = (title: string, color: string, background: AlbumBackground, extra: Partial<TextStyle> = {}): AlbumPage => ({
  id: 'cover-front', layout: 'freeform', size: '8x8', background, photos: [], templateId: 'cover-plain', slotFills: [],
  textElements: [{ id: 't', boxIndex: 0, text: title, fontSize: 64, fontFamily: 'Georgia', color, bold: true, italic: false, underline: false, alignment: 'center', x: 0, y: 0, ...extra }],
} as unknown as AlbumPage);

describe('a long title fits the spine', () => {
  it("the tester's title on a 6×4 (a 1050-px spine): shortened with \"…\", and the line that prints fits", () => {
    const title = '<img src=x onerror=alert(2)> SUPERCALIFRAGILISTICEXPIALIDOCIOUSHONGKONGTRIPWITHOUTANYSPACESATALLJUSTTOSEEWHATHAPPENS 🎉🎉🎉🎉🎉🎉';
    const g64 = coverWrapGeometry('6x4', 40, 'hardboundLinen');
    const s = deriveSpine({ ...cover(title, '#1F3A5F', solidBg('#F4EDE4')), size: '6x4' } as AlbumPage, g64, measure);
    expect(s.shortened).toBe(true);
    expect(s.text.text.endsWith('…')).toBe(true);
    expect(title.startsWith(s.text.text.slice(0, -1))).toBe(true); // it starts at the start
    expect(measure(s.text.text, s.text, s.text.fontSize)).toBeLessThanOrEqual(g64.panels.spine.height - 2 * g64.safeInsetPx);
    expect(s.title).toBe(title); // the front keeps the whole title
  });

  it('a title a little too long shrinks to fit, whole', () => {
    const max = Math.round(Math.min(g.panels.spine.width * 0.5, g.panels.front.height * 0.035));
    const chars = Math.floor(spineLength / (max * 0.6)) + 4; // just over at full size
    const title = 'A'.repeat(chars);
    const s = deriveSpine(cover(title, '#1F3A5F', solidBg('#F4EDE4')), g, measure);
    expect(s.shortened).toBe(false);
    expect(s.shrunk).toBe(true); // the editor says it prints smaller
    expect(s.text.text).toBe(title);
    expect(s.text.fontSize).toBeLessThan(max);
    expect(measure(title, s.text, s.text.fontSize)).toBeLessThanOrEqual(spineLength);
  });

  it('soft and hard covers agree on whether a title is shortened (the editor previews softcover; the cover is picked at checkout)', () => {
    const soft = coverWrapGeometry('8x8', 40, 'softcover');
    const one = '<img src=x onerror=alert(2)> SUPERCALIFRAGILISTICEXPIALIDOCIOUSHONGKONGTRIPWITHOUTANYSPACESATALLJUSTTOSEEWHATHAPPENS 🎉🎉🎉🎉🎉🎉';
    for (const title of [one, `${one} ${one}`]) {
      const page = cover(title, '#1F3A5F', solidBg('#F4EDE4'));
      expect(deriveSpine(page, g, measure).shortened).toBe(deriveSpine(page, soft, measure).shortened);
    }
    expect(deriveSpine(cover(one, '#1F3A5F', solidBg('#F4EDE4')), g, measure)).toMatchObject({ shortened: false, shrunk: true, text: { text: one } });
    expect(deriveSpine(cover(`${one} ${one}`, '#1F3A5F', solidBg('#F4EDE4')), soft, measure).shortened).toBe(true);
  });

  it('a short title prints whole, at full size', () => {
    const s = deriveSpine(cover('Hong Kong 2026', '#1F3A5F', solidBg('#F4EDE4')), g, measure);
    expect(s.text.text).toBe('Hong Kong 2026');
    expect(s.shortened).toBe(false);
    expect(s.shrunk).toBe(false);
    expect(s.text.fontSize).toBe(Math.round(Math.min(g.panels.spine.width * 0.5, g.panels.front.height * 0.035)));
  });

  it('ends on a whole word when that costs little, and never splits an emoji', () => {
    const style = { fontFamily: 'Georgia', bold: false, italic: false } as TextStyle;
    const words = fitSpineLine('Our trip to Hong Kong and Macau', style, 10, 10, 20 * 6, measure); // room for 20 chars
    expect(words).toEqual({ text: 'Our trip to Hong…', fontSize: 10, shortened: true });
    const emoji = fitSpineLine('🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉', style, 10, 10, 5 * 6, measure);
    expect(emoji.text).toBe('🎉🎉🎉🎉…');
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(emoji.text)).toBe(false);
  });
});

describe('the spine title shows', () => {
  it('white title on a photo cover (cream spine) → dark ink, and the editor is told', () => {
    const s = deriveSpine(cover('Hong Kong, Exactly Right', '#FFFFFF', photoBg), g, measure);
    expect(s.bg).toBe('#FFFBF7');
    expect(s.text.color).toBe(SPINE_DARK_INK);
    expect(s.inkChanged).toBe(true);
    expect(contrastRatio(s.text.color, s.bg)!).toBeGreaterThanOrEqual(3);
  });

  it('a colour that reads stays the title colour', () => {
    expect(deriveSpine(cover('Trip', '#1F3A5F', photoBg), g, measure)).toMatchObject({ inkChanged: false, text: { color: '#1F3A5F' } });
    expect(deriveSpine(cover('Trip', '#FFFFFF', solidBg('#1F2A44')), g, measure)).toMatchObject({ inkChanged: false, text: { color: '#FFFFFF' } });
  });

  it('dark title on a dark cover → light ink', () => {
    const s = deriveSpine(cover('Trip', '#222222', solidBg('#101820')), g, measure);
    expect(s.text.color).toBe(SPINE_LIGHT_INK);
  });

  it('a white title with a dark outline reads on cream, so it keeps its colour', () => {
    expect(spineInk({ color: '#FFFFFF', outlineColor: '#2D2D2D', outlineWidth: 3 }, '#FFFBF7')).toBe('#FFFFFF');
  });

  it('a colour it cannot read is left as chosen', () => {
    expect(spineInk({ color: 'goldenrod' }, '#FFFBF7')).toBe('goldenrod');
  });
});

describe('every spine renderer draws what deriveSpine fits (source guards)', () => {
  const src = (f: string) => readFileSync(resolve(__dirname, f), 'utf8');
  it('print: the fitted line, in the same safe inset', () => {
    const p = src('printPipeline.ts');
    expect(p).toMatch(/const spine = deriveSpine\(coverFront, geom\);/);
    expect(p).toMatch(/drawCoverText\(ctx, \{ style: spine\.text, rect: spineSafe, rotateDeg: -90, valign: 'middle' \}\);/);
    expect(p).toMatch(/const spineSafe = insetRect\(spineRect, geom\.safeInsetPx\);/);
  });
  it('the editor strip shows the whole fitted line and says when it is shortened', () => {
    const e = src('CoverEditor.tsx');
    expect(e).toMatch(/const line = spine\.text\.text;/);
    expect(e).toMatch(/\{spine\.shortened \? \(/);
    expect(e).toMatch(/data-testid="spine-too-long"/);
    expect(e).toMatch(/\) : spine\.shrunk && \(/);
  });
});
