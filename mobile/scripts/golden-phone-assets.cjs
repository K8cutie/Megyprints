#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   THE GOLDEN PAGES FOR A PHONE TEST BUILD.

     node scripts/golden-phone-assets.cjs        (from mobile/)

   Writes golden-phone/bundle.json (not in git): the 45 golden pages exactly
   as the website drew them (tools/golden/web/pages.json), the test photo
   files and the app's font files as base64 (their exact bytes: no Android
   resource step can re-encode a PNG or drop its colour profile), and what
   they were made from. build-android.ps1 -GoldenPages runs this and builds
   with MEGY_GOLDEN_PAGES=1, so Metro puts the file in the app as
   'megy-golden-pages' (goldenPages.js) for the debug screen
   src/app/golden-pages.tsx.

   It stops when the website pictures are missing or out of date (the same
   fingerprint the golden test checks, tools/golden/sources.cjs): the phone
   must draw the very pages the computer will compare it with. Make them with
   `npm test -- goldenPages` here, or `node renderWeb.mjs` in tools/golden.

   appRendererHash() (also used by test/goldenPhone.check.ts): a fingerprint
   of the app's page renderer (src/render, src/dev/goldenRun.ts and every
   shared website file they import), so the computer can tell whether the
   phone's pictures came from today's renderer code.
   ══════════════════════════════════════════════════════════════════════════ */
const fs = require('node:fs');
const path = require('node:path');

const MOBILE = path.resolve(__dirname, '..');
const REPO = path.resolve(MOBILE, '..');
const WEB = path.join(REPO, 'tools', 'golden', 'web');
const OUT = path.join(MOBILE, 'golden-phone');
const { goldenFingerprint, hashFiles, sha256 } = require(path.join(REPO, 'tools', 'golden', 'sources.cjs'));

const toPosix = (p) => p.split(path.sep).join('/');

/** The font files of src/render/fontTable.ts BUNDLED_FONTS, in order, as
 *  package paths. Read from the file's text; the caller proves the reading
 *  right against the website pictures' font fingerprint. */
function bundledFontFiles() {
  const text = fs.readFileSync(path.join(MOBILE, 'src', 'render', 'fontTable.ts'), 'utf8');
  const consts = Object.fromEntries([...text.matchAll(/const (\w+) = '([^']+)';/g)].map((m) => [m[1], m[2]]));
  const list = text.slice(text.indexOf('BUNDLED_FONTS'), text.indexOf('];', text.indexOf('BUNDLED_FONTS')));
  return [...list.matchAll(/file: `\$\{(\w+)\}([^`]+)`/g)].map((m) => {
    if (!consts[m[1]]) throw new Error(`fontTable.ts: no const ${m[1]}`);
    return consts[m[1]] + m[2];
  });
}

const IMPORT_RE = /\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|\bimport\s+['"]([^'"]+)['"]/g;

function resolveLocal(fromAbs, spec) {
  let base;
  if (spec.startsWith('@web/')) base = path.join(REPO, 'src', spec.slice(5));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(fromAbs), spec);
  else return null; // a package
  for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
    if (/\.(ts|tsx)$/.test(c) && fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

/** src/render, src/dev/goldenRun.ts and everything they import (app and shared website files). */
function appRendererFiles() {
  const start = [
    ...fs.readdirSync(path.join(MOBILE, 'src', 'render')).filter((f) => f.endsWith('.ts')).map((f) => path.join(MOBILE, 'src', 'render', f)),
    path.join(MOBILE, 'src', 'dev', 'goldenRun.ts'),
  ];
  const seen = new Set();
  const queue = [...start];
  while (queue.length) {
    const abs = queue.shift();
    if (seen.has(abs)) continue;
    seen.add(abs);
    for (const m of fs.readFileSync(abs, 'utf8').matchAll(IMPORT_RE)) {
      const t = resolveLocal(abs, m[1] || m[2] || m[3]);
      if (t && !seen.has(t)) queue.push(t);
    }
  }
  return [...seen].map((abs) => toPosix(path.relative(REPO, abs))).sort();
}

function appRendererHash() {
  return hashFiles(appRendererFiles());
}

/** Throws unless tools/golden/web is there and made from today's code, pages, tool and fonts. */
function checkWebPictures(fontFiles) {
  const manifestFile = path.join(WEB, 'manifest.json');
  if (!fs.existsSync(manifestFile) || !fs.existsSync(path.join(WEB, 'pages.json'))) {
    throw new Error('There are no website pictures in tools/golden/web: run `npm test -- goldenPages` in mobile/ (or node renderWeb.mjs in tools/golden) first.');
  }
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const now = goldenFingerprint(fontFiles);
  const stale = [];
  if (now.renderer.hash !== manifest.fingerprint.renderer.hash) stale.push("the website's print code changed");
  if (now.tools.hash !== manifest.fingerprint.tools.hash) stale.push('the golden pages, the test photos or the tool changed');
  if (now.fonts !== manifest.fingerprint.fonts) stale.push('the font files changed (or fontTable.ts was read wrong)');
  if (stale.length) throw new Error(`The website pictures are out of date (${stale.join('; ')}): run \`npm test -- goldenPages\` in mobile/ first.`);
  return { manifest, now };
}

function main() {
  const fonts = bundledFontFiles();
  if (fonts.length < 1) throw new Error('fontTable.ts: no font files found');
  const fontPaths = fonts.map((f) => path.join(MOBILE, 'node_modules', f));
  for (const f of fontPaths) if (!fs.existsSync(f)) throw new Error(`font file missing: ${f} (run npm ci in mobile/)`);
  const { manifest, now } = checkWebPictures(fontPaths);
  const set = JSON.parse(fs.readFileSync(path.join(WEB, 'pages.json'), 'utf8'));

  const b64 = (file) => fs.readFileSync(file).toString('base64');
  const bundle = {
    madeFrom: {
      madeAt: manifest.madeAt, chromium: manifest.chromium, pagesSha256: manifest.pagesSha256,
      renderer: now.renderer.hash, tools: now.tools.hash, fonts: now.fonts,
    },
    appRenderer: appRendererHash(),
    photos: set.photos,
    photoFiles: manifest.photos.map((p) => {
      const bytes = fs.readFileSync(path.join(WEB, p.file));
      if (sha256(bytes) !== p.sha256) throw new Error(`${p.file} is not the photo the website drew`);
      return { file: p.file, sha256: p.sha256, base64: bytes.toString('base64') };
    }),
    fonts: fonts.map((file, i) => ({ file, base64: b64(fontPaths[i]) })),
    // The files the website served while it drew the pages (mask edges from
    // public/, the made-up corner art): the phone opens the very same bytes.
    assetFiles: (manifest.served || []).map((url) => {
      const made = (manifest.assets || []).find((a) => a.url === url);
      const file = made ? path.join(WEB, made.file) : path.join(REPO, 'public', url);
      if (!fs.existsSync(file)) throw new Error(`${url}: no file at ${file}`);
      return { url, base64: b64(file) };
    }),
    cases: set.cases.map((c) => {
      const w = manifest.cases.find((x) => x.name === c.name);
      if (!w) throw new Error(`${c.name} is in pages.json but not in manifest.json`);
      return { name: c.name, albumSize: c.albumSize, pageIndex: c.pageIndex, kind: c.kind, page: c.page, width: w.width, height: w.height, bare: !!w.bare };
    }),
  };
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, 'bundle.json');
  fs.writeFileSync(file, JSON.stringify(bundle));
  console.log(`${bundle.cases.length} golden pages, ${bundle.photoFiles.length} photos, ${bundle.fonts.length} fonts: ${toPosix(path.relative(MOBILE, file))} (${(fs.statSync(file).size / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`App renderer fingerprint ${bundle.appRenderer.slice(0, 12)} (${appRendererFiles().length} files)`);
}

module.exports = { appRendererFiles, appRendererHash, bundledFontFiles };

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
