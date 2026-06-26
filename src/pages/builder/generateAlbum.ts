import type { AlbumPage, UploadedPhoto, AlbumSizePreset, LayoutStyle, PageTemplate } from './types';
import { getTemplatesForRatio, getTemplatesForAlbum } from './pageTemplates';
import { analyzePhotos, type PhotoRatio } from './photoAnalyzer';
import { templateTracker } from './varietyTracker';

/* ══════════════════════════════════════════════════════════════════════════
   SMART ALBUM GENERATION — Ratio-aware template matching
   ══════════════════════════════════════════════════════════════════════════ */

const MIN_PAGES = 40;

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

  const pushPage = (template: PageTemplate, fills: number[]) => {
    const slotCount = template.slots.length;
    const page = createEmptyPage(pageIdx, albumSize, background, border, cornerBase);
    page.templateId = template.id;
    page.slotFills = new Array(slotCount).fill(null);
    page.slotScales = new Array(slotCount).fill(1);
    page.slotOffsetsX = new Array(slotCount).fill(0);
    page.slotOffsetsY = new Array(slotCount).fill(0);
    fills.forEach((photoIdx, s) => { page.slotFills![s] = photoIdx; });
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

    // ── 3a. Greedily place mixed-ratio templates while the pool supports them. ──
    if (mixedTemplates.length > 0) {
      let placed = true;
      while (placed) {
        placed = false;
        for (const template of mixedTemplates) {
          const fills = tryMixedFill(template, remaining);
          if (fills) {
            pushPage(template, fills);
            const usedSet = new Set(fills);
            remaining = remaining.filter((i) => !usedSet.has(i));
            placed = true;
            break;
          }
        }
      }
    }

    // ── 3b. Remaining photos → ratio by ratio. ──
    const byRatio: Partial<Record<PhotoRatio, number[]>> = {};
    for (const i of remaining) {
      const r = ratioOf[i] ?? dominantRatio;
      (byRatio[r] ??= []).push(i);
    }

    for (const ratio of Object.keys(byRatio) as PhotoRatio[]) {
      const queue = byRatio[ratio]!;
      const ratioTemplates = templatesForRatio(ratio);
      const onePhoto = ratioTemplates.filter((t) => t.slotCount === 1);
      // In randomize mode ignore the fixed photos-per-page so slot counts (and
      // therefore page breaks / photo positions) vary on every click.
      let multi = (photosPerPage && !randomize)
        ? ratioTemplates.filter((t) => t.slotCount === photosPerPage)
        : ratioTemplates.filter((t) => t.slotCount > 1);
      if (multi.length === 0) multi = ratioTemplates;

      while (queue.length > 0) {
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
        const id = randomize
          ? candidates[Math.floor(Math.random() * candidates.length)].id
          : (templateTracker.pick(candidates.map((t) => t.id))
            ?? candidates[Math.floor(Math.random() * candidates.length)].id);
        const template = candidates.find((t) => t.id === id) ?? candidates[0];
        const take = Math.min(template.slots.length, queue.length);
        pushPage(template, queue.splice(0, take));
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

  // Fill new slots with ratio-matched photos
  const newFills: (number | null)[] = new Array(slotCount).fill(null);
  for (let slotIdx = 0; slotIdx < slotCount && existingFills.length > 0; slotIdx++) {
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
    slotFills: newFills,
    slotScales: new Array(slotCount).fill(1),
    slotOffsetsX: new Array(slotCount).fill(0),
    slotOffsetsY: new Array(slotCount).fill(0),
  };
}
