#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   THE WEBSITE'S CAPTION-FIT ANSWERS, in headless Chromium.

     cd tools/golden && npm ci && node fitWeb.mjs

   The website's builder asks textFit whether a caption fits its box ("Too
   long for this box", "Make it fit (size 22)", a new caption made smaller),
   measuring words with the browser's canvas. The app's builder asks the same
   textFit with its own measurer (Skia, mobile/src/builder/textMeasurer.ts).
   This writes what the website answers for every case in fitCases.ts, with
   the app's own font files loaded into Chromium (the same files the app
   draws with), to tools/golden/web-fit/textfit.json; the app's test
   (mobile/test/textMeasurer.test.ts) re-runs this when it is out of date and
   holds the app's answers to it.
   Same Chromium as renderWeb.mjs (playwright-core 1.61.1, build 1228).
   ══════════════════════════════════════════════════════════════════════════ */
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const require = createRequire(import.meta.url);
const { REPO_ROOT, fitFingerprint } = require('./fitSources.cjs');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'web-fit');
const MOBILE = path.join(REPO_ROOT, 'mobile');
// On Linux (the CI runner), letters are measured as on Windows: no hinting,
// letters between pixels (see LINUX_TEXT in renderWeb.mjs). Windows: unchanged.
const LINUX_TEXT = process.platform === 'linux' ? ['--font-render-hinting=none'] : [];

async function bundleNode() {
  const outfile = path.join(os.tmpdir(), `fit-node-${process.pid}.mjs`);
  await build({
    stdin: {
      contents: [
        "export { buildFitCases } from './fitCases';",
        "export { BUNDLED_FONTS } from '../../mobile/src/render/fontTable';",
      ].join('\n'),
      resolveDir: HERE, loader: 'ts',
    },
    bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'error',
    define: { 'import.meta.env': '{}' },
    // The builder module pulls in React; any copy will do to build page data.
    nodePaths: [path.join(REPO_ROOT, 'node_modules')],
  });
  const mod = await import(pathToFileURL(outfile).href);
  fs.rmSync(outfile, { force: true });
  return mod;
}

async function bundleWeb() {
  const result = await build({
    entryPoints: [path.join(HERE, 'fitEntry.ts')],
    bundle: true, platform: 'browser', format: 'iife', write: false, logLevel: 'error',
    define: { 'import.meta.env': '{}' },
  });
  return result.outputFiles[0].text;
}

async function main() {
  const { buildFitCases, BUNDLED_FONTS } = await bundleNode();
  const cases = buildFitCases();
  const fontFiles = BUNDLED_FONTS.map((f) => path.join(MOBILE, 'node_modules', f.file));
  for (const f of fontFiles) if (!fs.existsSync(f)) throw new Error(`font file missing: ${f} (run npm ci in mobile/)`);
  const browser = await chromium.launch({ headless: true, args: [...LINUX_TEXT, '--disable-gpu', '--disable-accelerated-2d-canvas', '--disable-gpu-compositing'] });
  const page = await (await browser.newContext({ deviceScaleFactor: 1 })).newPage();
  page.on('pageerror', (e) => console.error('[page error]', e.message));
  await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
  await page.addScriptTag({ content: await bundleWeb() });
  const fonts = BUNDLED_FONTS.map((f, i) => ({ face: f.face, weight: f.weight, italic: f.italic, base64: fs.readFileSync(fontFiles[i]).toString('base64') }));
  await page.evaluate((fs_) => globalThis.fitCheck.registerFonts(fs_), fonts);
  const answers = await page.evaluate((cs) => globalThis.fitCheck.fit(cs), cases);
  const version = browser.version();
  await browser.close();
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'textfit.json'), JSON.stringify({
    note: 'Made by tools/golden/fitWeb.mjs. Do not edit: re-run it.',
    madeAt: new Date().toISOString(), chromium: version, fingerprint: fitFingerprint(fontFiles), cases, answers,
  }, null, 1));
  const shrink = answers.filter((a) => a.fit && !a.fit.fits).length;
  console.log(`${answers.length} captions (${shrink} too long for their box) → ${path.relative(REPO_ROOT, path.join(OUT, 'textfit.json'))}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
