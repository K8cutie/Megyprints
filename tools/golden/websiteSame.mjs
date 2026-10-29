#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   IS THE WEBSITE'S PRINT OUTPUT UNCHANGED? Byte for byte, on every golden
   page and cover.

     cd tools/golden && node websiteSame.mjs [<git-ref>]
         (default: where this branch left main, git merge-base HEAD origin/main)

   A change that moves website code into shared files for the 2.0 app (the
   cover layout, the looks, the soft edge, where a QR or a graphic sits) must
   not change one byte of what the website sends to the printer. This makes
   the print files of every golden page and cover twice in the same headless
   Chromium: with the website's src/ as it is at <git-ref> (exported with
   git archive into a temp folder) and with the working copy's src/, and
   compares them. <git-ref> must be a commit from BEFORE the change: once
   the change is committed, HEAD compares the code with itself and proves
   nothing (the script says so and stops with exit code 2). The default,
   the commit this branch left main at, compares the whole branch with
   main as it was.

   It compares:
     • each page's print-file JPEG and every sharp-words patch (its PNG bytes
       and where it goes), renderPageForPrint;
     • the same page with its words baked in (bakeWords: the smaller file);
     • the cover file's JPEG and its word patches, renderCoverWrapForPrint.
   Needs the golden pages made first (node renderWeb.mjs: tools/golden/web).
   Prints one line per page and stops with exit code 1 on any difference.
   ══════════════════════════════════════════════════════════════════════════ */
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const require = createRequire(import.meta.url);
const { REPO_ROOT, sha256 } = require('./sources.cjs');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(HERE, 'web');
const ORIGIN = 'http://golden.test';
/** The commit to compare against: the one given, or where HEAD left origin/main. */
function baseRef() {
  if (process.argv[2]) return process.argv[2];
  return execFileSync('git', ['-C', REPO_ROOT, 'merge-base', 'HEAD', 'origin/main']).toString().trim();
}
const ref = baseRef();

/** The website's src/ at `ref`, in a temp folder. */
function exportSrc() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'megy-src-'));
  const tar = path.join(dir, 'src.tar');
  execFileSync('git', ['-C', REPO_ROOT, 'archive', '--format=tar', '-o', tar, ref, 'src'], { stdio: 'inherit' });
  // Relative names: GNU tar reads 'C:' as a remote host.
  execFileSync('tar', ['-xf', 'src.tar'], { cwd: dir, stdio: 'inherit' });
  fs.rmSync(tar);
  return dir;
}

async function bundle(srcRoot) {
  const result = await build({
    entryPoints: [path.join(HERE, 'sameEntry.ts')],
    bundle: true, platform: 'browser', format: 'iife', write: false, logLevel: 'error',
    define: { 'import.meta.env': '{}' },
    alias: {
      'megy-print': path.join(srcRoot, 'src', 'pages', 'builder', 'printPipeline.ts'),
      'megy-types': path.join(srcRoot, 'src', 'pages', 'builder', 'types.ts'),
    },
    // The exported copy has no node_modules of its own: the repo's.
    nodePaths: [path.join(REPO_ROOT, 'node_modules')],
  });
  return result.outputFiles[0].text;
}

/** The app's font files (mobile/src/render/fontTable.ts), as renderWeb.mjs gives them to the website. */
async function bundledFonts() {
  const out = path.join(os.tmpdir(), `golden-fonts-${process.pid}.mjs`);
  await build({ stdin: { contents: "export { BUNDLED_FONTS } from '../../mobile/src/render/fontTable';", resolveDir: HERE, loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'error' });
  const { BUNDLED_FONTS } = await import(pathToFileURL(out).href);
  fs.rmSync(out, { force: true });
  return BUNDLED_FONTS.map((f) => ({ face: f.face, weight: f.weight, italic: f.italic, base64: fs.readFileSync(path.join(REPO_ROOT, 'mobile', 'node_modules', f.file)).toString('base64') }));
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(WEB, 'manifest.json'), 'utf8'));
  const set = JSON.parse(fs.readFileSync(path.join(WEB, 'pages.json'), 'utf8'));
  const base = exportSrc();
  try {
    await compareWith(base, manifest, set);
  } finally {
    // Even when something fails part-way: never leave the exported copy in %TEMP%.
    fs.rmSync(base, { recursive: true, force: true });
  }
}

async function compareWith(base, manifest, set) {
  const before = await bundle(base);
  const after = await bundle(REPO_ROOT);
  if (before === after) {
    console.error(`The website's print code at ${ref} is the same text as the working copy's: this would compare the code with itself and prove nothing. Give a commit from before the change (for example: node websiteSame.mjs origin/main).`);
    process.exitCode = 2;
    return;
  }
  console.log(`Comparing the print code at ${ref} (${execFileSync('git', ['-C', REPO_ROOT, 'rev-parse', '--short', ref]).toString().trim()}) with the working copy's (the two bundles differ).`);

  const browser = await chromium.launch({ headless: true, args: ['--disable-gpu', '--disable-accelerated-2d-canvas', '--disable-gpu-compositing'] });
  const context = await browser.newContext({ deviceScaleFactor: 1, viewport: { width: 800, height: 600 } });
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) return route.abort();
    if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>' });
    let file = null;
    if (/^\/masks\/[a-z-]+\.png$/.test(url.pathname)) file = path.join(REPO_ROOT, 'public', url.pathname);
    const made = (manifest.assets || []).find((a) => a.url === url.pathname);
    if (made) file = path.join(WEB, made.file);
    if (!file || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: 'image/png', body: fs.readFileSync(file) });
  });
  const fontList = await bundledFonts();
  const photos = manifest.photos.map((p) => fs.readFileSync(path.join(WEB, p.file)).toString('base64'));
  const open = async (js) => {
    const page = await context.newPage();
    page.on('pageerror', (e) => console.error('[page error]', e.message));
    await page.goto(`${ORIGIN}/`);
    await page.addScriptTag({ content: js });
    await page.evaluate((f) => globalThis.same.registerFonts(f), fontList);
    await page.evaluate((p) => globalThis.same.setImages(p), photos);
    return page;
  };
  const pBefore = await open(before);
  const pAfter = await open(after);

  const diffs = [];
  const compare = async (name, call, input) => {
    const a = await pBefore.evaluate(([c, i]) => globalThis.same[c](i), [call, input]);
    const b = await pAfter.evaluate(([c, i]) => globalThis.same[c](i), [call, input]);
    const same = a.image === b.image && a.words.length === b.words.length && a.words.every((w, i) => w === b.words[i]);
    const jpeg = Buffer.from(a.image, 'base64');
    console.log(`${same ? 'same' : 'DIFFERENT'}  ${name.padEnd(44)} jpeg ${sha256(jpeg).slice(0, 12)} (${(jpeg.length / 1024).toFixed(0)} KB)  ${a.words.length} word patches`);
    if (!same) diffs.push({ name, before: { image: sha256(jpeg), words: a.words.map((w) => sha256(w)) }, after: { image: sha256(Buffer.from(b.image, 'base64')), words: b.words.map((w) => sha256(w)) } });
  };
  for (const c of set.cases) {
    const input = { page: c.page, albumSize: c.albumSize, pageIndex: c.pageIndex, photos: set.photos };
    await compare(c.name, 'page', { ...input, bakeWords: false });
    await compare(`${c.name} (words baked in)`, 'page', { ...input, bakeWords: true });
  }
  for (const c of set.covers) {
    await compare(c.name, 'cover', { albumSize: c.albumSize, pageCount: c.pageCount, cover: c.cover, material: c.material, coverFront: c.coverFront, coverDesign: c.coverDesign, photos: set.photos });
  }
  await browser.close();

  const total = set.cases.length * 2 + set.covers.length;
  console.log(`\n${total - diffs.length} of ${total} print files byte-identical to the website's print code at ${ref} (${execFileSync('git', ['-C', REPO_ROOT, 'rev-parse', '--short', ref]).toString().trim()}).`);
  if (diffs.length) {
    fs.mkdirSync(path.join(HERE, 'out'), { recursive: true });
    fs.writeFileSync(path.join(HERE, 'out', 'website-same.json'), JSON.stringify(diffs, null, 1));
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
