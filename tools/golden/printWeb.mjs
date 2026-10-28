#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   THE WEBSITE'S PRINT FILES for the three print-file albums (printAlbums.ts),
   made by the website's own code in headless Chromium:

     cd tools/golden && npm ci && node printWeb.mjs

   Needs what renderWeb.mjs needs (npm ci at the repo root and in mobile/,
   Playwright's Chromium for playwright-core 1.61.1).

   For each album it runs, in the browser, what runs for a real order
   (printWebEntry.ts): the checkout's cover file and print file, then the
   console's press sheets, cover sheet and "Sheets as JPEG" zip. The fonts
   are the app's own font files (as in the golden pages), the photos the
   synthetic test photos (no real photos).

   Writes tools/golden/print-web/ (never committed):
     albums.json            the albums, exactly as made (the app's check
                            makes its files from this file);
     photos/photo-N.png     the test photos, the bytes both sides load;
     <album>/interior.pdf, cover.pdf, sheets.pdf, cover-sheet.pdf, jpeg.zip;
     manifest.json          Chromium's version, sizes, notes, timings.
   The app's side: mobile/test/printFiles.check.ts (npm run print:compare).
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
const { REPO_ROOT } = require('./sources.cjs');
const { printFingerprint } = require('./printSources.cjs');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'print-web');
const MOBILE = path.join(REPO_ROOT, 'mobile');
/** Every zip entry is dated this, on both sides. */
export const ZIP_DATE = '2026-10-29T08:00:00';

async function bundleNode() {
  const outfile = path.join(os.tmpdir(), `print-node-${process.pid}.mjs`);
  await build({
    stdin: {
      contents: [
        "export { buildPrintAlbums } from './printAlbums';",
        "export { allSyntheticPhotos } from './syntheticPhotos';",
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

/** Vite's "?url" import of pdf.js's worker: here a blob URL of the same file. */
const workerUrl = {
  name: 'worker-url',
  setup(b) {
    b.onResolve({ filter: /\?url$/ }, (args) => ({ path: path.join(REPO_ROOT, 'node_modules', args.path.replace(/\?url$/, '')), namespace: 'worker-url' }));
    b.onLoad({ filter: /.*/, namespace: 'worker-url' }, (args) => ({
      contents: `export default URL.createObjectURL(new Blob([${JSON.stringify(fs.readFileSync(args.path, 'utf8'))}], { type: 'text/javascript' }));`,
      loader: 'js',
    }));
  },
};

async function bundleWeb() {
  const result = await build({
    entryPoints: [path.join(HERE, 'printWebEntry.ts')],
    bundle: true, platform: 'browser', format: 'esm', write: false, logLevel: 'error',
    define: { 'import.meta.env': '{}' }, plugins: [workerUrl],
  });
  return result.outputFiles[0].text;
}

const encodePng = (p) => {
  const png = new PNG({ width: p.width, height: p.height });
  png.data = Buffer.from(p.rgba.buffer, p.rgba.byteOffset, p.rgba.byteLength);
  return PNG.sync.write(png);
};

async function main() {
  const { buildPrintAlbums, allSyntheticPhotos, BUNDLED_FONTS } = await bundleNode();
  const albums = buildPrintAlbums();
  const photoPngs = allSyntheticPhotos().map(encodePng);
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'photos'), { recursive: true });
  photoPngs.forEach((bytes, i) => fs.writeFileSync(path.join(OUT, 'photos', `photo-${i}.png`), bytes));
  const fontFiles = BUNDLED_FONTS.map((f) => path.join(MOBILE, 'node_modules', f.file));
  for (const f of fontFiles) if (!fs.existsSync(f)) throw new Error(`font file missing: ${f} (run npm ci in mobile/)`);

  const webJs = await bundleWeb();
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-gpu', '--disable-accelerated-2d-canvas', '--disable-gpu-compositing'],
  });
  const context = await browser.newContext({ deviceScaleFactor: 1, viewport: { width: 800, height: 600 } });
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.error('[page]', m.text()); });
  page.on('pageerror', (e) => console.error('[page error]', e.message));
  let saveDir = OUT;
  await page.exposeFunction('saveFile', (name, b64, append) => {
    fs.mkdirSync(saveDir, { recursive: true });
    (append ? fs.appendFileSync : fs.writeFileSync)(path.join(saveDir, name), Buffer.from(b64, 'base64'));
  });
  await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
  await page.addScriptTag({ content: webJs, type: 'module' });
  await page.waitForFunction(() => !!globalThis.printWeb, null, { timeout: 60_000 });

  const fonts = BUNDLED_FONTS.map((f, i) => ({ face: f.face, weight: f.weight, italic: f.italic, base64: fs.readFileSync(fontFiles[i]).toString('base64') }));
  await page.evaluate((fs_) => globalThis.printWeb.registerFonts(fs_), fonts);
  await page.evaluate((imgs) => globalThis.printWeb.setImages(imgs), photoPngs.map((b) => b.toString('base64')));

  const made = [];
  for (const a of albums) {
    saveDir = path.join(OUT, a.name);
    const t0 = Date.now();
    const r = await page.evaluate(([album, when]) => globalThis.printWeb.make(album, when), [a, ZIP_DATE]);
    made.push({ name: a.name, ...r });
    const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
    console.log(`${a.name.padEnd(14)} ${a.pages.length} pages  interior ${mb(r.sizes['interior.pdf'])}  cover ${mb(r.sizes['cover.pdf'])}  sheets ${mb(r.sizes['sheets.pdf'])}  zip ${mb(r.sizes['jpeg.zip'])}  checkout ${((r.ms.cover + r.ms.interior) / 1000).toFixed(1)} s  console ${((r.ms.sheets + r.ms.jpeg) / 1000).toFixed(1)} s  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  const version = browser.version();
  await browser.close();

  fs.writeFileSync(path.join(OUT, 'albums.json'), JSON.stringify({ zipDate: ZIP_DATE, albums }, null, 1));
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({
    note: 'Made by tools/golden/printWeb.mjs. Do not edit: re-run it.',
    madeAt: new Date().toISOString(), chromium: version, fingerprint: printFingerprint(),
    chromiumArgs: 'GPU off (CPU drawing), deviceScaleFactor 1',
    albums: made,
  }, null, 1));
}

main().catch((e) => { console.error(e); process.exit(1); });
