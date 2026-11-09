import { describe, it, expect } from 'vitest';
import { clampWords, curveInBoxFit, freeSpot, inkPad, isPlacedWords, NEW_WORDS_LOOK, newPlacedWords, placedWordsFit, placeWords, wordsInk, wordsMiddle, wordsSafeArea } from './freeWords';
import { bindStrandedCaptions } from './useBuilderState';
import { getCanvasDimensions } from './layouts';
import { ALBUM_SIZES, type AlbumPage, type AlbumSizePreset, type TextElement } from './types';
import { curveGlyphs, wrapTextLines } from './wordArtRules';
import { deriveSpine } from './coverLayoutRules';
import { coverWrapGeometry } from './coverGeometry';
import { captionBoxRect } from './textFit';

/* ══════════════════════════════════════════════════════════════════════════
   WORDS PLACED BY HAND (Add text on a photo, owner 2026-11-07) and the safe
   print area they never leave: 0.25" from every trimmed edge, 1/2" from the
   spine on a page. Measured the way print measures (a measurer set to the
   words' font), so it is the letters that stay in, not a box round them.
   ══════════════════════════════════════════════════════════════════════════ */

/** Every character half the font size wide (the size read from the CSS font). */
function measurer() {
  const m = {
    font: '',
    measureText: (s: string) => ({ width: Array.from(s).length * 0.5 * Number(/(\d+(\.\d+)?)px/.exec(m.font)?.[1] ?? 16) }),
  };
  return m;
}

const SIZES = ALBUM_SIZES.map((s) => s.preset as AlbumSizePreset);
const perInch = (size: AlbumSizePreset) => {
  const ui = getCanvasDimensions(size);
  const print = ALBUM_SIZES.find((s) => s.preset === size)!;
  return (ui.width * 300) / print.width;
};

describe('the safe print area', () => {
  for (const size of SIZES) {
    it(`${size}: 0.25" from the top and bottom trim, 1/2" from BOTH side edges (a page's spine side changes when pages are added or deleted)`, () => {
      const ui = getCanvasDimensions(size);
      const k = perInch(size);
      for (const pageIndex of [0, 1, 2, 7]) {
        const a = wordsSafeArea(size, pageIndex);
        expect(a.x).toBeCloseTo(0.5 * k, 6);
        expect(ui.width - a.x - a.w).toBeCloseTo(0.5 * k, 6);
        expect(a.y).toBeCloseTo(0.25 * k, 6);
        expect(ui.height - a.y - a.h).toBeCloseTo(0.25 * k, 6);
      }
      // So words placed on page 1 (binds on its left) are still clear of the
      // spine when a page added before it makes it page 2 (binds on its right).
      expect(wordsSafeArea(size, 0)).toEqual(wordsSafeArea(size, 1));
    });
  }
  it('on the cover: 0.25" all round (the front panel has no spine edge of its own)', () => {
    const k = perInch('8x8');
    const a = wordsSafeArea('8x8', 0, true);
    expect(a.x).toBeCloseTo(0.25 * k, 6);
    expect(750 - a.x - a.w).toBeCloseTo(0.25 * k, 6);
  });
});

const words = (over: Partial<TextElement> = {}): TextElement => ({
  ...NEW_WORDS_LOOK, id: 'w1', text: 'Our day', x: 100, y: 100, rotation: 0, opacity: 100, placed: true, ...over,
});

describe('where the letters reach', () => {
  it('straight, centred: the widest line in the middle of its box, as many lines tall as print wraps, the outline and a letter\'s overhang round it', () => {
    const m = measurer();
    const t = words({ text: 'Our day', fontSize: 40, width: 300 });
    const ink = wordsInk(t, m);
    const pad = inkPad(t);
    expect(ink.left).toBeCloseTo((300 - 140) / 2 - pad, 6); // 7 letters × 20 px
    expect(ink.right).toBeCloseTo((300 + 140) / 2 + pad, 6);
    expect(ink.top).toBeCloseTo(-1, 6); // half the 2 px outline
    expect(ink.bottom).toBeCloseTo(40 * 1.25 + 1, 6);
  });
  it('left and right alignment hold the letters to their side of the box', () => {
    const m = measurer();
    expect(wordsInk(words({ width: 300, alignment: 'left' }), m).left).toBeCloseTo(-inkPad(words()), 6);
    expect(wordsInk(words({ width: 300, alignment: 'right' }), m).right).toBeCloseTo(300 + inkPad(words()), 6);
  });
  it('wrapped: as many lines as print breaks them into in the box', () => {
    const m = measurer();
    const t = words({ text: 'The castle lights came on at last', width: 200 });
    m.font = '';
    const lines = wrapTextLines({ measureText: (s) => ({ width: s.length * 20 }) }, t.text, 200).length;
    expect(lines).toBeGreaterThan(1);
    expect(wordsInk(t, m).bottom).toBeCloseTo(lines * 50 + 1, 6);
  });
  it('on a curve: as wide and tall as the curve, its middle where a one-line text\'s middle is', () => {
    const m = measurer();
    const t = words({ text: 'Our Beach Days', curve: 'arch', width: 400 });
    m.font = '';
    const c = curveGlyphs(t.text, { measureText: (s) => ({ width: Array.from(s).length * 20 }) }, 40, 'arch');
    const ink = wordsInk(t, m);
    const pad = inkPad(t);
    expect(ink.right - ink.left).toBeCloseTo(c.width + pad * 2, 6);
    expect(ink.bottom - ink.top).toBeCloseTo(c.height + pad * 2, 6);
    expect((ink.top + ink.bottom) / 2).toBeCloseTo(25, 6); // half of 40 × 1.25
  });
});

describe('placing words', () => {
  it('as wide as the words, never wider than the area, their middle where it was', () => {
    const m = measurer();
    const area = wordsSafeArea('8x8', 0);
    const t = placeWords(words({ text: 'Our day', width: 600 }), m, area, { cx: 375, cy: 375 });
    expect(t.width).toBe(Math.ceil(140 + inkPad(t) * 2)); // rounded up: never a line that only just fits
    const ink = wordsInk(t, m);
    expect(t.x + (ink.left + ink.right) / 2).toBeCloseTo(375, 0);
    expect(t.y + (ink.top + ink.bottom) / 2).toBeCloseTo(375, 0);
    const long = placeWords(words({ text: 'x'.repeat(200) }), m, area, { cx: 375, cy: 375 });
    expect(long.width).toBeLessThanOrEqual(area.w);
  });
  it('a size or a line that grows keeps the middle, and the words in the area', () => {
    const m = measurer();
    const area = wordsSafeArea('8x8', 0);
    const t = placeWords(words({ text: 'Hi' }), m, area, { cx: 375, cy: 375 });
    const bigger = placeWords({ ...t, fontSize: 80 }, m, area, wordsMiddle(t, m));
    expect(wordsMiddle(t, m).cy).toBeCloseTo(375, 0);
    const ink = wordsInk(bigger, m);
    expect(bigger.x + (ink.left + ink.right) / 2).toBeCloseTo(375, 0);
    expect(bigger.y + (ink.top + ink.bottom) / 2).toBeCloseTo(375, 0);
  });
  it('dragged past any edge, the letters stop at the safe area: right, left, top, bottom, on both page sides and the cover', () => {
    const m = measurer();
    for (const [pageIndex, cover] of [[0, false], [1, false], [0, true]] as const) {
      const area = wordsSafeArea('8x8', pageIndex, cover);
      const t = placeWords(words({ text: 'Bohol 2026' }), m, area, { cx: 375, cy: 375 });
      for (const [dx, dy] of [[5000, 0], [-5000, 0], [0, -5000], [0, 5000], [5000, 5000]]) {
        const moved = clampWords({ ...t, x: t.x + dx, y: t.y + dy }, m, area);
        const ink = wordsInk(moved, m);
        expect(moved.x + ink.left).toBeGreaterThanOrEqual(area.x - 1e-6);
        expect(moved.x + ink.right).toBeLessThanOrEqual(area.x + area.w + 1e-6);
        expect(moved.y + ink.top).toBeGreaterThanOrEqual(area.y - 1e-6);
        expect(moved.y + ink.bottom).toBeLessThanOrEqual(area.y + area.h + 1e-6);
      }
    }
  });
  it('a curve is kept in by where its letters reach, not by a line\'s height', () => {
    const m = measurer();
    const area = wordsSafeArea('8x8', 0);
    const t = placeWords(words({ text: 'Our Beach Days Together', curve: 'arch', fontSize: 60 }), m, area, { cx: 375, cy: 0 });
    const ink = wordsInk(t, m);
    expect(t.y + ink.top).toBeGreaterThanOrEqual(area.y - 1e-6);
  });
  it('words already inside the area are left where they are', () => {
    const m = measurer();
    const area = wordsSafeArea('8x8', 0);
    const t = placeWords(words(), m, area, { cx: 375, cy: 375 });
    expect(clampWords(t, m, area)).toBe(t);
  });
  it('without a measurer (fonts not loaded yet), still on the page', () => {
    const area = wordsSafeArea('6x4', 1);
    const t = placeWords(words({ text: 'A very long line of words on a small page' }), null, area, { cx: 740, cy: 490 });
    const ink = wordsInk(t, null);
    expect(t.x + ink.right).toBeLessThanOrEqual(area.x + area.w + 1e-6);
    expect(t.y + ink.bottom).toBeLessThanOrEqual(area.y + area.h + 1e-6);
  });
});

describe('too long for the page', () => {
  it('fits: nothing to say; too tall: the size it fits at, which does fit; none at all: says so', () => {
    const m = measurer();
    const area = wordsSafeArea('6x4', 0);
    expect(placedWordsFit(words({ text: 'Bohol' }), m, area)).toEqual({ fits: true, fitsAt: null });
    const long = words({ text: 'We walked all the way to the lighthouse and back again before the sun went down '.repeat(3), fontSize: 80 });
    const fit = placedWordsFit(long, m, area)!;
    expect(fit.fits).toBe(false);
    expect(fit.fitsAt).toBeGreaterThanOrEqual(8);
    expect(placedWordsFit({ ...long, fontSize: fit.fitsAt! }, m, area)).toEqual({ fits: true, fitsAt: null });
    expect(placedWordsFit({ ...long, fontSize: fit.fitsAt! + 1 }, m, area)!.fits).toBe(false);
    expect(placedWordsFit(words({ text: 'x '.repeat(5000), fontSize: 40 }), m, area)).toEqual({ fits: false, fitsAt: null });
    expect(placedWordsFit(words(), null, area)).toBeNull();
  });
  it('a curve too wide for the page is too long; smaller, it fits', () => {
    const m = measurer();
    const area = wordsSafeArea('6x4', 0);
    const fit = placedWordsFit(words({ text: 'Our Wonderful Year Together in Siargao', fontSize: 80, curve: 'wave' }), m, area)!;
    expect(fit.fits).toBe(false);
    expect(fit.fitsAt).not.toBeNull();
  });
});

describe('new words', () => {
  it('start big, white with a thin dark outline and a shadow, marked placed, centred where asked', () => {
    const m = measurer();
    const area = wordsSafeArea('8x8', 0);
    const t = newPlacedWords('w9', { text: 'Hello' }, { cx: 300, cy: 400 }, m, area);
    expect(t).toMatchObject({ id: 'w9', placed: true, color: '#FFFFFF', outlineColor: '#2D2D2D', outlineWidth: 2, shadow: true, bold: true });
    expect(isPlacedWords(t)).toBe(true);
    const ink = wordsInk(t, m);
    expect(t.x + (ink.left + ink.right) / 2).toBeCloseTo(300, 0);
  });
  it('a second one on the same photo goes under the first, not on top of it', () => {
    const m = measurer();
    const area = wordsSafeArea('8x8', 0);
    const first = newPlacedWords('w1', { text: 'Hello' }, { cx: 375, cy: 375 }, m, area);
    const spot = freeSpot([first], { cx: 375, cy: 375 }, m, area);
    const fInk = wordsInk(first, m);
    expect(spot.cy).toBeGreaterThan(first.y + fInk.bottom);
    expect(freeSpot([], { cx: 375, cy: 375 }, m, area)).toEqual({ cx: 375, cy: 375 });
  });
});

describe('an album opening', () => {
  it('leaves words placed by hand where they are, even with an empty caption box on the page (a stray free text still goes in it)', () => {
    const base: AlbumPage = {
      id: 'p', layout: 'freeform', templateId: 't88-fb-solo-pt-twobox-right', size: '8x8', slotFills: [0],
      photos: [], textElements: [],
    } as unknown as AlbumPage;
    const placed = words({ id: 'placed-1' });
    const stray: TextElement = { ...words({ id: 'text-1' }), placed: undefined };
    const [kept] = bindStrandedCaptions([{ ...base, textElements: [placed] }]);
    expect(kept.textElements[0]).toEqual(placed);
    const [healed] = bindStrandedCaptions([{ ...base, textElements: [stray] }]);
    expect(healed.textElements[0].boxIndex).toBe(0);
  });
});

describe('words on a curve in a box (a caption box, a photo frame): not clipped, so kept in the safe area', () => {
  // A caption band at the bottom of a 6x4 page (reviewer, 2026-11-07: an arch there reached y 503 of 500).
  const box = { x: 40, y: 400, w: 670, h: 60 };
  const area = wordsSafeArea('6x4', 0);
  const look = { ...NEW_WORDS_LOOK, text: 'Our first family trip to the beach', fontSize: 28, outlineWidth: 0, curve: 'arch' as const };
  it('an arch whose letters reach past the safe line does not fit; the size it fits at keeps them inside', () => {
    const m = measurer();
    const fit = curveInBoxFit(look, box, area, m)!;
    expect(fit.fits).toBe(false);
    expect(fit.fitsAt).not.toBeNull();
    expect(curveInBoxFit({ ...look, fontSize: fit.fitsAt! }, box, area, m)).toEqual({ fits: true, fitsAt: null });
  });
  it('in the middle of the page it fits; too wide for its box at any size, nothing fits; straight: not asked', () => {
    const m = measurer();
    expect(curveInBoxFit(look, { x: 40, y: 220, w: 670, h: 50 }, area, m)).toEqual({ fits: true, fitsAt: null });
    expect(curveInBoxFit({ ...look, text: 'x'.repeat(300) }, box, area, m)).toEqual({ fits: false, fitsAt: null });
    expect(curveInBoxFit({ ...look, curve: undefined }, box, area, m)).toBeNull();
    expect(curveInBoxFit(look, box, area, null)).toBeNull();
  });
});

describe('words placed by hand on the cover', () => {
  it('never become the spine line: with no title the spine is empty (not "Est. 2026")', () => {
    const g = coverWrapGeometry('8x8', 60, 'softcover');
    const measure = (t: string) => t.length * 10;
    const front = { id: 'c', layout: 'freeform', templateId: 'cover-hero', size: '8x8', textElements: [words({ id: 'w', text: 'Est. 2026', fontSize: 60 })] } as unknown as AlbumPage;
    expect(deriveSpine(front, g, measure).text.text).toBe('');
    const titled = { ...front, textElements: [...front.textElements, { ...words({ id: 't', text: 'The Garcias' }), placed: undefined, boxIndex: 0 }] } as AlbumPage;
    expect(deriveSpine(titled, g, measure).text.text).toBe('The Garcias');
  });
  it('new ones go clear of the title (and of any caption with words), not on top of it', () => {
    const m = measurer();
    const area = wordsSafeArea('8x8', 0, true);
    const cover = { id: 'c', layout: 'freeform', templateId: 'cover-plain', size: '8x8', textElements: [{ ...words({ id: 't', text: 'The Garcia Family' }), placed: undefined, boxIndex: 0 }] } as unknown as AlbumPage;
    const title = captionBoxRect(cover, 0, '8x8', 0, { coverMode: true })!;
    const middle = { cx: title.x + title.w / 2, cy: title.y + title.h / 2 };
    const spot = freeSpot([], middle, m, area, [title]);
    expect(spot.cy < title.y || spot.cy > title.y + title.h).toBe(true);
  });
});
