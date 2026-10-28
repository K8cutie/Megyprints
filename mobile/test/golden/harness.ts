/* ══════════════════════════════════════════════════════════════════════════
   THE GOLDEN CHECK'S SHARED PARTS: loading the website pictures and the
   app's renderer once per test file, drawing a golden page or cover the
   app's way and comparing it with the website's, and writing the results.

   Three test files use it, and jest runs them side by side:
     goldenPages.test.ts    every golden page;
     goldenCovers.test.ts   every golden cover file, the QR chip's printed
                            size, every texture tile;
     goldenMistakes.test.ts the mistakes the check must catch, and the
                            phone's golden run drawing what the check draws.
   The website pictures are made (again, when out of date) before any of
   them starts (webPictures.cjs, jest globalSetup). Each file writes its own
   report: tools/golden/out/report-<part>.json (and mistakes.json).
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import type { SkImage, Skia } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import type { AlbumPage, AlbumSizePreset, CoverDesign, CoverType, MaterialType } from '@web/pages/builder/types';
import { planPage, type PagePlan } from '../../src/render/pagePlan';
import { PageDrawer, type DrawOptions } from '../../src/render/drawPage';
import { PageText } from '../../src/render/pageText';
import { planCover, type CoverPlan, type CoverMeasure } from '../../src/render/coverPlan';
import { CoverDrawer, appCoverWords } from '../../src/render/drawCover';
import { AssetCache } from '../../src/render/assets';
import { headlessSkia, fontFiles, imageFromFile, pixelsOf, readPng, writeImage, writeRgba, REPO_ROOT } from './headless';
import { comparePage, pageFailures, PIXELMATCH, type PageComparison } from './compare';
import { appWords, lineFailures, type WebLine, type TextItemLines } from './words';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { goldenIsStale } = require('./webPictures.cjs') as { goldenIsStale: () => string | null };

export interface Fingerprint { renderer: { hash: string; files: string[] }; tools: { hash: string }; fonts: string }
export interface WebLineOn extends WebLine { canvas: [number, number] }
export interface WebCase { name: string; file: string; bare: string | null; width: number; height: number; lines: WebLineOn[] }
export interface WebTile { name: string; color: string | null; px: number; file: string }
export interface Manifest { fingerprint: Fingerprint; chromium: string; photos: { file: string }[]; assets: { url: string; file: string }[]; cases: WebCase[]; covers: WebCase[]; tiles: WebTile[] }
export interface GoldenCase { name: string; albumSize: AlbumSizePreset; pageIndex: number; kind: 'photos' | 'text'; checks: string; page: AlbumPage }
export interface GoldenCover { name: string; albumSize: AlbumSizePreset; pageCount: number; cover: CoverType; material: MaterialType; checks: string; coverFront?: AlbumPage; coverDesign?: CoverDesign }
export interface GoldenSet { photos: { id: string; image: number; width: number; height: number }[]; cases: GoldenCase[]; covers: GoldenCover[] }

export const WEB = path.join(REPO_ROOT, 'tools', 'golden', 'web');
export const OUT = path.join(REPO_ROOT, 'tools', 'golden', 'out');

export const readJson = <T,>(file: string): T => JSON.parse(fs.readFileSync(file, 'utf8')) as T;

/** The golden set and the website pictures' manifest, read when a test file
 *  lists its tests (globalSetup has made them current). */
export function goldenLists(): { golden: GoldenSet; manifest: Manifest } {
  const stale = goldenIsStale();
  if (stale) throw new Error(`The website pictures are not current (${stale}): run the golden tests through jest (its globalSetup makes them), or node renderWeb.mjs in tools/golden.`);
  return { golden: readJson<GoldenSet>(path.join(WEB, 'pages.json')), manifest: readJson<Manifest>(path.join(WEB, 'manifest.json')) };
}

export interface Result {
  name: string; kind: string; size: string; checks: string;
  differingPct: number; outsideWordsPct: number; worstTilePct: number; worstTileMean: number; inkPct: number; inkDiffPct: number | null;
  over8LevelsPct: number; maxChannelDiff: number;
  words: { lines: string[]; zone: { x: number; y: number; w: number; h: number }; inkDiff: number; worstBlock: number; shift: { x: number; y: number } }[];
  lineFailures: string[]; failures: string[];
  notDrawn: string[]; missing: string[]; renderMs: number;
}

/** Everything a test file draws with, made in setupGolden(). */
export const G = {
  Sk: undefined as unknown as Skia,
  text: undefined as unknown as PageText,
  drawer: undefined as unknown as PageDrawer,
  covers: undefined as unknown as CoverDrawer,
  assets: undefined as unknown as AssetCache,
  set: undefined as unknown as GoldenSet,
  manifest: undefined as unknown as Manifest,
  photos: [] as SkImage[],
};
export const results: Result[] = [];
export const tileResults: { file: string; maxLevels: number; meanLevels: number }[] = [];
/** What each mistake put in on purpose scored (tools/golden/out/mistakes.json). */
export const mistakes: { test: string; page: string; failures: string[]; outsideWordsPct: number; worstTilePct: number; worstTileMean: number; words: { inkDiff: number; worstBlock: number; shift: { x: number; y: number } }[] }[] = [];

/** A file the website serves that a golden page names: a mask edge
 *  (public/masks) or the made-up corner art (tools/golden/web/assets). */
function servedBytes(src: string): Uint8Array | null {
  if (/^\/masks\/[a-z-]+\.png$/.test(src)) return new Uint8Array(fs.readFileSync(path.join(REPO_ROOT, 'public', src)));
  const a = G.manifest.assets.find((x) => x.url === src);
  return a ? new Uint8Array(fs.readFileSync(path.join(WEB, a.file))) : null;
}

export const photoOf = (i: number): SkImage | null => G.photos[G.set.photos[i]?.image] ?? null;
const photoIds = (): string[] => G.set.photos.map((p) => p.id);

export async function setupGolden(): Promise<void> {
  const { golden, manifest } = goldenLists();
  G.set = golden;
  G.manifest = manifest;
  G.Sk = await headlessSkia();
  const files = fontFiles();
  PageText.expectAll(files);
  G.text = new PageText(G.Sk, files);
  G.drawer = new PageDrawer(G.Sk, G.text);
  G.covers = new CoverDrawer(G.Sk, G.text, G.drawer);
  G.assets = new AssetCache(G.Sk, servedBytes);
  G.photos = manifest.photos.map((p) => imageFromFile(G.Sk, path.join(WEB, p.file)));
  fs.mkdirSync(OUT, { recursive: true });
}

/** Draw a planned page and read it back; `missing` gets every named picture that did not open. */
export function draw(plan: PagePlan, options: DrawOptions = {}, using: PageDrawer = G.drawer, missing?: Set<string>): { rgba: Uint8Array; W: number; H: number; img: SkImage; ms: number } {
  const t0 = Date.now();
  const img = using.renderPrintPage(plan, photoOf, { assets: G.assets.get, onMissing: (s) => missing?.add(s), ...options });
  const ms = Date.now() - t0;
  return { rgba: pixelsOf(img), W: img.width(), H: img.height(), img, ms };
}

export interface Loaded { web: WebCase; ref: Uint8Array; refBare: Uint8Array; W: number; H: number }
const loaded = new Map<string, Loaded>();
function webPictures(name: string, web: WebCase): Loaded {
  const hit = loaded.get(name);
  if (hit) return hit;
  const ref = readPng(G.Sk, path.join(WEB, web.file));
  const refBare = web.bare ? readPng(G.Sk, path.join(WEB, web.bare)).data : ref.data;
  const out = { web, ref: ref.data, refBare, W: ref.width, H: ref.height };
  // Keep only the last couple of pictures: a page is 24 MB, a cover 60.
  while (loaded.size > 1) loaded.delete(loaded.keys().next().value as string);
  loaded.set(name, out);
  return out;
}

export function caseNamed(name: string): Loaded & { c: GoldenCase; plan: PagePlan } {
  const c = G.set.cases.find((x) => x.name === name);
  const web = G.manifest.cases.find((x) => x.name === name);
  if (!c || !web) throw new Error(`golden page ${name} is not in pages.json / manifest.json any more`);
  const plan = planPage({ page: c.page, albumSize: c.albumSize, pageIndex: c.pageIndex, photoCount: G.set.photos.length, photoIds: photoIds() });
  return { ...webPictures(name, web), c, plan };
}

/** The app's measure for cover words: the page renderer's own (Chromium's canvas measure). */
const coverMeasure: CoverMeasure = (s, style, fontSize) => G.text.measure(s, { family: style.fontFamily, size: fontSize, bold: style.bold, italic: style.italic });

export function coverNamed(name: string): Loaded & { c: GoldenCover; plan: CoverPlan } {
  const c = G.set.covers.find((x) => x.name === name);
  const web = G.manifest.covers.find((x) => x.name === name);
  if (!c || !web) throw new Error(`golden cover ${name} is not in pages.json / manifest.json any more`);
  const plan = planCover({
    albumSize: c.albumSize, pageCount: c.pageCount, cover: c.cover, material: c.material,
    coverFront: c.coverFront, coverDesign: c.coverDesign, photoCount: G.set.photos.length, photoIds: photoIds(),
  }, coverMeasure);
  return { ...webPictures(name, web), c, plan };
}

export interface Checked { cmp: PageComparison; lines: string[]; failures: string[]; ms: number; img: SkImage; words: TextItemLines[]; missing: string[] }

/** The app draws a page (twice when it has words) and it is compared. */
export function check(name: string, plan?: PagePlan, options: { appWords?: boolean; using?: PageDrawer; usingText?: PageText } = {}): Checked {
  const L = caseNamed(name);
  const p = plan ?? L.plan;
  const using = options.using ?? G.drawer;
  const missing = new Set<string>();
  const page = draw(p, { words: options.appWords ?? true }, using, missing);
  if (page.W !== L.W || page.H !== L.H) throw new Error(`${name}: the app's page is ${page.W}x${page.H}, the website's ${L.W}x${L.H}`);
  const words = appWords(p, options.usingText ?? G.text);
  const appBare = L.web.bare || words.length ? draw(p, { words: false }, using, missing) : null;
  if (appBare) appBare.img.dispose();
  const cmp = comparePage({ ref: L.ref, refBare: L.refBare, app: page.rgba, appBare: appBare ? appBare.rgba : page.rgba, W: page.W, H: page.H }, words.map((w) => w.zone), p.bleed);
  const lines = lineFailures(words.flatMap((w) => w.lines), L.web.lines);
  return { cmp, lines, failures: pageFailures(cmp), ms: page.ms, img: page.img, words, missing: [...missing] };
}

/** Print's lines on a cover, all on the wrap: a line drawn on the front
 *  page's own canvas is moved onto the front panel (as the page is). */
function coverWebLines(L: Loaded, plan: CoverPlan): WebLine[] {
  const front = plan.steps.find((s) => s.kind === 'front');
  return L.web.lines.map((l) => {
    if (l.canvas[0] === L.W && l.canvas[1] === L.H) return l;
    if (!front || front.kind !== 'front') throw new Error('a line drawn off the wrap, and the cover has no front page');
    const kx = front.rect.w / l.canvas[0], ky = front.rect.h / l.canvas[1];
    const [a, b, c, d, e, f] = l.m;
    return { ...l, m: [a * kx, b * ky, c * kx, d * ky, e * kx + front.rect.x, f * ky + front.rect.y] as WebLine['m'] };
  });
}

/** The app draws a cover (with and without its words) and it is compared. */
export function checkCover(name: string, plan?: CoverPlan, options: { appWords?: boolean } = {}): Checked {
  const L = coverNamed(name);
  const p = plan ?? L.plan;
  const missing = new Set<string>();
  const t0 = Date.now();
  const img = G.covers.render(p, photoOf, { words: options.appWords ?? true, assets: G.assets.get, onMissing: (s) => missing.add(s) });
  const ms = Date.now() - t0;
  if (img.width() !== L.W || img.height() !== L.H) throw new Error(`${name}: the app's cover is ${img.width()}x${img.height()}, the website's ${L.W}x${L.H}`);
  const rgba = pixelsOf(img);
  const bareImg = G.covers.render(p, photoOf, { words: false, assets: G.assets.get, onMissing: (s) => missing.add(s) });
  const bare = pixelsOf(bareImg);
  bareImg.dispose();
  const words = appCoverWords(p, G.text);
  const cmp = comparePage({ ref: L.ref, refBare: L.refBare, app: rgba, appBare: bare, W: L.W, H: L.H }, words.map((w) => w.zone), 0);
  const lines = lineFailures(words.flatMap((w) => w.lines), coverWebLines(L, p));
  return { cmp, lines, failures: pageFailures(cmp), ms, img, words, missing: [...missing] };
}

/** Keep a page's or cover's result, its app picture and its diff. */
export function record(name: string, kind: string, size: string, checks: string, r: Checked, notDrawn: string[], W: number, H: number): void {
  writeImage(path.join(OUT, 'app', `${name}.png`), r.img);
  r.img.dispose();
  writeRgba(G.Sk, path.join(OUT, 'diff', `${name}.png`), W, H, r.cmp.diff);
  results.push({
    name, kind, size, checks,
    differingPct: r.cmp.differingPct, outsideWordsPct: r.cmp.outsideWordsPct, worstTilePct: r.cmp.worstTilePct, worstTileMean: r.cmp.worstTileMean,
    inkPct: r.cmp.inkPct, inkDiffPct: r.cmp.inkDiffPct,
    over8LevelsPct: r.cmp.over8LevelsPct, maxChannelDiff: r.cmp.maxChannelDiff,
    words: r.cmp.words.map((w, i) => ({ lines: r.words[i].lines.map((l) => l.text), zone: w.zone, inkDiff: w.inkDiff, worstBlock: w.worstBlock, shift: w.shift })),
    lineFailures: r.lines, failures: r.failures,
    notDrawn, missing: r.missing, renderMs: r.ms,
  });
}

/** Keep what a mistake put in on purpose scored. */
export function recordMistake(page: string, r: Checked): void {
  mistakes.push({
    test: expect.getState().currentTestName ?? '', page, failures: r.failures,
    outsideWordsPct: r.cmp.outsideWordsPct, worstTilePct: r.cmp.worstTilePct, worstTileMean: r.cmp.worstTileMean,
    words: r.cmp.words.map((w) => ({ inkDiff: w.inkDiff, worstBlock: w.worstBlock, shift: w.shift })),
  });
}

/** Let go of everything and write this file's report (report-<part>.json). */
export function finishGolden(part: string): void {
  G.photos.forEach((p) => p.dispose());
  G.assets?.dispose();
  G.drawer?.dispose();
  if (mistakes.length) fs.writeFileSync(path.join(OUT, 'mistakes.json'), JSON.stringify(mistakes, null, 1));
  if (!results.length && !tileResults.length) return;
  fs.writeFileSync(path.join(OUT, `report-${part}.json`), JSON.stringify({ chromium: G.manifest?.chromium, pixelmatch: PIXELMATCH, results, tiles: tileResults }, null, 1));
  const pct = (v: number | null, d = 3) => (v == null ? '-'.padStart(d + 4) : `${v.toFixed(d).padStart(d + 4)}%`);
  const rows = results.map((r) => {
    const w = r.words;
    const shift = w.length ? Math.max(...w.map((x) => Math.max(Math.abs(x.shift.x), Math.abs(x.shift.y)))).toFixed(2) : '   -';
    const ink = w.length ? `${(Math.max(...w.map((x) => x.inkDiff)) * 100).toFixed(2)}%` : '    -';
    const block = w.length ? Math.max(...w.map((x) => x.worstBlock)).toFixed(1) : '   -';
    return `${r.name.padEnd(40)} ${r.kind.padEnd(6)} page ${pct(r.differingPct)}  not-ink ${pct(r.outsideWordsPct)}  tile ${pct(r.worstTilePct, 2)}  tile mean ${r.worstTileMean.toFixed(2).padStart(5)}  ink off ${ink.padStart(6)}  block ${block.padStart(5)}  text off ${shift.padStart(4)} px  ${r.renderMs} ms`;
  });
  const tiles = tileResults.length ? `\nTexture tiles: worst pixel ${Math.max(...tileResults.map((t) => t.maxLevels))} levels, worst mean ${Math.max(...tileResults.map((t) => t.meanLevels)).toFixed(2)} (${tileResults.length} tiles)` : '';
  console.log(`Golden ${part}, app vs website (pixelmatch ${PIXELMATCH.threshold}, edges counted, Chromium ${G.manifest?.chromium}):\n${rows.join('\n')}${tiles}`);
}
