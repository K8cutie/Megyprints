#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   MAKE THE GOLDEN PICTURES: the website's print renderer drawing the golden
   pages, in headless Chromium.

     cd tools/golden && npm ci && node renderWeb.mjs

   Needs the website's packages (npm ci at the repo root), the app's (npm ci
   in mobile/: the fonts come from there) and Playwright's Chromium (this
   uses playwright-core 1.61.1, which drives Chromium build 1228; if it is
   missing: npx playwright-core@1.61.1 install chromium-headless-shell).

   What it does:
     1. bundles webEntry.ts (the website's printPipeline) with esbuild;
     2. builds the golden pages (goldenPages.ts, seeded) and the synthetic
        photos (syntheticPhotos.ts);
     3. opens Chromium with the GPU off (the CPU drawing, like the app's
        headless check), loads the app's font files into it, and has the
        website draw each page: 300 DPI, bleed, words in;
     4. writes tools/golden/web/: one PNG per page, pages.json (the pages,
        exactly as drawn) and manifest.json (what they were made from: see
        sources.cjs).
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
        "export { allSyntheticPhotos, PHOTO_SIZES } from './syntheticPhotos';",
        "export { BUNDLED_FONTS } from '../../mobile/src/render/fontTable';",
        "export { planPage } from '../../mobile/src/render/pagePlan';",
      ].join('\n'),
      resolveDir: HERE, loader: 'ts',
    },
    bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'error',
    // The app's '@web/…' imports are the website's src folder.
    alias: { '@web': path.join(REPO_ROOT, 'src') },
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

async function main() {
  const { buildGoldenSet, allSyntheticPhotos, BUNDLED_FONTS, planPage } = await bundleNode();
  const set = buildGoldenSet();
  const photoPngs = allSyntheticPhotos().map(encodePng);
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

  const cases = [];
  for (const c of set.cases) {
    const t0 = Date.now();
    const r = await page.evaluate((input) => globalThis.golden.render(input), {
      page: c.page, albumSize: c.albumSize, pageIndex: c.pageIndex, photos: set.photos,
    });
    const bytes = Buffer.from(r.png.slice(r.png.indexOf(',') + 1), 'base64');
    const file = `${c.name}.png`;
    fs.writeFileSync(path.join(OUT, file), bytes);
    // The words: how the browser breaks each text into lines, in the boxes
    // the app's plan puts them in (the app's test checks it gets the same).
    const plan = planPage({ page: c.page, albumSize: c.albumSize, pageIndex: c.pageIndex, photoCount: set.photos.length });
    const words = [];
    for (const it of plan.items) {
      if (it.kind !== 'boxText' && it.kind !== 'freeText') continue;
      const s = it.style;
      const font = `${s.italic ? 'italic' : 'normal'} ${s.bold ? 'bold' : 'normal'} ${it.fontSize}px ${s.fontFamily || 'serif'}`;
      const maxWidth = it.kind === 'boxText' ? it.maxWidth : it.boxWidth;
      words.push({ font, maxWidth, lines: await page.evaluate(([f, tx, mw]) => globalThis.golden.wrap(f, tx, mw), [font, s.text, maxWidth]) });
    }
    cases.push({ name: c.name, file, width: r.width, height: r.height, sha256: sha256(bytes), words });
    console.log(`${c.name.padEnd(34)} ${r.width}x${r.height}  ${(bytes.length / 1024).toFixed(0)} KB  ${Date.now() - t0} ms`);
  }

  // How this Chromium measures and places a line (kept for the record: the
  // app's text check compares its own numbers with these).
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
  const total = cases.reduce((n, c) => n + fs.statSync(path.join(OUT, c.file)).size, 0);
  console.log(`\n${cases.length} pages, ${(total / 1024 / 1024).toFixed(1)} MB → ${path.relative(REPO_ROOT, OUT)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
