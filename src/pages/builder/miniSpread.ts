/* ═══════════════════════════════════════════════════════════════════════════
   THE MEGY MINI'S MIDDLE SPREAD (owner, 2026-11-16: "since its a staple can we
   have a full page spread feature in the middle page").

   A stapled booklet's two middle pages (8 and 9 of 16) are one piece of
   paper: the inside of the innermost folded sheet (printSheet saddleFolds:
   10|7 · 8|9). Nothing is cut between them, so ONE photo runs across both,
   like a magazine centrefold.

   How it draws: page 8 and page 9 each carry one frame TWO pages wide with no
   spine margin (marginForTemplate gives a spreadHalf template none). Page 8's
   frame starts at its left edge and runs past its right edge; page 9's starts
   one page to the left. Every renderer clips at the page edge, so page 8
   shows the photo's left half and page 9 its right half, and the halves meet
   exactly at the fold. Both pages hold the SAME photo, zoom, pan and look:
   healSpreadPairs keeps them in step after any edit.

   A video memory may go on the spread, in an OUTER corner only (top or
   bottom left on page 8, top or bottom right on page 9): never near the fold
   and the staples (owner, 2026-11-16).
   ═══════════════════════════════════════════════════════════════════════════ */
import type { AlbumPage, PageTemplate, UploadedPhoto } from './types';
import type { QrCorner } from './pageTemplates';

export type SpreadHalf = 'left' | 'right';

/** Page 8 is index 7 (page 1 is index 0); page 9 is index 8. */
export const SPREAD_LEFT_INDEX = 7;

/** The left half's index in a Mini of `pageCount` pages: the booklet's
 *  middle (16 pages: page 8, index 7; 24 pages: page 12, index 11). */
export function spreadLeftIndex(pageCount: number): number {
  return pageCount >= 4 ? Math.floor(pageCount / 2) - 1 : SPREAD_LEFT_INDEX;
}

export const SPREAD_LEFT_ID = 'mini-spread-left';
export const SPREAD_RIGHT_ID = 'mini-spread-right';

/** The outer corners each half may carry a video memory in. */
export const SPREAD_QR_CORNERS: Record<SpreadHalf, readonly QrCorner[]> = { left: ['bl', 'tl'], right: ['br', 'tr'] };

const MINI = '5.8x8.3' as const;
/** A5 in inches: the spread half's own page, no spine reserve. */
const PAGE_W_IN = 148 / 25.4;
const PAGE_H_IN = 210 / 25.4;
/** The same chip as every album's: 1.2" square, 0.35" in from the trim. */
const QR_IN = 1.2;
const QR_PAD_IN = 0.35;

/** The id of a half, with a video memory in `corner` (an outer one). */
export function spreadTemplateId(half: SpreadHalf, corner?: QrCorner | null): string {
  const base = half === 'left' ? SPREAD_LEFT_ID : SPREAD_RIGHT_ID;
  return corner ? `${base}-qr-${corner}` : base;
}

/** Which half of the middle spread a template is, or null. */
export function spreadHalfOf(templateId: string | null | undefined): SpreadHalf | null {
  if (!templateId) return null;
  if (templateId === SPREAD_LEFT_ID || templateId.startsWith(`${SPREAD_LEFT_ID}-qr-`)) return 'left';
  if (templateId === SPREAD_RIGHT_ID || templateId.startsWith(`${SPREAD_RIGHT_ID}-qr-`)) return 'right';
  return null;
}

/** The corner of a spread half's video memory, or null. */
export function spreadQrCornerOf(templateId: string | null | undefined): QrCorner | null {
  const m = /^mini-spread-(?:left|right)-qr-(tl|tr|bl|br)$/.exec(templateId ?? '');
  return m ? (m[1] as QrCorner) : null;
}

function half(side: SpreadHalf, corner: QrCorner | null): PageTemplate {
  const slots: PageTemplate['slots'] = [
    { id: 'p1', x: side === 'left' ? 0 : -1, y: 0, width: 2, height: 1, ratio: '4:3' },
  ];
  if (corner) {
    const w = QR_IN / PAGE_W_IN, h = QR_IN / PAGE_H_IN;
    const px = QR_PAD_IN / PAGE_W_IN, py = QR_PAD_IN / PAGE_H_IN;
    slots.push({
      id: 'qr', kind: 'qr', width: w, height: h,
      x: corner === 'tl' || corner === 'bl' ? px : 1 - px - w,
      y: corner === 'tl' || corner === 'tr' ? py : 1 - py - h,
    });
  }
  return {
    id: spreadTemplateId(side, corner),
    name: corner ? `Middle spread + QR (${corner.toUpperCase()})` : 'Middle spread',
    category: 'single',
    slotCount: slots.length,
    margin: { top: 0, bottom: 0, left: 0, right: 0 },
    orientation: 'landscape',
    targetRatio: '4:3',
    albumSizes: [MINI],
    fullBleed: true,
    spreadHalf: side,
    slots,
  };
}

/** Every spread template: each half plain, and with a memory in each outer
 *  corner. NOT in PAGE_TEMPLATES (never dealt, picked or listed as a layout);
 *  getTemplateById resolves them, like the cover templates. */
export const SPREAD_TEMPLATES: PageTemplate[] = [
  half('left', null), half('right', null),
  ...SPREAD_QR_CORNERS.left.map((c) => half('left', c)),
  ...SPREAD_QR_CORNERS.right.map((c) => half('right', c)),
];

/** The spread's shape (two A5 pages side by side), width / height. */
export const SPREAD_ASPECT = (2 * 148) / 210;

/** The photo for the middle spread: a landscape one that crops least on the
 *  spread (at most 12% off its top and bottom or a third off its sides),
 *  nearest the middle of the roll so the book still reads in time order.
 *  Photos in `skip` (a video memory's own photo) are never taken. Null when
 *  the roll has none: the Mini is made without a spread, as before. */
export function pickSpreadPhoto(photos: readonly UploadedPhoto[], skip: ReadonlySet<number> = new Set()): number | null {
  const mid = (photos.length - 1) / 2;
  let best: { i: number; crop: number; dist: number } | null = null;
  photos.forEach((p, i) => {
    if (skip.has(i) || p.leftOut || !p.width || !p.height) return;
    const a = p.width / p.height;
    if (a < 1.2) return;
    const crop = 1 - Math.min(a, SPREAD_ASPECT) / Math.max(a, SPREAD_ASPECT);
    const fits = a < SPREAD_ASPECT ? crop <= 0.12 : crop <= 0.34;
    if (!fits) return;
    const dist = Math.abs(i - mid);
    // Nearest the middle wins; a crop more than 5% worse loses to a tighter one.
    if (!best || dist + crop * 100 < best.dist + best.crop * 100) best = { i, crop, dist };
  });
  return best ? (best as { i: number }).i : null;
}

/** The two halves for `photo`, built like any full page (createEmptyPage's
 *  page with this template and the photo in its frame). */
export function spreadPages(left: AlbumPage, right: AlbumPage, photo: number): [AlbumPage, AlbumPage] {
  const fill = (p: AlbumPage, side: SpreadHalf): AlbumPage => ({
    ...p,
    templateId: spreadTemplateId(side),
    slotFills: [photo],
    slotScales: [1],
    slotOffsetsX: [0],
    slotOffsetsY: [0],
    qrFills: undefined,
    slotMasks: [],
    slotLooks: [],
    slotGeometries: [],
    studio: false,
  });
  return [fill(left, 'left'), fill(right, 'right')];
}

/** After an edit, keep each spread's two halves showing the same photo, zoom,
 *  pan, look and mask: the half that changed (from `prev` to `next`) is
 *  copied to its partner. Its video memory and corner stay its own. */
export function healSpreadPairs(prev: readonly AlbumPage[], next: AlbumPage[]): AlbumPage[] {
  for (let i = 0; i + 1 < next.length; i++) {
    if (spreadHalfOf(next[i]?.templateId) !== 'left' || spreadHalfOf(next[i + 1]?.templateId) !== 'right') continue;
    const leftChanged = next[i] !== prev[i];
    const rightChanged = next[i + 1] !== prev[i + 1];
    if (leftChanged === rightChanged) continue;
    const from = leftChanged ? next[i] : next[i + 1];
    const to = leftChanged ? i + 1 : i;
    next[to] = {
      ...next[to],
      slotFills: [from.slotFills?.[0] ?? null, ...(next[to].slotFills ?? []).slice(1)],
      slotScales: [from.slotScales?.[0] ?? 1],
      slotOffsetsX: [from.slotOffsetsX?.[0] ?? 0],
      slotOffsetsY: [from.slotOffsetsY?.[0] ?? 0],
      slotLooks: from.slotLooks?.[0] !== undefined ? [from.slotLooks[0]] : [],
      slotMasks: from.slotMasks?.[0] !== undefined ? [from.slotMasks[0]] : [],
    };
    i++;
  }
  return next;
}

/** The outer corner on this half nearest the one asked for: top or bottom
 *  stays, the side is always the spread's outside edge. */
export function outerSpreadCorner(side: SpreadHalf, corner: QrCorner): QrCorner {
  const top = corner === 'tl' || corner === 'tr';
  if (side === 'left') return top ? 'tl' : 'bl';
  return top ? 'tr' : 'br';
}

/** The middle spread back in the middle (pages 8 and 9 of 16, 12 and 13 of
 *  24) after Studio pages that were kept go back where they were, which can
 *  push it along. Unchanged otherwise. */
export function placeSpreadPair(pages: AlbumPage[]): AlbumPage[] {
  const middle = spreadLeftIndex(pages.length);
  const at = pages.findIndex((p, i) => spreadHalfOf(p.templateId) === 'left' && spreadHalfOf(pages[i + 1]?.templateId) === 'right');
  if (at < 0 || at === middle || pages.length < middle + 2) return pages;
  const next = [...pages];
  const pair = next.splice(at, 2);
  next.splice(middle, 0, ...pair);
  return next;
}

/** Is this page index a half of the middle spread? */
export function isSpreadPage(pages: readonly AlbumPage[], index: number): boolean {
  return spreadHalfOf(pages[index]?.templateId) !== null;
}
