#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   MAKE THE GOLDEN PICTURES: the website's print renderer drawing the golden
   pages, in headless Chromium.

     cd tools/golden && npm ci && node renderWeb.mjs

   Needs the website's packages (npm ci at the repo root), the app's (npm ci
   in mobile/: the fonts and CanvasKit come from there) and Playwright's
   Chromium (this uses playwright-core 1.61.1, which drives Chromium build
   1228; if it is missing: npx playwright-core@1.61.1 install
   chromium-headless-shell).

   What it does:
     1. bundles webEntry.ts (the website's printPipeline) with esbuild;
     2. builds the golden pages (goldenPages.ts, seeded) and the synthetic
        photos (syntheticPhotos.ts); the Display P3 test photo is written by
        CanvasKit (Skia), which puts the colour profile in the PNG;
     3. opens Chromium with the GPU off (the CPU drawing, like the app's
        headless check), loads the app's font files into it, and has the
        website draw each page: 300 DPI, bleed, words in, writing down every
        line of words print draws (webEntry.ts); a page with words is drawn
        a second time without them (print's own `words: false`), so the check
        knows exactly which pixels the words paint;
     4. writes tools/golden/web/: one PNG per page (and NAME.bare.png),
        pages.json (the pages, exactly as drawn) and manifest.json (what they
        were made from: see sources.cjs, and the lines print drew).
   Nothing here uses the app's page code (planPage): the words and boxes
   come from print itself.
   The app's test (mobile/test/goldenPages.test.ts) compares against these.
   ══════════════════════════════════════════════════════════════════════════ */
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const require = createRequire(import.meta.url);
const { REPO_ROOT, goldenFingerprint, sha256 } = require('./sources.cjs');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'web');
const MOBILE = path.join(REPO_ROOT, 'mobile');

async function bundleNode() {
  const outfile = path.join(os.tmpdir(), `golden-node-${process.pid}.mjs`);
  await build({
    stdin: {
      contents: [
        "export { buildGoldenSet } from './goldenPages';",
        "export { allSyntheticPhotos, p3SyntheticPhoto, PHOTO_SIZES } from './syntheticPhotos';",
        "export { BUNDLED_FONTS } from '../../mobile/src/render/fontTable';",
      ].join('\n'),
      resolveDir: HERE, loader: 'ts',
    },
    bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'error',
  });
  const mod = await import(pathToFileURL(outfile).href);
  fs.rmSync(outfile, { force: true });
  return mod;
}

async function bundleWeb() {
  const result = await build({
    entryPoints: [path.join(HERE, 'webEntry.ts')],
    bundle: true, platform: 'browser', format: 'iife', write: false, logLevel: 'error',
    define: { 'import.meta.env': '{}' },
  });
  return result.outputFiles[0].text;
}

const encodePng = (p) => {
  const png = new PNG({ width: p.width, height: p.height });
  png.data = Buffer.from(p.rgba.buffer, p.rgba.byteOffset, p.rgba.byteLength);
  return PNG.sync.write(png);
};

/** A PNG of `p` whose numbers are Display P3 colours: Skia writes the P3
 *  profile into it (an iCCP chunk), as a phone camera does in a JPEG. */
async function encodeP3Png(p) {
  const dir = path.join(MOBILE, 'node_modules', 'canvaskit-wasm', 'bin', 'full');
  const CanvasKitInit = require(path.join(dir, 'canvaskit.js'));
  const CK = await CanvasKitInit({ locateFile: (f) => path.join(dir, f) });
  const img = CK.MakeImage({
    width: p.width, height: p.height, colorType: CK.ColorType.RGBA_8888, alphaType: CK.AlphaType.Unpremul, colorSpace: CK.ColorSpace.DISPLAY_P3,
  }, p.rgba, p.width * 4);
  if (!img) throw new Error('CanvasKit could not make the P3 photo');
  const bytes = Buffer.from(img.encodeToBytes(CK.ImageFormat.PNG, 100));
  img.delete();
  if (!bytes.includes(Buffer.from('iCCP'))) throw new Error('the P3 photo has no colour profile');
  return bytes;
}

async function main() {
  const { buildGoldenSet, allSyntheticPhotos, p3SyntheticPhoto, BUNDLED_FONTS } = await bundleNode();
  const set = buildGoldenSet();
  const photoPngs = [...allSyntheticPhotos().map(encodePng), await encodeP3Png(p3SyntheticPhoto())];
  // The test photos as files: the website loads these bytes, and so does the
  // app's test (decoded by Skia, like a photo file on the phone).
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'photos'), { recursive: true });
  const photoFiles = photoPngs.map((bytes, i) => {
    const file = `photos/photo-${i}.png`;
    fs.writeFileSync(path.join(OUT, file), bytes);
    return { file, sha256: sha256(bytes) };
  });
  const fontFiles = BUNDLED_FONTS.map((f) => path.join(MOBILE, 'node_modules', f.file));
  for (const f of fontFiles) if (!fs.existsSync(f)) throw new Error(`font file missing: ${f} (run npm ci in mobile/)`);

  const webJs = await bundleWeb();
  const browser = await chromium.launch({
    headless: true,
    // The CPU drawing: no GPU canvas, so the pictures don't depend on this
    // PC's graphics card (the app's headless check draws on the CPU too).
    args: ['--disable-gpu', '--disable-accelerated-2d-canvas', '--disable-gpu-compositing'],
  });
  const context = await browser.newContext({ deviceScaleFactor: 1, viewport: { width: 800, height: 600 } });
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.error('[page]', m.text()); });
  page.on('pageerror', (e) => console.error('[page error]', e.message));
  await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
  await page.addScriptTag({ content: webJs });

  const fonts = BUNDLED_FONTS.map((f, i) => ({ face: f.face, weight: f.weight, italic: f.italic, base64: fs.readFileSync(fontFiles[i]).toString('base64') }));
  await page.evaluate((fs_) => globalThis.golden.registerFonts(fs_), fonts);
  await page.evaluate((imgs) => globalThis.golden.setImages(imgs), photoPngs.map((b) => b.toString('base64')));

  const drawOne = async (c, words) => {
    const r = await page.evaluate((input) => globalThis.golden.render(input), {
      page: c.page, albumSize: c.albumSize, pageIndex: c.pageIndex, photos: set.photos, words,
    });
    return { ...r, bytes: Buffer.from(r.png.slice(r.png.indexOf(',') + 1), 'base64') };
  };

  const cases = [];
  for (const c of set.cases) {
    const t0 = Date.now();
    const full = await drawOne(c, true);
    const file = `${c.name}.png`;
    fs.writeFileSync(path.join(OUT, file), full.bytes);
    // The page under the words, when it has any (else it is the page itself).
    let bare = null;
    if (full.lines.length) {
      const under = await drawOne(c, false);
      if (under.lines.length) throw new Error(`${c.name}: words drawn with words: false`);
      bare = `${c.name}.bare.png`;
      fs.writeFileSync(path.join(OUT, bare), under.bytes);
    }
    cases.push({ name: c.name, file, bare, width: full.width, height: full.height, sha256: sha256(full.bytes), lines: full.lines });
    console.log(`${c.name.padEnd(34)} ${full.width}x${full.height}  ${(full.bytes.length / 1024).toFixed(0)} KB  ${full.lines.length} lines  ${Date.now() - t0} ms`);
  }

  // How this Chromium measures and places a line (kept for the record).
  const probes = [];
  for (const f of BUNDLED_FONTS) {
    const font = `${f.italic ? 'italic' : 'normal'} ${f.weight === 700 ? 'bold' : 'normal'} 80px "${f.face}"`;
    probes.push({ font, text: 'Our first beach day', ...(await page.evaluate(([a, b]) => globalThis.golden.measure(a, b), [font, 'Our first beach day'])) });
  }

  const version = browser.version();
  await browser.close();

  fs.writeFileSync(path.join(OUT, 'pages.json'), JSON.stringify(set, null, 1));
  const manifest = {
    note: 'Made by tools/golden/renderWeb.mjs. Do not edit: re-run it.',
    madeAt: new Date().toISOString(),
    chromium: version,
    playwrightCore: require('playwright-core/package.json').version,
    chromiumArgs: 'GPU off (CPU drawing), deviceScaleFactor 1',
    fingerprint: goldenFingerprint(fontFiles),
    pagesSha256: sha256(fs.readFileSync(path.join(OUT, 'pages.json'))),
    photos: photoFiles,
    probes,
    cases,
  };
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
  const total = fs.readdirSync(OUT).filter((f) => f.endsWith('.png')).reduce((n, f) => n + fs.statSync(path.join(OUT, f)).size, 0);
  console.log(`\n${cases.length} pages, ${(total / 1024 / 1024).toFixed(1)} MB → ${path.relative(REPO_ROOT, OUT)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
