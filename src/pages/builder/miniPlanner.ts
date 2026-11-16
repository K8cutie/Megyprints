/* ═══════════════════════════════════════════════════════════════════════════
   THE MEGY MINI'S PAGE PLANNER: which of the Mini's own layouts
   (miniTemplates.ts) each page gets, and which photos go in it.

   Owner, 2026-11-17: "im trying to avoid pages with lots of free spaces since
   the pages for mini are very few". So every page is filled: the planner
   picks layouts whose frames add up to exactly the photos it is given, over
   exactly the pages it is given.

   1. HOW MANY OF EACH LAYOUT. A layout is so many landscape frames and so
      many portrait frames (a Full page: 1 portrait; Two landscapes: 2; …).
      Of every mix that fills the pages with the photos, it takes the one with
      the fewest photos in a frame of the other shape (a landscape crossed
      counts more than a portrait), then the fewest pages of the one layout
      that isn't all A-shapes (miniTemplates THIRD_ROW), then the most even
      pages, then the fewest small frames.
   2. A PHOTO IN A FRAME OF THE OTHER SHAPE only when no mix avoids it, e.g.
      a few photos with many landscapes (owner: "Yes, build it" to "a page
      with only one landscape photo … crops the photo to fill the page,
      keeping the faces in"). Then a landscape goes on a Full page of its own
      (the least-wide landscape first), or a portrait in a landscape frame
      (the least-tall portrait first). The builder moves such a photo to show
      its faces (useBuilderState, miniCrossings).
   3. THE ORDER. Page by page, the layout whose photos come earliest in the
      day, so the book reads in the order the photos were taken, a page
      keeping to one scene when it can; a layout
      that just appeared waits a page when another fits nearly as well, and
      a layout that comes twice in a row turns the other way round.

   Pure: no randomness unless asked (ties then go either way).
   ═══════════════════════════════════════════════════════════════════════════ */
import type { UploadedPhoto } from './types';
import { MINI_TEMPLATES, miniFrames, type MiniFrame } from './miniTemplates';

/** A photo's shape for the Mini's frames: a landscape when it is clearly
 *  wider than tall; portraits and squares go in portrait frames (a square
 *  then loses its sides, never a head). */
export function miniShape(photo: Pick<UploadedPhoto, 'width' | 'height'>): MiniFrame {
  return photo.width > 0 && photo.height > 0 && photo.width / photo.height > 1.05 ? 'L' : 'P';
}

interface Kind { key: string; L: number; P: number; ids: string[] }

/** The layouts as kinds (a layout and its upside-down twin are one kind). */
const KINDS: Kind[] = (() => {
  const byKey = new Map<string, Kind>();
  for (const t of MINI_TEMPLATES) {
    const f = miniFrames(t);
    const L = f.filter((x) => x === 'L').length, P = f.length - L;
    const key = `${L}:${P}`;
    const k = byKey.get(key) ?? { key, L, P, ids: [] };
    k.ids.push(t.id);
    byKey.set(key, k);
  }
  return [...byKey.values()].sort((a, b) => a.L + a.P - (b.L + b.P) || a.L - b.L);
})();
const SIZE = (k: Kind) => k.L + k.P;
/** Small (A8) frames a kind has: they print at 2.9 × 2.0 in. */
const SMALL: Record<string, number> = { '3:1': 2, '5:0': 4 };
/** The landscape over a portrait and a landscape (miniTemplates THIRD_ROW):
 *  its landscapes lose a little of their sides, so it is dealt only where the
 *  A-shapes alone would have to cut a photo to half. */
const NEAR: Record<string, number> = { '2:1': 8 };
/** A photo in a frame of the other shape. A portrait in a landscape frame
 *  keeps its faces (the builder shows them) and loses top and bottom; a
 *  landscape on a portrait page loses its sides, which in a group shot are
 *  people. So one landscape crossed costs more than two portraits. */
const PORTRAIT_CROSSED = 700;
const LANDSCAPE_CROSSED = 1500;

/** One planned page: its layout and its photos in frame order (indices into
 *  the photos the planner was given). */
export interface MiniPage { templateId: string; photos: number[] }

/** How many pages of each kind: the best mix of exactly `pages` pages holding
 *  exactly `photos` photos, `landscapes` of them landscapes. */
function chooseMix(photos: number, landscapes: number, pages: number, random: () => number): number[] {
  const avg = photos / pages;
  let best: number[][] = [];
  let bestCost = Infinity;
  const n = new Array(KINDS.length).fill(0);
  const walk = (i: number, pagesLeft: number, photosLeft: number) => {
    if (i === KINDS.length - 1) {
      if (photosLeft !== pagesLeft * SIZE(KINDS[i])) return;
      n[i] = pagesLeft;
      let cells = 0, even = 0, small = 0, same = 0, near = 0;
      KINDS.forEach((k, j) => {
        cells += n[j] * k.L;
        even += n[j] * (SIZE(k) - avg) ** 2;
        small += n[j] * (SMALL[k.key] ?? 0);
        near += n[j] * (NEAR[k.key] ?? 0);
        same += n[j] * n[j];
      });
      const crossed = cells > landscapes ? (cells - landscapes) * PORTRAIT_CROSSED : (landscapes - cells) * LANDSCAPE_CROSSED;
      const cost = crossed + near + even + small * 0.4 + (same / pages) * 2;
      if (cost < bestCost - 1e-9) { bestCost = cost; best = [[...n]]; }
      else if (Math.abs(cost - bestCost) <= 1e-9) best.push([...n]);
      return;
    }
    for (let c = 0; c <= pagesLeft && c * SIZE(KINDS[i]) <= photosLeft; c++) {
      n[i] = c;
      walk(i + 1, pagesLeft - c, photosLeft - c * SIZE(KINDS[i]));
    }
    n[i] = 0;
  };
  walk(0, pages, photos);
  if (!best.length) return [];
  return best[Math.min(best.length - 1, Math.floor(random() * best.length))];
}

/**
 * The pages for `photos` (in the order they were taken) over `pages` pages.
 * Every photo is placed and no page is empty. With fewer photos than pages it
 * makes one page a photo; with more than five a page it adds pages.
 */
export function planMiniPages(
  photos: readonly Pick<UploadedPhoto, 'width' | 'height'>[],
  pages: number,
  random: () => number = () => 0,
  /** Each photo's scene (generateAlbum planScenes): a page keeps to one when it can. */
  scene?: readonly (number | undefined)[],
): MiniPage[] {
  const total = photos.length;
  if (total === 0 || pages <= 0) return [];
  const maxPer = Math.max(...KINDS.map(SIZE));
  const count = Math.max(Math.min(pages, total), Math.ceil(total / maxPer));
  const shape = photos.map(miniShape);
  const landscapes = shape.filter((s) => s === 'L').length;
  const mix = chooseMix(total, landscapes, count, random);
  if (!mix.length) return photos.map((_, i) => ({ templateId: 'mini-full', photos: [i] }));

  // 2. Which photos go in a frame of the other shape (the fewest there can be).
  const lFrames = KINDS.reduce((s, k, j) => s + mix[j] * k.L, 0);
  const aspect = (i: number) => (photos[i].width > 0 && photos[i].height > 0 ? photos[i].width / photos[i].height : 1);
  const frame: MiniFrame[] = [...shape];
  const crossing = new Set<number>();
  if (lFrames > landscapes) {
    // Portraits into landscape frames: the least tall first.
    const ps = shape.map((s, i) => (s === 'P' ? i : -1)).filter((i) => i >= 0).sort((a, b) => aspect(b) - aspect(a));
    for (const i of ps.slice(0, lFrames - landscapes)) { frame[i] = 'L'; crossing.add(i); }
  } else if (lFrames < landscapes) {
    // Landscapes into portrait frames (a Full page of their own): the least wide first.
    const ls = shape.map((s, i) => (s === 'L' ? i : -1)).filter((i) => i >= 0).sort((a, b) => aspect(a) - aspect(b));
    for (const i of ls.slice(0, landscapes - lFrames)) { frame[i] = 'P'; crossing.add(i); }
  }

  // 3. Page by page, in the order the photos were taken.
  const left = [...mix];
  const used = new Array(total).fill(false);
  const out: MiniPage[] = [];
  let previous = '';
  const fullKind = KINDS.findIndex((k) => k.L === 0 && k.P === 1);
  for (let p = 0; p < count; p++) {
    let pick: { j: number; taken: number[]; score: number } | null = null;
    for (let j = 0; j < KINDS.length; j++) {
      if (!left[j]) continue;
      const k = KINDS[j];
      const taken: number[] = [];
      let needL = k.L, needP = k.P;
      for (let i = 0; i < total && (needL || needP); i++) {
        if (used[i]) continue;
        if (frame[i] === 'L' && needL) { taken.push(i); needL--; }
        else if (frame[i] === 'P' && needP) { taken.push(i); needP--; }
      }
      if (needL || needP) continue;
      let score = Math.max(...taken);
      // Photos of two scenes on one page (owner, 2026-11-09: a page holds one
      // scene) only when keeping to one would pull photos from well ahead.
      if (scene) score += 2 * (new Set(taken.map((i) => scene[i])).size - 1);
      // The same layout on the page before: another one, unless it would
      // pull photos from well ahead of the day.
      if (k.key === previous) score += 5;
      // A landscape that must lose its sides gets a page of its own.
      if (j !== fullKind && left[fullKind] && taken.some((i) => crossing.has(i) && shape[i] === 'L')) score += 6;
      if (!pick || score < pick.score - 1e-9 || (Math.abs(score - pick.score) <= 1e-9 && random() < 0.5)) pick = { j, taken, score };
    }
    if (!pick) break;
    left[pick.j]--;
    for (const i of pick.taken) used[i] = true;
    previous = KINDS[pick.j].key;
    out.push(laidOut(KINDS[pick.j], pick.taken.sort((a, b) => a - b), frame, crossing, out[out.length - 1]?.templateId, random));
  }
  return out;
}

/** Which way round the kind's layout goes: never the same as the page before
 *  when it has another, else the one whose first frame takes the earliest
 *  photo. Then its photos in frame order: each frame shape in time order, a
 *  portrait that must fill a landscape frame in the big one. */
function laidOut(kind: Kind, taken: number[], frame: MiniFrame[], crossing: Set<number>, before: string | undefined, random: () => number): MiniPage {
  const templates = kind.ids.map((id) => MINI_TEMPLATES.find((t) => t.id === id)!);
  const first = taken[0];
  const others = templates.filter((tm) => tm.id !== before);
  const pool = others.length ? others : templates;
  const fits = pool.filter((tm) => miniFrames(tm)[0] === frame[first]);
  const choices = fits.length ? fits : pool;
  const t = choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))];
  const frames = miniFrames(t);
  const queue = { L: taken.filter((i) => frame[i] === 'L'), P: taken.filter((i) => frame[i] === 'P') };
  // The big landscape frame is the one that spans the page's width.
  const big = t.slots.findIndex((s, i) => frames[i] === 'L' && s.width > 0.9);
  const cross = queue.L.find((i) => crossing.has(i));
  const fills: number[] = new Array(frames.length).fill(-1);
  if (big >= 0 && cross != null) {
    fills[big] = cross;
    queue.L = queue.L.filter((i) => i !== cross);
  }
  frames.forEach((f, s) => { if (fills[s] < 0) fills[s] = queue[f].shift()!; });
  return { templateId: t.id, photos: fills };
}

/** A Mini page's photos on another Mini layout ("Change layout"): each photo
 *  goes to a frame of the shape it sat in, in order, and only what is left
 *  crosses. Filling by order alone put a landscape in a portrait frame
 *  whenever the two layouts list their frames in a different order (Landscape
 *  over two portraits → Two portraits over landscape). `claimed` = frames a
 *  QR or words hold, which take no photo. */
export function miniReflow(
  fromTemplateId: string | undefined, fills: readonly (number | null)[] | undefined,
  toTemplateId: string, claimed: (i: number) => boolean = () => false,
): (number | null)[] | null {
  const from = fromTemplateId ? MINI_TEMPLATES.find((t) => t.id === fromTemplateId) : undefined;
  const to = MINI_TEMPLATES.find((t) => t.id === toTemplateId);
  if (!from || !to) return null;
  const fromFrames = miniFrames(from);
  const seen = new Set<number>();
  const photos: { i: number; shape: MiniFrame }[] = [];
  (fills ?? []).forEach((f, s) => { if (f != null && !seen.has(f)) { seen.add(f); photos.push({ i: f, shape: fromFrames[s] ?? 'P' }); } });
  const toFrames = miniFrames(to);
  const out: (number | null)[] = new Array(toFrames.length).fill(null);
  const left = [...photos];
  toFrames.forEach((shape, s) => {
    if (claimed(s)) return;
    const k = left.findIndex((p) => p.shape === shape);
    if (k >= 0) out[s] = left.splice(k, 1)[0].i;
  });
  toFrames.forEach((_, s) => { if (out[s] == null && !claimed(s) && left.length) out[s] = left.shift()!.i; });
  return out;
}

/** The frames on a Mini page whose photo is the other shape (a landscape on
 *  a Full page, a portrait in a landscape frame): the ones to move so their
 *  faces show. */
export function miniCrossings(
  templateId: string | undefined, fills: readonly (number | null)[] | undefined,
  photos: readonly Pick<UploadedPhoto, 'width' | 'height'>[],
): number[] {
  const t = templateId ? MINI_TEMPLATES.find((tm) => tm.id === templateId) : undefined;
  if (!t || !fills) return [];
  const frames = miniFrames(t);
  return frames.flatMap((f, s) => {
    const i = fills[s];
    return i != null && photos[i] && miniShape(photos[i]) !== f ? [s] : [];
  });
}
