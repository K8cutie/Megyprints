/* ══════════════════════════════════════════════════════════════════════════
   HOW AN APP PAGE IS COMPARED WITH THE WEBSITE'S (test/goldenPages.test.ts).

   Four pictures per page with words: the website's page with and without
   its words (print's own `words: false`), and the app's, the same two ways.
   "Ink" is what the words paint: a pixel whose with-words and without-words
   values differ. Both renderers draw everything else exactly the same way
   twice, so ink is exact: letters, outline, shadow, underline, nothing else.

   1. EVERYTHING BUT THE INK: pixelmatch at threshold 0.05, smoothed edge
      pixels counted too (includeAA: nothing excused as "anti-aliasing").
      Only the ink of each text (website's or app's), widened by 2 px, is
      left out, and only inside that text's own box (and that box's mirror
      in the bleed, where print copies a text that touches the page's edge);
      the rest of a text box
      (the paper or the photo under a title) is held to the same bar as the
      page. Two bars:
        • the whole: at most MAX_DIFF_OUTSIDE_WORDS of the counted pixels;
        • any one 64 × 64 px tile: at most MAX_TILE_DIFF of its counted
          pixels off by more than TILE_LEVELS of 255, so a small missing
          thing (a frame line, a mask edge) fails even when the whole page
          is big. (Real differences are faint: blended edge pixels a few
          levels apart, whole rows of them along a photo's edge, which
          pixelmatch counts; a missing line is strong.)
        • any one 64 × 64 px tile's mean colour (its counted pixels, each
          channel): within MAX_TILE_MEAN_LEVELS of the website's. A colour
          a little off everywhere (a texture's tint a shade off, a wash or a
          look a little too strong) moves every pixel by a few levels:
          under pixelmatch's threshold and the tile's 32 levels, but not
          under a whole tile's mean, where real differences (a few edge
          pixels) average out.
   2. THE INK, per text box: Chromium on Windows draws letters with
      DirectWrite (grid-fitted), Skia with FreeType, so letter edges never
      match pixel for pixel. What must match:
        • the ink itself, per colour channel: Σ (with − without) over the
          box, app vs website, within MAX_INK_DIFF of the website's ink.
          A missing caption, outline, shadow or underline, or a wrong
          colour, changes it by far more;
        • 8 × 8 px blocks: the mean colour of every block of the box within
          MAX_BLOCK_DIFF levels (edges wash out over a block; a missing
          letter, line or stroke does not);
        • where it sits: the ink's offset against the website's (sum of
          squared differences at ±2 px, parabola through the best three)
          under MAX_WORD_SHIFT_PX. No ink, or a flat curve, is NaN: a fail.
   3. THE LINES (goldenPages.test.ts): the same lines, in the same order,
      as print really drew them (webEntry.ts writes down every fillText),
      each placed where print placed it, in its colour, as wide.

   Every bar was set by measuring (2026-10-28, tools/golden, 44 pages; the
   numbers are in the plan's "Page renderer notes"): just above the worst
   real page, and the mutation tests in goldenPages.test.ts prove each kind
   of mistake (a photo 1/4 px off, a frame 1 px wider, a frame line or a
   dash missing, words missing or 1 px lower, no underline, outline or
   shadow, a wrong colour, a turned title's shadow in the wrong place)
   fails at least one bar.

   Why threshold 0.05: at pixelmatch's default 0.1 a photo moved 1/4 px can
   hide (0.21% of the page); at 0.03 the filter rounding alone reaches 0.58%
   (the one blended pixel at each sharp edge of a downscaled photo comes out
   up to 15 of 255 levels apart: Chromium's Skia and CanvasKit round
   bilinear weights differently).
   ══════════════════════════════════════════════════════════════════════════ */
import pixelmatch from 'pixelmatch';

export const PIXELMATCH = { threshold: 0.05, includeAA: true } as const;
/** Everything but the words' ink: % of the counted pixels that may differ. */
export const MAX_DIFF_OUTSIDE_WORDS = 0.15;
/** Any 64 × 64 tile: % of its counted pixels that may be off by more than TILE_LEVELS. */
export const TILE = 64;
export const TILE_LEVELS = 32;
export const MAX_TILE_DIFF = 1;
/** Any 64 × 64 tile's mean colour (counted pixels, per channel), levels of 255. */
export const MAX_TILE_MEAN_LEVELS = 2;
/** A text's ink, per channel, app vs website: share of the website's ink. */
export const MAX_INK_DIFF = 0.06;
/** A text's 8 × 8 blocks: mean colour, levels of 255. */
export const BLOCK = 8;
export const MAX_BLOCK_DIFF = 40;
/** How far a text's ink may sit from the website's, px. */
export const MAX_WORD_SHIFT_PX = 0.5;
/** A line's width, app vs browser, px. */
export const MAX_LINE_WIDTH_DIFF_PX = 1;
/** Where a line is drawn, app vs print, px. */
export const MAX_LINE_POSITION_DIFF_PX = 0.01;
/** The ink left out of the pixel bar is widened by this, px. */
export const INK_MARGIN_PX = 2;

export interface Area { x: number; y: number; w: number; h: number }

export interface WordsResult {
  zone: Area;
  /** Σ of the largest channel difference with − without, website / app. */
  refInk: number;
  appInk: number;
  /** Worst channel: |Σ app ink − Σ website ink| / the website's largest channel sum. */
  inkDiff: number;
  /** The worst 8 × 8 block's mean colour difference, levels. */
  worstBlock: number;
  shift: { x: number; y: number };
}

export interface PageComparison {
  pixels: number;
  differing: number;
  differingPct: number;
  /** Pixels held to the page bar (all but the words' ink). */
  counted: number;
  outsideWordsPct: number;
  worstTilePct: number;
  worstTileAt: { x: number; y: number } | null;
  /** The worst tile's mean colour difference, levels (largest channel). */
  worstTileMean: number;
  worstTileMeanAt: { x: number; y: number } | null;
  /** % of the page left out as words' ink. */
  inkPct: number;
  /** pixelmatch inside the ink (reported, not barred). */
  inkDiffPct: number | null;
  /** Any channel off by more than 8 of 255 (a plainer, stricter count). */
  over8LevelsPct: number;
  maxChannelDiff: number;
  words: WordsResult[];
  diff: Uint8Array;
}

/** RGBA pictures of one size. */
export interface Pictures { ref: Uint8Array; refBare: Uint8Array; app: Uint8Array; appBare: Uint8Array; W: number; H: number }

interface Box { x0: number; y0: number; x1: number; y1: number; w: number; h: number }
function clampBox(a: Area, W: number, H: number): Box {
  const x0 = Math.max(0, Math.floor(a.x)), y0 = Math.max(0, Math.floor(a.y));
  const x1 = Math.min(W, Math.ceil(a.x + a.w)), y1 = Math.min(H, Math.ceil(a.y + a.h));
  return { x0, y0, x1, y1, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

/** The ink in a box: the largest channel difference with − without, per pixel. */
function inkOf(full: Uint8Array, bare: Uint8Array, W: number, b: Box): Float32Array {
  const out = new Float32Array(b.w * b.h);
  for (let y = 0; y < b.h; y++) {
    let i = ((b.y0 + y) * W + b.x0) * 4;
    for (let x = 0; x < b.w; x++, i += 4) {
      const dr = Math.abs(full[i] - bare[i]), dg = Math.abs(full[i + 1] - bare[i + 1]), db = Math.abs(full[i + 2] - bare[i + 2]);
      out[y * b.w + x] = dr > dg ? (dr > db ? dr : db) : (dg > db ? dg : db);
    }
  }
  return out;
}

/** Σ (with − without) per channel over a box. */
function channelSums(full: Uint8Array, bare: Uint8Array, W: number, b: Box): [number, number, number] {
  let r = 0, g = 0, bl = 0;
  for (let y = 0; y < b.h; y++) {
    let i = ((b.y0 + y) * W + b.x0) * 4;
    for (let x = 0; x < b.w; x++, i += 4) {
      r += full[i] - bare[i]; g += full[i + 1] - bare[i + 1]; bl += full[i + 2] - bare[i + 2];
    }
  }
  return [r, g, bl];
}

/** The worst 8 × 8 block of a box: mean colour, app vs website, largest channel. */
function worstBlockDiff(ref: Uint8Array, app: Uint8Array, W: number, b: Box): number {
  let worst = 0;
  for (let by = 0; by + BLOCK <= b.h; by += BLOCK) {
    for (let bx = 0; bx + BLOCK <= b.w; bx += BLOCK) {
      let r = 0, g = 0, bl = 0;
      for (let y = 0; y < BLOCK; y++) {
        let i = ((b.y0 + by + y) * W + b.x0 + bx) * 4;
        for (let x = 0; x < BLOCK; x++, i += 4) {
          r += app[i] - ref[i]; g += app[i + 1] - ref[i + 1]; bl += app[i + 2] - ref[i + 2];
        }
      }
      const n = BLOCK * BLOCK;
      const d = Math.max(Math.abs(r), Math.abs(g), Math.abs(bl)) / n;
      if (d > worst) worst = d;
    }
  }
  return worst;
}

/** How far the app's ink sits from the website's (px, + = right/down); NaN
 *  when the app has no ink there or the match has no clear best place. */
export function inkShift(refInk: Float32Array, appInk: Float32Array, w: number, h: number): { x: number; y: number } {
  let refSum = 0, appSum = 0;
  for (let i = 0; i < refInk.length; i++) { refSum += refInk[i]; appSum += appInk[i]; }
  if (!(refSum > 0) || appSum < refSum * 0.05) return { x: NaN, y: NaN };
  const ssd = (dx: number, dy: number) => {
    let s = 0;
    for (let y = 2; y < h - 2; y++) {
      for (let x = 2; x < w - 2; x++) {
        const d = refInk[y * w + x] - appInk[(y + dy) * w + x + dx];
        s += d * d;
      }
    }
    return s;
  };
  const axis = (at: (d: number) => number) => {
    const v = [-2, -1, 0, 1, 2].map(at);
    let m = 2;
    for (let i = 1; i < 4; i++) if (v[i] < v[m]) m = i;
    if (m === 0 || m === 4) return m - 2; // 2 px or more: no finer answer needed
    const den = v[m - 1] - 2 * v[m] + v[m + 1];
    // A flat curve (no ink to line up) has no best place: not a pass.
    if (!(den > 1e-6 * Math.max(1, v[m]))) return NaN;
    // The app's ink at x + d matches the website's at x: it sits d px over.
    return m - 2 + (v[m - 1] - v[m + 1]) / (2 * den);
  };
  return { x: axis((d) => ssd(d, 0)), y: axis((d) => ssd(0, d)) };
}

/** Where a box shows again in the bleed (print-file px): mirrored across
 *  each page edge it is near, as printBleed mirrors the page's edges. */
export function bleedMirrors(zone: Area, bleed: number, W: number, H: number): Area[] {
  if (!bleed) return [];
  const R = W - bleed, B = H - bleed;
  const xs: [number, number][] = [[zone.x, zone.x + zone.w]];
  const ys: [number, number][] = [[zone.y, zone.y + zone.h]];
  const flip = (a: number, b: number, edge: number): [number, number] => [2 * edge - b, 2 * edge - a];
  xs.push(flip(zone.x, zone.x + zone.w, bleed), flip(zone.x, zone.x + zone.w, R));
  ys.push(flip(zone.y, zone.y + zone.h, bleed), flip(zone.y, zone.y + zone.h, B));
  // Each mirror lands only in its own bleed band.
  const xBand: [number, number][] = [[bleed, R], [0, bleed], [R, W]];
  const yBand: [number, number][] = [[bleed, B], [0, bleed], [B, H]];
  const out: Area[] = [];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (!i && !j) continue;
      const x0 = Math.max(xs[i][0], xBand[i][0]), x1 = Math.min(xs[i][1], xBand[i][1]);
      const y0 = Math.max(ys[j][0], yBand[j][0]), y1 = Math.min(ys[j][1], yBand[j][1]);
      if (x1 > x0 && y1 > y0) out.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    }
  }
  return out;
}

/** Leave a box's ink (website's or app's), widened by INK_MARGIN_PX, out of the page bar. */
function excuseInk(p: Pictures, area: Area, excused: Uint8Array): void {
  const b = clampBox(area, p.W, p.H);
  const refInk = inkOf(p.ref, p.refBare, p.W, b);
  const appInk = inkOf(p.app, p.appBare, p.W, b);
  const M = INK_MARGIN_PX;
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      const k = y * b.w + x;
      if (refInk[k] > 0 || appInk[k] > 0) {
        for (let yy = Math.max(0, y - M); yy <= Math.min(b.h - 1, y + M); yy++) {
          for (let xx = Math.max(0, x - M); xx <= Math.min(b.w - 1, x + M); xx++) excused[(b.y0 + yy) * p.W + b.x0 + xx] = 1;
        }
      }
    }
  }
}

/** Compare one page. `zones`: each text's box (print-file px, bleed in), in
 *  the order the page draws its texts; `bleed`: the print file's bleed, px. */
export function comparePage(p: Pictures, zones: Area[], bleed = 0): PageComparison {
  const { ref, refBare, app, appBare, W, H } = p;
  const diff = new Uint8Array(W * H * 4);
  const differing = pixelmatch(ref, app, diff, W, H, PIXELMATCH);
  let over8 = 0, maxChannel = 0;
  for (let i = 0; i < app.length; i += 4) {
    const d = Math.max(Math.abs(app[i] - ref[i]), Math.abs(app[i + 1] - ref[i + 1]), Math.abs(app[i + 2] - ref[i + 2]));
    if (d > 8) over8++;
    if (d > maxChannel) maxChannel = d;
  }

  // The words' ink, per zone, and the pixels it leaves out of the page bar.
  const excused = new Uint8Array(W * H);
  const words: WordsResult[] = zones.map((zone) => {
    const b = clampBox(zone, W, H);
    const refInk = inkOf(ref, refBare, W, b);
    const appInk = inkOf(app, appBare, W, b);
    let refTotal = 0, appTotal = 0;
    for (let k = 0; k < refInk.length; k++) { refTotal += refInk[k]; appTotal += appInk[k]; }
    excuseInk(p, zone, excused);
    for (const m of bleedMirrors(zone, bleed, W, H)) excuseInk(p, m, excused);
    const sr = channelSums(ref, refBare, W, b);
    const sa = channelSums(app, appBare, W, b);
    const scale = Math.max(Math.abs(sr[0]), Math.abs(sr[1]), Math.abs(sr[2]), 1);
    const inkDiff = Math.max(Math.abs(sa[0] - sr[0]), Math.abs(sa[1] - sr[1]), Math.abs(sa[2] - sr[2])) / scale;
    return {
      zone, refInk: refTotal, appInk: appTotal, inkDiff: refTotal > 0 ? inkDiff : (appTotal > 0 ? Infinity : 0),
      worstBlock: worstBlockDiff(ref, app, W, b),
      shift: inkShift(refInk, appInk, b.w, b.h),
    };
  });

  // pixelmatch marks a differing pixel red (255, 0, 0), a differing smoothed edge yellow.
  const isDiff = (p4: number) => diff[p4] === 255 && diff[p4 + 2] === 0 && (diff[p4 + 1] === 0 || diff[p4 + 1] === 255);
  let counted = 0, restDiff = 0, inkPx = 0, inkDiffPx = 0;
  for (let q = 0; q < W * H; q++) {
    if (excused[q]) { inkPx++; if (isDiff(q * 4)) inkDiffPx++; } else { counted++; if (isDiff(q * 4)) restDiff++; }
  }

  // Tiles: the worst one's share of counted pixels off by more than
  // TILE_LEVELS (a tile mostly left out as ink, under a quarter counted, is
  // not judged on its own).
  let worstTilePct = 0;
  let worstTileAt: { x: number; y: number } | null = null;
  let worstTileMean = 0;
  let worstTileMeanAt: { x: number; y: number } | null = null;
  for (let ty = 0; ty < H; ty += TILE) {
    for (let tx = 0; tx < W; tx += TILE) {
      let n = 0, d = 0, sr = 0, sg = 0, sb = 0;
      const y1 = Math.min(H, ty + TILE), x1 = Math.min(W, tx + TILE);
      for (let y = ty; y < y1; y++) {
        let i = (y * W + tx) * 4;
        for (let x = tx; x < x1; x++, i += 4) {
          if (excused[y * W + x]) continue;
          n++;
          sr += app[i] - ref[i]; sg += app[i + 1] - ref[i + 1]; sb += app[i + 2] - ref[i + 2];
          if (Math.abs(app[i] - ref[i]) > TILE_LEVELS || Math.abs(app[i + 1] - ref[i + 1]) > TILE_LEVELS || Math.abs(app[i + 2] - ref[i + 2]) > TILE_LEVELS) d++;
        }
      }
      if (n < (TILE * TILE) / 4) continue;
      const pct = (d / n) * 100;
      if (pct > worstTilePct) { worstTilePct = pct; worstTileAt = { x: tx, y: ty }; }
      const mean = Math.max(Math.abs(sr), Math.abs(sg), Math.abs(sb)) / n;
      if (mean > worstTileMean) { worstTileMean = mean; worstTileMeanAt = { x: tx, y: ty }; }
    }
  }

  return {
    pixels: W * H, differing, differingPct: (differing / (W * H)) * 100,
    counted, outsideWordsPct: counted ? (restDiff / counted) * 100 : 0,
    worstTilePct, worstTileAt, worstTileMean, worstTileMeanAt,
    inkPct: (inkPx / (W * H)) * 100, inkDiffPct: inkPx ? (inkDiffPx / inkPx) * 100 : null,
    over8LevelsPct: (over8 / (W * H)) * 100, maxChannelDiff: maxChannel,
    words, diff,
  };
}

/** What fails a page, in words (empty: it passes the pixel and ink bars). */
export function pageFailures(cmp: PageComparison): string[] {
  const out: string[] = [];
  if (!(cmp.outsideWordsPct <= MAX_DIFF_OUTSIDE_WORDS)) out.push(`page: ${cmp.outsideWordsPct.toFixed(3)}% of pixels differ (bar ${MAX_DIFF_OUTSIDE_WORDS}%)`);
  if (!(cmp.worstTilePct <= MAX_TILE_DIFF)) out.push(`tile at ${cmp.worstTileAt?.x},${cmp.worstTileAt?.y}: ${cmp.worstTilePct.toFixed(2)}% off by more than ${TILE_LEVELS} levels (bar ${MAX_TILE_DIFF}%)`);
  if (!(cmp.worstTileMean <= MAX_TILE_MEAN_LEVELS)) out.push(`tile at ${cmp.worstTileMeanAt?.x},${cmp.worstTileMeanAt?.y}: its colour ${cmp.worstTileMean.toFixed(2)} levels off on average (bar ${MAX_TILE_MEAN_LEVELS})`);
  cmp.words.forEach((w, i) => {
    if (!(w.inkDiff <= MAX_INK_DIFF)) out.push(`text ${i + 1}: ink ${(w.inkDiff * 100).toFixed(1)}% off the website's (bar ${MAX_INK_DIFF * 100}%)`);
    if (!(w.worstBlock <= MAX_BLOCK_DIFF)) out.push(`text ${i + 1}: an 8x8 block ${w.worstBlock.toFixed(1)} levels off (bar ${MAX_BLOCK_DIFF})`);
    if (!(Math.abs(w.shift.x) < MAX_WORD_SHIFT_PX && Math.abs(w.shift.y) < MAX_WORD_SHIFT_PX)) out.push(`text ${i + 1}: sits ${w.shift.x.toFixed(2)}, ${w.shift.y.toFixed(2)} px off (bar ${MAX_WORD_SHIFT_PX})`);
  });
  return out;
}

/* TEXTURE TILES (goldenPages.test.ts): a page texture's tile, as print
   prepares it before repeating it over the page (the material's SVG drawn at
   the print tile size), against the app's (textureTile.ts: the same SVG
   drawn by Skia). Both are Skia drawing the same vector shapes and the same
   Perlin noise, so they agree to a few levels of 255 on every pixel: the
   bars were set by measuring all 16 textures, own colour and tinted
   (2026-10-29: worst pixel 3 levels, worst mean 0.77), just above the worst.
   A wrong tint, a missing grain layer or a wrong noise seed moves whole
   areas by far more. */
export const MAX_TEXTURE_TILE_LEVELS = 4;
export const MAX_TEXTURE_TILE_MEAN = 1;

/** How a tile differs: its worst pixel and its mean (largest channel, levels). */
export function tileFailures(ref: Uint8Array, app: Uint8Array): { maxLevels: number; meanLevels: number; failures: string[] } {
  if (ref.length !== app.length) return { maxLevels: 255, meanLevels: 255, failures: ['the tiles are not the same size'] };
  let max = 0, sum = 0;
  for (let i = 0; i < ref.length; i += 4) {
    const d = Math.max(Math.abs(ref[i] - app[i]), Math.abs(ref[i + 1] - app[i + 1]), Math.abs(ref[i + 2] - app[i + 2]), Math.abs(ref[i + 3] - app[i + 3]));
    if (d > max) max = d;
    sum += d;
  }
  const mean = sum / (ref.length / 4);
  const failures: string[] = [];
  if (!(max <= MAX_TEXTURE_TILE_LEVELS)) failures.push(`a pixel ${max} levels off (bar ${MAX_TEXTURE_TILE_LEVELS})`);
  if (!(mean <= MAX_TEXTURE_TILE_MEAN)) failures.push(`${mean.toFixed(2)} levels off on average (bar ${MAX_TEXTURE_TILE_MEAN})`);
  return { maxLevels: max, meanLevels: mean, failures };
}
