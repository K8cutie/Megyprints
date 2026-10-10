import type { AlbumPage, UploadedPhoto, AlbumSizePreset, LayoutStyle, PageTemplate, TextElement, BoxRoll, QrFill } from './types';
import { medianSharpness, isBlurry, photoQuality } from '../../lib/photoCheck';
import { separateLookAlikes } from './lookAlikes';
import { getTemplateById, getTemplatesForRatio, getTemplatesForAlbum, getTemplatesForOrientation, orientationOfRatio, orientationOfShape, photoSlotCount, qrBadgeTemplate, qrBadgeCornerOf, type QrCorner } from './pageTemplates';

/* ── Ratio LOOSENING budget ───────────────────────────────────────────────────
   Ratio matching is loosened, not removed: a photo still prefers its own ratio,
   but may also use a NEIGHBOURING ratio of the same orientation. The budget is
   the crop that costs — adjacent camera ratios are cheap, distant ones are not:
     4:3 <-> 3:2  11.1%      3:2 <-> 16:9  15.6%      4:3 <-> 16:9  25.0%
     3:4 <-> 2:3  11.1%      2:3 <-> 9:16  15.6%      3:4 <-> 9:16  25.0%
   0.16 therefore admits the adjacent pairs and excludes the far ones. */
const MAX_LOOSE_CROP = 0.16;
const RATIO_VALUE: Record<string, number> = {
  '4:3': 4 / 3, '3:4': 3 / 4, '3:2': 3 / 2, '2:3': 2 / 3, '1:1': 1, '16:9': 16 / 9, '9:16': 9 / 16,
};
/** Fraction of the photo lost when aspect `a` is object-cover fitted into `b`. */
const cropBetween = (a: number, b: number) => 1 - Math.min(a, b) / Math.max(a, b);
const ratioCrop = (a: string, b: string) => cropBetween(RATIO_VALUE[a] ?? 1, RATIO_VALUE[b] ?? 1);
import { analyzePhotos, type PhotoRatio } from './photoAnalyzer';
import { PER_SIZE_AUTHORED } from './templateKit';
import { templateTracker, ShuffleBag, shuffleArray } from './varietyTracker';
import { MIN_ALBUM_PAGES as MIN_PAGES, naturalPerPage } from './densities';

/* ══════════════════════════════════════════════════════════════════════════
   SMART ALBUM GENERATION — Ratio-aware template matching
   ══════════════════════════════════════════════════════════════════════════ */

/** Deterministic page ID from index */
function makePageId(index: number): string {
  return `page-${String(index).padStart(4, '0')}`;
}

function createEmptyPage(
  index: number,
  size: AlbumSizePreset,
  background?: AlbumPage['background'],
  border?: { color: string; width: number },
  cornerBase?: string,
): AlbumPage {
  return {
    id: makePageId(index),
    layout: 'freeform' as LayoutStyle,
    size,
    templateId: undefined,
    slotFills: [],
    slotScales: [],
    slotOffsetsX: [],
    slotOffsetsY: [],
    slotGeometries: [],
    photos: [],
    textElements: [],
    background: background ?? { type: 'solid' as const, solid: '#FFFBF7' },
    photoBorderColor: border?.color,
    photoBorderWidth: border?.width,
    cornerBase,
  };
}

/** A new "moment" starts when consecutive shots are more than this apart. */
const MOMENT_GAP_MS = 3 * 60 * 60 * 1000; // 3 hours

/** Split photos into chronological "moments" by EXIF capture time, so photos
 *  taken close together land on the same page(s). Photos without EXIF time keep
 *  their upload order in a trailing group. Returns arrays of photo indices. */
function groupPhotosByMoment(photos: UploadedPhoto[]): number[][] {
  const timed: { i: number; t: number }[] = [];
  const untimed: number[] = [];
  photos.forEach((p, i) => {
    if (typeof p.capturedAt === 'number') timed.push({ i, t: p.capturedAt });
    else untimed.push(i);
  });
  timed.sort((a, b) => a.t - b.t);

  const groups: number[][] = [];
  let current: number[] = [];
  let lastT: number | null = null;
  for (const { i, t } of timed) {
    if (lastT !== null && t - lastT > MOMENT_GAP_MS) {
      if (current.length) groups.push(current);
      current = [];
    }
    current.push(i);
    lastT = t;
  }
  if (current.length) groups.push(current);
  if (untimed.length) groups.push(untimed); // no-EXIF photos → trailing group

  // Nothing had a capture time → one group in upload order (old behaviour).
  return groups.length ? groups : [photos.map((_, i) => i)];
}

/* ══════════════════════════════════════════════════════════════════════════
   BOX DEALING — Megy decides what each combo/caption box holds.
   Boxes used to generate EMPTY and wait for the customer to pick a kind from
   the 3-way chooser (which mostly never happened — dead bands). Now each box
   ROLLS its content at generation: a quote materializes immediately as a bound
   caption; text/qr are stored as the box's dealt kind and render as tap-to-fill
   invitations that open that kind's editor directly. The customer can always
   override via the box's chooser affordance — the roll sets a default, never
   a cage.
   ══════════════════════════════════════════════════════════════════════════ */

/** The owner-set odds of each kind. Must sum to 1.
 *  2026-08-12: 45/30/25. 2026-09-09 (owner): 60/25/15 — quotes are the
 *  zero-effort completion accelerant, so they take the larger share now that
 *  the pool is sized to the album and can't run dry. 2026-10-02 (owner): no
 *  QR in combo boxes any more — video memories live on full-page photos (see
 *  VIDEO-READY PAGES) — so QR's share splits 60:25 → 70/30. 'qr' stays a
 *  BoxRoll only because saved albums carry it. */
export const BOX_ROLL_WEIGHTS: Record<BoxRoll, number> = { quote: 0.70, text: 0.30, qr: 0 };

/** What generation needs to deal boxes. Quote styling is passed in (not read
 *  from THEMES here) because generateAlbum is pure — the caller resolves the
 *  active theme's caption font/color so a dealt quote is EXACTLY what a
 *  QuotePickerModal pick via setBoxText would have produced. Absent (specs,
 *  legacy callers) → boxes generate empty exactly as before. */
export interface BoxContentOptions {
  quotePool: string[];
  quoteFontFamily: string;
  quoteColor: string;
  /** The occasion the pool was written for: each dealt quote carries it
   *  (TextElement.fromOccasion) so a later occasion change can swap it. */
  occasion?: string;
}

export function rollBoxKind(): BoxRoll {
  const r = Math.random();
  if (r < BOX_ROLL_WEIGHTS.quote) return 'quote';
  if (r < BOX_ROLL_WEIGHTS.quote + BOX_ROLL_WEIGHTS.text) return 'text';
  return 'qr';
}

/** A roll that may NOT be a quote: text vs qr at their relative odds (25:15),
 *  so QR keeps its share instead of every held-back box collapsing to text. */
export function rollNonQuoteKind(): BoxRoll {
  return Math.random() < BOX_ROLL_WEIGHTS.text / (BOX_ROLL_WEIGHTS.text + BOX_ROLL_WEIGHTS.qr) ? 'text' : 'qr';
}

/** QUOTE CADENCE (owner, 2026-09-12): a quote on most pages reads as filler
 *  put there to pad the page count. So a dealt quote may land on at most ONE
 *  box per page, and never on two consecutive pages; the boxes it is held
 *  back from still deal as own-words / QR invitations at their odds. */
export const QUOTE_CADENCE = { maxPerPage: 1, minPageGap: 1 } as const;

/** Does this page already carry a bound caption (a dealt quote or the
 *  customer's own words)? Either way it "speaks", and the cadence counts it. */
export function pageSpeaks(page: AlbumPage): boolean {
  return page.textElements.some((t) => t.boxIndex != null) || (page.slotTexts ?? []).some((t) => !!t);
}

/** Deals each pool line AT MOST ONCE per generation (shuffled order), then
 *  null forever — an album can NEVER carry the same dealt quote twice (owner
 *  rule). Callers degrade a null deal (dealBoxContent re-rolls the box between
 *  the remaining kinds), so a big album gets more invitations once the pool
 *  runs dry instead of twin quotes. */
export function makeQuoteDealer(pool: string[]): () => string | null {
  const deck = shuffleArray([...pool]);
  let i = 0;
  return () => (i < deck.length ? deck[i++] : null);
}

/** Roll every combo/caption box of a freshly built page (mutates it). A rolled
 *  quote becomes a bound caption NOW — the exact TextElement shape setBoxText
 *  creates, so all three renderers treat it as an ordinary caption. An
 *  exhausted or empty quote pool degrades the roll to a text/qr invitation
 *  (at their relative odds) rather than a blank promise — a line is never
 *  dealt twice in one album. Shared by generateAlbum and the per-page
 *  regenerate. */
export function dealBoxContent(
  page: AlbumPage,
  template: PageTemplate,
  box: BoxContentOptions,
  dealQuote: () => string | null,
  /** Cadence: false when the previous page carries a quote. */
  allowQuote = true,
): boolean {
  const boxes = template.textSlots?.length ?? 0;
  if (boxes === 0) return false;
  const rolls: (BoxRoll | null)[] = [];
  let quotesHere = 0;
  for (let j = 0; j < boxes; j++) {
    let kind = rollBoxKind();
    // Cadence: no quote when the previous page has one, and at most one per page.
    if (kind === 'quote' && (!allowQuote || quotesHere >= QUOTE_CADENCE.maxPerPage)) kind = rollNonQuoteKind();
    if (kind === 'quote') {
      const quote = dealQuote();
      if (quote) {
        quotesHere++;
        page.textElements.push({
          id: `box-${j}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          text: quote,
          x: 0,
          y: 0,
          fontSize: 28,
          fontFamily: box.quoteFontFamily,
          color: box.quoteColor,
          bold: false,
          italic: true,
          underline: false,
          alignment: 'center',
          rotation: 0,
          opacity: 100,
          boxIndex: j,
          ...(box.occasion ? { fromOccasion: box.occasion } : {}),
        } satisfies TextElement);
      } else {
        // Pool exhausted (or empty): never repeat a line — re-roll this box
        // between the two remaining kinds at their RELATIVE odds (25:15) so
        // QR keeps its share instead of every late box collapsing to text.
        kind = rollNonQuoteKind();
      }
    }
    rolls.push(kind);
  }
  page.textSlotRoll = rolls;
  return quotesHere > 0;
}

/* ══════════════════════════════════════════════════════════════════════════
   VIDEO-READY PAGES (owner, 2026-09-12): "7 QR links as the minimum for a
   40-page album." The album includes 7 video memories, so it must OFFER at
   least 7 places to put one.
   2026-10-02 (owner): those places are FULL-PAGE PHOTOS, no longer combo
   boxes ("Add a VIDEO to this QR" is gone). generateAlbum reserves the
   MIN_MEMORY_PAGES photos that crop least on a full page and gives each its
   own full-bleed single, spread across the album; the "Add a video memory"
   button turns one into a full-bleed photo with a corner QR badge.
   ══════════════════════════════════════════════════════════════════════════ */
export const MIN_MEMORY_PAGES = 7;

/** A QR already sits on this page (a badge, or one placed in a box before
 *  box QRs were retired — those keep working). */
export function hasActiveQr(page: AlbumPage): boolean {
  return (page.qrFills ?? []).some((q) => q != null) || (page.textSlotQr ?? []).some((q) => q != null);
}

/** Can "Add a video memory" go on this page as it stands? The ONE rule the
 *  button (canAddMemoryQr) and the generator share: exactly one photo slot,
 *  with a photo, no caption box (the badge layout has none, so a caption
 *  would be orphaned), and no QR on it yet. A QR-badge page whose memory was
 *  removed qualifies again, so it is never stranded. */
export function canTakeMemoryQr(page: AlbumPage): boolean {
  const t = page.templateId ? getTemplateById(page.templateId) : undefined;
  if (!t) return false;
  const filled = (page.slotFills ?? []).some((f) => f != null);
  return photoSlotCount(t) === 1 && filled && !(t.textSlots?.length) && !hasActiveQr(page);
}

/** A page that carries a video memory or can take one. */
export function isMemoryReady(page: AlbumPage): boolean {
  return hasActiveQr(page) || canTakeMemoryQr(page);
}

/** The video memories on a page: its badge, plus any placed in a frame or a
 *  box before memories moved to full pages. */
export function memoriesOn(page: AlbumPage): QrFill[] {
  return [...(page.qrFills ?? []), ...(page.textSlotQr ?? [])].filter((q): q is QrFill => q != null);
}

/** Can a video memory sit on this layout? A memory only ever sits on a
 *  full-bleed, one-photo page — the photo over the whole sheet, no box —
 *  with its QR as the corner badge (owner, 2026-10-08). The QR-badge
 *  layouts themselves qualify. */
export function layoutHoldsMemory(t: PageTemplate): boolean {
  return photoSlotCount(t) === 1 && !(t.textSlots?.length) && coversWholeSheet(t);
}

/* ── Which photos go on the memory pages ──────────────────────────────────
   A full-page single shows the photo object-cover across the whole sheet, so
   any photo that isn't the page's shape loses an edge. Losing the SIDES is
   fine (a landscape on a square page: ~12% off each side); losing the TOP and
   BOTTOM takes heads and feet, so only what an adjacent camera ratio would
   cost is allowed there. Photos inside those limits FIT; an album short of
   fitting photos takes the least-bad others — and, when the caller detected
   faces, only those whose faces the centred crop keeps. */
const PAGE_ASPECT: Record<string, number> = {
  '6x4': 6 / 4, '8x6': 8 / 6, '6x8': 6 / 8, '6x6': 1, '8x8': 1, '9x9': 1, '11.5x8': 11.5 / 8, '8.5x11': 8.5 / 11,
};
const SIDE_CROP_OK = 0.34;
const TOP_CROP_OK = 0.12;
/** The most a SHORT album may take off the top + bottom (12.5% each — a
 *  portrait on a square page), and only face-aware when faces are known. */
const TOP_CROP_MAX = 0.25;
/** Face centre must sit this far inside the kept band (a head has size). */
const FACE_MARGIN = 0.07;

function fullPageCrop(photo: UploadedPhoto, pageAspect: number): { crop: number; vertical: boolean } {
  const a = photo.width > 0 && photo.height > 0 ? photo.width / photo.height : 1;
  return { crop: cropBetween(a, pageAspect), vertical: a < pageAspect };
}
function fitsFullPage(photo: UploadedPhoto, pageAspect: number): boolean {
  const { crop, vertical } = fullPageCrop(photo, pageAspect);
  return vertical ? crop <= TOP_CROP_OK + 1e-9 : crop <= SIDE_CROP_OK + 1e-9;
}
/** A portrait on a landscape page or vice versa: it loses ~half the photo. */
function crossesOrientation(photo: UploadedPhoto, pageAspect: number): boolean {
  const a = photo.width > 0 && photo.height > 0 ? photo.width / photo.height : 1;
  const orient = (x: number) => (x > 1.05 ? 'L' : x < 0.95 ? 'P' : 'S');
  const po = orient(a), pg = orient(pageAspect);
  return (po === 'L' && pg === 'P') || (po === 'P' && pg === 'L');
}
/** May this photo go on a full page at all? Fitting photos, plus — for an
 *  album short of those — a top/bottom cut up to TOP_CROP_MAX. Never across
 *  orientation (a portrait on a landscape page or vice versa loses ~half the
 *  photo — the rule the whole layout engine is built on). */
function allowedOnFullPage(photo: UploadedPhoto, pageAspect: number): boolean {
  if (fitsFullPage(photo, pageAspect)) return true;
  if (crossesOrientation(photo, pageAspect)) return false;
  const { crop, vertical } = fullPageCrop(photo, pageAspect);
  return vertical ? crop <= TOP_CROP_MAX + 1e-9 : crop <= SIDE_CROP_OK + 1e-9;
}
/** Lower is better. Fitting photos cost their crop; others pay for a top/
 *  bottom cut, more when a known face falls outside the kept band. */
function fullPageCost(photo: UploadedPhoto, pageAspect: number, face?: { x: number; y: number }): number {
  const { crop, vertical } = fullPageCrop(photo, pageAspect);
  if (fitsFullPage(photo, pageAspect)) return crop;
  if (!face) return 1 + crop * (vertical ? 3 : 1);
  const at = vertical ? face.y : face.x;
  const kept = at >= crop / 2 + FACE_MARGIN && at <= 1 - crop / 2 - FACE_MARGIN;
  return kept ? 0.5 + crop : 4 + crop;
}

/** Does this single-photo template stretch its photo across the WHOLE sheet? */
function coversWholeSheet(t: PageTemplate): boolean {
  if (!t.fullBleed) return false;
  const s = t.slots[0];
  return !!s && s.x <= 0.001 && s.y <= 0.001 && s.width >= 0.999 && s.height >= 0.999;
}

/** The size's full-page single: one photo over the whole sheet, no box, and a
 *  slot ratio that matches the page (so the render IS the page shape). */
export function memorySingleTemplate(size: AlbumSizePreset): PageTemplate | undefined {
  const aspect = PAGE_ASPECT[size] ?? 1;
  return getTemplatesForAlbum(size).find((t) =>
    t.slots.length === 1 && !(t.textSlots?.length) && coversWholeSheet(t)
    && Math.abs(Math.log((RATIO_VALUE[t.targetRatio] ?? 1) / aspect)) < 0.12);
}

/** Photos (by index) that would need a crop on a memory page — the ones worth
 *  running face detection on BEFORE generation. Empty when the album already
 *  has MIN_MEMORY_PAGES fitting photos (the common case: no detection cost). */
export function memoryFaceCandidates(photos: UploadedPhoto[], size: AlbumSizePreset, max = 40): number[] {
  const aspect = PAGE_ASPECT[size] ?? 1;
  const fitting = photos.filter((p) => fitsFullPage(p, aspect)).length;
  if (fitting >= Math.min(MIN_MEMORY_PAGES, photos.length)) return [];
  return photos.map((_, i) => i)
    .filter((i) => !fitsFullPage(photos[i], aspect) && allowedOnFullPage(photos[i], aspect))
    .slice(0, max);
}

/** Why this album would get fewer than MIN_MEMORY_PAGES video memories — its
 *  photos are the wrong shape for its full pages — and the no-crop fixes:
 *  more photos of the shape those pages need, or an offered size whose full
 *  pages already fit them (the flipped orientation first: 8×6 ↔ 6×8). null
 *  when the album isn't short, or has under MIN_MEMORY_PAGES photos at all
 *  (that's "add photos", which the fill estimate already says). Photos still
 *  being measured (0×0) don't count either way. Same rule as generation. */
export interface MemoryShortfall {
  have: number;
  missing: number;
  shape: 'landscape' | 'portrait';
  betterSize?: AlbumSizePreset;
}
export function memoryShortfall(photos: UploadedPhoto[], size: AlbumSizePreset, offered: AlbumSizePreset[]): MemoryShortfall | null {
  const measured = photos.filter((p) => p.width > 0 && p.height > 0);
  if (measured.length < MIN_MEMORY_PAGES) return null;
  const fitOn = (s: AlbumSizePreset) => {
    const aspect = PAGE_ASPECT[s] ?? 1;
    return measured.filter((p) => allowedOnFullPage(p, aspect)).length;
  };
  const have = fitOn(size);
  if (have >= MIN_MEMORY_PAGES) return null;
  const aspect = PAGE_ASPECT[size] ?? 1;
  const shape = aspect < 0.95 ? 'portrait' : 'landscape';
  const flip = (s: AlbumSizePreset) => Math.abs(Math.log((PAGE_ASPECT[s] ?? 1) * aspect));
  const betterSize = offered
    .filter((s) => s !== size && memorySingleTemplate(s) && fitOn(s) >= MIN_MEMORY_PAGES)
    .sort((a, b) => flip(a) - flip(b) || fitOn(b) - fitOn(a))[0];
  return { have, missing: MIN_MEMORY_PAGES - have, shape, ...(betterSize ? { betterSize } : {}) };
}

/* ══════════════════════════════════════════════════════════════════════════
   A NEW SIZE KEEPS THE VIDEO MEMORIES (2026-10-08). A memory is the
   customer's video and its printed QR. Changing a made album's size lays
   every page out again, and the generator never carried a QR over: every
   memory was dropped, with no word. Now each one comes along onto a full page
   of the new size, as its corner badge on the same photo, in the same corner.
   A memory whose photo can't fill a page of the new size can't come; the
   caller asks before it comes off (actionEngine change_size).
   ══════════════════════════════════════════════════════════════════════════ */
export interface CarriedMemory {
  /** The photo it sits on: an index into the photos. */
  photo: number;
  fill: QrFill;
  /** Its badge corner. null for a memory placed in a frame or a box before
   *  memories moved to full pages: the caller picks the corner away from the
   *  face, the way "Add a video memory" does. */
  corner: QrCorner | null;
}

/** Can this memory photo be the full page of `size`? What the generator
 *  allows any memory page (allowedOnFullPage), or — for a photo that was a
 *  full page of `was` already, which the customer saw — no more cut than it
 *  had there. Never across orientation. */
export function memoryPhotoFits(photo: UploadedPhoto, size: AlbumSizePreset, was?: AlbumSizePreset): boolean {
  const aspect = PAGE_ASPECT[size] ?? 1;
  if (allowedOnFullPage(photo, aspect)) return true;
  if (!was || crossesOrientation(photo, aspect)) return false;
  return fullPageCrop(photo, aspect).crop <= fullPageCrop(photo, PAGE_ASPECT[was] ?? 1).crop + 1e-9;
}

/** Which of the album's memories a change from `from` to `to` carries, each
 *  on its photo (`photos` indexes), and which can't come. A badge comes with
 *  its own photo; a frame or box memory with a photo of its page that fits,
 *  one no other memory took if it can. A memory placed twice (a duplicated
 *  page) comes along once, from whichever place fits. Two memories on one
 *  photo the album holds twice both come (the photo stays in twice). */
export function memoriesAcrossSize(
  pages: AlbumPage[], photos: UploadedPhoto[], from: AlbumSizePreset, to: AlbumSizePreset,
): { carried: CarriedMemory[]; lost: QrFill[] } {
  type Spot = { photo: number; was?: AlbumSizePreset; corner: QrCorner | null };
  const byCode = new Map<string, { fill: QrFill; badge: boolean; spots: Spot[] }>();
  for (const page of pages) {
    const memories = memoriesOn(page);
    if (!memories.length) continue;
    const t = page.templateId ? getTemplateById(page.templateId) : undefined;
    const corner = memories.length === 1 ? qrBadgeCornerOf(page.templateId) : null;
    const was = t && layoutHoldsMemory(t) ? ((page.size as AlbumSizePreset | undefined) ?? from) : undefined;
    const onPage = [...new Set([...(page.slotFills ?? []), ...(page.textSlotFills ?? [])].filter((f): f is number => f != null))];
    for (const fill of memories) {
      const entry = byCode.get(fill.code) ?? { fill, badge: false, spots: [] };
      byCode.set(fill.code, entry);
      // A badge's own photo first, ahead of anything a frame or box offers.
      if (corner) { entry.badge = true; entry.spots.unshift(...onPage.slice(0, 1).map((photo) => ({ photo, was, corner }))); }
      else entry.spots.push(...onPage.map((photo) => ({ photo, was, corner: null })));
    }
  }
  const carried: CarriedMemory[] = [];
  const lost: QrFill[] = [];
  const badgeOK = !!qrBadgeTemplate(to, 'br');
  const fits = (s: Spot) => badgeOK && !!photos[s.photo] && memoryPhotoFits(photos[s.photo], to, s.was);
  const claimed = new Set<number>();
  // Badges first (each has its one photo), then frame/box memories, which
  // pick among their page's photos.
  const entries = [...byCode.values()].sort((a, b) => Number(b.badge) - Number(a.badge));
  for (const { fill, badge, spots } of entries) {
    const ok = spots.filter(fits);
    const spot = (badge ? ok[0] : undefined) ?? ok.find((s) => !claimed.has(s.photo)) ?? ok[0];
    if (!spot) { lost.push(fill); continue; }
    claimed.add(spot.photo);
    carried.push({ photo: spot.photo, fill, corner: spot.corner });
  }
  return { carried, lost };
}

/** Pick `k` memory photos spread across the album's chronological order:
 *  each of k equal stretches gives its best FITTING photo nearest its middle;
 *  a stretch with none borrows a spare fitting photo from elsewhere (kept a
 *  little apart from the others); only then does it take its least-bad other. */
function pickMemoryPhotos(
  photos: UploadedPhoto[], size: AlbumSizePreset, k: number,
  faces?: Record<number, { x: number; y: number }>, randomize = false,
): number[] {
  const aspect = PAGE_ASPECT[size] ?? 1;
  const order = groupPhotosByMoment(photos).flat();
  const n = order.length;
  if (k <= 0 || n === 0) return [];
  const allowed = (i: number) => allowedOnFullPage(photos[i], aspect);
  if (n <= k) return order.filter(allowed);
  // Megy's photo check (lib/photoCheck): a blurry shot only as a last resort,
  // and the sharper, eyes-open shot wins within a stretch. Without check
  // results every photo scores the same, so nothing changes.
  const median = medianSharpness(photos);
  const blurry = (i: number) => isBlurry(photos[i], median);
  const weak = (i: number) => 1 - photoQuality(photos[i], median);
  const fits = (i: number) => fitsFullPage(photos[i], aspect) && !blurry(i);
  const cost = (i: number) => fullPageCost(photos[i], aspect, faces?.[i]);
  const picks: (number | null)[] = new Array(k).fill(null);
  const pickedAt: number[] = [];
  const used = new Set<number>();
  const take = (s: number, p: number) => { picks[s] = order[p]; used.add(order[p]); pickedAt.push(p); };
  const seg = (s: number) => [Math.floor((s * n) / k), Math.floor(((s + 1) * n) / k)] as const;
  const centre = (s: number) => {
    const [lo, hi] = seg(s);
    const mid = (lo + hi - 1) / 2;
    return randomize ? mid + (Math.random() - 0.5) * (hi - lo) * 0.6 : mid;
  };
  // 1. Each stretch: its fitting photo nearest the middle (cheaper crop breaks ties).
  for (let s = 0; s < k; s++) {
    const [lo, hi] = seg(s);
    let best = -1, bestD = Infinity;
    for (let p = lo; p < hi; p++) {
      if (!fits(order[p])) continue;
      const d = Math.abs(p - centre(s)) + cost(order[p]) + weak(order[p]) * (hi - lo);
      if (d < bestD) { bestD = d; best = p; }
    }
    if (best >= 0) take(s, best);
  }
  // 2. A stretch without one borrows a spare fitting photo, nearest first,
  //    never right beside another memory photo (two full pages in a row).
  const minGap = Math.max(1, Math.floor(n / (k * 3)));
  for (let s = 0; s < k; s++) {
    if (picks[s] != null) continue;
    let best = -1, bestD = Infinity;
    for (let p = 0; p < n; p++) {
      const i = order[p];
      if (used.has(i) || !fits(i) || pickedAt.some((q) => Math.abs(q - p) < minGap)) continue;
      const d = Math.abs(p - centre(s));
      if (d < bestD) { bestD = d; best = p; }
    }
    if (best >= 0) take(s, best);
  }
  // 3. Still short: the stretch's least-bad ALLOWED other photo (face-aware
  //    when known), else any allowed one left; none allowed → fewer memory
  //    pages rather than a photo cut across its orientation.
  for (let s = 0; s < k; s++) {
    if (picks[s] != null) continue;
    const [lo, hi] = seg(s);
    let best = -1, bestC = Infinity;
    for (let p = lo; p < hi; p++) {
      const i = order[p];
      if (used.has(i) || !allowed(i)) continue;
      const c = cost(i) + Math.abs(p - centre(s)) / n + weak(i) + (blurry(i) ? 10 : 0);
      if (c < bestC) { bestC = c; best = p; }
    }
    if (best < 0) for (let p = 0; p < n; p++) if (!used.has(order[p]) && allowed(order[p])) { best = p; break; }
    if (best >= 0) take(s, best);
  }
  return picks.filter((i): i is number => i != null);
}

/** Put each reserved photo's full-page single back where its photo falls in
 *  the album's order, never right beside another full-page single. A photo
 *  that carries a memory (`badges`) gets its badge page instead — one per
 *  memory it carries (it is reserved that many times). Mutates. */
function insertMemoryPages(
  pages: AlbumPage[], reserved: number[], solo: PageTemplate | undefined, photos: UploadedPhoto[],
  size: AlbumSizePreset, background?: AlbumPage['background'],
  options?: { border?: { color: string; width: number }; cornerBase?: string },
  badges?: Map<number, CarriedMemory[]>,
): void {
  const order = groupPhotosByMoment(photos).flat();
  const pos = new Map(order.map((idx, p) => [idx, p]));
  const pagePos = (p: AlbumPage) => {
    let m = Infinity;
    for (const f of [...(p.slotFills ?? []), ...(p.textSlotFills ?? [])]) if (f != null) m = Math.min(m, pos.get(f) ?? Infinity);
    return m;
  };
  const isFullPage = (p: AlbumPage | undefined) => {
    const t = p?.templateId ? getTemplateById(p.templateId) : undefined;
    return !!t && photoSlotCount(t) === 1 && coversWholeSheet(t);
  };
  for (const r of [...reserved].sort((a, b) => (pos.get(a) ?? 0) - (pos.get(b) ?? 0))) {
    // Right after the LAST page that starts before this photo. "Before the
    // first page that starts after it" put six memory pages in a row on pages
    // 1-7: shapes are dealt in turn, so the 13 portraits from the END of the
    // roll sit on pages 2-8, and every memory photo stopped at the first of
    // them (1-star testers round 3, the Hoarder).
    let at = 0;
    pages.forEach((p, i) => { if (pagePos(p) < (pos.get(r) ?? 0)) at = i + 1; });
    // Facing pages must not repeat a look: step one page later (or earlier).
    if (isFullPage(pages[at - 1]) || isFullPage(pages[at])) {
      if (at + 1 <= pages.length && !isFullPage(pages[at]) && !isFullPage(pages[at + 1])) at += 1;
      else if (at - 1 >= 0 && !isFullPage(pages[at - 2]) && !isFullPage(pages[at - 1])) at -= 1;
    }
    const page = createEmptyPage(pages.length, size, background, options?.border, options?.cornerBase);
    const memory = badges?.get(r)?.shift();
    const badge = memory ? qrBadgeTemplate(size, memory.corner ?? 'br') : undefined;
    if (memory && badge) asBadgePage(page, badge, r, memory.fill);
    else if (solo) {
      page.templateId = solo.id;
      page.slotFills = [r];
      page.slotScales = [1];
      page.slotOffsetsX = [0];
      page.slotOffsetsY = [0];
    } else continue;
    pages.splice(at, 0, page);
  }
}

/** The page "Add a video memory" makes (applyMemoryQr): the photo over the
 *  whole sheet, the QR chip in its corner, and no theme corners, which would
 *  sit over the chip. Mutates. */
function asBadgePage(page: AlbumPage, badge: PageTemplate, photo: number, fill: QrFill): void {
  const n = badge.slots.length;
  const photoSlot = badge.slots.findIndex((s) => s.kind !== 'qr');
  page.templateId = badge.id;
  page.slotFills = badge.slots.map((_, i) => (i === photoSlot ? photo : null));
  page.qrFills = badge.slots.map((s) => (s.kind === 'qr' ? fill : null));
  page.slotTexts = new Array(n).fill(null);
  page.ornamentFills = new Array(n).fill(null);
  page.slotScales = new Array(n).fill(1);
  page.slotOffsetsX = new Array(n).fill(0);
  page.slotOffsetsY = new Array(n).fill(0);
  page.cornerBase = undefined;
}

/* ══════════════════════════════════════════════════════════════════════════
   STUDIO PAGES SURVIVE A RESHUFFLE. A page the customer moved frames on is
   theirs: Regenerate / Surprise Me build the rest of the album around it.
   The caller splits them out, generates from the remaining photos with a
   smaller minimum, maps the fresh pages' photo indexes back to the full
   pool, and merges the kept pages back at their old positions.
   ══════════════════════════════════════════════════════════════════════════ */
export function splitStudioPages(pages: AlbumPage[]): { kept: { index: number; page: AlbumPage }[]; used: Set<number> } {
  const kept: { index: number; page: AlbumPage }[] = [];
  const used = new Set<number>();
  pages.forEach((page, index) => {
    if (!page.studio) return;
    kept.push({ index, page });
    for (const f of page.slotFills ?? []) if (f != null) used.add(f);
    for (const f of page.textSlotFills ?? []) if (f != null) used.add(f);
  });
  return { kept, used };
}

/** Fresh pages were dealt from a REDUCED pool; `map[k]` is pool index k's
 *  index in the full photo list. Mutates. */
export function remapSlotFills(pages: AlbumPage[], map: number[]): void {
  const re = (f: number | null | undefined) => (f == null ? null : (map[f] ?? null));
  for (const p of pages) {
    if (p.slotFills) p.slotFills = p.slotFills.map(re);
    if (p.textSlotFills) p.textSlotFills = p.textSlotFills.map(re);
  }
}

/** Put the kept pages back where they were (clamped to the new length). */
export function mergeStudioPages(fresh: AlbumPage[], kept: { index: number; page: AlbumPage }[]): AlbumPage[] {
  const out = [...fresh];
  for (const k of [...kept].sort((a, b) => a.index - b.index)) out.splice(Math.min(k.index, out.length), 0, k.page);
  return out;
}

/** How many combo/caption boxes an album carries — ONE quote per box is the
 *  pool size that guarantees neither generation nor the finish-line sweep ever
 *  runs dry (each line is dealt at most once). */
export function countAlbumBoxes(pages: AlbumPage[]): number {
  let n = 0;
  for (const p of pages) {
    const t = p.templateId ? getTemplateById(p.templateId) : undefined;
    n += t?.textSlots?.length ?? 0;
  }
  return n;
}

/** Deal every page's boxes with ONE dealer (album-wide never-repeat). This is
 *  the generation-time path split out so the caller can size the quote pool
 *  to the FINISHED page list first — the pool used to be fixed at 25 lines and
 *  went dry halfway through an 80-page album (2026-09-09). Mutates pages. */
export function dealAlbumBoxes(pages: AlbumPage[], box: BoxContentOptions): void {
  const dealQuote = makeQuoteDealer(box.quotePool);
  let prevHadQuote = false;
  for (const page of pages) {
    const template = page.templateId ? getTemplateById(page.templateId) : undefined;
    prevHadQuote = template ? dealBoxContent(page, template, box, dealQuote, !prevHadQuote) : false;
  }
}

/** Lines the finish-line sweep needs in the pool to fill EVERY empty box:
 *  the deck excludes lines the album already carries, so the pool must hold
 *  the still-empty boxes PLUS every held line (an upper bound on overlap). */
export function quotesNeededForSweep(pages: AlbumPage[]): number {
  let held = 0;
  let empty = 0;
  for (const p of pages) {
    held += p.textElements.length + (p.slotTexts ?? []).filter(Boolean).length;
    const t = p.templateId ? getTemplateById(p.templateId) : undefined;
    const boxes = t?.textSlots?.length ?? 0;
    for (let j = 0; j < boxes; j++) {
      const occupied =
        p.textElements.some((x) => x.boxIndex === j) ||
        p.textSlotFills?.[j] != null ||
        !!p.textSlotQr?.[j] ||
        !!p.textSlotOrnament?.[j];
      if (!occupied) empty++;
    }
  }
  return held + empty;
}

/** "Megy finishes it" — the preview's finish-line sweep. Fills EVERY still-
 *  empty combo/caption box across the album with a quote the album hasn't
 *  used yet: lines already printed anywhere (bound captions AND photo-slot
 *  texts, including customer-edited ones) are excluded from the deck, so the
 *  album-wide never-repeat rule holds. Occupied boxes are untouched. Pure —
 *  returns new pages plus counts; `remaining` > 0 means the pool ran dry and
 *  that many boxes were left exactly as they were. */
/** Does this template's slots span MORE THAN ONE ratio? Such a template can
 *  only be filled slot-by-slot (tryMixedFill); handing it to a single-ratio
 *  queue would cross orientations. Single-slot templates are never mixed. */
export const isMixedRatioTemplate = (t: PageTemplate): boolean =>
  new Set(t.slots.map((s) => s.ratio).filter(Boolean)).size > 1;

/** A layout with minDensity is dealt only when the customer CHOSE at least
 *  that many photos per page (AUTO never does) — see PageTemplate.minDensity. */
export const densityAllowsTemplate = (t: PageTemplate, photosPerPage: number | undefined): boolean =>
  t.minDensity == null || (photosPerPage ?? 0) >= t.minDensity;

/** Templates for a photo of this ratio at this size — THE rule the generator
 *  deals by (and the upload step's note reads). RATIO matching is LOOSE — any
 *  layout of the same ORIENTATION is an acceptable home (a 4:3 in a 3:2 slot
 *  costs ~11%), which also unlocks layouts whose regions aren't exact camera
 *  ratios. But ORIENTATION is STRICT: putting a portrait photo in a landscape
 *  slot loses ~50% and chops heads/feet, so we never cross it. (The old
 *  fallback returned EVERY template for the size — orientation-blind — which is
 *  exactly how a portrait photo ended up hard-cropped in a landscape layout.) */
export function templatesForPhotoRatio(albumSize: AlbumSizePreset, ratio: PhotoRatio, photosPerPage?: number): PageTemplate[] {
  const allowed = (t: PageTemplate) => !isMixedRatioTemplate(t) && densityAllowsTemplate(t, photosPerPage);
  // MIXED-RATIO templates are excluded here on purpose. This path draws from
  // ONE ratio's queue and fills every slot from it, but a mixed template has
  // slots of more than one orientation by design (e.g. a portrait hero beside
  // two landscape frames). Filling those blindly puts a photo in a slot of the
  // opposite orientation and chops it — the exact defect this whole function
  // is orientation-strict to avoid. They are placed ONLY by tryMixedFill,
  // which matches each slot individually.
  const sameOrientation = getTemplatesForOrientation(albumSize, orientationOfRatio(ratio)).filter(allowed);
  // LOOSEN, don't remove: keep this photo's own ratio plus NEIGHBOURING ratios
  // within the crop budget. That unlocks the layouts exact-matching locked out
  // without letting a 4:3 land in a 16:9 slot (25%).
  const near = sameOrientation.filter((t) => ratioCrop(t.targetRatio, ratio) <= MAX_LOOSE_CROP);
  if (near.length) return near;
  if (sameOrientation.length) return sameOrientation; // orientation stays strict
  const exact = getTemplatesForRatio(albumSize, ratio).filter(allowed);
  if (exact.length) return exact;
  // Last resort for a size with nothing of this orientation: single-ratio
  // layouts only, so even here a slot is never filled across orientations.
  return getTemplatesForAlbum(albumSize).filter(allowed);
}

/** The shape (width / height) frame `i` of `t` prints at on a `size` page. A
 *  photo over the whole sheet prints at the PAGE's shape, whatever ratio the
 *  layout declares (see cropSafe); every other frame is ratio-true. */
export function frameShape(t: PageTemplate, i: number, size: AlbumSizePreset): number {
  if (i === 0 && coversWholeSheet(t)) return PAGE_ASPECT[size] ?? 1;
  return RATIO_VALUE[t.slots[i]?.ratio ?? t.targetRatio] ?? 1;
}

/** Can a photo of this ratio sit in a frame of this shape? templatesForPhotoRatio's
 *  rule, one frame at a time: the same orientation, and a crop within the loose
 *  budget (a 4:3 in a 3:2 frame, 11%, yes; in a square, 25%, no). */
export function frameTakesPhoto(frame: number, ratio: PhotoRatio): boolean {
  const photo = RATIO_VALUE[ratio] ?? 1;
  return orientationOfShape(frame) === orientationOfShape(photo) && cropBetween(frame, photo) <= MAX_LOOSE_CROP + 1e-9;
}

/** The upload step's note when the CHOSEN photos-per-page doesn't fit these
 *  photos' SHAPES at this size (or null). "2 per page" on an 8×8 with square
 *  photos made 50 single pages (+₱270) while the note said "all 40 pages are
 *  filled": an 8×8's 2-photo layouts take two portraits or two landscapes,
 *  never two squares (1-star testers round 2, the Indecisive one). */
export function perPageShapeNote(photos: UploadedPhoto[], albumSize: AlbumSizePreset, perPage: number | undefined, extraCost?: ExtraPagesCost): string | null {
  if (!perPage || perPage <= 1) return null;
  const live = photos.filter((p) => !p.leftOut && p.width > 0 && p.height > 0);
  if (live.length < MIN_PAGES) return null;
  const groups = Object.entries(analyzePhotos(live).groups) as [PhotoRatio, number[]][];
  const best = (ratio: PhotoRatio) => Math.max(1, ...templatesForPhotoRatio(albumSize, ratio, perPage).map((t) => t.slotCount).filter((n) => n <= perPage));
  const short = groups.filter(([r, idx]) => idx.length > 0 && best(r) < perPage);
  if (!short.length) return null;
  const shapeOf = (r: PhotoRatio) => orientationOfRatio(r) as string;
  const shortCount = short.reduce((n, [, idx]) => n + idx.length, 0);
  const shapes = [...new Set(short.map(([r]) => shapeOf(r)))];
  const fits = (['portrait', 'landscape', 'square'] as const).filter((o) => getTemplatesForOrientation(albumSize, o).some((t) => !isMixedRatioTemplate(t) && t.slotCount === perPage));
  const pages = chosenAlbumPages(live, albumSize, perPage)?.pages ?? MIN_PAGES;
  const bestShort = Math.max(...short.map(([r]) => best(r)));
  const size = `${/^(8|11)/.test(albumSize) ? 'an' : 'a'} ${albumSize.replace('x', '×')}`;
  const why = fits.length
    ? `its ${perPage}-photo layouts take ${fits.join(' or ')} photos`
    : `it has no ${perPage}-photo layout`;
  return `${shortCount === live.length ? 'Your' : `${shortCount} of your`} ${shapes.join(' and ')} photos can't go ${perPage} to a page on ${size} (${why}), so they go ${bestShort === 1 ? 'one' : `${bestShort}`} to a page`
    + (pages > MIN_PAGES ? extraPagesClause(pages, extraCost) : '.')
    + ' Pick Surprise and Megy mixes in bigger layouts for fewer pages.';
}

export function sweepFillQuotes(
  pages: AlbumPage[],
  box: BoxContentOptions,
): { pages: AlbumPage[]; filled: number; remaining: number; heldBack: number; noLine: number } {
  const used = new Set<string>();
  for (const p of pages) {
    for (const t of p.textElements) used.add(t.text);
    for (const st of p.slotTexts ?? []) if (st) used.add(st.text);
  }
  const deck = shuffleArray(box.quotePool.filter((l) => !used.has(l)));
  let di = 0;
  let filled = 0;
  // Two different reasons a box stays empty: the quote CADENCE holds it back
  // (by design — it prints as open space), or the theme has no unused line
  // left. The preview said "out of unique lines" for both (1-star testers).
  let heldBack = 0;
  let noLine = 0;
  const next: AlbumPage[] = [];
  pages.forEach((page, i) => {
    const template = page.templateId ? getTemplateById(page.templateId) : undefined;
    const boxes = template?.textSlots?.length ?? 0;
    if (boxes === 0) { next.push(page); return; }
    let out = page;
    for (let j = 0; j < boxes; j++) {
      const occupied =
        out.textElements.some((t) => t.boxIndex === j) ||
        out.textSlotFills?.[j] != null ||
        !!out.textSlotQr?.[j] ||
        !!out.textSlotOrnament?.[j];
      if (occupied) continue;
      // (A box dealt 'qr' before box QRs were retired is an ordinary empty
      // box now — video memories live on full-page photos — so it fills too.)
      // Cadence: one voice per page, and never on the page right after one
      // that speaks. Held-back boxes stay invitations (they print as paper).
      const prevSpeaks = i > 0 && pageSpeaks(next[i - 1]);
      if (pageSpeaks(out) || prevSpeaks) { heldBack++; continue; }
      if (di >= deck.length) { noLine++; continue; }
      const quote = deck[di++];
      out = {
        ...out,
        textElements: [
          ...out.textElements,
          {
            id: `box-${j}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            text: quote,
            x: 0,
            y: 0,
            fontSize: 28,
            fontFamily: box.quoteFontFamily,
            color: box.quoteColor,
            bold: false,
            italic: true,
            underline: false,
            alignment: 'center',
            rotation: 0,
            opacity: 100,
            boxIndex: j,
            ...(box.occasion ? { fromOccasion: box.occasion } : {}),
          } satisfies TextElement,
        ],
      };
      filled++;
    }
    next.push(out);
  });
  return { pages: next, filled, remaining: heldBack + noLine, heldBack, noLine };
}

/* ══════════════════════════════════════════════════════════════════════════
   A CHOSEN PHOTOS-PER-PAGE IS DEALT AS CHOSEN (1-star testers round 3, the
   Hoarder): "4 · Collage" on 196 photos made 59 pages, 36 of them 4-ups. The
   fill plan made one page in four a 3-up "to breathe", the photos left at the
   end of a shape's queue went on singles, and 260 photos (past fill mode)
   came out at 82 pages, only 36 of them 4-ups. Now each queue of same-shape
   photos (moment by moment, as the album deals them) gets its own plan: as
   few pages as its layouts allow, each as near the chosen count as it can be.
   When those can't fill the album's minimum, the spare pages are shared out
   (the densest queue first), so 130 photos at 4 a page make 40 pages, not
   the 41-42 the shared fill plan's leftover singles made.
   ══════════════════════════════════════════════════════════════════════════ */

/** The photo counts this shape's layouts deal at this size, up to `cap`
 *  (1 only when it has a one-photo layout: without one, a "single" page is
 *  dealt on a bigger layout and takes more photos than planned). */
function dealableCounts(albumSize: AlbumSizePreset, ratio: PhotoRatio, cap: number, photosPerPage?: number): number[] {
  const counts = [...new Set(templatesForPhotoRatio(albumSize, ratio, photosPerPage)
    .map((t) => t.slotCount).filter((c) => c >= 1 && c <= cap))].sort((a, b) => a - b);
  return counts.length ? counts : [1];
}

/** Splits `n` photos into exactly `p` pages using only `allowed` counts.
 *  Some counts can't make some sums: on an 8×6 a wide photo has only 4-up
 *  layouts at "4 per page", so 7 of them are 4+1+1+1, never 4+3 (a 3 the
 *  deck can't deal broke into singles and the album outgrew its estimate).
 *  `fits(p)` says whether p pages can hold exactly n; `split(p)` gives the
 *  counts spread evenly (as near n/p as the sum allows), rhythm-shuffled. */
function pageSplitter(n: number, allowed: number[]) {
  // rows[p][s] = 1 when s photos fill exactly p pages
  const rows: Uint8Array[] = [new Uint8Array(n + 1)];
  rows[0][0] = 1;
  const row = (p: number): Uint8Array => {
    while (rows.length <= p) {
      const prev = rows[rows.length - 1];
      const next = new Uint8Array(n + 1);
      for (let sum = 0; sum <= n; sum++) if (prev[sum]) for (const c of allowed) if (sum + c <= n) next[sum + c] = 1;
      rows.push(next);
    }
    return rows[p];
  };
  const fits = (p: number) => p >= 1 && p <= n && row(p)[n] === 1;
  const split = (p: number): number[] => {
    // Each page takes the count nearest to keeping the running total on the
    // even line (as planPageCounts does), among counts that still leave an
    // exact split for the pages after it.
    const counts: number[] = [];
    let cum = 0;
    for (let i = 0; i < p; i++) {
      const want = (n * (i + 1)) / p - cum;
      const left = n - cum;
      const c = [...allowed].sort((x, y) => Math.abs(x - want) - Math.abs(y - want) || y - x)
        .find((x) => x <= left && row(p - i - 1)[left - x] === 1)!;
      counts.push(c);
      cum += c;
    }
    return rhythmShuffle(counts);
  };
  return { fits, split };
}

/** The page counts at a chosen photos-per-page for each queue of same-shape
 *  photos, keyed `${moment}:${ratio}` (moment by moment, shape by shape, the
 *  way layoutAlbum deals them): "4 per page" on 174 squares = 42 pages of 4
 *  and 2 of 3. Spare pages up to `minPages` go to the densest queue first,
 *  never more pages than a queue has photos. Deterministic in its LENGTHS
 *  (only the order of counts within a queue is shuffled), so the upload
 *  step's estimate is the album's page count. */
function chosenQueuePlans(photos: UploadedPhoto[], albumSize: AlbumSizePreset, perPage: number, minPages: number): Map<string, number[]> {
  const analysis = analyzePhotos(photos);
  const ratioOf: Record<number, PhotoRatio> = {};
  (Object.entries(analysis.groups) as [PhotoRatio, number[]][]).forEach(([r, idx]) => idx.forEach((i) => { ratioOf[i] = r; }));
  const cap = Math.min(perPage, Math.max(1, ...getTemplatesForAlbum(albumSize).map((t) => t.slotCount)));
  const queues: { key: string; n: number; split: ReturnType<typeof pageSplitter>; pages: number }[] = [];
  groupPhotosByMoment(photos).forEach((group, g) => {
    const n = new Map<PhotoRatio, number>();
    for (const i of group) { const r = ratioOf[i] ?? analysis.dominantRatio; n.set(r, (n.get(r) ?? 0) + 1); }
    for (const [r, count] of n) {
      let allowed = dealableCounts(albumSize, r, cap, perPage);
      let split = pageSplitter(count, allowed);
      let pages = Math.ceil(count / Math.max(...allowed));
      while (pages <= count && !split.fits(pages)) pages++;
      if (pages > count) { // no exact split at all (no one-photo layout): singles carry it
        allowed = [...new Set([1, ...allowed])];
        split = pageSplitter(count, allowed);
        pages = Math.ceil(count / Math.max(...allowed));
        while (!split.fits(pages)) pages++;
      }
      queues.push({ key: `${g}:${r}`, n: count, split, pages });
    }
  });
  // Spare pages to the densest queue that can take one; when none can take
  // exactly one, the smallest step there is (the album then runs a page or
  // two over the minimum, never short of it: no blank pages).
  let spare = minPages - queues.reduce((sum, q) => sum + q.pages, 0);
  while (spare > 0) {
    const byDensity = [...queues].sort((a, b) => b.n / b.pages - a.n / a.pages);
    const stepOf = (q: (typeof queues)[number]) => {
      for (let d = 1; q.pages + d <= q.n; d++) if (q.split.fits(q.pages + d)) return d;
      return Infinity;
    };
    const one = byDensity.find((q) => stepOf(q) === 1);
    const q = one ?? byDensity.reduce<(typeof queues)[number] | null>((best, x) => (stepOf(x) < (best ? stepOf(best) : Infinity) ? x : best), null);
    if (!q || stepOf(q) === Infinity) break;
    const d = stepOf(q);
    q.pages += d;
    spare -= d;
  }
  return new Map(queues.map((q) => [q.key, q.split.split(q.pages)]));
}

const planLength = (plans: Map<string, number[]>) => [...plans.values()].reduce((sum, p) => sum + p.length, 0);

/** What generateAlbum makes for these photos at a CHOSEN photos-per-page:
 *  its pages, and how many are the full-page video-memory singles. null for
 *  Surprise. The upload step says it before Generate. */
export function chosenAlbumPages(
  photos: UploadedPhoto[], albumSize: AlbumSizePreset, perPage: number | undefined, minPages = MIN_PAGES,
): { pages: number; memoryPages: number } | null {
  if (!perPage || photos.length === 0) return null;
  const solo = memorySingleTemplate(albumSize);
  const reserved = solo ? pickMemoryPhotos(photos, albumSize, Math.min(MIN_MEMORY_PAGES, photos.length)) : [];
  const taken = new Set(reserved);
  const rest = photos.filter((_, i) => !taken.has(i));
  if (perPage === 1) return { pages: Math.max(minPages, photos.length), memoryPages: reserved.length };
  const restMin = Math.max(1, minPages - reserved.length);
  return { pages: Math.max(minPages, reserved.length + planLength(chosenQueuePlans(rest, albumSize, perPage, restMin))), memoryPages: reserved.length };
}

/** What `pages` pages add to the price past the included ones (pricing's
 *  extraPagesCharge on the live schedule), or null before it loads. */
export type ExtraPagesCost = ((pages: number) => number) | null | undefined;

/** ": about 55 pages, 15 more than the 40 included, which adds ₱424." */
function extraPagesClause(pages: number, extraCost: ExtraPagesCost): string {
  const amount = extraCost ? extraCost(pages) : 0;
  return `: about ${pages} pages, ${pages - MIN_PAGES} more than the ${MIN_PAGES} included`
    + (amount > 0 ? `, which adds ₱${amount.toLocaleString('en-PH')}` : '') + '.';
}

/** The upload step's note for the photos-per-page picked, or null: the
 *  shapes can't take it (perPageShapeNote); or the pages and pesos it makes
 *  past the included 40; or, with too few photos, why pages get fewer. */
export function photosPerPageNote(
  photos: UploadedPhoto[], albumSize: AlbumSizePreset, perPage: number | undefined, extraCost?: ExtraPagesCost,
): string | null {
  const shape = perPageShapeNote(photos, albumSize, perPage, extraCost);
  if (shape) return shape;
  if (!perPage || perPage <= 1) return null;
  const live = photos.filter((p) => !p.leftOut && p.width > 0 && p.height > 0);
  if (live.length < MIN_PAGES) return null;
  const made = chosenAlbumPages(live, albumSize, perPage);
  if (made && made.pages > MIN_PAGES) {
    return `${perPage} per page makes your album`
      + extraPagesClause(made.pages, extraCost).replace(/\.$/, '')
      + `. That counts ${made.memoryPages} full-page photos, where your video memories go.`;
  }
  // Too few photos for every page to take `perPage`: the 40 pages are filled
  // with fewer on some. (The video-memory singles count: 4 a page fills 40
  // pages from 7 + 33 × 4 = 139 photos, not 160.)
  const memory = memorySingleTemplate(albumSize) ? MIN_MEMORY_PAGES : 0;
  const needed = memory + (MIN_PAGES - memory) * perPage;
  if (live.length >= needed) return null;
  return `With ${live.length} photos, ${live.length * 2 < needed ? 'most' : 'some'} pages get fewer than ${perPage} so all ${MIN_PAGES} pages are filled. ${perPage} per page needs about ${needed} photos.`;
}

/** How many empty boxes "let Megy finish" can fill: the sweep's own rules
 *  (cadence included) with a line for every box. "N boxes waiting" shows this
 *  — it counted the boxes the cadence holds back too, so the button kept
 *  inviting a tap that could never fill them (1-star testers, 2026-10-04). */
export function fillableBoxCount(pages: AlbumPage[]): number {
  const boxes = pages.reduce((n, p) => n + ((p.templateId ? getTemplateById(p.templateId)?.textSlots?.length : 0) ?? 0), 0);
  if (boxes === 0) return 0;
  const lines = Array.from({ length: boxes }, (_, i) => `\u0000fillable-${i}`);
  return sweepFillQuotes(pages, { quotePool: lines, quoteFontFamily: '', quoteColor: '' }).filled;
}

/**
 * FILL PLAN — the per-page photo counts for an album whose photos cannot fill
 * MIN_PAGES at the natural (or chosen) density. Replaces "drop to one density"
 * (which made a 60-photo album sixty single pages): the counts are a varied
 * mix whose sum is exactly `photos`, spread over `minPages` or a little more,
 * never denser than `cap`, and never the same count more than 3 pages in a
 * row when the mix allows. Pure and deterministic given Math.random.
 */
export function planPageCounts(photos: number, minPages: number, cap: number, allowedCounts?: number[]): number[] {
  const max = Math.max(1, Math.floor(cap));
  if (photos <= 0) return [];
  // The counts this deck can deal, capped; 1 is always dealable (a single page).
  const A = [...new Set([1, ...(allowedCounts ?? Array.from({ length: max }, (_, i) => i + 1))])]
    .filter((c) => c >= 1 && c <= max).sort((a, b) => a - b);
  if (A.length === 0) A.push(1);
  const top = A[A.length - 1];
  if (photos <= minPages || top === 1) return new Array(photos).fill(1);
  // Page budget: at least minPages; when the photos would force every page
  // to the cap, add just enough pages for the mix to breathe (about one page
  // in four below the cap) — more pages cost the customer money, so the
  // inflation is deliberately mild. (Surprise only: a count the CUSTOMER
  // chose is planned per shape, without breathing pages — chosenQueuePlans.)
  const pages = Math.max(minPages, Math.ceil(photos / (top - 0.25)));
  const avg = photos / pages;
  const nearest = (d: number, exclude?: number): number => {
    let best = A[0], bestErr = Infinity;
    for (const a of A) {
      if (a === exclude) continue;
      const e = Math.abs(a - d);
      if (e < bestErr) { best = a; bestErr = e; }
    }
    return best;
  };
  // 1. Even spread (Bresenham): each page takes the allowed count nearest to
  //    what keeps the running total on the average line. Deterministic, and
  //    the best rhythm a given mix can have — no count runs longer than it must.
  const counts: number[] = [];
  let cum = 0;
  for (let i = 0; i < pages; i++) {
    const c = nearest(avg * (i + 1) - cum);
    counts.push(c);
    cum += c;
  }
  // 2. Land the sum exactly on `photos` with allowed-value moves, walking from
  //    the middle outward. If the deck's steps cannot close the gap, extra
  //    single pages close it (pages only ever ADD — never a blank).
  let diff = photos - cum;
  const order = [...counts.keys()].sort((a, b) => Math.abs(a - pages / 2) - Math.abs(b - pages / 2));
  const up = (c: number) => A.find((a) => a > c);
  const down = (c: number) => [...A].reverse().find((a) => a < c);
  for (let guard = 0; diff !== 0 && guard < 20; guard++) {
    let moved = false;
    for (const i of order) {
      if (diff === 0) break;
      if (diff > 0) { const n = up(counts[i]); if (n != null && n - counts[i] <= diff) { diff -= n - counts[i]; counts[i] = n; moved = true; } }
      else { const n = down(counts[i]); if (n != null && counts[i] - n <= -diff) { diff += counts[i] - n; counts[i] = n; moved = true; } }
    }
    if (!moved) break;
  }
  while (diff > 0) { counts.push(1); diff--; }
  while (diff < 0) { const i = counts.findIndex((c) => c > 1); if (i < 0) break; counts[i]--; diff++; }
  // 3. Randomise without breaking the rhythm.
  return rhythmShuffle(counts);
}

/** Swap random neighbouring pages only when no run around them grows past
 *  what the even spread allows (ceil(majority / rest), never under 3). Swaps
 *  move pages, not photos, so the sum stays exact. Mutates and returns. */
function rhythmShuffle(counts: number[]): number[] {
  // One page has no neighbour to swap with: the swap reached past the end
  // and made [2] into [undefined, 2], a page that is never dealt (a 2-photo
  // queue at "2 per page", once each shape got its own plan).
  if (counts.length < 2) return counts;
  const freq = new Map<number, number>();
  for (const c of counts) freq.set(c, (freq.get(c) ?? 0) + 1);
  const major = Math.max(...freq.values());
  const rest = counts.length - major;
  const maxRun = rest === 0 ? Infinity : Math.max(3, Math.ceil(major / rest));
  const runAt = (i: number): number => {
    let lo = i, hi = i;
    while (lo > 0 && counts[lo - 1] === counts[i]) lo--;
    while (hi < counts.length - 1 && counts[hi + 1] === counts[i]) hi++;
    return hi - lo + 1;
  };
  for (let t = 0; t < counts.length; t++) {
    const i = Math.floor(Math.random() * (counts.length - 1));
    if (counts[i] === counts[i + 1]) continue;
    [counts[i], counts[i + 1]] = [counts[i + 1], counts[i]];
    if (runAt(i) > maxRun || runAt(i + 1) > maxRun) [counts[i], counts[i + 1]] = [counts[i + 1], counts[i]];
  }
  return counts;
}

export interface GenerateOptions {
  randomize?: boolean;
  border?: { color: string; width: number };
  cornerBase?: string;
  boxContent?: BoxContentOptions;
  minPages?: number;
  /** Face centres (0–1) by photo index, detected by the caller BEFORE
   *  generation for memoryFaceCandidates() — used only when an album is short
   *  of photos that fit a full page, to crop the ones whose faces survive. */
  faceCenters?: Record<number, { x: number; y: number }>;
  /** Video memories that come along (a new album size, memoriesAcrossSize):
   *  each goes on its photo (an index into the photos) as its corner badge. */
  memories?: CarriedMemory[];
}

/**
 * Album generation = the memory pages + the layout around them.
 * The MIN_MEMORY_PAGES photos that crop least on a full page are reserved
 * first, spread across the album, and each gets its own full-bleed single
 * (where "Add a video memory" goes); every other photo is laid out exactly as
 * before (layoutAlbum, with that many fewer pages to fill); the memory pages
 * then go back where their photos fall in the album's order. Memories that
 * come along take their full pages first, as badges on their own photos.
 */
export function generateAlbum(
  photos: UploadedPhoto[],
  albumSize: AlbumSizePreset,
  photosPerPage?: number | undefined,
  background?: AlbumPage['background'] | undefined,
  options?: GenerateOptions,
): AlbumPage[] {
  const minPages = Math.max(1, Math.floor(options?.minPages ?? MIN_PAGES));
  const solo = memorySingleTemplate(albumSize);
  const badges = new Map<number, CarriedMemory[]>();
  for (const m of options?.memories ?? []) {
    if (photos[m.photo] && qrBadgeTemplate(albumSize, m.corner ?? 'br')) badges.set(m.photo, [...(badges.get(m.photo) ?? []), m]);
  }
  const carried = [...badges].flatMap(([photo, list]) => list.map(() => photo));
  const want = solo ? Math.max(0, Math.min(MIN_MEMORY_PAGES, photos.length) - carried.length) : 0;
  const reserved = [...carried, ...(want > 0 ? pickMemoryPhotosBesides(photos, albumSize, want, badges, options) : [])];
  if (reserved.length === 0) {
    const plain = layoutAlbum(photos, albumSize, photosPerPage, background, options);
    separateLookAlikes(plain, photos, isMemoryReady);
    return plain;
  }
  const taken = new Set(reserved);
  const restMap = photos.map((_, i) => i).filter((i) => !taken.has(i));
  const pages = layoutAlbum(restMap.map((i) => photos[i]), albumSize, photosPerPage, background,
    { ...options, minPages: Math.max(1, minPages - reserved.length) },
    // Fill mode is a property of the WHOLE album (its photos vs its 40
    // pages); deciding it on what's left after reserving would flip the
    // density cap at the boundary (119 photos at 2/page dealt 3s).
    { photos: photos.length, minPages });
  remapSlotFills(pages, restMap);
  insertMemoryPages(pages, reserved, solo, photos, albumSize, background, options, badges);
  // Two shots of the same moment the customer kept never share a page (and
  // never swap a memory page's photo out from under its QR).
  separateLookAlikes(pages, photos, isMemoryReady);
  pages.forEach((p, i) => { p.id = makePageId(i); });
  return pages;
}

/** pickMemoryPhotos, from the photos that don't already carry a memory. */
function pickMemoryPhotosBesides(
  photos: UploadedPhoto[], size: AlbumSizePreset, k: number, taken: Map<number, CarriedMemory[]>, options?: GenerateOptions,
): number[] {
  if (taken.size === 0) return pickMemoryPhotos(photos, size, k, options?.faceCenters, options?.randomize);
  const others = photos.map((_, i) => i).filter((i) => !taken.has(i));
  const faces: Record<number, { x: number; y: number }> = {};
  others.forEach((i, k2) => { const f = options?.faceCenters?.[i]; if (f) faces[k2] = f; });
  return pickMemoryPhotos(others.map((i) => photos[i]), size, k, faces, options?.randomize).map((k2) => others[k2]);
}

/**
 * Smart album layout:
 *  1. Analyze all photos to find dominant aspect ratio
 *  2. Select templates that match the dominant ratio + album size
 *  3. Place photos in ratio-matched slots — no more cropping disasters
 *  4. Fall back to mixed-ratio templates if needed
 */
function layoutAlbum(
  photos: UploadedPhoto[],
  albumSize: AlbumSizePreset,
  photosPerPage?: number | undefined,
  background?: AlbumPage['background'] | undefined,
  options?: GenerateOptions,
  /** The whole album's photos + minimum pages, when these photos are only
   *  part of it (the memory photos were reserved): fill mode is decided on it. */
  basis?: { photos: number; minPages: number },
): AlbumPage[] {
  // STUDIO: when the caller keeps some pages out of the reshuffle it asks for
  // fewer fresh pages, so the merged album still lands on the minimum.
  const minPages = Math.max(1, Math.floor(options?.minPages ?? MIN_PAGES));
  // A size with no layouts cannot build an album. The size pickers already drop
  // such a size (see albumSizeOptions), so reaching here means a stale draft or
  // a direct call — fail LOUDLY rather than dealing pages that would render and
  // print blank.
  if (getTemplatesForAlbum(albumSize).length === 0) {
    throw new Error(
      `No page layouts are available for the ${albumSize} album size, so it cannot be generated. ` +
      `(If this size is being re-authored, add layouts to its per-size template file.)`,
    );
  }

  const totalPhotos = photos.length;
  // Surprise Me mode: keep the photo sequence (chronological) but repackage it
  // into random templates + random slot counts so page breaks and photo
  // positions visibly differ on every click.
  const randomize = options?.randomize ?? false;
  // Theme-baked photo frame + corner art applied to every generated page.
  const border = options?.border;
  const cornerBase = options?.cornerBase;
  // Box dealing (see BOX_ROLL_WEIGHTS above). One quote dealer for the whole
  // generation so each line is dealt AT MOST ONCE album-wide (never-repeat rule).
  const boxContent = options?.boxContent;
  const dealQuote = boxContent ? makeQuoteDealer(boxContent.quotePool) : () => null;

  // Reset anti-repeat history at the START of every generation so a prior
  // album's tail doesn't bias the first pages of this one (cross-album carry).
  // Only templateTracker is consumed here (themeTracker/backgroundTracker are
  // used by other builder actions, not this function), so scope the clear to it.
  templateTracker.clear();

  // FILL MODE: on AUTO, if there aren't enough photos for the natural look to fill
  // the album (which is what leaves blank pages), drop to the LOWEST density that
  // still fills MIN_PAGES — i.e. 1 photo/page for 40–79 photos. Photo-rich albums
  // (>= MIN_PAGES × natural) keep the natural mixed/multi look. Guarantees no
  // surprise blanks without ballooning the page count.
  //
  // The same guarantee for an EXPLICIT density (owner, 2026-09-12): "Collage"
  // (4/page) on 60 photos is 15 pages, and the deck padded the other 25 with
  // BLANKS. A chosen density is a CEILING, never a promise to pad: when the
  // photos cannot fill MIN_PAGES at it, the budget drops to the densest count
  // that still does (1/page below 80 photos), and single-photo pages carry the
  // rest. Same rule for every size — 8x6/6x8 had the identical hole.
  // (Decided on the WHOLE album when these photos are only part of it.)
  const modePhotos = basis?.photos ?? totalPhotos;
  const modeMin = basis?.minPages ?? minPages;
  const autoFill = !randomize && photosPerPage == null && modePhotos < modeMin * naturalPerPage(albumSize);
  // Outside fill mode the explicit window allows density + 1 (see the window
  // below), so the album only fills 40 pages once photos reach 40 × (density+1);
  // below that, the fill budget takes over at exactly the chosen density or less.
  const explicitFill = !randomize && photosPerPage != null && photosPerPage > 1 && modePhotos < modeMin * (photosPerPage + 1);
  const fillDensity = (autoFill || explicitFill)
    ? Math.max(1, Math.floor(modePhotos / modeMin))
    : undefined;
  const effPerPage = explicitFill ? Math.min(photosPerPage as number, fillDensity as number) : (photosPerPage ?? fillDensity);
  const fillMode = fillDensity != null;
  // FILL PLAN (owner, 2026-09-12): in fill mode the per-page counts are planned
  // across the whole album so the mix stays varied (see planPageCounts) instead
  // of collapsing to one density. Cap = the chosen density, or the deck's
  // natural on AUTO; the emit loop deals each page at its planned count.
  const deckMax = Math.max(1, ...getTemplatesForAlbum(albumSize).map((t) => t.slotCount));
  const planCap = fillMode ? Math.min(deckMax, photosPerPage ?? Math.max(2, naturalPerPage(albumSize))) : 1;
  let plan: number[] | null = null; // built below, once the pool's ratios are known
  let planCarry = 0; // photos the plan wanted on earlier pages that the queues could not supply yet

  // No photos → minimum empty pages
  if (totalPhotos === 0) {
    return Array.from({ length: minPages }, (_, i) => createEmptyPage(i, albumSize, background, border, cornerBase));
  }

  // ── 1. Analyze photo aspect ratios ──
  const analysis = analyzePhotos(photos);
  const dominantRatio = analysis.dominantRatio;

  // ── 2. Group photos into chronological "moments" (EXIF capture time) ──
  const momentGroups = groupPhotosByMoment(photos);

  // photo index → aspect ratio (from the ratio analysis)
  const ratioOf: Record<number, PhotoRatio> = {};
  (Object.entries(analysis.groups) as [PhotoRatio, number[]][]).forEach(([ratio, idxs]) => {
    idxs.forEach((i) => { ratioOf[i] = ratio; });
  });

  const isMixedRatio = isMixedRatioTemplate;
  const densityAllows = (t: PageTemplate): boolean => densityAllowsTemplate(t, photosPerPage);
  const templatesForRatio = (ratio: PhotoRatio): PageTemplate[] => templatesForPhotoRatio(albumSize, ratio, photosPerPage);

  const pages: AlbumPage[] = [];
  let pageIdx = 0;

  // ── Dealt randomness (see ShuffleBag): one bag per template pool, persisted
  // across moment groups so the spread guarantee holds album-wide, not per
  // group. Keyed by pool identity (ratio + kind) — the id lists are stable for
  // one generation, so the same bag keeps dealing across groups.
  const bags = new Map<string, ShuffleBag>();
  const bagFor = (key: string, ids: readonly string[]): ShuffleBag => {
    let b = bags.get(key);
    if (!b) { b = new ShuffleBag(ids); bags.set(key, b); }
    return b;
  };

  // ── Hero sprinkle: structural variety. Even a perfect deal of five DUOS is
  // still a duo on every page — so in AUTO layout (no explicit photos-per-page),
  // or when curation/geometry leaves under 3 distinct multi layouts, deal an
  // occasional full-page hero between multi-photo pages (cadence 4–7 pages,
  // jittered; a naturally-occurring 1-photo page resets the clock). Heroes only
  // ADD pages (fewer photos on a page ⇒ more sheets) — never shrink the album.
  // Fill mode is excluded (it is already 1/page by design).
  let nextHeroIn = 2 + Math.floor(Math.random() * 4);
  // The one-page monotony guard for the mixed-template path (replaces the old
  // recent-history check).
  let lastTemplateId: string | null = null;

  // Geometry signature of the PREVIOUS page, so no two adjacent (facing) pages
  // share a layout even when the deck is thin. Two templates with the same slot
  // + textSlot rects read as the same page to someone flipping the album; ids
  // alone would let a near-identical twin sit beside its sibling. Updated in
  // pushPage; consumed by dealSingle.
  const geoSigOf = (t: PageTemplate): string =>
    // full-bleed vs margin distinguishes a 0,0,1,1 photo that BLEEDS from the
    // same fractions floating inside the safe area — they render differently and
    // must not count as the same look (a full-page square beside a framed one).
    (t.fullBleed ? 'FB' : `M${t.margin.top.toFixed(2)}`) + '|'
    + t.slots.map((s) => `${s.x.toFixed(3)},${s.y.toFixed(3)},${s.width.toFixed(3)},${s.height.toFixed(3)}`).join(';')
    + '|' + (t.textSlots ?? []).map((s) => `${s.x.toFixed(2)},${s.y.toFixed(2)},${s.width.toFixed(2)},${s.height.toFixed(2)}`).join(';');
  let lastGeoSig: string | null = null;
  /** Photos-per-page of the last two pages. Varying the LAYOUT is not enough:
   *  two different 2-photo layouts both look "different" by geometry, so a run
   *  of twenty 2-photo pages passes every other variety check while reading as
   *  one long monotonous stretch. The RHYTHM — 3, 1, 2, 3 … — is what the eye
   *  actually reads, so the count is steered too. */
  const recentCounts: number[] = [];
  const countRecentlyUsed = (n: number) => recentCounts.includes(n);
  const noteCount = (n: number) => {
    recentCounts.push(n);
    if (recentCounts.length > 2) recentCounts.shift();
  };

  /** Deal a single-photo template that does NOT repeat the previous page's
   *  look. `boxFree` is the cadence-preferred subset (box-free while on
   *  cooldown); `singles` is the full fallback. Order of preference:
   *    1. box-free AND a different look   — honours the cadence and the guard
   *    2. any single AND a different look — BREAKS the cadence to avoid a twin
   *    3. box-free (repeat allowed)       — deck genuinely offers only one look
   *    4. anything
   *  Adjacency-distinctness is the hard rule; the caption cadence yields to it. */
  const breakCadenceForAdjacency = PER_SIZE_AUTHORED.has(albumSize);
  const dealSingle = (key: string, singles: PageTemplate[], boxFree: PageTemplate[]): PageTemplate => {
    const bag = bagFor(`${key}:single`, singles.map((t) => t.id));
    const byId = new Map(singles.map((t) => [t.id, t]));
    const okSet = new Set(boxFree.map((t) => t.id));
    const allSet = new Set(singles.map((t) => t.id));
    const differs = (id: string): boolean => {
      const t = byId.get(id);
      return !!t && geoSigOf(t) !== lastGeoSig;
    };
    // Predicate 2 BREAKS the caption cadence to dodge a repeat, but only where
    // that trade is worth it. On the five non-authored sizes every box-free
    // single collapses to the SAME full-bleed geometry (applySinglePicFullBleed
    // rewrites them all to 0,0,1,1), so the only "different look" is a caption
    // single — and grabbing it every other page doubles empty caption bands
    // (~25% -> ~50%). Those sizes therefore keep the cadence and tolerate the
    // occasional adjacent full-bleed repeat, exactly as before this change. The
    // per-size-authored sizes (6x6) DO have genuine box-free variety plus
    // single+box layouts the customer wants, so there the break is a net win.
    const id =
      bag.draw((x) => okSet.has(x) && differs(x)) ??
      (breakCadenceForAdjacency ? bag.draw((x) => allSet.has(x) && differs(x)) : null) ??
      bag.draw((x) => okSet.has(x)) ??
      bag.draw((x) => allSet.has(x));
    return (id != null ? byId.get(id) : undefined) ?? boxFree[0] ?? singles[0];
  };

  // ── Caption cadence ── A template's caption / text band (the "combo box") is
  // dead space when the customer leaves it empty — which is most of the time —
  // so cap box-bearing templates to ~1 in 4 pages. After one is placed, the
  // next 3 pages are restricted to box-FREE layouts, WHEN any exist for that
  // ratio (else the box is allowed through so no photo is ever stranded).
  // Starts mid-cycle so page 1 isn't always a box.
  const hasBox = (t: PageTemplate): boolean => (t.textSlots?.length ?? 0) > 0;
  let captionCooldown = Math.floor(Math.random() * 4);
  // Quote cadence across consecutive pages (see QUOTE_CADENCE).
  let prevPageHadQuote = false;
  // Prefer box-free layouts while the cadence cooldown is active (no-op once it
  // elapses, or when the ratio has no box-free layout at all).
  const boxAware = (list: PageTemplate[]): PageTemplate[] => {
    if (captionCooldown <= 0) return list;
    const noBox = list.filter((t) => !hasBox(t));
    return noBox.length ? noBox : list;
  };

  // ── Full-bleed crop safety ── A full-bleed single renders the photo
  // object-cover across the WHOLE page, so an off-orientation photo is hard
  // cropped (a 3:4 phone photo on a 3:2 page shows only ~50% of its height —
  // heads/feet chopped). Single-photo pages therefore only deal full-bleed
  // templates whose ratio ≈ the page's aspect; otherwise the framed/caption
  // singles (exact-ratio slots, zero crop) carry the hero role.
  const pageAspect = PAGE_ASPECT[albumSize] ?? 1;
  // coversWholeSheet (module scope): whether a single stretches its photo
  // across the WHOLE sheet. That — not the fullBleed flag — is the condition
  // the crop rule is about. A template can be full bleed and still be safe: a
  // 2:3 photo occupying the left 4x6" of a 6x6 page bleeds off three edges at
  // ZERO crop, because the slot is the photo's own ratio and a combo box takes
  // the remainder.
  const cropSafe = (t: PageTemplate): boolean =>
    !coversWholeSheet(t) ||
    Math.abs(Math.log((RATIO_VALUE[t.targetRatio] ?? 1) / pageAspect)) < 0.12;

  const pushPage = (template: PageTemplate, fills: number[]) => {
    const slotCount = template.slots.length;
    lastTemplateId = template.id;
    lastGeoSig = geoSigOf(template);
    noteCount(slotCount);
    nextHeroIn -= 1;
    if (slotCount === 1) nextHeroIn = Math.max(nextHeroIn, 4 + Math.floor(Math.random() * 4));
    // A box page re-arms the cooldown (next 3 pages box-free); any other page
    // ticks it down toward the next allowed box.
    captionCooldown = hasBox(template) ? 3 : Math.max(0, captionCooldown - 1);
    const page = createEmptyPage(pageIdx, albumSize, background, border, cornerBase);
    page.templateId = template.id;
    page.slotFills = new Array(slotCount).fill(null);
    page.slotScales = new Array(slotCount).fill(1);
    page.slotOffsetsX = new Array(slotCount).fill(0);
    page.slotOffsetsY = new Array(slotCount).fill(0);
    fills.forEach((photoIdx, s) => {
      // Defensive (fresh pages): never overwrite a slot claimed by QR/text.
      if (page.qrFills?.[s] || page.slotTexts?.[s]) return;
      page.slotFills![s] = photoIdx;
    });
    // Megy deals this page's combo/caption boxes (no-op for box-free layouts
    // and for callers that don't opt in — specs generate empty boxes as before).
    prevPageHadQuote = boxContent ? dealBoxContent(page, template, boxContent, dealQuote, !prevPageHadQuote) : false;
    pages.push(page);
    pageIdx++;
  };

  // Templates that MIX photo ratios on one page (e.g. 3:2 + 1:1 + 2:3). Filled
  // greedily when a moment's photos supply every ratio the template needs.
  const mixedTemplates = getTemplatesForAlbum(albumSize).filter((t) => isMixedRatio(t) && densityAllows(t));

  // Try to fill a mixed template from `pool`: one unused photo per slot whose
  // ratio matches that slot's ratio. Returns the fills, or null if any slot
  // can't be matched (the template is then skipped this round).
  const tryMixedFill = (template: PageTemplate, pool: number[]): number[] | null => {
    const used = new Set<number>();
    const fills: number[] = [];
    for (const slot of template.slots) {
      const need = slot.ratio ?? template.targetRatio;
      const needOrient = orientationOfRatio(need);
      // Prefer the exact ratio, then LOOSEN to any photo of the same orientation
      // (never across it). Exact-only made mixed templates fail whenever the
      // moment lacked that precise ratio, so they were rarely used at all.
      // Exact ratio first; then the CLOSEST same-orientation photo (loosened, not
      // removed) — never the first one that happens to share an orientation.
      let pick = pool.find((idx) => !used.has(idx) && (ratioOf[idx] ?? dominantRatio) === need);
      if (pick === undefined) {
        let bestCrop = Infinity;
        for (const idx of pool) {
          if (used.has(idx)) continue;
          const r = ratioOf[idx] ?? dominantRatio;
          if (orientationOfRatio(r) !== needOrient) continue;
          const c = ratioCrop(r, need);
          if (c < bestCrop) { bestCrop = c; pick = idx; }
        }
      }
      if (pick === undefined) return null;
      used.add(pick);
      fills.push(pick);
    }
    return fills;
  };

  // ── 3. Lay out each moment. First place any MIXED-ratio templates the pool can
  //       satisfy; then the remaining photos go RATIO-BY-RATIO (homogeneous
  //       templates + single-photo full-page leftovers). Every photo lands in a
  //       slot of its OWN ratio — never cropped. ──
  // The counts the deck can actually deal for THIS pool's ratios (square
  // photos on a square page have 1, 3 and 4 — no 2), so the plan never asks
  // for a count no layout can serve.
  // A CHOSEN count (2+): each shape's queue gets its own plan, the album's
  // minimum shared out among them (see A CHOSEN PHOTOS-PER-PAGE above). The
  // shared fill plan is for Surprise only.
  const chosenCount = !randomize && photosPerPage != null && photosPerPage > 1;
  const chosenCap = Math.min(deckMax, photosPerPage ?? 1);
  const queuePlans = chosenCount ? chosenQueuePlans(photos, albumSize, photosPerPage as number, minPages) : null;
  const exactPlan = queuePlans != null;
  if (fillMode && !exactPlan) {
    const present = new Set<PhotoRatio>(photos.map((_, i) => ratioOf[i] ?? dominantRatio));
    const allowed = new Set<number>([1]);
    for (const r of present) for (const t of templatesForRatio(r)) if (t.slotCount <= planCap) allowed.add(t.slotCount);
    plan = planPageCounts(totalPhotos, minPages, planCap, [...allowed]);
  }

  for (const [moment, group] of momentGroups.entries()) {
    let remaining = [...group];

    // ── 3a. Place mixed-ratio templates the pool can satisfy — but with VARIETY,
    //       not always the first match (that made every mixed-ratio moment land
    //       on the SAME template). If only one mixed template fits and it was used
    //       recently, stop forcing mixed here and let the more-varied
    //       ratio-by-ratio path take these photos instead. ──
    // "1 · Big & bold" is ONE photo a page, like the ratio path below (multi =
    // [] at 1/page): mixed pages are 2+ photos, and dealing them there put a
    // 3-4-photo page in a 1-per-page album and left its last pages BLANK at 40
    // photos (2026-10-04, found by the 40-photo minimum's every-size sweep).
    if (mixedTemplates.length > 0 && !fillMode && !exactPlan && !(effPerPage === 1 && !randomize)) {
      const mixedBag = bagFor('mixed', mixedTemplates.map((t) => t.id));
      let placed = true;
      while (placed) {
        placed = false;
        // Every mixed template fillable from the remaining pool right now.
        const fillable = mixedTemplates
          .map((t) => ({ t, fills: tryMixedFill(t, remaining) }))
          .filter((x): x is { t: PageTemplate; fills: number[] } => x.fills !== null);
        if (fillable.length === 0) break;

        // Single mixed option that we just placed → break the monotony: let 3b
        // handle these photos with its larger, varied homogeneous pool.
        if (!randomize && fillable.length === 1 && fillable[0].t.id === lastTemplateId) break;

        // Deal from the mixed bag, restricted to what's fillable right now AND
        // (while on cooldown) to box-free layouts, so the caption cadence holds
        // on mixed pages too.
        const eligiblePool = boxAware(fillable.map((x) => x.t));
        const okIds = new Set(eligiblePool.map((t) => t.id));
        // Same rhythm rule as the ratio path: prefer a page whose PHOTO COUNT
        // is not one of the last two, so mixed pages break the run instead of
        // extending it. Falls back to any eligible layout when the pool has
        // nothing of a different count.
        const countOf = new Map(fillable.map((x) => [x.t.id, x.t.slotCount]));
        // If EVERY mixed option would repeat a photo-count we just used, stop
        // placing mixed pages and hand these photos to the ratio-by-ratio path,
        // which can deal a different count. Without this the loop drains photos
        // into mixed pages back to back: on 8×6 every 3-photo layout is
        // mixed-ratio, so the album came out as 45 consecutive 3-photo pages —
        // varied frames, one flat rhythm. Breaking here is safe: the photos are
        // simply laid out by 3b instead, and after a couple of pages of another
        // count the mixed layouts become eligible again.
        if (fillable.every((x) => countRecentlyUsed(x.t.slotCount))) break;
        const id =
          mixedBag.draw((x) => okIds.has(x) && !countRecentlyUsed(countOf.get(x) ?? -1)) ??
          mixedBag.draw((x) => okIds.has(x));
        const chosen = fillable.find((x) => x.t.id === id)
          ?? fillable[Math.floor(Math.random() * fillable.length)];
        pushPage(chosen.t, chosen.fills);
        const usedSet = new Set(chosen.fills);
        remaining = remaining.filter((i) => !usedSet.has(i));
        placed = true;
      }
    }

    // ── 3b. Remaining photos → ratio by ratio, but INTERLEAVED. ──
    const byRatio: Partial<Record<PhotoRatio, number[]>> = {};
    for (const i of remaining) {
      const r = ratioOf[i] ?? dominantRatio;
      (byRatio[r] ??= []).push(i);
    }

    // Precompute each ratio's queue + its multi/onePhoto/full candidate sets once,
    // then ROUND-ROBIN: emit ONE page per non-empty ratio per pass and cycle until
    // every queue is drained. Draining one ratio fully (the old behaviour) parked
    // all same-ratio → same-thin-pool pages consecutively, which is exactly the
    // visible "grouping". Interleaving pulls a DIFFERENT pool page-to-page so the
    // thin-pool repeats are spread apart instead of clustered.
    interface RatioState {
      key: string;
      queue: number[];
      ratioTemplates: PageTemplate[];
      onePhoto: PageTemplate[];
      /** Single-photo pool with crop-unsafe full-bleeds filtered out (falls
       *  back to every single when nothing crop-safe exists — a leftover photo
       *  must always land somewhere). */
      singles: PageTemplate[];
      multi: PageTemplate[];
      /** This queue's own page counts at a chosen photos-per-page (exactPlan),
       *  the next one to deal, and what earlier pages owe it. */
      plan?: number[];
      planAt: number;
      carry: number;
    }
    const states: RatioState[] = (Object.keys(byRatio) as PhotoRatio[]).map((ratio) => {
      const queue = byRatio[ratio]!;
      const ratioTemplates = templatesForRatio(ratio);
      const onePhoto = ratioTemplates.filter((t) => t.slotCount === 1);
      const safeSingles = onePhoto.filter(cropSafe);
      const singles = safeSingles.length > 0 ? safeSingles : onePhoto;
      const allMulti = ratioTemplates.filter((t) => t.slotCount > 1);
      // Fill mode at 1/page → single-photo full-page templates (multi stays
      // empty, so the loop falls to `onePhoto`). Explicit/fill density → the
      // target is a CEILING: the window may only widen DOWNWARD (sparser
      // layouts only ADD pages — revenue-safe, and never denser than what the
      // density picker offered for this size). Fill mode caps at exactly the
      // computed budget: denser pages would underfill MIN_PAGES and pad the
      // album with blanks, breaking fill mode's no-surprise-blanks contract.
      // A pool still thin after widening is handled by the hero valve — NEVER
      // by densification. No allMulti fallback here for the same reason: an
      // empty window falls through to single-photo pages (more pages, no
      // crops). AUTO/randomize → every multi layout of this ratio.
      let multi: PageTemplate[];
      let own: number[] | undefined;
      if (queuePlans) {
        multi = allMulti.filter((t) => t.slotCount <= chosenCap);
        own = queuePlans.get(`${moment}:${ratio}`);
      } else if (plan) {
        multi = allMulti.filter((t) => t.slotCount <= planCap);
      } else if (effPerPage === 1 && !randomize) {
        multi = [];
      } else if (effPerPage && !randomize) {
        const hi = fillMode ? effPerPage : effPerPage + 1;
        let win = 1;
        do {
          multi = allMulti.filter((t) =>
            t.slotCount >= Math.max(2, effPerPage - win) && t.slotCount <= hi);
          win++;
        } while (multi.length < 3 && effPerPage - win >= 2);
      } else {
        multi = allMulti;
      }
      return { key: ratio, queue, ratioTemplates, onePhoto, singles, multi, plan: own, planAt: 0, carry: 0 };
    });

    // Emit exactly one page from a ratio's queue (drains 1..slotCount photos).
    const emitOnePage = (st: RatioState) => {
      const { key, queue, ratioTemplates, singles, multi } = st;
      const fits = multi.filter((t) => t.slotCount <= queue.length);

      // ── Planned fill ── deal this page at its planned count (plus any
      // carry the earlier pages could not place), choosing a layout that
      // differs from the last and, while the caption cooldown runs, is box-free.
      if (plan || st.plan) {
        // Past the plan's length (singles added pages) the plan CYCLES, so the
        // tail keeps the same rhythm instead of collapsing to one per page.
        // A queue with its own plan (exactPlan) deals it in order.
        const planned = st.plan ? (st.plan[st.planAt++] ?? 1) : (plan!.length ? plan![pages.length % plan!.length] : 1);
        const want = Math.max(1, Math.min(st.plan ? chosenCap : planCap, planned + (st.plan ? st.carry : planCarry)));
        let template: PageTemplate | undefined;
        // Counts this page may take: never MORE than wanted (2026-10-04, the
        // 1-star testers): a page over the plan left the album short of photos
        // for its last pages, which then printed BLANK (42 real photos on an
        // 8×8 → 2 blank pages). Fewer is safe — the difference carries on.
        const under = fits.filter((t) => t.slotCount <= want);
        if (want > 1 && under.length > 0) {
          // Nearest count to the plan, from the top. A count the last two pages
          // did not use beats an exact repeat by up to one photo (the carry
          // absorbs it) — the rhythm rule. Then, from the best count down, the
          // first count with a layout that is not the previous page's: a thin
          // pool (ONE 4-up for square photos) used to break to a SINGLE page
          // every other time — "4 · Collage" on 196 photos made 73 pages, 28
          // of them singles (testers). A different multi page keeps the album
          // close to its plan instead.
          // A count the CUSTOMER CHOSE ("4 per page") is not a rhythm to vary:
          // the rhythm penalty pushed every other page to a 3-up, and the one
          // square 4-up couldn't repeat, so 196 photos at "4 per page" came out
          // as 62 pages with only 28 holding 4 — more pages, a higher price
          // (1-star testers round 2, the Hoarder). Chosen: the nearest count
          // wins, and the one layout for the chosen count may repeat.
          const chosen = photosPerPage != null && !randomize;
          const counts = [...new Set(under.map((t) => t.slotCount))]
            .sort((a, b) => chosen
              ? (Math.abs(a - want) - Math.abs(b - want) || b - a)
              : (Math.abs(a - want) + (countRecentlyUsed(a) ? 0.75 : 0)) - (Math.abs(b - want) + (countRecentlyUsed(b) ? 0.75 : 0)) || b - a);
          for (const count of counts) {
            let nearest = under.filter((t) => t.slotCount === count && t.id !== lastTemplateId);
            if (!nearest.length && chosen && count === want) nearest = under.filter((t) => t.slotCount === count);
            if (!nearest.length) continue;
            const pool = boxAware(nearest);
            const byId = new Map(nearest.map((t) => [t.id, t]));
            const okSet = new Set(pool.map((t) => t.id));
            const anySet = new Set(nearest.map((t) => t.id));
            const bag = bagFor(`${key}:multi`, multi.map((t) => t.id));
            const id =
              bag.draw((x) => okSet.has(x) && geoSigOf(byId.get(x)!) !== lastGeoSig) ??
              bag.draw((x) => anySet.has(x) && geoSigOf(byId.get(x)!) !== lastGeoSig) ??
              bag.draw((x) => okSet.has(x)) ?? bag.draw((x) => anySet.has(x));
            template = (id != null ? byId.get(id) : undefined) ?? pool[0] ?? nearest[0];
            break;
          }
        }
        if (!template) {
          template = singles.length > 0
            ? dealSingle(key, singles, boxAware(singles))
            : (ratioTemplates.filter((t) => t.slotCount <= queue.length)[0] ?? ratioTemplates[0]);
        }
        const take = Math.min(template.slots.length, queue.length);
        // What this page did not take is owed to the next one. (Never negative
        // now — no page takes more than it wants — so the album can only run
        // out of plan, never out of photos: no blank pages at the end.)
        if (st.plan) st.carry = want - take; else planCarry = want - take;
        pushPage(template, queue.splice(0, take));
        return;
      }

      // Hero sprinkle (see cadence note above): AUTO mode, or a thin pool
      // (<3 distinct even after widening) as the variety emergency valve.
      // Thin-pool heroes fire in FILL MODE too: a 1-photo page only ADDS
      // pages, so it can never underfill toward blank padding.
      // A hero page whose only crop-safe single carries a caption would spend
      // the hero on a BOX page during the cooldown — which is exactly what the
      // cadence is trying to hold down. In that case skip the hero and let a
      // (box-free) multi page carry this slot instead.
      const heroPool = boxAware(singles);
      const heroWouldBox = captionCooldown > 0 && heroPool.every(hasBox);
      const heroAllowed = singles.length > 0 && !heroWouldBox &&
        ((photosPerPage == null && !fillMode) || multi.length < 3);
      if (heroAllowed && fits.length > 0 && nextHeroIn <= 0) {
        const hero = dealSingle(key, singles, heroPool);
        pushPage(hero, queue.splice(0, 1));
        // ADAPTIVE cadence (set AFTER pushPage — its natural-single reset would
        // otherwise max() this away): a THIN multi pool (2 layouts) can only
        // alternate A/B between heroes, so heroes must come often (every 2–4
        // pages) to break the rhythm; rich pools only need one every 4–7.
        // Cadence keys off how many distinct PHOTO COUNTS this pool can deal,
        // not how many layouts it has. A pool of seven 2-photo layouts still
        // only ever says "2" — its frames vary while the rhythm does not — so
        // the hero page is the ONLY thing that can break the run and has to
        // come often. (8×6 is exactly this: all of its 3-photo layouts are
        // mixed-ratio and therefore placed elsewhere, leaving the ratio path
        // with nothing but duos.)
        const distinctCounts = new Set(multi.map((t) => t.slotCount)).size;
        nextHeroIn = (multi.length < 3 || distinctCounts < 2)
          ? 2 + Math.floor(Math.random() * 3)
          : 4 + Math.floor(Math.random() * 4);
        return;
      }

      let template: PageTemplate | undefined;
      if (fits.length > 0) {
        // Deal from this ratio's multi bag, restricted to layouts that still
        // fit the remaining photos AND (while on cooldown) to box-free ones.
        // The bag spreads slot-counts too, so the old de-cluster bias is subsumed.
        const pool = boxAware(fits);
        const okSet = new Set(pool.map((t) => t.id));
        const fitSet = new Set(fits.map((t) => t.id));
        const byId = new Map(fits.map((t) => [t.id, t]));
        const differs = (id: string): boolean => {
          const t = byId.get(id);
          return !!t && geoSigOf(t) !== lastGeoSig;
        };
        // A layout whose PHOTO COUNT is not one of the last two pages'. This is
        // the rhythm control: without it a deck can serve twenty consecutive
        // 2-photo pages, each a "different" layout and each passing `differs`,
        // which reads as one flat stretch.
        const freshCount = (id: string): boolean => {
          const t = byId.get(id);
          return !!t && !countRecentlyUsed(t.slotCount);
        };
        const bag = bagFor(`${key}:multi`, multi.map((t) => t.id));
        const id =
          // 1. different look AND a count we have not just used — the good case
          bag.draw((x) => okSet.has(x) && differs(x) && freshCount(x)) ??
          bag.draw((x) => fitSet.has(x) && differs(x) && freshCount(x)) ??
          // 2. the deck cannot change the count right now → settle for a
          //    different look (previous behaviour)
          bag.draw((x) => okSet.has(x) && differs(x)) ??
          bag.draw((x) => fitSet.has(x) && differs(x));
        if (id != null) {
          template = byId.get(id) ?? pool[0] ?? fits[0];
        } else if (singles.length > 0) {
          // The multi pool can only REPEAT the previous page (a thin pool —
          // e.g. the single portrait duo dealt at 2/page). Break to a distinct
          // single rather than print the same duo twice. This only adds a page,
          // which is always safe in fill mode.
          template = dealSingle(key, singles, boxAware(singles));
        } else {
          const id2 = bag.draw((x) => okSet.has(x)) ?? bag.draw((x) => fitSet.has(x));
          template = (id2 != null ? byId.get(id2) : undefined)
            ?? pool[Math.floor(Math.random() * pool.length)] ?? fits[0];
        }
      } else if (singles.length > 0) {
        // Leftover smaller than any multi-slot → a dealt single-photo page,
        // chosen to not repeat the previous page's look.
        template = dealSingle(key, singles, boxAware(singles));
      } else {
        const rest = ratioTemplates.filter((t) => t.slotCount <= queue.length);
        const pool = rest.length ? rest : ratioTemplates;
        template = pool[Math.floor(Math.random() * pool.length)];
      }
      const take = Math.min(template.slots.length, queue.length);
      pushPage(template, queue.splice(0, take));
    };

    // Round-robin until every queue is empty — never exits early, so no photo is
    // ever left unplaced (blanks regression guard). The per-pass order is
    // SHUFFLED: a fixed order makes two ratios strictly alternate, which is
    // itself a visible macro-pattern.
    let anyLeft = states.some((s) => s.queue.length > 0);
    while (anyLeft) {
      anyLeft = false;
      for (const st of shuffleArray(states)) {
        if (st.queue.length > 0) {
          emitOnePage(st);
          if (st.queue.length > 0) anyLeft = true;
        }
      }
    }
  }

  // ── 4. Pad out to the minimum page count with empty pages ──
  while (pages.length < minPages) {
    pages.push(createEmptyPage(pageIdx++, albumSize, background, border, cornerBase));
  }

  return pages;
}

/**
 * Shuffle layout: pick a new random template matching the dominant ratio
 * and re-place photos into ratio-matched slots.
 */
export function shufflePageLayout(
  page: AlbumPage,
  photos: UploadedPhoto[],
): AlbumPage {
  if (!photos.length || !page.templateId) return page;

  // Analyze photos to maintain ratio awareness
  const analysis = analyzePhotos(photos);
  const albumSize = page.size;
  const dominantRatio = analysis.dominantRatio;

  // Get templates matching dominant ratio, excluding current
  const matchingTemplates = getTemplatesForRatio(albumSize, dominantRatio)
    .filter(t => t.id !== page.templateId);

  // Loosen the ratio to the whole same-ORIENTATION pool before ever falling back
  // to every template (which would let a portrait photo land in a landscape page).
  const sameOrientationPool = getTemplatesForOrientation(albumSize, orientationOfRatio(dominantRatio))
    .filter(t => t.id !== page.templateId);
  const pool = matchingTemplates.length > 0
    ? matchingTemplates
    : sameOrientationPool.length > 0
      ? sameOrientationPool
      : getTemplatesForAlbum(albumSize).filter(t => t.id !== page.templateId);

  // Nothing else to deal (only layout for the size, or the size has none at all
  // while it is re-authored) → keep the page exactly as it is.
  if (!pool.length) return page;

  const templateId = templateTracker.pick(pool.map(t => t.id), page.templateId) ?? pool[Math.floor(Math.random() * pool.length)].id;
  const template = pool.find(t => t.id === templateId) ?? pool[0];
  const slotCount = template.slots.length;

  // Preserve existing fills, re-matched to new slot count
  const existingFills = (page.slotFills ?? []).filter((f): f is number => f !== null);

  // Build ratio queues from existing fills
  const ratioQueues: Record<PhotoRatio, number[]> = {
    '4:3': [], '3:4': [], '3:2': [], '2:3': [], '1:1': [], '16:9': [], '9:16': [],
  };
  existingFills.forEach(idx => {
    const ratio = analysis.assignments[idx];
    if (ratio) ratioQueues[ratio].push(idx);
  });

  // Carry any chooser-placed QR / per-slot text forward (mutual exclusivity:
  // a claimed slot never gets a photo).
  const carriedQr = (page.qrFills ?? []).slice(0, slotCount);
  const carriedText = (page.slotTexts ?? []).slice(0, slotCount);

  // Fill new slots with ratio-matched photos
  const newFills: (number | null)[] = new Array(slotCount).fill(null);
  for (let slotIdx = 0; slotIdx < slotCount && existingFills.length > 0; slotIdx++) {
    // Skip slots claimed by a carried-over QR/text.
    if (carriedQr[slotIdx] || carriedText[slotIdx]) continue;
    const targetRatio = template.targetRatio;
    let bestPhotoIdx: number | null = null;

    if (ratioQueues[targetRatio] && ratioQueues[targetRatio].length > 0) {
      bestPhotoIdx = ratioQueues[targetRatio].shift()!;
    } else {
      // Loosen to the CLOSEST same-orientation ratio (least crop), not merely the
      // first one found; only cross orientation as a genuine last resort (better a
      // cropped page than a dropped photo).
      const wantOrient = orientationOfRatio(targetRatio);
      const sameOrient = (Object.keys(ratioQueues) as PhotoRatio[])
        .filter((r) => orientationOfRatio(r) === wantOrient && ratioQueues[r].length > 0)
        .sort((a, b) => ratioCrop(a, targetRatio) - ratioCrop(b, targetRatio));
      if (sameOrient.length > 0) {
        bestPhotoIdx = ratioQueues[sameOrient[0]].shift()!;
      } else {
        for (const queue of Object.values(ratioQueues)) {
          if (queue.length > 0) {
            bestPhotoIdx = queue.shift()!;
            break;
          }
        }
      }
    }

    newFills[slotIdx] = bestPhotoIdx;
  }

  return {
    ...page,
    templateId: template.id,
    qrFills: carriedQr,
    slotTexts: carriedText,
    slotFills: newFills,
    slotScales: new Array(slotCount).fill(1),
    slotOffsetsX: new Array(slotCount).fill(0),
    slotOffsetsY: new Array(slotCount).fill(0),
  };
}
