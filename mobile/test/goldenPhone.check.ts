/**
 * @jest-environment node
 */
/* ══════════════════════════════════════════════════════════════════════════
   THE GOLDEN PAGES AND COVERS DRAWN ON A PHONE, held to the website's
   print files.

     npm run golden:phone          (from mobile/, after a phone run)

   Not part of `npm run check`: it needs pictures from a phone or emulator.
   How to get them (docs/mobile-port-plan.md, "Page renderer on the phone"):
     1. scripts\build-android.ps1 -Variant release -GoldenPages
     2. node scripts/golden-phone-run.cjs --device <adb serial>
        (installs it, opens the debug screen with ?run=1, waits, and pulls
        the app's files folder into tools/golden/phone/)
     3. npm run golden:phone

   The phone (src/dev/goldenRun.ts) drew every golden page with its own
   Skia, with and without the words, and wrote down the lines it broke each
   text into, how wide its Skia measures them and each text's box. Here each
   page goes through the very same comparison as the Node check
   (test/golden/compare.ts comparePage and pageFailures, test/golden/words.ts
   lineFailures: the same pixelmatch, the same bars), against the same
   website pictures (tools/golden/web).

   A photo saved with a colour profile other than sRGB is drawn twice by the
   phone: as the file is, and after the photo intake's colour step
   (modules/photo-files srgbCopy). As the file is, the page must FAIL (Skia
   on Android draws the profile's numbers as sRGB: the check has to see
   that); after the colour step it must pass like every other page.

   The cover files go through checkCover's comparison (the whole wrap, the
   same bars, the lines on the wrap), with the same known platform
   difference as the Node check (test/golden/known.ts); each texture tile
   through tileFailures. The run's timing pass (pages drawn with a 12 MP
   photo) is reported, not compared.

   Writes tools/golden/phone-out/: report.json, table.md, a diff per page
   (pixelmatch's own picture) and side/NAME.png (website | phone | diff, and
   the same three at full size where they differ most).
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import type { SkCanvas, SkFont, SkImage, Skia } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import { AlphaType, ColorType, FilterMode, MipmapMode, PaintStyle } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import type { AlbumPage, AlbumSizePreset, CoverDesign, CoverType, MaterialType } from '@web/pages/builder/types';
import type { PhonePage, PhoneReport } from '../src/dev/goldenRun';
import { planPage, type PagePlan } from '../src/render/pagePlan';
import { planCover, type CoverPlan } from '../src/render/coverPlan';
import { PageText } from '../src/render/pageText';
import { headlessSkia, fontFiles, fontPath, readPng, writeImage, writeRgba, REPO_ROOT } from './golden/headless';
import { comparePage, pageFailures, tileFailures, PIXELMATCH, type Area, type PageComparison } from './golden/compare';
import { coverWebLines, lineFailures, type WebLineOn } from './golden/words';
import { KNOWN_PLATFORM_DIFFERENCES } from './golden/known';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { appRendererHash } = require('../scripts/golden-phone-assets.cjs') as { appRendererHash: () => string };

interface WebCase { name: string; file: string; bare: string | null; width: number; height: number; lines: WebLineOn[] }
interface WebTile { name: string; color: string | null; px: number; file: string }
interface Manifest { chromium: string; fingerprint: { renderer: { hash: string }; tools: { hash: string }; fonts: string }; cases: WebCase[]; covers: WebCase[]; tiles: WebTile[] }

const WEB = path.join(REPO_ROOT, 'tools', 'golden', 'web');
const PHONE = process.env.GOLDEN_PHONE_DIR ? path.resolve(process.env.GOLDEN_PHONE_DIR) : path.join(REPO_ROOT, 'tools', 'golden', 'phone');
const OUT = path.join(REPO_ROOT, 'tools', 'golden', 'phone-out');

const readJson = <T,>(file: string): T => JSON.parse(fs.readFileSync(file, 'utf8')) as T;

if (!fs.existsSync(path.join(PHONE, 'report.json'))) {
  throw new Error(`No phone pictures in ${PHONE}: build with -GoldenPages, run node scripts/golden-phone-run.cjs, then this again.`);
}
const report = readJson<PhoneReport>(path.join(PHONE, 'report.json'));
const manifest = readJson<Manifest>(path.join(WEB, 'manifest.json'));
/** Photo files the phone's colour step had to convert. */
const convertedFiles = new Set(report.photos.filter((p) => p.converted).map((p) => p.file));
const pagesJson = readJson<{
  photos: { id: string; image: number }[];
  cases: { name: string; albumSize: AlbumSizePreset; pageIndex: number; page: AlbumPage }[];
  covers: { name: string; albumSize: AlbumSizePreset; pageCount: number; cover: CoverType; material: MaterialType; coverFront?: AlbumPage; coverDesign?: CoverDesign }[];
}>(path.join(WEB, 'pages.json'));

/** The page plan (shared code, no measuring): its bleed and its photos. */
function planOf(name: string): PagePlan {
  const c = pagesJson.cases.find((x) => x.name === name);
  if (!c) throw new Error(`${name} is not in pages.json`);
  return planPage({ page: c.page, albumSize: c.albumSize, pageIndex: c.pageIndex, photoCount: pagesJson.photos.length, photoIds: pagesJson.photos.map((p) => p.id) });
}

/** The cover's plan, worked out on the computer (its front panel is where print's front-page lines go). */
function coverPlanOf(name: string): CoverPlan {
  const c = pagesJson.covers.find((x) => x.name === name);
  if (!c) throw new Error(`${name} is not in pages.json covers`);
  return planCover({
    albumSize: c.albumSize, pageCount: c.pageCount, cover: c.cover, material: c.material, coverFront: c.coverFront, coverDesign: c.coverDesign,
    photoCount: pagesJson.photos.length, photoIds: pagesJson.photos.map((p) => p.id),
  }, (s, style, fontSize) => text.measure(s, { family: style.fontFamily, size: fontSize, bold: style.bold, italic: style.italic }));
}

interface Row {
  page: string; kind: 'page' | 'cover'; variant: string; size: string; drawMs: number;
  outsideWordsPct: number; worstTilePct: number; worstTileMean: number; differingPct: number; over8LevelsPct: number; maxChannelDiff: number;
  inkOff: number | null; worstBlock: number | null; textShift: number | null;
  lines: number; lineFailures: string[]; failures: string[]; expectFail: boolean; passed: boolean;
}
const rows: Row[] = [];
const tileRows: { file: string; maxLevels: number; meanLevels: number; ms: number; failures: string[] }[] = [];

let Sk: Skia;
let text: PageText;
let labelFont: SkFont;
let smallFont: SkFont;

beforeAll(async () => {
  Sk = await headlessSkia();
  const face = Sk.Typeface.MakeFreeTypeFaceFromData(Sk.Data.fromBytes(new Uint8Array(fs.readFileSync(fontPath('@expo-google-fonts/dm-sans/700Bold/DMSans_700Bold.ttf')))));
  if (!face) throw new Error('could not load the label font');
  labelFont = Sk.Font(face, 30);
  smallFont = Sk.Font(face, 22);
  text = new PageText(Sk, fontFiles());
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'diff'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'side'), { recursive: true });
}, 120_000);

afterAll(() => {
  if (!rows.length) return;
  const pct = (v: number | null, d = 3) => (v == null ? '-' : `${v.toFixed(d)}%`);
  const head = '| Page | Size | Outside the words (bar 0.15%) | Worst 64 px tile (bar 1%) | Tile mean (bar 2) | Ink off (bar 6%) | Worst 8 px block (bar 40) | Text off, px (bar 0.5) | Lines as print drew them | Draw on phone | Result |\n|---|---|---|---|---|---|---|---|---|---|---|';
  const lines = rows.map((r) => {
    const name = r.variant ? `${r.page} (after the colour step)` : r.page;
    const known = KNOWN_PLATFORM_DIFFERENCES[r.page];
    const result = r.expectFail ? (r.passed ? 'FAILS, as it must (raw P3 numbers)' : 'passes (?)')
      : known && r.failures.length === 1 && known.test(r.failures[0]) && !r.lineFailures.length ? `known platform difference only: ${r.failures[0]}`
        : (r.passed ? 'pass' : `FAIL: ${[...r.lineFailures, ...r.failures].join('; ')}`);
    return `| ${name} | ${r.size} | ${pct(r.outsideWordsPct)} | ${pct(r.worstTilePct, 2)} | ${r.worstTileMean.toFixed(2)} | ${r.inkOff == null ? '-' : `${(r.inkOff * 100).toFixed(2)}%`} | ${r.worstBlock == null ? '-' : r.worstBlock.toFixed(1)} | ${r.textShift == null ? '-' : r.textShift.toFixed(2)} | ${r.lines ? (r.lineFailures.length ? 'NO' : `${r.lines} of ${r.lines}`) : '-'} | ${r.drawMs} ms | ${result} |`;
  });
  const tiles = tileRows.length
    ? `\n\nTexture tiles drawn alone on the phone: ${tileRows.filter((t) => !t.failures.length).length} of ${tileRows.length} within the bars; worst pixel ${Math.max(...tileRows.map((t) => t.maxLevels))} levels (bar 4), worst mean ${Math.max(...tileRows.map((t) => t.meanLevels)).toFixed(2)} (bar 1).\n`
    : '';
  const timing = report.timing
    ? `\n\nTiming pass: each page drawn with a ${report.timing.photo} photo in every photo slot (made in ${report.timing.makeMs} ms), words included, print size with bleed:\n\n| Page | Draw on phone |\n|---|---|\n${report.timing.pages.map((t) => `| ${t.name} | ${t.error ? `stopped: ${t.error}` : `${t.drawMs} ms`} |`).join('\n')}\n`
    : '';
  fs.writeFileSync(path.join(OUT, 'table.md'), `${head}\n${lines.join('\n')}\n${tiles}${timing}`);
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ pixelmatch: PIXELMATCH, chromium: manifest.chromium, device: report.device, phoneTotalMs: report.totalMs, photos: report.photos, rows, tiles: tileRows, timing: report.timing ?? null }, null, 1));
  console.log(`Golden pages and covers, PHONE vs website (pixelmatch ${PIXELMATCH.threshold}, edges counted):\n${head}\n${lines.join('\n')}${tiles}${timing}`);
});

describe('the phone drew the pages the computer compares it with', () => {
  it('from the same website pictures (pages, photos, fonts, print code)', () => {
    expect(report.madeFrom.renderer).toBe(manifest.fingerprint.renderer.hash);
    expect(report.madeFrom.tools).toBe(manifest.fingerprint.tools.hash);
    expect(report.madeFrom.fonts).toBe(manifest.fingerprint.fonts);
  });
  it("with today's renderer code (else: build again with -GoldenPages and run again)", () => {
    expect(report.appRenderer).toBe(appRendererHash());
  });
  it('every golden page and cover, none stopped', () => {
    const drawn = new Set(report.pages.filter((p) => !p.variant).map((p) => p.name));
    expect(manifest.cases.map((c) => c.name).filter((n) => !drawn.has(n))).toEqual([]);
    expect(manifest.covers.map((c) => c.name).filter((n) => !drawn.has(n))).toEqual([]);
    expect(report.pages.filter((p) => p.error).map((p) => `${p.file}: ${p.error}`)).toEqual([]);
  });
  it('every texture tile, and the timing pass', () => {
    expect((report.tiles ?? []).map((t) => t.file).sort()).toEqual(manifest.tiles.map((t) => t.file).sort());
    expect((report.tiles ?? []).filter((t) => t.error).map((t) => `${t.file}: ${t.error}`)).toEqual([]);
    expect(report.timing?.pages.filter((t) => t.error).map((t) => `${t.name}: ${t.error}`) ?? ['no timing pass']).toEqual([]);
  });
});

/** Does this golden page draw a photo file the phone's colour step converted? */
function usesConverted(name: string): boolean {
  if (!pagesJson.cases.some((c) => c.name === name)) return false; // a cover: no Display P3 photo
  return planOf(name).items.some((it) => (it.kind === 'photo' || it.kind === 'boxPhoto')
    && convertedFiles.has(`photos/photo-${pagesJson.photos[it.photoIndex]?.image}.png`));
}

const rgbaImage = (rgba: Uint8Array, W: number, H: number): SkImage => {
  const img = Sk.Image.MakeImage({ width: W, height: H, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul }, Sk.Data.fromBytes(rgba), W * 4);
  if (!img) throw new Error('could not make a picture');
  return img;
};

/** website | phone | diff, scaled down, and the same three at full size round the spot that differs most. */
function sideBySide(file: string, title: string, ref: Uint8Array, app: Uint8Array, diff: Uint8Array, W: number, H: number, focus: Area): void {
  const PANEL = 760, GAP = 16, TOP = 56, CROP = 480;
  const scale = PANEL / W, ph = Math.round(H * scale);
  const width = PANEL * 3 + GAP * 4, height = TOP + ph + GAP + 44 + CROP + GAP;
  const surface = Sk.Surface.Make(width, height);
  if (!surface) throw new Error('no surface');
  const c: SkCanvas = surface.getCanvas();
  const white = Sk.Paint(); white.setColor(Sk.Color('#ffffff'));
  c.drawRect(Sk.XYWHRect(0, 0, width, height), white);
  const ink = Sk.Paint(); ink.setColor(Sk.Color('#2E2E2E')); ink.setAntiAlias(true);
  const accent = Sk.Paint(); accent.setColor(Sk.Color('#B85C38')); accent.setAntiAlias(true);
  c.drawText(title, GAP, 38, accent, labelFont);
  const imgs = [rgbaImage(ref, W, H), rgbaImage(app, W, H), rgbaImage(diff, W, H)];
  const names = ['Website (print file)', 'Phone (its own Skia)', 'Difference (pixelmatch)'];
  const fx = Math.max(0, Math.min(W - CROP, Math.round(focus.x + focus.w / 2 - CROP / 2)));
  const fy = Math.max(0, Math.min(H - CROP, Math.round(focus.y + focus.h / 2 - CROP / 2)));
  const border = Sk.Paint(); border.setColor(Sk.Color('#B85C38')); border.setStyle(PaintStyle.Stroke); border.setStrokeWidth(2);
  imgs.forEach((img, i) => {
    const x = GAP + i * (PANEL + GAP);
    c.drawImageRectOptions(img, Sk.XYWHRect(0, 0, W, H), Sk.XYWHRect(x, TOP, PANEL, ph), FilterMode.Linear, MipmapMode.Linear, white);
    c.drawRect(Sk.XYWHRect(x + fx * scale, TOP + fy * scale, CROP * scale, CROP * scale), border);
    c.drawText(`${names[i]}: 1:1 at ${fx},${fy}`, x, TOP + ph + GAP + 30, ink, smallFont);
    const cw = Math.min(CROP, PANEL);
    c.drawImageRectOptions(img, Sk.XYWHRect(fx, fy, cw, CROP), Sk.XYWHRect(x, TOP + ph + GAP + 44, cw, CROP), FilterMode.Nearest, MipmapMode.None, white);
    img.dispose();
  });
  surface.flush();
  const snap = surface.makeImageSnapshot();
  writeImage(file, snap);
  snap.dispose();
  surface.dispose();
}

const phonePages = report.pages.filter((p) => !p.error);

describe('every page and cover the phone drew, against the website (the same bars as the Node check)', () => {
  it.each(phonePages.map((p) => [p.variant ? `${p.name}.${p.variant}` : p.name, p] as [string, PhonePage]))('%s', (tag, p) => {
    const isCover = p.kind === 'cover';
    const web = (isCover ? manifest.covers : manifest.cases).find((c) => c.name === p.name) as WebCase;
    expect(web).toBeDefined();
    const ref = readPng(Sk, path.join(WEB, web.file));
    const refBare = web.bare ? readPng(Sk, path.join(WEB, web.bare)).data : ref.data;
    const app = readPng(Sk, path.join(PHONE, p.file));
    expect([app.width, app.height]).toEqual([ref.width, ref.height]);
    const appBare = p.bareFile ? readPng(Sk, path.join(PHONE, p.bareFile)).data : app.data;
    const zones = p.words.map((w) => w.zone);
    const cmp: PageComparison = comparePage({ ref: ref.data, refBare, app: app.data, appBare, W: ref.width, H: ref.height }, zones, isCover ? 0 : planOf(p.name).bleed);
    const webLines = isCover
      ? (() => { const front = coverPlanOf(p.name).steps.find((st) => st.kind === 'front'); return coverWebLines(web.lines, ref.width, ref.height, front && front.kind === 'front' ? front.rect : null); })()
      : web.lines;
    const lf = lineFailures(p.words.flatMap((w) => w.lines), webLines);
    const failures = pageFailures(cmp);
    writeRgba(Sk, path.join(OUT, 'diff', `${tag}.png`), ref.width, ref.height, cmp.diff);
    const focus: Area = cmp.worstTileAt ? { x: cmp.worstTileAt.x, y: cmp.worstTileAt.y, w: 64, h: 64 } : zones[0] ?? { x: ref.width / 2, y: ref.height / 2, w: 0, h: 0 };
    const expectFail = !p.variant && usesConverted(p.name);
    const passed = failures.length === 0 && lf.length === 0 && p.notDrawn.length === 0;
    sideBySide(path.join(OUT, 'side', `${tag}.png`), `${tag}: ${passed ? 'passes every bar' : `fails: ${[...lf, ...failures].join('; ')}`}`.slice(0, 150), ref.data, app.data, cmp.diff, ref.width, ref.height, focus);
    const w = cmp.words;
    rows.push({
      page: p.name, kind: isCover ? 'cover' : 'page', variant: p.variant, size: `${ref.width}x${ref.height}`, drawMs: p.drawMs,
      outsideWordsPct: cmp.outsideWordsPct, worstTilePct: cmp.worstTilePct, worstTileMean: cmp.worstTileMean, differingPct: cmp.differingPct, over8LevelsPct: cmp.over8LevelsPct, maxChannelDiff: cmp.maxChannelDiff,
      inkOff: w.length ? Math.max(...w.map((x) => x.inkDiff)) : null,
      worstBlock: w.length ? Math.max(...w.map((x) => x.worstBlock)) : null,
      textShift: w.length ? Math.max(...w.map((x) => Math.max(Math.abs(x.shift.x), Math.abs(x.shift.y)))) : null,
      lines: web.lines.length, lineFailures: lf, failures, expectFail, passed: expectFail ? !passed : passed,
    });

    expect(p.notDrawn).toEqual([]);
    expect(p.missing ?? []).toEqual([]);
    const known = KNOWN_PLATFORM_DIFFERENCES[p.name];
    if (expectFail) {
      // Raw Display P3 numbers drawn as sRGB: the bars must catch it.
      expect(failures.length).toBeGreaterThan(0);
    } else if (known) {
      expect(lf).toEqual([]);
      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatch(known);
    } else {
      expect(lf).toEqual([]);
      expect(failures).toEqual([]);
    }
  }, 300_000);
});

describe('every texture tile the phone drew alone, against the tile print prepares', () => {
  it.each((report.tiles ?? []).filter((t) => !t.error).map((t) => [t.file, t] as [string, NonNullable<PhoneReport['tiles']>[number]]))('%s', (file, t) => {
    const w = manifest.tiles.find((x) => x.file === file) as WebTile;
    const ref = readPng(Sk, path.join(WEB, w.file));
    const app = readPng(Sk, path.join(PHONE, t.phoneFile));
    expect([app.width, app.height]).toEqual([ref.width, ref.height]);
    const r = tileFailures(ref.data, app.data);
    tileRows.push({ file, maxLevels: r.maxLevels, meanLevels: r.meanLevels, ms: t.ms, failures: r.failures });
    expect(r.failures).toEqual([]);
  }, 60_000);
});

