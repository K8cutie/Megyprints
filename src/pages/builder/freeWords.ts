/* ══════════════════════════════════════════════════════════════════════════
   WORDS PLACED BY HAND: "Add text" on a photo, on a page or on the cover
   (owner, 2026-11-07: "adding text on a photo is possible... applied in cover
   and pages picture editor"). They are a free text (a TextElement with no
   caption box), marked `placed`, at x/y in the editor's design space, as wide
   as their words, and they carry the cover title's WordArt.

   THE SAFE PRINT AREA (owner, the same day: "applying your solution to
   potential risks"). A page is trimmed after it prints and bound down one
   edge, so words too close to an edge can be cut off or lost in the binding.
   Placed words always stay inside:
     • PRINTER_SPEC.safeIn (0.25") from the top and bottom trim, and
     • on a page, the hardbound binding allowance (1/2") from BOTH side
       edges: the cover is picked at checkout, after the album is made, and
       1/2" holds for both covers; and a page's spine edge changes side
       whenever a page is added, deleted or copied before it (binding.ts:
       page 1 binds on its left, page 2 on its right…), which would leave
       words placed on its outer edge 0.25" from the new spine. Both sides
       keep 1/2", so words placed anywhere stay clear of the binding
       wherever the page ends up.
   The cover's front panel has no spine edge of its own (coverMode): 0.25"
   all round.

   Every renderer draws placed words as it draws any free text: a box at x/y,
   `width` wide, lines wrapped in it from the top (renderTextElement's free
   branch, drawPage freeText, PageView). On a curve, the curve's middle sits
   where a one-line straight text's middle would. `wordsInk` is where the
   letters reach, measured the way print measures, so the safe area holds the
   letters themselves, not a box round them.
   ══════════════════════════════════════════════════════════════════════════ */

import { HARDBOUND_BINDING_INCHES } from './binding';
import { PRINTER_SPEC } from './coverGeometry';
import { DEFAULT_TITLE_FONT } from './fontCatalog';
import { getCanvasDimensions } from './layouts';
import { getPrintDimensions, PRINT_DPI } from './printSize';
import type { Fit } from './textFit';
import type { AlbumSizePreset, TextElement } from './types';
import { CAPTION_PAD_X, curveCentreX, curveGlyphs, freeTextBoxWidth, TEXT_LINE_HEIGHT, wrapTextLines } from './wordArtRules';
import type { TextMeasurer } from '../../shared/platform';

/** A rectangle in the editor's design space (getCanvasDimensions). */
export interface Area { x: number; y: number; w: number; h: number }

/** Where the letters reach, from the words' own x/y (design px). */
export interface Ink { left: number; top: number; right: number; bottom: number }

/** Words placed by hand (Add text). Albums made before them have none. */
export function isPlacedWords(t: Pick<TextElement, 'placed' | 'boxIndex'> | null | undefined): boolean {
  return !!t && t.placed === true && t.boxIndex == null;
}

/** The safe print area for words on a page (design px): see the top of this
 *  file. The same on every page (`_pageIndex` is kept for the callers that
 *  name the page: a page's spine side is not fixed). */
export function wordsSafeArea(albumSize: AlbumSizePreset, _pageIndex: number, coverMode = false): Area {
  const { width: uiW, height: uiH } = getCanvasDimensions(albumSize);
  const { width: W } = getPrintDimensions(albumSize);
  const perInch = (uiW * PRINT_DPI) / W;
  const safe = PRINTER_SPEC.safeIn * perInch;
  const side = coverMode ? safe : Math.max(safe, HARDBOUND_BINDING_INCHES * perInch);
  return { x: side, y: safe, w: uiW - side * 2, h: uiH - safe * 2 };
}

type WordsLook = Pick<TextElement, 'text' | 'fontSize' | 'fontFamily' | 'bold' | 'italic' | 'outlineWidth' | 'curve' | 'alignment'> & { width?: number };

/** The CSS font a measurer takes (textFit's, the same string). */
export const wordsFont = (t: Pick<TextElement, 'fontSize' | 'fontFamily' | 'bold' | 'italic'>): string =>
  `${t.italic ? 'italic' : 'normal'} ${t.bold ? 'bold' : 'normal'} ${t.fontSize || 24}px ${t.fontFamily || 'serif'}`;

/** Room past the measured words: letters that reach past their advance
 *  (an italic's tail, a script's swash) and half the outline. */
export function inkPad(t: Pick<TextElement, 'fontSize' | 'outlineWidth'>): number {
  return Math.max(2, (t.fontSize || 24) * 0.08) + (t.outlineWidth || 0) / 2;
}

/** The widest line the words take on their own (no wrap), or the curve's width. */
function naturalWidth(t: WordsLook, m: TextMeasurer | null): number {
  const size = t.fontSize || 24;
  if (!m) return String(t.text ?? '').length * size * 0.6;
  m.font = wordsFont(t);
  if (t.curve) return curveGlyphs(t.text, m, size, t.curve).width;
  return Math.max(0, ...String(t.text ?? '').split('\n').map((line) => m.measureText(line).width));
}

/** Where the letters reach (design px, from x/y), as the renderers draw a free
 *  text: see the top of this file. Without a measurer, the words' rough size
 *  (freeTextBoxWidth's), so nothing is placed off the page meanwhile. */
export function wordsInk(t: WordsLook, m: TextMeasurer | null): Ink {
  const size = t.fontSize || 24;
  const step = size * TEXT_LINE_HEIGHT;
  const bw = freeTextBoxWidth({ width: t.width, text: t.text, fontSize: size });
  const align = t.alignment ?? 'center';
  const anchor = align === 'left' ? 0 : align === 'right' ? bw : bw / 2;
  const pad = inkPad(t);
  if (m) m.font = wordsFont(t);
  if (t.curve && m) {
    const c = curveGlyphs(t.text, m, size, t.curve);
    const cx = curveCentreX(anchor, align, c.width);
    const cy = step / 2;
    return { left: cx - c.width / 2 - pad, right: cx + c.width / 2 + pad, top: cy - c.height / 2 - pad, bottom: cy + c.height / 2 + pad };
  }
  const lines = m ? wrapTextLines(m, t.text, bw) : String(t.text ?? '').split('\n');
  const widest = m ? Math.max(0, ...lines.map((l) => m.measureText(l).width)) : Math.min(bw, naturalWidth(t, null));
  const left = align === 'left' ? 0 : align === 'right' ? bw - widest : (bw - widest) / 2;
  const v = (t.outlineWidth || 0) / 2;
  return { left: left - pad, right: left + widest + pad, top: -v, bottom: lines.length * step + v };
}

/** The middle of the letters, design px. */
export function wordsMiddle(t: WordsLook & Pick<TextElement, 'x' | 'y'>, m: TextMeasurer | null): { cx: number; cy: number } {
  const ink = wordsInk(t, m);
  return { cx: t.x + (ink.left + ink.right) / 2, cy: t.y + (ink.top + ink.bottom) / 2 };
}

/** x/y moved so the letters are inside `area` (centred on it when they are
 *  wider or taller than it). */
export function clampWords<T extends WordsLook & Pick<TextElement, 'x' | 'y'>>(t: T, m: TextMeasurer | null, area: Area): T {
  const ink = wordsInk(t, m);
  const fit = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
  const x = fit(t.x, area.x - ink.left, area.x + area.w - ink.right);
  const y = fit(t.y, area.y - ink.top, area.y + area.h - ink.bottom);
  return x === t.x && y === t.y ? t : { ...t, x, y };
}

/** The words as wide as they are (never wider than the area: the letters'
 *  overhang and outline fit in it too), their middle at `middle` (else where it
 *  is now), kept in the area. Called whenever placed words change, with the
 *  middle of the words as they were, so a longer line grows both ways and a
 *  bigger size stays put. */
export function placeWords<T extends WordsLook & Pick<TextElement, 'x' | 'y'>>(t: T, m: TextMeasurer | null, area: Area, middle?: { cx: number; cy: number }): T {
  const at = middle ?? wordsMiddle(t, m);
  const pad = inkPad(t);
  const most = Math.max(1, area.w - pad * 2);
  const width = Math.max(Math.min(t.fontSize || 24, most), Math.min(most, Math.ceil(naturalWidth(t, m) + pad * 2)));
  const sized = { ...t, width };
  const ink = wordsInk(sized, m);
  return clampWords({ ...sized, x: at.cx - (ink.left + ink.right) / 2, y: at.cy - (ink.top + ink.bottom) / 2 }, m, area);
}

/** Do the words fit the safe area at their size? If not, the largest whole size
 *  (≥ 8) they fit at, as textFit says for a caption box (the "Too long" line and
 *  "Make it fit"). Measured by placing them, as print draws them. null when
 *  they can't be measured. */
export function placedWordsFit(t: WordsLook, m: TextMeasurer | null, area: Area): Fit | null {
  if (!m) return null;
  if (!String(t.text ?? '').trim()) return { fits: true, fitsAt: null };
  const middle = { cx: area.x + area.w / 2, cy: area.y + area.h / 2 };
  const fitsAt = (size: number) => {
    const p = placeWords({ ...t, fontSize: size, x: 0, y: 0 }, m, area, middle);
    const ink = wordsInk(p, m);
    return ink.right - ink.left <= area.w + 0.5 && ink.bottom - ink.top <= area.h + 0.5;
  };
  const size = t.fontSize || 24;
  if (fitsAt(size)) return { fits: true, fitsAt: null };
  for (let px = Math.floor(size) - 1; px >= 8; px--) if (fitsAt(px)) return { fits: false, fitsAt: px };
  return { fits: false, fitsAt: null };
}

/** What new placed words start as: big, white with a thin dark outline and a
 *  shadow, so they read on a photo, light or dark. The customer changes any of it. */
export const NEW_WORDS_LOOK = {
  fontSize: 40,
  fontFamily: DEFAULT_TITLE_FONT,
  color: '#FFFFFF',
  bold: true,
  italic: false,
  underline: false,
  alignment: 'center' as const,
  outlineColor: '#2D2D2D',
  outlineWidth: 2,
  shadow: true,
};

/** New placed words with `look`, their middle at `middle` (design px). */
export function newPlacedWords(id: string, look: Partial<TextElement> & { text: string }, middle: { cx: number; cy: number }, m: TextMeasurer | null, area: Area): TextElement {
  const t: TextElement = {
    ...NEW_WORDS_LOOK, ...look,
    id, x: middle.cx, y: middle.cy, rotation: 0, opacity: 100, placed: true,
  };
  return placeWords(t, m, area, middle);
}

/** How tall new words are taken to be when their size isn't given (design px). */
const SPOT_GAP = 40;
/** Room left between new words and words already there (design px). */
const SPOT_ROOM = 8;

/** Where new words (`size`: their letters' width and height) go on a photo:
 *  their middle at `middle`, or, when that puts them over words already there
 *  (placed words, and `avoid`: caption boxes holding words, the cover's
 *  title), the nearest spot just under, over, left or right of those words
 *  that keeps them in the area. So new words never land on top of others,
 *  where there is room. */
export function freeSpot(
  existing: readonly TextElement[], middle: { cx: number; cy: number }, m: TextMeasurer | null, area: Area,
  avoid: readonly Area[] = [], size?: { w: number; h: number },
): { cx: number; cy: number } {
  const half = { w: (size?.w ?? 0) / 2 + SPOT_ROOM, h: (size?.h ?? SPOT_GAP) / 2 + SPOT_ROOM };
  const boxes = [
    ...existing.filter(isPlacedWords).map((t) => {
      const ink = wordsInk(t, m);
      return { x0: t.x + ink.left, x1: t.x + ink.right, y0: t.y + ink.top, y1: t.y + ink.bottom };
    }),
    ...avoid.map((a) => ({ x0: a.x, x1: a.x + a.w, y0: a.y, y1: a.y + a.h })),
  ];
  const over = (p: { cx: number; cy: number }) => boxes.find((b) => p.cx + half.w > b.x0 && p.cx - half.w < b.x1 && p.cy + half.h > b.y0 && p.cy - half.h < b.y1);
  const fits = (p: { cx: number; cy: number }) => p.cx - half.w >= area.x && p.cx + half.w <= area.x + area.w && p.cy - half.h >= area.y && p.cy + half.h <= area.y + area.h;
  let spot = { ...middle };
  for (let tries = 0; tries < boxes.length * 2; tries++) {
    const hit = over(spot);
    if (!hit) return spot;
    const options = [
      { cx: spot.cx, cy: hit.y1 + half.h }, { cx: spot.cx, cy: hit.y0 - half.h },
      { cx: hit.x0 - half.w, cy: spot.cy }, { cx: hit.x1 + half.w, cy: spot.cy },
    ].filter(fits);
    if (!options.length) return spot;
    const d = (p: { cx: number; cy: number }) => Math.hypot(p.cx - middle.cx, p.cy - middle.cy);
    // The nearest that is clear of everything, else the nearest.
    spot = options.filter((p) => !over(p)).sort((a, b) => d(a) - d(b))[0] ?? options.sort((a, b) => d(a) - d(b))[0];
  }
  return spot;
}

/** Words on a curve in a box (a caption box, a photo frame: `box`, design
 *  px): a curve isn't clipped to its box, so do its letters stay inside the
 *  safe print area, and within the box's width (textFit's rule)? If not, the
 *  largest whole size (≥ 8) at which they do. As print places it: the curve's
 *  middle at the box's middle, anchored as a straight line is (left, centre,
 *  right, inside the caption margin). null when it can't be measured. */
export function curveInBoxFit(t: WordsLook, box: Area, area: Area, m: TextMeasurer | null): Fit | null {
  if (!m || !t.curve) return null;
  if (!String(t.text ?? '').trim()) return { fits: true, fitsAt: null };
  const align = t.alignment ?? 'center';
  const pad = box.w * CAPTION_PAD_X;
  const anchor = align === 'left' ? box.x + pad : align === 'right' ? box.x + box.w - pad : box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const curve = t.curve;
  const fitsAt = (size: number) => {
    m.font = wordsFont({ ...t, fontSize: size });
    const c = curveGlyphs(t.text, m, size, curve);
    if (c.width > box.w - pad * 2) return false;
    const cx = curveCentreX(anchor, align, c.width);
    const o = inkPad({ fontSize: size, outlineWidth: t.outlineWidth });
    return cx - c.width / 2 - o >= area.x - 0.5 && cx + c.width / 2 + o <= area.x + area.w + 0.5
      && cy - c.height / 2 - o >= area.y - 0.5 && cy + c.height / 2 + o <= area.y + area.h + 0.5;
  };
  const size = t.fontSize || 24;
  if (fitsAt(size)) return { fits: true, fitsAt: null };
  for (let px = Math.floor(size) - 1; px >= 8; px--) if (fitsAt(px)) return { fits: false, fitsAt: px };
  return { fits: false, fitsAt: null };
}
