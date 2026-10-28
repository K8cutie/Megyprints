/* ══════════════════════════════════════════════════════════════════════════
   textFit — does a caption fit its box? (1-star testers round 2, PERF2-2)

   A 160-character memory typed into a quote box at size 34 printed with its
   first line and its last word cut off (the box clips), spilled over the
   photo above it in the editor, and Order went straight to checkout. All
   three renderers wrap a caption the same way — wrapTextLines inside the box
   less a 4% pad each side, lines TEXT_LINE_HEIGHT apart, vertically centred,
   clipped to the box — so the same arithmetic, in the editor's design space,
   says whether it fits, and the size at which it would.

   Shared with the 2.0 app (src/shared/sharedModules.ts). Measuring the words
   is the device's job: a TextMeasurer (shared/platform.ts), set to a CSS
   font and asked a width. Every function takes one; left out, it is the
   device's default (canvasMeasurer: the browser's canvas on the website,
   none in the app, whose builder hands in its own).
   ══════════════════════════════════════════════════════════════════════════ */

import type { AlbumPage, AlbumSizePreset } from './types';
import { adaptTemplateToOrientation, getTemplateById } from './pageTemplates';
import { marginForTemplate } from './binding';
import { getCanvasDimensions } from './layouts';
import { wrapTextLines, TEXT_LINE_HEIGHT, CAPTION_PAD_X } from './wordArtRules';
import { defaultMeasurer } from './canvasMeasurer';
import type { TextMeasurer } from '../../shared/platform';

export { defaultMeasurer };

export interface Box { w: number; h: number }
export interface CaptionStyle { fontSize?: number; fontFamily?: string; bold?: boolean; italic?: boolean }
/** What measuring a caption needs: a font to set and a width to read (a
 *  browser canvas's 2D context is one). */
export type Measurer = TextMeasurer;

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

const fontOf = (s: CaptionStyle, size: number) =>
  `${s.italic ? 'italic' : 'normal'} ${s.bold ? 'bold' : 'normal'} ${size}px ${s.fontFamily || 'serif'}`;

function linesAt(text: string, s: CaptionStyle, size: number, box: Box, m: Measurer): number {
  m.font = fontOf(s, size);
  const pad = box.w * CAPTION_PAD_X;
  return wrapTextLines(m, text, box.w - pad * 2).length;
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

/** A plain sentence to measure a box with, longer than any cap. */
const ROOM_SAMPLE = 'The castle lights came on and none of us wanted this happy day to end so we stayed a little longer together under the bright night sky and talked about every ride we took';

/** The longest line a box takes at this style, in characters, capped at
 *  `max`: measured word by word on a plain sentence, the way print wraps.
 *  "Write a line for this photo" writes for the room a box has — a full
 *  sentence in a big box, a short line in a thin band (owner, 2026-10-21:
 *  "the longer quotes makes the page template more relatable"). null when it
 *  can't be measured. */
export function quoteRoom(box: Box, s: CaptionStyle, max = 100, m: Measurer | null = defaultMeasurer()): number | null {
  if (!m || box.w <= 0 || box.h <= 0) return null;
  const words = ROOM_SAMPLE.split(' ');
  let room = 0;
  for (let n = 1; n <= words.length; n++) {
    const t = words.slice(0, n).join(' ');
    if (t.length > max) return max; // it takes everything up to the cap
    if (!captionFits(t, s, box, m)?.fits) break;
    room = t.length;
  }
  return room;
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
