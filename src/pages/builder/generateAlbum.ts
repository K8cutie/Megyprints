import type { AlbumPage, UploadedPhoto, AlbumSizePreset, LayoutStyle, PageTemplate, TextElement, BoxRoll } from './types';
import { getTemplatesForRatio, getTemplatesForAlbum, getTemplatesForOrientation, orientationOfRatio } from './pageTemplates';

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

/** The owner-set odds of each kind. Must sum to 1. */
export const BOX_ROLL_WEIGHTS: Record<BoxRoll, number> = { quote: 0.45, text: 0.30, qr: 0.25 };

/** What generation needs to deal boxes. Quote styling is passed in (not read
 *  from THEMES here) because generateAlbum is pure — the caller resolves the
 *  active theme's caption font/color so a dealt quote is EXACTLY what a
 *  QuotePickerModal pick via setBoxText would have produced. Absent (specs,
 *  legacy callers) → boxes generate empty exactly as before. */
export interface BoxContentOptions {
  quotePool: string[];
  quoteFontFamily: string;
  quoteColor: string;
}

export function rollBoxKind(): BoxRoll {
  const r = Math.random();
  if (r < BOX_ROLL_WEIGHTS.quote) return 'quote';
  if (r < BOX_ROLL_WEIGHTS.quote + BOX_ROLL_WEIGHTS.text) return 'text';
  return 'qr';
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
): void {
  const boxes = template.textSlots?.length ?? 0;
  if (boxes === 0) return;
  const rolls: (BoxRoll | null)[] = [];
  for (let j = 0; j < boxes; j++) {
    let kind = rollBoxKind();
    if (kind === 'quote') {
      const quote = dealQuote();
      if (quote) {
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
        } satisfies TextElement);
      } else {
        // Pool exhausted (or empty): never repeat a line — re-roll this box
        // between the two remaining kinds at their RELATIVE odds (30:25) so
        // QR keeps its share instead of every late box collapsing to text.
        kind = Math.random() < BOX_ROLL_WEIGHTS.text / (BOX_ROLL_WEIGHTS.text + BOX_ROLL_WEIGHTS.qr)
          ? 'text'
          : 'qr';
      }
    }
    rolls.push(kind);
  }
  page.textSlotRoll = rolls;
}

/**
 * Smart album generation:
 *  1. Analyze all photos to find dominant aspect ratio
 *  2. Select templates that match the dominant ratio + album size
 *  3. Place photos in ratio-matched slots — no more cropping disasters
 *  4. Fall back to mixed-ratio templates if needed
 */
export function generateAlbum(
  photos: UploadedPhoto[],
  albumSize: AlbumSizePreset,
  photosPerPage?: number | undefined,
  background?: AlbumPage['background'] | undefined,
  options?: { randomize?: boolean; border?: { color: string; width: number }; cornerBase?: string; boxContent?: BoxContentOptions },
): AlbumPage[] {
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
  const fillDensity = (!randomize && photosPerPage == null && totalPhotos < MIN_PAGES * naturalPerPage(albumSize))
    ? Math.max(1, Math.floor(totalPhotos / MIN_PAGES))
    : undefined;
  const effPerPage = photosPerPage ?? fillDensity;
  const fillMode = fillDensity != null;

  // No photos → minimum empty pages
  if (totalPhotos === 0) {
    return Array.from({ length: MIN_PAGES }, (_, i) => createEmptyPage(i, albumSize, background, border, cornerBase));
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

  /** Does this template's slots span MORE THAN ONE ratio? Such a template can
   *  only be filled slot-by-slot (tryMixedFill); handing it to a single-ratio
   *  queue would cross orientations. Single-slot templates are never mixed. */
  const isMixedRatio = (t: PageTemplate): boolean =>
    new Set(t.slots.map((s) => s.ratio).filter(Boolean)).size > 1;

  // Templates for a photo at this size. RATIO matching is LOOSE — any layout of
  // the same ORIENTATION is an acceptable home (a 4:3 in a 3:2 slot costs ~11%),
  // which also unlocks layouts whose regions aren't exact camera ratios. But
  // ORIENTATION is STRICT: putting a portrait photo in a landscape slot loses
  // ~50% and chops heads/feet, so we never cross it. (The old fallback returned
  // EVERY template for the size — orientation-blind — which is exactly how a
  // portrait photo ended up hard-cropped in a landscape layout.)
  const templatesForRatio = (ratio: PhotoRatio): PageTemplate[] => {
    // MIXED-RATIO templates are excluded here on purpose. This path draws from
    // ONE ratio's queue and fills every slot from it, but a mixed template has
    // slots of more than one orientation by design (e.g. a portrait hero beside
    // two landscape frames). Filling those blindly puts a photo in a slot of the
    // opposite orientation and chops it — the exact defect this whole function
    // is orientation-strict to avoid. They are placed ONLY by tryMixedFill,
    // which matches each slot individually.
    const sameOrientation = getTemplatesForOrientation(albumSize, orientationOfRatio(ratio))
      .filter((t) => !isMixedRatio(t));
    // LOOSEN, don't remove: keep this photo's own ratio plus NEIGHBOURING ratios
    // within the crop budget. That unlocks the layouts exact-matching locked out
    // without letting a 4:3 land in a 16:9 slot (25%).
    const near = sameOrientation.filter((t) => ratioCrop(t.targetRatio, ratio) <= MAX_LOOSE_CROP);
    if (near.length) return near;
    if (sameOrientation.length) return sameOrientation; // orientation stays strict
    const exact = getTemplatesForRatio(albumSize, ratio).filter((t) => !isMixedRatio(t));
    if (exact.length) return exact;
    // Last resort for a size with nothing of this orientation: single-ratio
    // layouts only, so even here a slot is never filled across orientations.
    return getTemplatesForAlbum(albumSize).filter((t) => !isMixedRatio(t));
  };

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
  const PAGE_ASPECT: Record<string, number> = {
    '6x4': 6 / 4, '8x6': 8 / 6, '6x8': 6 / 8, '6x6': 1, '8x8': 1, '9x9': 1, '11.5x8': 11.5 / 8, '8.5x11': 8.5 / 11,
  };
  const pageAspect = PAGE_ASPECT[albumSize] ?? 1;
  /** Does this single-photo template stretch its photo across the WHOLE sheet?
   *  That — not the fullBleed flag — is the condition the crop rule is about.
   *  A template can be full bleed and still be safe: a 2:3 photo occupying the
   *  left 4x6" of a 6x6 page bleeds off three edges at ZERO crop, because the
   *  slot is the photo's own ratio and a combo box takes the remainder. Testing
   *  the flag instead of the geometry rejected those layouts for a problem they
   *  do not have. */
  const coversWholeSheet = (t: PageTemplate): boolean => {
    if (!t.fullBleed) return false;
    const s = t.slots[0];
    return !!s && s.x <= 0.001 && s.y <= 0.001 && s.width >= 0.999 && s.height >= 0.999;
  };
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
    if (boxContent) dealBoxContent(page, template, boxContent, dealQuote);
    pages.push(page);
    pageIdx++;
  };

  // Templates that MIX photo ratios on one page (e.g. 3:2 + 1:1 + 2:3). Filled
  // greedily when a moment's photos supply every ratio the template needs.
  const mixedTemplates = getTemplatesForAlbum(albumSize).filter(isMixedRatio);

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
  for (const group of momentGroups) {
    let remaining = [...group];

    // ── 3a. Place mixed-ratio templates the pool can satisfy — but with VARIETY,
    //       not always the first match (that made every mixed-ratio moment land
    //       on the SAME template). If only one mixed template fits and it was used
    //       recently, stop forcing mixed here and let the more-varied
    //       ratio-by-ratio path take these photos instead. ──
    if (mixedTemplates.length > 0 && !fillMode) {
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
      if (effPerPage === 1 && !randomize) {
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
      return { key: ratio, queue, ratioTemplates, onePhoto, singles, multi };
    });

    // Emit exactly one page from a ratio's queue (drains 1..slotCount photos).
    const emitOnePage = (st: RatioState) => {
      const { key, queue, ratioTemplates, singles, multi } = st;
      const fits = multi.filter((t) => t.slotCount <= queue.length);

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
  while (pages.length < MIN_PAGES) {
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
