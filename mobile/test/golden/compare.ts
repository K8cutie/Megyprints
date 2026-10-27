/* ══════════════════════════════════════════════════════════════════════════
   HOW AN APP PAGE IS COMPARED WITH THE WEBSITE'S (test/goldenPages.test.ts).

   Pixels: pixelmatch at threshold 0.05, smoothed edge pixels counted too
   (includeAA: nothing is excused as "just anti-aliasing"). 0.05 was chosen
   by measuring, not to pass (tools/golden, 2026-10-28, four photo pages):
     • the app's real pages: 0.000 to 0.061% of pixels differ;
     • the same pages with the photo moved 1/4 px: 0.79 to 1.42%;
       moved 1/2 px: 0.85 to 1.89%; zoomed ×1.002 or a frame 1 px wider:
       0.97 to 4.8%.
   At pixelmatch's default 0.1 a 1/4 px move can hide (0.21%); at 0.03 the
   filter rounding alone reaches 0.58% (the one blended pixel at each sharp
   edge of a downscaled photo comes out up to 15 of 255 levels apart:
   Chromium's Skia and CanvasKit round bilinear weights differently).
   So the bar for everything that is not words is 0.5% at 0.05, and the
   mutation test in goldenPages.test.ts proves a 1/4 px error fails it.

   Words: their pixels are reported, not held to 0.5% (Chromium on Windows
   draws letters with DirectWrite, which grid-fits them; Skia uses FreeType),
   but where they sit is: each text box's offset against the website's,
   measured to a fraction of a pixel (sum of squared differences at ±1 px,
   parabola through the three), must be under 0.5 px.
   ══════════════════════════════════════════════════════════════════════════ */
import pixelmatch from 'pixelmatch';
import type { PagePlan } from '../../src/render/pagePlan';
import { TEXT_LINE_HEIGHT } from '@web/pages/builder/wordArtRules';

export const PIXELMATCH = { threshold: 0.05, includeAA: true } as const;
/** Everything that is not words: % of the page's pixels. */
export const MAX_DIFF_OUTSIDE_WORDS = 0.5;
/** How far a text box may sit from the website's, px. */
export const MAX_WORD_SHIFT_PX = 0.5;
/** A line's width, app vs browser, px. */
export const MAX_LINE_WIDTH_DIFF_PX = 1;

export interface Area { x: number; y: number; w: number; h: number }

export interface PageComparison {
  pixels: number;
  differing: number;
  differingPct: number;
  outsideWordsPct: number;
  wordsPct: number | null;
  /** Any channel off by more than 8 of 255 (a plainer, stricter count). */
  over8LevelsPct: number;
  maxChannelDiff: number;
  wordShifts: { x: number; y: number }[];
  diff: Uint8Array;
}

/** Where the words are drawn, print-file px (bleed included): a caption box
 *  or a photo frame holding words, or a free text's box with room round it. */
export function wordAreas(plan: PagePlan, lineCounts: number[]): Area[] {
  const b = plan.bleed;
  const out: Area[] = [];
  let k = 0;
  for (const it of plan.items) {
    if (it.kind === 'boxText') {
      out.push({ x: it.box.x + b, y: it.box.y + b, w: it.box.w, h: it.box.h });
      k++;
    } else if (it.kind === 'freeText') {
      const lines = lineCounts[k++] ?? 1;
      const pad = it.fontSize * 0.5;
      out.push({ x: it.x + b - pad, y: it.y + b - pad, w: it.boxWidth * it.scaleX + pad * 2, h: lines * it.fontSize * TEXT_LINE_HEIGHT * it.scaleY + pad * 2 });
    }
  }
  return out;
}

function luminance(rgba: Uint8Array, W: number, a: Area): { lum: Float32Array; x0: number; y0: number; w: number; h: number } {
  const x0 = Math.max(0, Math.floor(a.x)), y0 = Math.max(0, Math.floor(a.y));
  const x1 = Math.min(W, Math.ceil(a.x + a.w));
  const y1 = Math.min(rgba.length / 4 / W, Math.ceil(a.y + a.h));
  const w = x1 - x0, h = y1 - y0;
  const lum = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((y0 + y) * W + x0 + x) * 4;
      lum[y * w + x] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
    }
  }
  return { lum, x0, y0, w, h };
}

/** How far the app's drawing in `a` sits from the website's (px, + = right/down). */
export function shiftIn(ref: Uint8Array, app: Uint8Array, W: number, a: Area): { x: number; y: number } {
  const r = luminance(ref, W, a);
  const p = luminance(app, W, a);
  const ssd = (dx: number, dy: number) => {
    let s = 0;
    for (let y = 2; y < r.h - 2; y++) {
      for (let x = 2; x < r.w - 2; x++) {
        const d = r.lum[y * r.w + x] - p.lum[(y + dy) * p.w + x + dx];
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
    const frac = den > 0 ? (v[m - 1] - v[m + 1]) / (2 * den) : 0;
    // The app's picture at x + d matches the website's at x: it sits d px over.
    return m - 2 + frac;
  };
  return { x: axis((d) => ssd(d, 0)), y: axis((d) => ssd(0, d)) };
}

/** Compare one page. `ref` and `app` are RGBA of the same size. */
export function comparePage(ref: Uint8Array, app: Uint8Array, W: number, H: number, words: Area[]): PageComparison {
  const diff = new Uint8Array(W * H * 4);
  const differing = pixelmatch(ref, app, diff, W, H, PIXELMATCH);
  let over8 = 0, maxChannel = 0;
  for (let i = 0; i < app.length; i += 4) {
    const d = Math.max(Math.abs(app[i] - ref[i]), Math.abs(app[i + 1] - ref[i + 1]), Math.abs(app[i + 2] - ref[i + 2]));
    if (d > 8) over8++;
    if (d > maxChannel) maxChannel = d;
  }
  const inWords = new Uint8Array(W * H);
  for (const a of words) {
    for (let y = Math.max(0, Math.floor(a.y)); y < Math.min(H, Math.ceil(a.y + a.h)); y++) {
      for (let x = Math.max(0, Math.floor(a.x)); x < Math.min(W, Math.ceil(a.x + a.w)); x++) inWords[y * W + x] = 1;
    }
  }
  let wordsPx = 0, wordsDiff = 0, restDiff = 0;
  for (let p = 0; p < W * H; p++) {
    // pixelmatch marks a differing pixel red (255, 0, 0), a differing smoothed edge yellow.
    const r = diff[p * 4], g = diff[p * 4 + 1], b = diff[p * 4 + 2];
    const isDiff = r === 255 && b === 0 && (g === 0 || g === 255);
    if (inWords[p]) { wordsPx++; if (isDiff) wordsDiff++; } else if (isDiff) restDiff++;
  }
  return {
    pixels: W * H, differing, differingPct: (differing / (W * H)) * 100,
    outsideWordsPct: (restDiff / (W * H)) * 100,
    wordsPct: wordsPx ? (wordsDiff / wordsPx) * 100 : null,
    over8LevelsPct: (over8 / (W * H)) * 100, maxChannelDiff: maxChannel,
    wordShifts: words.map((a) => shiftIn(ref, app, W, a)),
    diff,
  };
}
