/**
 * @jest-environment node
 */
/* ══════════════════════════════════════════════════════════════════════════
   WHY THIS TEST: the riskiest part of the 2.0 app. When the app makes the
   print files itself, every page must come out the way the website's print
   renderer makes it today. A photo shifted a pixel, a caption broken onto a
   different line, a mask a hair off: the printed book is wrong and nobody
   sees it until it is in a customer's hands.

   So the app's page renderer (src/render) draws the golden pages (the
   website's own seeded album generator plus hand-made pages: pans, zooms,
   masks, washes, frames, captions, a quote, a title) headless in Node with
   Skia's CanvasKit build, and every page is compared, pixel by pixel, with
   the picture the website's printPipeline draws of it in headless Chromium
   (tools/golden/renderWeb.mjs, run again by this test whenever the website's
   print code, the golden pages or the fonts changed since the last pictures).

   The bars (why these numbers: test/golden/compare.ts):
     • everything that is not words: at most 0.5% of the page's pixels
       differ at pixelmatch 0.05, smoothed edges counted;
     • the words: the same lines, broken at the same words, each line's
       width within 1 px of the browser's, each text box within 0.5 px of
       where the website draws it. Their pixels are reported, not barred;
     • a golden page uses only what the app draws (PagePlan.notDrawn empty);
     • and the check itself must fail when a photo is off by 1/4 px, a frame
       by 1 px, or a caption by 1 px (the last describe).
   Outputs (the app's pictures, a diff picture per page, report.json):
   tools/golden/out/.
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { SkImage, Skia } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import type { AlbumPage, AlbumSizePreset } from '@web/pages/builder/types';
import { wrapTextLines } from '@web/pages/builder/wordArtRules';
import { planPage, type PagePlan } from '../src/render/pagePlan';
import { PageDrawer } from '../src/render/drawPage';
import { PageText } from '../src/render/pageText';
import { BUNDLED_FONTS } from '../src/render/fontTable';
import { headlessSkia, fontFiles, fontPath, imageFromFile, pixelsOf, readPng, writeImage, writeRgba, REPO_ROOT } from './golden/headless';
import { comparePage, wordAreas, PIXELMATCH, MAX_DIFF_OUTSIDE_WORDS, MAX_LINE_WIDTH_DIFF_PX, MAX_WORD_SHIFT_PX } from './golden/compare';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { goldenFingerprint } = require('../../tools/golden/sources.cjs') as { goldenFingerprint: (fonts: string[]) => Fingerprint };

interface Fingerprint { renderer: { hash: string; files: string[] }; tools: { hash: string }; fonts: string }
interface WebLine { text: string; width: number }
interface WebCase { name: string; file: string; width: number; height: number; words: { lines: WebLine[] }[] }
interface Manifest { fingerprint: Fingerprint; chromium: string; photos: { file: string }[]; cases: WebCase[] }
interface GoldenCase { name: string; albumSize: AlbumSizePreset; pageIndex: number; kind: 'photos' | 'text'; checks: string; page: AlbumPage }
interface GoldenSet { photos: { id: string; image: number; width: number; height: number }[]; cases: GoldenCase[] }

const WEB = path.join(REPO_ROOT, 'tools', 'golden', 'web');
const OUT = path.join(REPO_ROOT, 'tools', 'golden', 'out');

function goldenIsStale(): string | null {
  const manifestFile = path.join(WEB, 'manifest.json');
  if (!fs.existsSync(manifestFile) || !fs.existsSync(path.join(WEB, 'pages.json'))) return 'there are no website pictures yet';
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')) as Manifest;
  const now = goldenFingerprint(BUNDLED_FONTS.map((f) => fontPath(f.file)));
  if (now.renderer.hash !== manifest.fingerprint.renderer.hash) return "the website's print code changed";
  if (now.tools.hash !== manifest.fingerprint.tools.hash) return 'the golden pages or the test photos changed';
  if (now.fonts !== manifest.fingerprint.fonts) return 'the font files changed';
  return null;
}

/** Make the website pictures when they are missing or out of date. */
function ensureWebPictures(): void {
  const why = goldenIsStale();
  if (!why) return;
  const tool = path.join(REPO_ROOT, 'tools', 'golden');
  if (!fs.existsSync(path.join(tool, 'node_modules', 'playwright-core'))) {
    throw new Error(`The website pictures must be made again (${why}), but tools/golden has no packages: run "npm ci" in tools/golden, then the tests again.`);
  }
  console.log(`Making the website pictures again (${why})…`);
  execFileSync(process.execPath, [path.join(tool, 'renderWeb.mjs')], { cwd: tool, stdio: 'inherit', timeout: 300_000 });
  const still = goldenIsStale();
  if (still) throw new Error(`renderWeb.mjs ran, but the pictures are still out of date: ${still}`);
}

const readJson = <T,>(file: string): T => JSON.parse(fs.readFileSync(file, 'utf8')) as T;

interface Result {
  name: string; kind: string; size: string; checks: string;
  differingPct: number; outsideWordsPct: number; wordsPct: number | null;
  over8LevelsPct: number; maxChannelDiff: number;
  words: { web: string[]; app: string[]; worstWidthDiffPx: number; shift: { x: number; y: number } }[];
  notDrawn: string[]; renderMs: number;
}

let Sk: Skia;
let drawer: PageDrawer;
let text: PageText;
let set: GoldenSet;
let manifest: Manifest;
let photos: SkImage[] = [];
const results: Result[] = [];

/** Draw a planned page and read it back. */
function draw(plan: PagePlan): { rgba: Uint8Array; W: number; H: number; img: SkImage; ms: number } {
  const t0 = Date.now();
  const img = drawer.renderPrintPage(plan, (i) => photos[set.photos[i]?.image] ?? null);
  const ms = Date.now() - t0;
  return { rgba: pixelsOf(img), W: img.width(), H: img.height(), img, ms };
}

/** The app's line breaks for each text on the page, with the website's. */
function lineChecks(plan: PagePlan, web: WebCase) {
  const out: { web: string[]; app: string[]; worstWidthDiffPx: number }[] = [];
  let k = 0;
  for (const it of plan.items) {
    if (it.kind !== 'boxText' && it.kind !== 'freeText') continue;
    const look = { family: it.style.fontFamily, size: it.fontSize, bold: it.style.bold, italic: it.style.italic };
    const app = wrapTextLines(text.measurer(look), it.style.text, it.kind === 'boxText' ? it.maxWidth : it.boxWidth);
    const webLines = web.words[k++]?.lines ?? [];
    const worst = webLines.reduce((m, l, i) => Math.max(m, app[i] === l.text ? Math.abs(text.measure(l.text, look) - l.width) : Infinity), 0);
    out.push({ web: webLines.map((l) => l.text), app, worstWidthDiffPx: worst });
  }
  return out;
}

function caseNamed(name: string): { c: GoldenCase; web: WebCase; plan: PagePlan; ref: { width: number; height: number; data: Uint8Array } } {
  const c = set.cases.find((x) => x.name === name);
  const web = manifest.cases.find((x) => x.name === name);
  if (!c || !web) throw new Error(`golden page ${name} is not in pages.json / manifest.json any more`);
  const plan = planPage({ page: c.page, albumSize: c.albumSize, pageIndex: c.pageIndex, photoCount: set.photos.length });
  return { c, web, plan, ref: readPng(Sk, path.join(WEB, web.file)) };
}

beforeAll(async () => {
  ensureWebPictures();
  set = readJson<GoldenSet>(path.join(WEB, 'pages.json'));
  manifest = readJson<Manifest>(path.join(WEB, 'manifest.json'));
  Sk = await headlessSkia();
  const files = fontFiles();
  PageText.expectAll(files);
  text = new PageText(Sk, files);
  drawer = new PageDrawer(Sk, text);
  photos = manifest.photos.map((p) => imageFromFile(Sk, path.join(WEB, p.file)));
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
}, 600_000);

afterAll(() => {
  photos.forEach((p) => p.dispose());
  if (!results.length) return;
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ chromium: manifest?.chromium, pixelmatch: PIXELMATCH, results }, null, 1));
  const pct = (v: number | null, d = 3) => (v == null ? '-'.padStart(d + 4) : `${v.toFixed(d).padStart(d + 4)}%`);
  const rows = results.map((r) => {
    const shift = r.words.length ? Math.max(...r.words.map((w) => Math.max(Math.abs(w.shift.x), Math.abs(w.shift.y)))).toFixed(2) : '   -';
    return `${r.name.padEnd(40)} ${r.kind.padEnd(6)} page ${pct(r.differingPct)}  not-words ${pct(r.outsideWordsPct)}  words ${pct(r.wordsPct, 2)}  text off ${shift.padStart(4)} px  >8 levels ${pct(r.over8LevelsPct, 2)}  ${r.renderMs} ms`;
  });
  console.log(`Golden pages, app vs website (pixelmatch ${PIXELMATCH.threshold}, edges counted, Chromium ${manifest?.chromium}):\n${rows.join('\n')}`);
});

const pageNames = (() => {
  const file = path.join(WEB, 'pages.json');
  // The pictures (and pages.json) may only be made in beforeAll: then the
  // names come from the page builder's fixed list in the manifest next run.
  return fs.existsSync(file) ? readJson<GoldenSet>(file).cases.map((c) => c.name) : [];
})();

describe('the app draws every golden page the way the website prints it', () => {
  if (!pageNames.length) {
    it('has website pictures to compare with (made now: run the tests again)', () => {
      expect(fs.existsSync(path.join(WEB, 'pages.json'))).toBe(true);
    });
    return;
  }

  it.each(pageNames)('%s', (name) => {
    const { c, web, plan, ref } = caseNamed(name);
    const page = draw(plan);
    expect([page.W, page.H]).toEqual([ref.width, ref.height]);
    writeImage(path.join(OUT, 'app', `${c.name}.png`), page.img);
    page.img.dispose();

    const lines = lineChecks(plan, web);
    const cmp = comparePage(ref.data, page.rgba, page.W, page.H, wordAreas(plan, lines.map((l) => l.app.length)));
    writeRgba(Sk, path.join(OUT, 'diff', `${c.name}.png`), page.W, page.H, cmp.diff);
    results.push({
      name: c.name, kind: c.kind, size: c.albumSize, checks: c.checks,
      differingPct: cmp.differingPct, outsideWordsPct: cmp.outsideWordsPct, wordsPct: cmp.wordsPct,
      over8LevelsPct: cmp.over8LevelsPct, maxChannelDiff: cmp.maxChannelDiff,
      words: lines.map((l, i) => ({ ...l, shift: cmp.wordShifts[i] })),
      notDrawn: plan.notDrawn, renderMs: page.ms,
    });

    expect(plan.notDrawn).toEqual([]); // a golden page only uses what the app draws
    for (const l of lines) {
      expect(l.app).toEqual(l.web);
      expect(l.worstWidthDiffPx).toBeLessThanOrEqual(MAX_LINE_WIDTH_DIFF_PX);
    }
    for (const s of cmp.wordShifts) {
      expect(Math.abs(s.x)).toBeLessThan(MAX_WORD_SHIFT_PX);
      expect(Math.abs(s.y)).toBeLessThan(MAX_WORD_SHIFT_PX);
    }
    expect(cmp.outsideWordsPct).toBeLessThanOrEqual(MAX_DIFF_OUTSIDE_WORDS);
  }, 120_000);
});

/* The check is only worth something if it fails on a real mistake. Each case
   draws a golden page with one small error put in on purpose, and the check
   must catch it. */
describe('the check fails when the app is off by a fraction of a pixel', () => {
  const nudge = (plan: PagePlan, f: (it: PagePlan['items'][number]) => PagePlan['items'][number]): PagePlan => ({ ...plan, items: plan.items.map(f) });
  const run = (name: string, mutate: (p: PagePlan) => PagePlan) => {
    if (!pageNames.includes(name)) throw new Error(`golden page ${name} is gone: pick another for this check`);
    const { plan, ref } = caseNamed(name);
    const bad = mutate(plan);
    const page = draw(bad);
    page.img.dispose();
    return comparePage(ref.data, page.rgba, page.W, page.H, wordAreas(bad, []));
  };

  it.each(['pan-zoom-portrait', 'masks-paths', 'gen-8x8-p5-t88-fb-duo-exact-h-gap'])('a photo moved 1/4 px on %s', (name) => {
    const cmp = run(name, (p) => nudge(p, (it) => (it.kind === 'photo' ? { ...it, pan: { x: it.pan.x + 0.25, y: it.pan.y } } : it)));
    expect(cmp.outsideWordsPct).toBeGreaterThan(MAX_DIFF_OUTSIDE_WORDS);
  }, 120_000);

  it('a frame 1 px wider', () => {
    const cmp = run('gen-6x4-p19-t64-fb-duo-tall-gap', (p) => nudge(p, (it) => (it.kind === 'photo' ? { ...it, box: { ...it.box, w: it.box.w + 1 } } : it)));
    expect(cmp.outsideWordsPct).toBeGreaterThan(MAX_DIFF_OUTSIDE_WORDS);
  }, 120_000);

  it('a caption 1 px lower', () => {
    const cmp = run('64-caption-yellow', (p) => nudge(p, (it) => (it.kind === 'boxText' ? { ...it, centerY: it.centerY + 1 } : it)));
    expect(Math.max(...cmp.wordShifts.map((s) => Math.abs(s.y)))).toBeGreaterThanOrEqual(MAX_WORD_SHIFT_PX);
  }, 120_000);
});
