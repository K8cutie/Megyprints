/* ══════════════════════════════════════════════════════════════════════════
   WHAT THE GOLDEN PICTURES WERE MADE FROM, so the app's test can tell when
   they are out of date.

   The website pictures in tools/golden/web are the website's print renderer
   at one moment. If printPipeline.ts, or any file it pulls in (templates,
   margins, the photo fit, the word wrap…), changes after that, the pictures
   no longer show what the website prints today, and comparing the app
   against them would prove nothing. So renderWeb.mjs writes a fingerprint
   of those files (and of the test photos and fonts) into manifest.json, and
   mobile/test/goldenPages.test.ts stops with "re-make the golden pictures"
   when the fingerprint no longer matches.

   Line endings are ignored (a Windows checkout has CRLF), nothing else is.
   ══════════════════════════════════════════════════════════════════════════ */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ENTRY = 'src/pages/builder/printPipeline.ts';
/** Also part of the pictures: the test photos and the page set. */
const TOOL_FILES = ['tools/golden/syntheticPhotos.ts', 'tools/golden/goldenPages.ts', 'tools/golden/webEntry.ts'];

const toPosix = (p) => p.split(path.sep).join('/');

function resolveLocal(fromRel, spec) {
  let base;
  if (spec.startsWith('@/')) base = path.join(REPO_ROOT, 'src', spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(REPO_ROOT, path.dirname(fromRel), spec);
  else return null; // an npm package
  for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
    if (/\.(ts|tsx)$/.test(c) && fs.existsSync(c) && fs.statSync(c).isFile()) return toPosix(path.relative(REPO_ROOT, c));
  }
  return null;
}

const IMPORT_RE = /\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|\bimport\s+['"]([^'"]+)['"]/g;

/** printPipeline.ts and every website file it imports, all the way down. */
function rendererSources() {
  const seen = new Set();
  const queue = [ENTRY];
  while (queue.length) {
    const rel = queue.shift();
    if (seen.has(rel)) continue;
    seen.add(rel);
    const text = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    for (const m of text.matchAll(IMPORT_RE)) {
      const spec = m[1] || m[2] || m[3];
      const target = resolveLocal(rel, spec);
      if (target && !seen.has(target)) queue.push(target);
    }
  }
  return [...seen].sort();
}

function fileText(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
}

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/** One fingerprint over files (path + text, line endings ignored). */
function hashFiles(files) {
  const h = crypto.createHash('sha256');
  for (const f of files) h.update(`${f}\n${fileText(f)}\n`);
  return h.digest('hex');
}

/** The fingerprint of everything the golden pictures depend on. */
function goldenFingerprint(fontFiles) {
  const renderer = rendererSources();
  const tools = TOOL_FILES;
  const fonts = crypto.createHash('sha256');
  for (const f of fontFiles) fonts.update(fs.readFileSync(f));
  return {
    renderer: { hash: hashFiles(renderer), files: renderer },
    tools: { hash: hashFiles(tools), files: tools },
    fonts: fonts.digest('hex'),
  };
}

module.exports = { REPO_ROOT, rendererSources, hashFiles, sha256, goldenFingerprint };
