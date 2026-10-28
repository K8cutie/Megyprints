#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   MAKE THE GOLDEN PICTURES: the website's print renderer drawing the golden
   pages and covers, in headless Chromium.

     cd tools/golden && npm ci && node renderWeb.mjs

   Needs the website's packages (npm ci at the repo root), the app's (npm ci
   in mobile/: the fonts and CanvasKit come from there) and Playwright's
   Chromium (this uses playwright-core 1.61.1, which drives Chromium build
   1228; if it is missing: npx playwright-core@1.61.1 install
   chromium-headless-shell).

   What it does:
     1. bundles webEntry.ts (the website's printPipeline) with esbuild;
     2. builds the golden pages and covers (goldenPages.ts, seeded) and the
        synthetic photos and corner art (syntheticPhotos.ts); the Display P3
        test photo is written by CanvasKit (Skia), which puts the colour
        profile in the PNG;
     3. opens Chromium with the GPU off (the CPU drawing, like the app's
        headless check) on a page of its own (http://golden.test/, answered
        here, never the network) that serves the website's public/masks
        edge pictures and the made-up corner art, loads the app's font files
        into it, has the website make every QR code and graphic the pages
        name (the PNG an album keeps), then draws each page: 300 DPI, bleed,
        words in, writing down every line of words print draws
        (webEntry.ts); a page with words is drawn a second time without them
        (print's own `words: false`), so the check knows exactly which
        pixels the words paint. Each cover is made as for an order
        (renderCoverWrapForPrint): the wrap caught just before its JPEG is
        the cover under its words, and print's own word patches laid on it
        give the cover with them. And each of the 16 texture tiles as print
        prepares it, in its own colour at the 8x8 tile size and tinted at
        the 6x4 one;
     4. writes tools/golden/web/: one PNG per page or cover (and NAME.bare.png),
        tiles/, assets/, pages.json (the pages and covers, exactly as drawn,
        QR codes and graphics in) and manifest.json (what they were made
        from: see sources.cjs, and the lines print drew).
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
/** The page Chromium draws on: answered by route() below, never looked up. */
const ORIGIN = 'http://golden.test';

async function bundleNode() {
  const outfile = path.join(os.tmpdir(), `golden-node-${process.pid}.mjs`);
  await build({
    stdin: {
      contents: [
        "export { buildGoldenSet } from './goldenPages';",
        "export { allSyntheticPhotos, p3SyntheticPhoto, bigSyntheticPhoto, syntheticCorner, PHOTO_SIZES } from './syntheticPhotos';",
        "export { BUNDLED_FONTS } from '../../mobile/src/render/fontTable';",
        "export { TEXTURE_NAMES, TEXTURE_COLORS } from '../../src/pages/builder/textures';",
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

/** Every string in `value` that starts with 'golden:', replaced (in place) by `swap`. */
async function swapPlaceholders(value, swap) {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (typeof value[i] === 'string' && value[i].startsWith('golden:')) value[i] = await swap(value[i]);
      else if (value[i] && typeof value[i] === 'object') await swapPlaceholders(value[i], swap);
    }
  } else if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) {
      if (typeof value[k] === 'string' && value[k].startsWith('golden:')) value[k] = await swap(value[k]);
      else if (value[k] && typeof value[k] === 'object') await swapPlaceholders(value[k], swap);
    }
  }
}

/** Where a file the page asks for comes from: the website's public/ masks, the made-up corner art. */
function servedFile(urlPath) {
  if (/^\/masks\/[a-z-]+\.png$/.test(urlPath)) return path.join(REPO_ROOT, 'public', urlPath);
  if (/^\/golden\/[a-z_]+\.png$/.test(urlPath)) return path.join(OUT, 'assets', path.basename(urlPath));
  return null;
}

async function main() {
  const { buildGoldenSet, allSyntheticPhotos, p3SyntheticPhoto, bigSyntheticPhoto, syntheticCorner, BUNDLED_FONTS, TEXTURE_NAMES, TEXTURE_COLORS } = await bundleNode();
  const set = buildGoldenSet();
  const photoPngs = [...allSyntheticPhotos().map(encodePng), await encodeP3Png(p3SyntheticPhoto()), encodePng(bigSyntheticPhoto())];
  // The test photos as files: the website loads these bytes, and so does the
  // app's test (decoded by Skia, like a photo file on the phone).
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'photos'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'tiles'), { recursive: true });
  const photoFiles = photoPngs.map((bytes, i) => {
    const file = `photos/photo-${i}.png`;
    fs.writeFileSync(path.join(OUT, file), bytes);
    return { file, sha256: sha256(bytes) };
  });
  const assetFiles = ['tl', 'tr', 'bl', 'br'].map((pos) => {
    const bytes = encodePng(syntheticCorner(pos));
    const file = `assets/corner_${pos}.png`;
    fs.writeFileSync(path.join(OUT, file), bytes);
    return { url: `/golden/corner_${pos}.png`, file, sha256: sha256(bytes) };
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
  const served = [];
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) return route.abort();
    if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>' });
    const file = servedFile(url.pathname);
    if (!file || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
    served.push(url.pathname);
    return route.fulfill({ status: 200, contentType: 'image/png', body: fs.readFileSync(file) });
  });
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.error('[page]', m.text()); });
  page.on('pageerror', (e) => console.error('[page error]', e.message));
  await page.goto(`${ORIGIN}/`);
  await page.addScriptTag({ content: webJs });

  const fonts = BUNDLED_FONTS.map((f, i) => ({ face: f.face, weight: f.weight, italic: f.italic, base64: fs.readFileSync(fontFiles[i]).toString('base64') }));
  await page.evaluate((fs_) => globalThis.golden.registerFonts(fs_), fonts);
  await page.evaluate((imgs) => globalThis.golden.setImages(imgs), photoPngs.map((b) => b.toString('base64')));

  // The QR codes and graphics, made by the website as an album keeps them.
  const made = new Map();
  const swap = async (ph) => {
    if (!made.has(ph)) made.set(ph, await page.evaluate((p) => globalThis.golden.resolve(p), ph));
    return made.get(ph);
  };
  await swapPlaceholders(set.cases, swap);
  await swapPlaceholders(set.covers, swap);

  const dataBytes = (r) => Buffer.from(r.png.slice(r.png.indexOf(',') + 1), 'base64');
  const drawOne = async (c, words) => {
    const r = await page.evaluate((input) => globalThis.golden.render(input), {
      page: c.page, albumSize: c.albumSize, pageIndex: c.pageIndex, photos: set.photos, words,
    });
    return { ...r, bytes: dataBytes(r) };
  };
  /** A cover as for an order: the wrap under its words, and the same wrap
   *  with print's word patches laid on (each patch pixel is either fully the
   *  word's, alpha 255, or not the word's at all, alpha 0: rgbaToPng). */
  const drawCover = async (c) => {
    const t0 = Date.now();
    const r = await page.evaluate((input) => globalThis.golden.renderCover(input), {
      albumSize: c.albumSize, pageCount: c.pageCount, cover: c.cover, material: c.material,
      coverFront: c.coverFront, coverDesign: c.coverDesign, photos: set.photos,
    });
    const bareBytes = Buffer.from(r.bare.slice(r.bare.indexOf(',') + 1), 'base64');
    const full = PNG.sync.read(bareBytes);
    if (full.width !== r.width || full.height !== r.height) throw new Error(`${c.name}: the wrap is ${full.width}x${full.height}, not ${r.width}x${r.height}`);
    for (const p of r.patches) {
      const patch = PNG.sync.read(Buffer.from(p.png, 'base64'));
      if (patch.width !== p.w || patch.height !== p.h) throw new Error(`${c.name}: a ${patch.width}x${patch.height} patch said to be ${p.w}x${p.h}`);
      for (let y = 0; y < patch.height; y++) {
        for (let x = 0; x < patch.width; x++) {
          const i = (y * patch.width + x) * 4;
          const a = patch.data[i + 3];
          if (a === 0) continue;
          if (a !== 255) throw new Error(`${c.name}: a word patch pixel with alpha ${a}`);
          const o = ((p.y + y) * full.width + (p.x + x)) * 4;
          full.data[o] = patch.data[i]; full.data[o + 1] = patch.data[i + 1]; full.data[o + 2] = patch.data[i + 2]; full.data[o + 3] = 255;
        }
      }
    }
    const fullBytes = PNG.sync.write(full);
    const file = `${c.name}.png`;
    fs.writeFileSync(path.join(OUT, file), fullBytes);
    let bare = null;
    if (r.lines.length) {
      bare = `${c.name}.bare.png`;
      fs.writeFileSync(path.join(OUT, bare), bareBytes);
    }
    console.log(`${c.name.padEnd(34)} ${r.width}x${r.height}  ${(fullBytes.length / 1024).toFixed(0)} KB  ${r.lines.length} lines  ${r.patches.length} patches  ${Date.now() - t0} ms`);
    return { name: c.name, file, bare, width: r.width, height: r.height, sha256: sha256(fullBytes), patches: r.patches.length, lines: r.lines };
  };

  const record = async (name, draw) => {
    const t0 = Date.now();
    const full = await draw(true);
    const file = `${name}.png`;
    fs.writeFileSync(path.join(OUT, file), full.bytes);
    // The picture under the words, when it has any (else it is the picture itself).
    let bare = null;
    if (full.lines.length) {
      const under = await draw(false);
      if (under.lines.length) throw new Error(`${name}: words drawn with words: false`);
      bare = `${name}.bare.png`;
      fs.writeFileSync(path.join(OUT, bare), under.bytes);
    }
    console.log(`${name.padEnd(34)} ${full.width}x${full.height}  ${(full.bytes.length / 1024).toFixed(0)} KB  ${full.lines.length} lines  ${Date.now() - t0} ms`);
    return { name, file, bare, width: full.width, height: full.height, sha256: sha256(full.bytes), lines: full.lines };
  };

  const cases = [];
  for (const c of set.cases) cases.push(await record(c.name, (words) => drawOne(c, words)));
  const covers = [];
  for (const c of set.covers) covers.push(await drawCover(c));

  // Each texture's tile as print prepares it: in its own colour at the 8x8
  // tile size (256 px), and tinted at the 6x4 one (192 px).
  const tiles = [];
  for (let i = 0; i < TEXTURE_NAMES.length; i++) {
    const name = TEXTURE_NAMES[i];
    for (const [color, px] of [[undefined, 256], [TEXTURE_COLORS[i % TEXTURE_COLORS.length].hex, 192]]) {
      const url = await page.evaluate(([n, c, p]) => globalThis.golden.textureTile(n, c ?? undefined, p), [name, color ?? null, px]);
      const file = `tiles/${name}-${color ? color.slice(1) : 'own'}-${px}.png`;
      const bytes = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
      fs.writeFileSync(path.join(OUT, file), bytes);
      tiles.push({ name, color: color ?? null, px, file, sha256: sha256(bytes) });
    }
  }

  // How this Chromium measures and places a line (kept for the record).
  const probes = [];
  for (const f of BUNDLED_FONTS) {
    const font = `${f.italic ? 'italic' : 'normal'} ${f.weight === 700 ? 'bold' : 'normal'} 80px "${f.face}"`;
    probes.push({ font, text: 'Our first beach day', ...(await page.evaluate(([a, b]) => globalThis.golden.measure(a, b), [font, 'Our first beach day'])) });
  }

  const version = browser.version();
  await browser.close();

  const used = [...new Set(served)].sort();
  for (const want of ['/masks/torn.png', '/masks/torn-rim.png', '/golden/corner_tl.png']) {
    if (!used.includes(want)) throw new Error(`the website never asked for ${want}: a golden page lost its mask edge or corner art`);
  }

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
    assets: assetFiles,
    served: used,
    probes,
    cases,
    covers,
    tiles,
  };
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
  const count = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((n, d) => n + (d.isDirectory() ? count(path.join(dir, d.name)) : fs.statSync(path.join(dir, d.name)).size), 0);
  console.log(`\n${cases.length} pages, ${covers.length} covers, ${tiles.length} tiles, ${(count(OUT) / 1024 / 1024).toFixed(1)} MB → ${path.relative(REPO_ROOT, OUT)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
