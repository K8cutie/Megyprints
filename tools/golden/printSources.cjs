/* ══════════════════════════════════════════════════════════════════════════
   WHAT THE WEBSITE'S PRINT FILES (print-web/) WERE MADE FROM, so the app's
   print-file check (mobile/test/printFiles.check.ts) makes them again when
   they are out of date: the albums (printAlbums.ts and what it imports),
   the website code printWebEntry.ts runs (the checkout's print and cover
   files, the console's sheets and zip, and every website file those import),
   how Chromium is driven, and the font table the fonts come from. Line
   endings are ignored (sources.cjs hashFiles).
   ══════════════════════════════════════════════════════════════════════════ */
const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT, hashFiles } = require('./sources.cjs');

const ENTRIES = ['tools/golden/printWebEntry.ts', 'tools/golden/printAlbums.ts'];
const TOOL_FILES = ['tools/golden/printWeb.mjs', 'tools/golden/printSources.cjs', 'mobile/src/render/fontTable.ts'];
const IMPORT_RE = /\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|\bimport\s+['"]([^'"]+)['"]/g;
const toPosix = (p) => p.split(path.sep).join('/');

function resolveLocal(fromRel, spec) {
  if (!spec.startsWith('.')) return null; // an npm package
  const base = path.resolve(REPO_ROOT, path.dirname(fromRel), spec.replace(/\?url$/, ''));
  for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
    if (/\.(ts|tsx)$/.test(c) && fs.existsSync(c) && fs.statSync(c).isFile()) return toPosix(path.relative(REPO_ROOT, c));
  }
  return null;
}

/** The entries and every local file they import, all the way down. */
function printSources() {
  const seen = new Set();
  const queue = [...ENTRIES];
  while (queue.length) {
    const rel = queue.shift();
    if (seen.has(rel)) continue;
    seen.add(rel);
    for (const m of fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8').matchAll(IMPORT_RE)) {
      const target = resolveLocal(rel, m[1] || m[2] || m[3]);
      if (target && !seen.has(target)) queue.push(target);
    }
  }
  return [...seen].sort();
}

function printFingerprint() {
  const files = [...printSources(), ...TOOL_FILES];
  return { hash: hashFiles(files), files: files.length };
}

module.exports = { printFingerprint };
