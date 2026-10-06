/* ══════════════════════════════════════════════════════════════════════════
   textFit — does a caption fit its box? (1-star testers round 2, PERF2-2)

   A 160-character memory typed into a quote box at size 34 printed with its
   first line and its last word cut off (the box clips), spilled over the
   photo above it in the editor, and Order went straight to checkout. All
   three renderers wrap a caption the same way — wrapTextLines inside the box
   less a 4% pad each side, lines TEXT_LINE_HEIGHT apart, vertically centred,
   clipped to the box — so the same arithmetic, in the editor's design space,
   says whether it fits, and the size at which it would.
   ══════════════════════════════════════════════════════════════════════════ */

import type { AlbumPage, AlbumSizePreset } from './types';
import { adaptTemplateToOrientation, getTemplateById } from './pageTemplates';
import { marginForTemplate } from './binding';
import { getCanvasDimensions } from './layouts';
import { wrapTextLines, TEXT_LINE_HEIGHT } from './wordArt';

export interface Box { w: number; h: number }
export interface CaptionStyle { fontSize?: number; fontFamily?: string; bold?: boolean; italic?: boolean }
/** What wrapTextLines needs of a canvas context. */
export type Measurer = Pick<CanvasRenderingContext2D, 'font' | 'measureText'>;

/** A caption box's size in DESIGN px (getCanvasDimensions space — the space
 *  fontSize is authored in), exactly as print lays it out. */
export function captionBoxSize(page: AlbumPage, boxIndex: number, albumSize: AlbumSizePreset, pageIndex: number, opts?: { coverMode?: boolean }): Box | null {
  const t = page.templateId ? getTemplateById(page.templateId) : undefined;
  if (!t) return null;
  const { width: W, height: H } = getCanvasDimensions(albumSize);
  const tt = adaptTemplateToOrientation(t, W, H);
  const ts = tt.textSlots?.[boxIndex];
  if (!ts) return null;
  const tm = marginForTemplate(tt, tt.margin, albumSize, pageIndex, { noBinding: !!opts?.coverMode });
  return { w: ts.width * W * (1 - tm.left - tm.right), h: ts.height * H * (1 - tm.top - tm.bottom) };
}

let shared: Measurer | null | undefined;
/** The browser's text measurer (null without a canvas, e.g. under jsdom). */
export function defaultMeasurer(): Measurer | null {
  if (shared !== undefined) return shared;
  try {
    shared = typeof document !== 'undefined' && !/jsdom/i.test(globalThis.navigator?.userAgent ?? '')
      ? document.createElement('canvas').getContext('2d')
      : null;
  } catch { shared = null; }
  return shared;
}

const fontOf = (s: CaptionStyle, size: number) =>
  `${s.italic ? 'italic' : 'normal'} ${s.bold ? 'bold' : 'normal'} ${size}px ${s.fontFamily || 'serif'}`;

function linesAt(text: string, s: CaptionStyle, size: number, box: Box, m: Measurer): number {
  m.font = fontOf(s, size);
  const pad = box.w * 0.04;
  return wrapTextLines(m as CanvasRenderingContext2D, text, box.w - pad * 2).length;
}

export interface Fit {
  fits: boolean;
  /** The largest whole size (≥ 8) at which it fits, when it doesn't now. */
  fitsAt: number | null;
}

/** Does `text` at this style fit `box`? null when it can't be measured. */
export function captionFits(text: string, s: CaptionStyle, box: Box, m: Measurer | null = defaultMeasurer()): Fit | null {
  if (!m || !text.trim() || box.w <= 0 || box.h <= 0) return m ? { fits: true, fitsAt: null } : null;
  const size = s.fontSize || 24;
  const fitsAtSize = (px: number) => linesAt(text, s, px, box, m) * px * TEXT_LINE_HEIGHT <= box.h * 1.02;
  if (fitsAtSize(size)) return { fits: true, fitsAt: null };
  for (let px = Math.floor(size) - 1; px >= 8; px--) if (fitsAtSize(px)) return { fits: false, fitsAt: px };
  return { fits: false, fitsAt: null };
}

/** The captions in the album that don't fit their boxes (0-based pages). */
export function overflowingCaptions(
  pages: readonly AlbumPage[], albumSize: AlbumSizePreset, m: Measurer | null = defaultMeasurer(),
): { pageIndex: number; boxIndex: number }[] {
  if (!m) return [];
  const out: { pageIndex: number; boxIndex: number }[] = [];
  pages.forEach((page, pageIndex) => {
    for (const el of page.textElements ?? []) {
      if (el.boxIndex == null || !(el.text ?? '').trim()) continue;
      const box = captionBoxSize(page, el.boxIndex, albumSize, pageIndex);
      const fit = box ? captionFits(el.text, el, box, m) : null;
      if (fit && !fit.fits) out.push({ pageIndex, boxIndex: el.boxIndex });
    }
  });
  return out;
}

/** Does the front cover's title fit its box? The cover title is box 0 of
 *  the cover page and prints the way a caption does (no binding margin), so
 *  the same arithmetic holds. A long title showed only its middle lines on the
 *  front, top and bottom cut off, and only the spine said anything (1-star
 *  testers round 3, the Perfectionist and the Rule-Breaker). null when there
 *  is no title or it can't be measured. */
export function coverTitleFit(coverFront: AlbumPage | null | undefined, albumSize: AlbumSizePreset, m: Measurer | null = defaultMeasurer()): Fit | null {
  const el = coverFront?.textElements?.find((t) => t.boxIndex === 0);
  if (!coverFront || !el || !(el.text ?? '').trim()) return null;
  const box = captionBoxSize(coverFront, 0, albumSize, 0, { coverMode: true });
  return box ? captionFits(el.text, el, box, m) : null;
}

export const COVER_TITLE_TOO_LONG_MESSAGE = 'The cover title is too long for the front cover: part of it is cut off in print.';

/** "Before you order" line for them, or ''. */
export function longTextsMessage(count: number): string {
  if (!count) return '';
  return count === 1
    ? '1 text is too long for its box: part of it is cut off in print.'
    : `${count} texts are too long for their boxes: part of each is cut off in print.`;
}
