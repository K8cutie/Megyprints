/* ══════════════════════════════════════════════════════════════════════════
   Megy's "Add Date Stamp" (Step 6): the day this page's photos were taken.

   The date comes from the photos' EXIF capture time (UploadedPhoto.capturedAt,
   read by exif.ts when they were added). exifr reads DateTimeOriginal as local
   wall-clock time, so the day is read back with local getters too.

   Only THIS page's photos count: its photo slots and any free-placed photos.
   Screenshots and photos sent through chat apps usually have no EXIF date;
   then there is no stamp, and Megy says so (NO_PHOTO_DATE) instead of
   guessing. Today's date would be wrong on a printed page.

   WHERE IT GOES (placeDateStamp): small, white with a soft shadow, in a corner
   of the page's largest plain photo, the way a camera stamps a print. Bottom
   right first. A corner that would touch another frame (a video memory's QR
   sits in a photo corner), a caption box or text already on the page is
   skipped, and so is anything within 0.25" of the page edge (the trim). With
   no free corner the caller falls back to Add Text's place: an empty caption
   box, else the middle of the page. Centred, a date ran into the quote box
   beside the photo.
   ══════════════════════════════════════════════════════════════════════════ */

import type { AlbumSizePreset, SlotGeometryOverride, TemplateMargin, TextElement } from '../pages/builder/types';
import { resolveSlotBox } from '../pages/builder/slotGeometry';
import { marginForTemplate } from '../pages/builder/binding';
import { getTemplateById } from '../pages/builder/pageTemplates';
import { getCanvasDimensions } from '../pages/builder/layouts';
import { ALBUM_INCHES } from '../pages/builder/templateKit';
import { TEXT_LINE_HEIGHT } from '../pages/builder/wordArt';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** What Megy says when the page's photos carry no date. */
export const NO_PHOTO_DATE =
  "The photos on this page don't say when they were taken. Tap Add Text to This Page and type the date.";

/** "October 12, 2026", or a range for photos taken over several days:
 *  "October 12–14, 2026", "September 30 – October 2, 2026",
 *  "December 31, 2025 – January 1, 2026". Null when no time is usable. */
export function formatDateStamp(times: readonly (number | null | undefined)[]): string | null {
  const days = times
    .filter((t): t is number => typeof t === 'number' && Number.isFinite(t))
    .map((t) => new Date(t));
  if (days.length === 0) return null;
  days.sort((a, b) => a.getTime() - b.getTime());
  const first = days[0];
  const last = days[days.length - 1];
  const y1 = first.getFullYear(), m1 = first.getMonth(), d1 = first.getDate();
  const y2 = last.getFullYear(), m2 = last.getMonth(), d2 = last.getDate();
  if (y1 === y2 && m1 === m2 && d1 === d2) return `${MONTHS[m1]} ${d1}, ${y1}`;
  if (y1 === y2 && m1 === m2) return `${MONTHS[m1]} ${d1}–${d2}, ${y1}`;
  if (y1 === y2) return `${MONTHS[m1]} ${d1} – ${MONTHS[m2]} ${d2}, ${y1}`;
  return `${MONTHS[m1]} ${d1}, ${y1} – ${MONTHS[m2]} ${d2}, ${y2}`;
}

type PageWithPhotos = {
  slotFills?: readonly (number | null)[];
  photos?: readonly { photoIndex: number }[];
};

/** The capture times of the photos on this page (each photo once). */
export function pagePhotoTimes(
  page: PageWithPhotos | null | undefined,
  photos: readonly { capturedAt?: number | null }[],
): number[] {
  if (!page) return [];
  const indexes = new Set<number>();
  for (const i of page.slotFills ?? []) if (i != null) indexes.add(i);
  for (const p of page.photos ?? []) indexes.add(p.photoIndex);
  const times: number[] = [];
  for (const i of indexes) {
    const t = photos[i]?.capturedAt;
    if (typeof t === 'number' && Number.isFinite(t)) times.push(t);
  }
  return times;
}

/** The stamp for this page, or null when its photos carry no date. */
export function dateStampForPage(
  page: PageWithPhotos | null | undefined,
  photos: readonly { capturedAt?: number | null }[],
): string | null {
  return formatDateStamp(pagePhotoTimes(page, photos));
}

/* ── Where the stamp goes ── */

/** Point sizes on paper: the stamp starts at 11 pt and may shrink to 8 pt to
 *  fit a small photo. Below that it isn't placed in a corner at all. */
const STAMP_PT = 11;
const STAMP_MIN_PT = 8;
/** Gap between the stamp and the photo's edge. */
const STAMP_INSET_IN = 0.12;
/** Nothing closer than this to the page edge: the trim. */
const EDGE_IN = 0.25;
/** The width estimate every renderer's fallback uses (wordArt.freeTextBoxWidth). */
const CHAR_W = 0.6;

/** The free-text fields a date stamp sets (useBuilderState.addTextElement). */
export type StampStyle = Pick<TextElement, 'x' | 'y' | 'fontSize' | 'alignment' | 'color' | 'shadow'> & { width: number };

type Rect = { x: number; y: number; w: number; h: number };
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

type Box = { x: number; y: number; width: number; height: number };
type StampSlot = Box & { kind?: string; shape?: string };

/** The corner spot for `text` on this page, in design px, or null when no
 *  corner of a plain photo is free. Pure: the caller hands it the template,
 *  the page's margin (binding-aware), the canvas and the page's inches. */
export function placeDateStamp(args: {
  text: string;
  page: {
    slotFills?: readonly (number | null)[];
    slotGeometries?: readonly (SlotGeometryOverride | null | undefined)[];
    slotMasks?: readonly (string | null)[];
    textElements?: readonly { boxIndex?: number; x: number; y: number; width?: number; text: string; fontSize?: number }[];
  };
  template: { slots: readonly StampSlot[]; textSlots?: readonly Box[] } | null | undefined;
  margin: TemplateMargin;
  canvas: { width: number; height: number };
  inches: { w: number; h: number };
}): StampStyle | null {
  const { text, page, template, margin, canvas, inches } = args;
  if (!template || !text) return null;
  const W = canvas.width, H = canvas.height;
  const pxPerIn = W / inches.w;
  const safeX = W * margin.left, safeY = H * margin.top;
  const safeW = W * (1 - margin.left - margin.right), safeH = H * (1 - margin.top - margin.bottom);
  const toPx = (b: Box): Rect => ({ x: safeX + b.x * safeW, y: safeY + b.y * safeH, w: b.width * safeW, h: b.height * safeH });

  const slots = template.slots.map((s, i) => toPx(resolveSlotBox(s, page.slotGeometries?.[i] ?? null)));
  const textBoxes = (template.textSlots ?? []).map(toPx);
  const freeTexts: Rect[] = (page.textElements ?? [])
    .filter((t) => t.boxIndex == null)
    .map((t) => {
      const fs = t.fontSize || 24;
      const w = t.width || t.text.length * fs * CHAR_W;
      const lines = Math.max(1, Math.ceil((t.text.length * fs * CHAR_W) / Math.max(1, w)));
      return { x: t.x, y: t.y, w, h: lines * fs * TEXT_LINE_HEIGHT };
    });

  // Plain photos only, biggest first: a circle or a heart has no corner.
  const candidates = template.slots
    .map((s, i) => ({ s, i, r: slots[i] }))
    .filter(({ s, i }) =>
      page.slotFills?.[i] != null &&
      (s.kind == null || s.kind === 'photo') &&
      (s.shape == null || s.shape === 'rectangle' || s.shape === 'rounded') &&
      !page.slotMasks?.[i])
    .sort((a, b) => b.r.w * b.r.h - a.r.w * a.r.h);

  const edge = EDGE_IN * pxPerIn, inset = STAMP_INSET_IN * pxPerIn;
  const pageArea: Rect = { x: edge, y: edge, w: W - 2 * edge, h: H - 2 * edge };
  for (const { i, r } of candidates) {
    // The part of the photo that is safely inside the trim.
    const x0 = Math.max(r.x, pageArea.x), y0 = Math.max(r.y, pageArea.y);
    const x1 = Math.min(r.x + r.w, pageArea.x + pageArea.w), y1 = Math.min(r.y + r.h, pageArea.y + pageArea.h);
    const avail = x1 - x0 - 2 * inset;
    if (avail <= 0 || y1 - y0 <= 2 * inset) continue;
    let fontSize = (STAMP_PT / 72) * pxPerIn;
    if (text.length * fontSize * CHAR_W > avail) fontSize = avail / (text.length * CHAR_W);
    if (fontSize < (STAMP_MIN_PT / 72) * pxPerIn) continue;
    const w = text.length * fontSize * CHAR_W;
    const h = fontSize * TEXT_LINE_HEIGHT;
    if (y1 - y0 < h + 2 * inset) continue;
    const others = [...slots.filter((_, j) => j !== i), ...textBoxes, ...freeTexts];
    for (const [right, bottom] of [[true, true], [false, true], [true, false], [false, false]] as const) {
      const spot: Rect = {
        x: right ? x1 - inset - w : x0 + inset,
        y: bottom ? y1 - inset - h : y0 + inset,
        w, h,
      };
      if (others.some((o) => overlaps(spot, o))) continue;
      const round = (v: number) => Math.round(v * 10) / 10;
      return {
        x: round(spot.x), y: round(spot.y), width: Math.ceil(w), fontSize: round(fontSize),
        alignment: right ? 'right' : 'left', color: '#FFFFFF', shadow: true,
      };
    }
  }
  return null;
}

/** The stamp for the page on screen: its text, and its corner spot (null =
 *  Add Text's own place). Null when the photos carry no date. */
export function dateStampFor(
  page: (PageWithPhotos & Parameters<typeof placeDateStamp>[0]['page'] & { templateId?: string; size?: string }) | null | undefined,
  pageIndex: number,
  albumSize: AlbumSizePreset,
  photos: readonly { capturedAt?: number | null }[],
): { text: string; style: StampStyle | null } | null {
  const text = dateStampForPage(page, photos);
  if (!page || !text) return null;
  const size = (page.size as AlbumSizePreset | undefined) ?? albumSize;
  const template = page.templateId ? getTemplateById(page.templateId) : undefined;
  const style = template
    ? placeDateStamp({
        text,
        page,
        template,
        margin: marginForTemplate(template, template.margin, size, pageIndex),
        canvas: getCanvasDimensions(size),
        inches: ALBUM_INCHES[size] ?? ALBUM_INCHES['8x8'],
      })
    : null;
  return { text, style };
}
