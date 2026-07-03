import type { AlbumPage, UploadedPhoto, AlbumSizePreset, LayoutStyle, PageTemplate } from './types';
import { getTemplatesForRatio, getTemplatesForAlbum } from './pageTemplates';
import { analyzePhotos, type PhotoRatio } from './photoAnalyzer';
import { templateTracker } from './varietyTracker';
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
  options?: { randomize?: boolean; border?: { color: string; width: number }; cornerBase?: string },
): AlbumPage[] {
  const totalPhotos = photos.length;
  // Surprise Me mode: keep the photo sequence (chronological) but repackage it
  // into random templates + random slot counts so page breaks and photo
  // positions visibly differ on every click.
  const randomize = options?.randomize ?? false;
  // Theme-baked photo frame + corner art applied to every generated page.
  const border = options?.border;
  const cornerBase = options?.cornerBase;

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

  // Templates for a ratio at this size; fall back to any template for the size
  // if that ratio has no dedicated template (a coverage gap).
  const templatesForRatio = (ratio: PhotoRatio): PageTemplate[] => {
    const list = getTemplatesForRatio(albumSize, ratio);
    return list.length ? list : getTemplatesForAlbum(albumSize);
  };

  const pages: AlbumPage[] = [];
  let pageIdx = 0;
  // De-cluster guard: remember the last page's photo-count so consecutive pages
  // can be biased to differ in slotCount too (not just template id). -1 = none yet.
  let lastSlotCount = -1;

  // Bias a candidate list so back-to-back pages differ in photo-count: if the
  // candidates span >1 distinct slotCount, drop those equal to the previous
  // page's count WHEN a non-empty subset remains. Pure bias — if every candidate
  // shares one slotCount (e.g. fill mode), the list is returned unchanged.
  const declusterBySlotCount = <T extends { slotCount: number }>(list: T[]): T[] => {
    if (list.length <= 1 || lastSlotCount < 0) return list;
    const distinct = new Set(list.map((t) => t.slotCount));
    if (distinct.size <= 1) return list;
    const differ = list.filter((t) => t.slotCount !== lastSlotCount);
    return differ.length ? differ : list;
  };

  const pushPage = (template: PageTemplate, fills: number[]) => {
    const slotCount = template.slots.length;
    lastSlotCount = slotCount;
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
    pages.push(page);
    pageIdx++;
  };

  // Templates that MIX photo ratios on one page (e.g. 3:2 + 1:1 + 2:3). Filled
  // greedily when a moment's photos supply every ratio the template needs.
  const mixedTemplates = getTemplatesForAlbum(albumSize).filter((t) => {
    const rset = new Set(t.slots.map((s) => s.ratio).filter(Boolean));
    return rset.size > 1;
  });

  // Try to fill a mixed template from `pool`: one unused photo per slot whose
  // ratio matches that slot's ratio. Returns the fills, or null if any slot
  // can't be matched (the template is then skipped this round).
  const tryMixedFill = (template: PageTemplate, pool: number[]): number[] | null => {
    const used = new Set<number>();
    const fills: number[] = [];
    for (const slot of template.slots) {
      const need = slot.ratio ?? template.targetRatio;
      const pick = pool.find((idx) => !used.has(idx) && (ratioOf[idx] ?? dominantRatio) === need);
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
      let placed = true;
      while (placed) {
        placed = false;
        // Every mixed template fillable from the remaining pool right now.
        const fillable = mixedTemplates
          .map((t) => ({ t, fills: tryMixedFill(t, remaining) }))
          .filter((x): x is { t: PageTemplate; fills: number[] } => x.fills !== null);
        if (fillable.length === 0) break;

        const ids = fillable.map((x) => x.t.id);
        // Single mixed option that we just used → break the monotony: let 3b
        // handle these photos with its larger, varied homogeneous pool.
        if (!randomize && ids.length === 1 && templateTracker.getRecent().includes(ids[0])) break;

        // De-cluster by photo-count: prefer a mixed template whose slotCount
        // differs from the previous page's (bias only — no-op if all share one).
        const biased = randomize
          ? fillable
          : declusterBySlotCount(fillable.map((x) => ({ ...x, slotCount: x.t.slots.length })));
        const biasedIds = biased.map((x) => x.t.id);
        const id = randomize
          ? ids[Math.floor(Math.random() * ids.length)]
          : (templateTracker.pick(biasedIds) ?? biasedIds[Math.floor(Math.random() * biasedIds.length)]);
        const chosen = fillable.find((x) => x.t.id === id) ?? fillable[0];
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
      queue: number[];
      ratioTemplates: PageTemplate[];
      onePhoto: PageTemplate[];
      multi: PageTemplate[];
    }
    const states: RatioState[] = (Object.keys(byRatio) as PhotoRatio[]).map((ratio) => {
      const queue = byRatio[ratio]!;
      const ratioTemplates = templatesForRatio(ratio);
      const onePhoto = ratioTemplates.filter((t) => t.slotCount === 1);
      // Honor the photos-per-page target, but allow ±1 slot so there are enough
      // DISTINCT templates to rotate between. A strict exact-count filter often
      // leaves just one active template for a ratio (worse after curation),
      // which is what made many pages land on the same layout. A little density
      // variation also reads more naturally than every page being identical.
      // In randomize mode, ignore the target entirely so layouts vary the most.
      // Fill mode at 1/page → single-photo full-page templates (multi stays empty,
      // so the loop falls to `onePhoto`). Otherwise honor the density target ±1.
      let multi = (effPerPage === 1 && !randomize)
        ? []
        : (effPerPage && !randomize)
          ? ratioTemplates.filter((t) => t.slotCount >= Math.max(2, effPerPage - 1) && t.slotCount <= effPerPage + 1)
          : ratioTemplates.filter((t) => t.slotCount > 1);
      if (multi.length === 0 && effPerPage !== 1) multi = ratioTemplates.filter((t) => t.slotCount > 1);
      if (multi.length === 0 && effPerPage !== 1) multi = ratioTemplates;
      return { queue, ratioTemplates, onePhoto, multi };
    });

    // Emit exactly one page from a ratio's queue (drains 1..slotCount photos).
    const emitOnePage = (st: RatioState) => {
      const { queue, ratioTemplates, onePhoto, multi } = st;
      // Prefer a multi-slot template that fits the remaining photos. For a
      // leftover smaller than any multi-slot, drop to a single-photo full-page
      // of this ratio — the leftover fix.
      let candidates = multi.filter((t) => t.slotCount <= queue.length);
      if (candidates.length === 0) {
        candidates = onePhoto.length
          ? onePhoto
          : ratioTemplates.filter((t) => t.slotCount <= queue.length);
        if (candidates.length === 0) candidates = ratioTemplates;
      }
      // De-cluster by photo-count too (bias only — no-op if all share one count,
      // e.g. fill mode where every candidate is single-photo).
      const pickPool = randomize ? candidates : declusterBySlotCount(candidates);
      const id = randomize
        ? pickPool[Math.floor(Math.random() * pickPool.length)].id
        : (templateTracker.pick(pickPool.map((t) => t.id))
          ?? pickPool[Math.floor(Math.random() * pickPool.length)].id);
      const template = pickPool.find((t) => t.id === id) ?? pickPool[0];
      const take = Math.min(template.slots.length, queue.length);
      pushPage(template, queue.splice(0, take));
    };

    // Round-robin until every queue is empty — never exits early, so no photo is
    // ever left unplaced (blanks regression guard).
    let anyLeft = states.some((s) => s.queue.length > 0);
    while (anyLeft) {
      anyLeft = false;
      for (const st of states) {
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

  const pool = matchingTemplates.length > 0
    ? matchingTemplates
    : getTemplatesForAlbum(albumSize).filter(t => t.id !== page.templateId);

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
      for (const queue of Object.values(ratioQueues)) {
        if (queue.length > 0) {
          bestPhotoIdx = queue.shift()!;
          break;
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
