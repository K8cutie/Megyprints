/**
 * @jest-environment node
 */
/* ══════════════════════════════════════════════════════════════════════════
   WHY THIS TEST: the riskiest part of the 2.0 app. When the app makes the
   print files itself, every page must come out the way the website's print
   renderer makes it today. A photo shifted a pixel, a caption broken onto a
   different line or drawn in the wrong colour, a frame line missing: the
   printed book is wrong and nobody sees it until it is in a customer's hands.

   So the app's page renderer (src/render) draws the golden pages (the
   website's own seeded album generator on all five sizes, plus hand-made
   pages: pans, zooms, every mask, washes, every frame, captions in every
   font style, quotes, titles, a Display P3 photo) headless in Node with
   Skia's CanvasKit build, and every page is compared, pixel by pixel, with
   the picture the website's printPipeline draws of it in headless Chromium
   (tools/golden/renderWeb.mjs, run again by this test whenever the website's
   print code, the golden pages, the tool or the fonts changed since the last
   pictures). A page with words is drawn twice on both sides, with and
   without them, so the words' own pixels are known exactly.

   The bars (the numbers, and why: test/golden/compare.ts):
     • everything but the words' ink: at most MAX_DIFF_OUTSIDE_WORDS of the
       pixels differ at pixelmatch 0.05, and no 64 px tile more than
       MAX_TILE_DIFF;
     • each text's ink: the same amount and colour, block by block, sitting
       within 0.5 px of the website's;
     • each line: the line print drew, at print's spot, as wide, in print's
       colour, outline and shadow (test/golden/words.ts);
     • a golden page uses only what the app draws (PagePlan.notDrawn empty);
     • and the check itself must fail on each kind of small mistake (the
       last describe).
   Outputs (the app's pictures, a diff picture per page, report.json):
   tools/golden/out/.
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { SkImage, Skia } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import type { AlbumPage, AlbumSizePreset } from '@web/pages/builder/types';
import { planPage, type PagePlan } from '../src/render/pagePlan';
import { PageDrawer, type DrawOptions } from '../src/render/drawPage';
import { PageText } from '../src/render/pageText';
import { BUNDLED_FONTS } from '../src/render/fontTable';
import { headlessSkia, fontFiles, fontPath, imageFromFile, pixelsOf, readPng, writeImage, writeRgba, REPO_ROOT } from './golden/headless';
import { comparePage, pageFailures, PIXELMATCH, type PageComparison } from './golden/compare';
import { appWords, lineFailures, type WebLine } from './golden/words';
import { runGoldenPages, type GoldenBundle, type PhoneReport, type ToSrgb } from '../src/dev/goldenRun';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { goldenFingerprint } = require('../../tools/golden/sources.cjs') as { goldenFingerprint: (fonts: string[]) => Fingerprint };

interface Fingerprint { renderer: { hash: string; files: string[] }; tools: { hash: string }; fonts: string }
interface WebCase { name: string; file: string; bare: string | null; width: number; height: number; lines: WebLine[] }
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
  if (now.tools.hash !== manifest.fingerprint.tools.hash) return 'the golden pages, the test photos or the tool changed';
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
  differingPct: number; outsideWordsPct: number; worstTilePct: number; inkPct: number; inkDiffPct: number | null;
  over8LevelsPct: number; maxChannelDiff: number;
  words: { lines: string[]; zone: { x: number; y: number; w: number; h: number }; inkDiff: number; worstBlock: number; shift: { x: number; y: number } }[];
  lineFailures: string[]; failures: string[];
  notDrawn: string[]; renderMs: number;
}

let Sk: Skia;
let text: PageText;
let drawer: PageDrawer;
let set: GoldenSet;
let manifest: Manifest;
let photos: SkImage[] = [];
const results: Result[] = [];
/** What each mistake put in on purpose scored (tools/golden/out/mistakes.json). */
const mistakes: { test: string; page: string; failures: string[]; outsideWordsPct: number; worstTilePct: number; words: { inkDiff: number; worstBlock: number; shift: { x: number; y: number } }[] }[] = [];

/** Draw a planned page and read it back. */
function draw(plan: PagePlan, options: DrawOptions = {}, using: PageDrawer = drawer): { rgba: Uint8Array; W: number; H: number; img: SkImage; ms: number } {
  const t0 = Date.now();
  const img = using.renderPrintPage(plan, (i) => photos[set.photos[i]?.image] ?? null, options);
  const ms = Date.now() - t0;
  return { rgba: pixelsOf(img), W: img.width(), H: img.height(), img, ms };
}

interface Loaded { c: GoldenCase; web: WebCase; plan: PagePlan; ref: Uint8Array; refBare: Uint8Array; W: number; H: number }
const loaded = new Map<string, Loaded>();
function caseNamed(name: string): Loaded {
  const hit = loaded.get(name);
  if (hit) return hit;
  const c = set.cases.find((x) => x.name === name);
  const web = manifest.cases.find((x) => x.name === name);
  if (!c || !web) throw new Error(`golden page ${name} is not in pages.json / manifest.json any more`);
  const plan = planPage({ page: c.page, albumSize: c.albumSize, pageIndex: c.pageIndex, photoCount: set.photos.length });
  const ref = readPng(Sk, path.join(WEB, web.file));
  const refBare = web.bare ? readPng(Sk, path.join(WEB, web.bare)).data : ref.data;
  const out = { c, web, plan, ref: ref.data, refBare, W: ref.width, H: ref.height };
  // Keep only the last few pages' pixels: a page is 24 MB.
  if (loaded.size > 2) loaded.delete(loaded.keys().next().value as string);
  loaded.set(name, out);
  return out;
}

/** The app draws a page (twice when it has words) and it is compared. */
function check(name: string, plan?: PagePlan, options: { appWords?: boolean; using?: PageDrawer; usingText?: PageText } = {}): { cmp: PageComparison; lines: string[]; failures: string[]; ms: number; img: SkImage; words: ReturnType<typeof appWords> } {
  const L = caseNamed(name);
  const p = plan ?? L.plan;
  const using = options.using ?? drawer;
  const page = draw(p, { words: options.appWords ?? true }, using);
  if (page.W !== L.W || page.H !== L.H) throw new Error(`${name}: the app's page is ${page.W}x${page.H}, the website's ${L.W}x${L.H}`);
  const words = appWords(p, options.usingText ?? text);
  const appBare = L.web.bare || words.length ? draw(p, { words: false }, using) : null;
  if (appBare) appBare.img.dispose();
  const cmp = comparePage({ ref: L.ref, refBare: L.refBare, app: page.rgba, appBare: appBare ? appBare.rgba : page.rgba, W: page.W, H: page.H }, words.map((w) => w.zone), p.bleed);
  const lines = lineFailures(words.flatMap((w) => w.lines), L.web.lines);
  return { cmp, lines, failures: pageFailures(cmp), ms: page.ms, img: page.img, words };
}

beforeAll(async () => {
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
  if (mistakes.length) fs.writeFileSync(path.join(OUT, 'mistakes.json'), JSON.stringify(mistakes, null, 1));
  if (!results.length) return;
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ chromium: manifest?.chromium, pixelmatch: PIXELMATCH, results }, null, 1));
  const pct = (v: number | null, d = 3) => (v == null ? '-'.padStart(d + 4) : `${v.toFixed(d).padStart(d + 4)}%`);
  const rows = results.map((r) => {
    const w = r.words;
    const shift = w.length ? Math.max(...w.map((x) => Math.max(Math.abs(x.shift.x), Math.abs(x.shift.y)))).toFixed(2) : '   -';
    const ink = w.length ? `${(Math.max(...w.map((x) => x.inkDiff)) * 100).toFixed(2)}%` : '    -';
    const block = w.length ? Math.max(...w.map((x) => x.worstBlock)).toFixed(1) : '   -';
    return `${r.name.padEnd(40)} ${r.kind.padEnd(6)} page ${pct(r.differingPct)}  not-ink ${pct(r.outsideWordsPct)}  tile ${pct(r.worstTilePct, 2)}  ink off ${ink.padStart(6)}  block ${block.padStart(5)}  text off ${shift.padStart(4)} px  ${r.renderMs} ms`;
  });
  console.log(`Golden pages, app vs website (pixelmatch ${PIXELMATCH.threshold}, edges counted, Chromium ${manifest?.chromium}):\n${rows.join('\n')}`);
});

// The website pictures are made (again) before the tests are listed, so a
// page just added to the set is checked in this very run.
ensureWebPictures();
const pageNames = readJson<GoldenSet>(path.join(WEB, 'pages.json')).cases.map((c) => c.name);

describe('the app draws every golden page the way the website prints it', () => {
  it('has golden pages to compare', () => expect(pageNames.length).toBeGreaterThan(40));

  it.each(pageNames)('%s', (name) => {
    const { c, plan, W, H } = caseNamed(name);
    const r = check(name);
    writeImage(path.join(OUT, 'app', `${c.name}.png`), r.img);
    r.img.dispose();
    writeRgba(Sk, path.join(OUT, 'diff', `${c.name}.png`), W, H, r.cmp.diff);
    results.push({
      name: c.name, kind: c.kind, size: c.albumSize, checks: c.checks,
      differingPct: r.cmp.differingPct, outsideWordsPct: r.cmp.outsideWordsPct, worstTilePct: r.cmp.worstTilePct,
      inkPct: r.cmp.inkPct, inkDiffPct: r.cmp.inkDiffPct,
      over8LevelsPct: r.cmp.over8LevelsPct, maxChannelDiff: r.cmp.maxChannelDiff,
      words: r.cmp.words.map((w, i) => ({ lines: r.words[i].lines.map((l) => l.text), zone: w.zone, inkDiff: w.inkDiff, worstBlock: w.worstBlock, shift: w.shift })),
      lineFailures: r.lines, failures: r.failures,
      notDrawn: plan.notDrawn, renderMs: r.ms,
    });

    expect(plan.notDrawn).toEqual([]); // a golden page only uses what the app draws
    expect(r.lines).toEqual([]);
    expect(r.failures).toEqual([]);
  }, 120_000);
});

/* The check is only worth something if it fails on a real mistake. Each case
   draws a golden page with one small error put in on purpose (in the page
   plan, or in the drawing code itself), and the pixel and ink bars alone must
   catch it (the line check is left out here: it would catch some of these
   from the data before a pixel is drawn). */
describe('the check fails on each kind of small mistake', () => {
  type Item = PagePlan['items'][number];
  const nudge = (plan: PagePlan, f: (it: Item, i: number) => Item): PagePlan => ({ ...plan, items: plan.items.map(f) });
  const style = (it: Item, over: Record<string, unknown>): Item =>
    (it.kind === 'boxText' || it.kind === 'freeText' ? ({ ...it, style: { ...it.style, ...over } } as Item) : it);
  const run = (name: string, mutate: (p: PagePlan) => PagePlan, options: Parameters<typeof check>[2] = {}): string[] => {
    if (!pageNames.includes(name)) throw new Error(`golden page ${name} is gone: pick another for this check`);
    const r = check(name, mutate(caseNamed(name).plan), options);
    r.img.dispose();
    mistakes.push({
      test: expect.getState().currentTestName ?? '', page: name, failures: r.failures,
      outsideWordsPct: r.cmp.outsideWordsPct, worstTilePct: r.cmp.worstTilePct,
      words: r.cmp.words.map((w) => ({ inkDiff: w.inkDiff, worstBlock: w.worstBlock, shift: w.shift })),
    });
    return r.failures;
  };
  const failsOn = (failures: string[], kind: RegExp) => expect(failures).toEqual(expect.arrayContaining([expect.stringMatching(kind)]));
  const PIXELS = /^(page|tile)/;
  const INK = /ink|block|sits/;

  it.each(['pan-zoom-portrait', 'masks-paths', 'gen-8x8-p5-t88-fb-duo-exact-h-gap'])('a photo moved 1/4 px on %s', (name) => {
    failsOn(run(name, (p) => nudge(p, (it) => (it.kind === 'photo' ? { ...it, pan: { x: it.pan.x + 0.25, y: it.pan.y } } : it))), PIXELS);
  }, 120_000);

  it('a frame 1 px wider', () => {
    failsOn(run('gen-6x4-p19-t64-fb-duo-tall-gap', (p) => nudge(p, (it) => (it.kind === 'photo' ? { ...it, box: { ...it.box, w: it.box.w + 1 } } : it))), PIXELS);
  }, 120_000);

  it("a double frame's inset line not drawn", () => {
    failsOn(run('frame-double-dashed-radial', (p) => nudge(p, (it) => (it.kind === 'photo' ? { ...it, frame: { ...it.frame, decorated: false } } : it))), PIXELS);
  }, 120_000);

  it('a dashed border drawn solid', () => {
    failsOn(run('frame-double-dashed-radial', (p) => nudge(p, (it) => (it.kind === 'photo' ? { ...it, frame: { ...it.frame, borderStyle: 'solid' } } : it))), PIXELS);
  }, 120_000);

  it('a caption 1 px lower', () => {
    failsOn(run('64-caption-yellow', (p) => nudge(p, (it) => (it.kind === 'boxText' ? { ...it, centerY: it.centerY + 1 } : it))), /sits/);
  }, 120_000);

  it.each(['two-captions-shadow', 'quote-in-photo-frame', '64-caption-yellow', 'gradient-duo-caption'])('no words drawn on %s', (name) => {
    failsOn(run(name, (p) => p, { appWords: false }), INK);
  }, 120_000);

  it('a free title at opacity 0', () => {
    failsOn(run('free-title-outline', (p) => nudge(p, (it) => (it.kind === 'freeText' ? { ...it, opacity: 0 } : it))), INK);
  }, 120_000);

  it('the underline missing', () => {
    failsOn(run('caption-wraps-underlined', (p) => nudge(p, (it) => style(it, { underline: false }))), INK);
  }, 120_000);

  it('the outline missing', () => {
    failsOn(run('free-title-outline', (p) => nudge(p, (it) => style(it, { outlineWidth: 0 }))), INK);
  }, 120_000);

  it('the shadow missing', () => {
    failsOn(run('two-captions-shadow', (p) => nudge(p, (it) => style(it, { shadow: false }))), INK);
  }, 120_000);

  it('a quote in the wrong colour (#FF0000 for #B85C38)', () => {
    failsOn(run('quote-in-photo-frame', (p) => nudge(p, (it) => (it.kind === 'boxText' && it.source === 'slot' ? style(it, { color: '#FF0000' }) : it))), INK);
  }, 120_000);

  it('a caption in black instead of #2D2D2D', () => {
    failsOn(run('64-caption-yellow', (p) => nudge(p, (it) => style(it, { color: '#000000' }))), INK);
  }, 120_000);

  it("a turned, stretched title's shadow offset turned with it (the old bug)", () => {
    const anyText = PageText as unknown as { pageOffset: (c: unknown, dx: number, dy: number) => { x: number; y: number } };
    const real = anyText.pageOffset;
    anyText.pageOffset = (_c, dx, dy) => ({ x: dx, y: dy });
    try {
      failsOn(run('title-shadow-alone', (p) => p), INK);
    } finally {
      anyText.pageOffset = real;
    }
  }, 120_000);

  it('the italic font files missing (Skia fakes the styles)', () => {
    const files = fontFiles().filter((f) => !f.font.italic);
    const fakeText = new PageText(Sk, files);
    const fakeDrawer = new PageDrawer(Sk, fakeText);
    failsOn(run('captions-italics', (p) => p, { using: fakeDrawer, usingText: fakeText }), INK);
  }, 120_000);
});

/* The phone's golden run (src/dev/goldenRun.ts: the debug screen of a
   -GoldenPages test build) must draw exactly what this check draws, so that
   comparing the phone's pictures with the website's tests the phone's Skia
   and nothing else. Run here with CanvasKit on three pages (a caption, a
   frame, the Display P3 photo), its pictures must be the ones check() draws,
   pixel for pixel, with the same lines and boxes; and a photo the colour
   step converts is drawn a second time with the converted file. */
describe("the phone's golden run draws what this check draws", () => {
  it('the same pictures, words and boxes, and a second picture after the colour step', async () => {
    const names = ['frame-double-dashed-radial', '64-caption-yellow', 'photo-display-p3'];
    const b64 = (file: string) => fs.readFileSync(file).toString('base64');
    const cases = set.cases.filter((c) => names.includes(c.name));
    const bundle: GoldenBundle = {
      madeFrom: { madeAt: 'test', chromium: manifest.chromium, pagesSha256: '', renderer: manifest.fingerprint.renderer.hash, tools: manifest.fingerprint.tools.hash, fonts: manifest.fingerprint.fonts },
      appRenderer: 'test',
      photos: set.photos,
      photoFiles: manifest.photos.map((p) => ({ file: p.file, sha256: '', base64: b64(path.join(WEB, p.file)) })),
      fonts: BUNDLED_FONTS.map((f) => ({ file: f.file, base64: b64(fontPath(f.file)) })),
      cases: cases.map((c) => {
        const w = manifest.cases.find((x) => x.name === c.name) as WebCase;
        return { name: c.name, albumSize: c.albumSize, pageIndex: c.pageIndex, kind: c.kind, page: c.page, width: w.width, height: w.height, bare: !!w.bare };
      }),
    };
    const written = new Map<string, Uint8Array | string>();
    // A stand-in for the phone's srgbCopy: says the P3 file was converted (same bytes back).
    const toSrgb: ToSrgb = async ({ file, bytes }) => ({ colorSpace: file.endsWith('photo-8.png') ? 'Display P3' : 'sRGB IEC61966-2.1', converted: file.endsWith('photo-8.png'), bytes });
    const report = await runGoldenPages(Sk, bundle, { write: async (n, c) => { written.set(n, c); } }, { toSrgb });

    expect(report.pages.map((p) => p.file)).toEqual([...cases.map((c) => `${c.name}.png`), 'photo-display-p3.srgb.png']);
    expect(report.pages.every((p) => !p.error)).toBe(true);
    expect(report.photos.filter((p) => p.converted).map((p) => p.file)).toEqual(['photos/photo-8.png']);
    const pngPixels = (name: string) => {
      const bytes = written.get(name);
      if (!(bytes instanceof Uint8Array)) throw new Error(`the run wrote no ${name}`);
      const img = Sk.Image.MakeImageFromEncoded(Sk.Data.fromBytes(bytes));
      if (!img) throw new Error(`${name} is not a picture`);
      const px = pixelsOf(img);
      img.dispose();
      return px;
    };
    const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
    for (const entry of report.pages) {
      const L = caseNamed(entry.name);
      const full = draw(L.plan, { words: true });
      full.img.dispose();
      expect([entry.width, entry.height]).toEqual([L.W, L.H]);
      expect(same(pngPixels(entry.file), full.rgba)).toBe(true);
      expect(entry.words).toEqual(appWords(L.plan, text));
      expect(entry.notDrawn).toEqual(L.plan.notDrawn);
      expect(entry.bareFile != null).toBe(!!L.web.bare);
      if (entry.bareFile) {
        const bare = draw(L.plan, { words: false });
        bare.img.dispose();
        expect(same(pngPixels(entry.bareFile), bare.rgba)).toBe(true);
      }
    }
    const json = JSON.parse(written.get('report.json') as string) as PhoneReport;
    expect(json.pages.length).toBe(4);
  }, 300_000);
});
