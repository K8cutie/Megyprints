/* What the website's caption-fit answers (web-fit/textfit.json) were made
   from, so the app's test knows when to make them again: the website's
   textFit.ts and canvasMeasurer.ts with every website file they import, the
   fit cases (and the golden pages they borrow), the tools, the font files.
   Line endings are ignored, nothing else is (as sources.cjs). */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { REPO_ROOT, hashFiles } = require('./sources.cjs');

const ENTRIES = ['src/pages/builder/textFit.ts', 'src/pages/builder/canvasMeasurer.ts', 'tools/golden/fitCases.ts'];
const TOOL_FILES = ['tools/golden/fitEntry.ts', 'tools/golden/fitWeb.mjs', 'tools/golden/fitSources.cjs', 'mobile/src/render/fontTable.ts'];
const IMPORT_RE = /\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|\bimport\s+['"]([^'"]+)['"]/g;
const toPosix = (p) => p.split(path.sep).join('/');

function resolveLocal(fromRel, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(REPO_ROOT, path.dirname(fromRel), spec);
  for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
    if (/\.(ts|tsx)$/.test(c) && fs.existsSync(c) && fs.statSync(c).isFile()) return toPosix(path.relative(REPO_ROOT, c));
  }
  return null;
}

function fitSources() {
  const seen = new Set();
  const queue = [...ENTRIES];
  while (queue.length) {
    const rel = queue.shift();
    if (seen.has(rel)) continue;
    seen.add(rel);
    const text = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    for (const m of text.matchAll(IMPORT_RE)) {
      const target = resolveLocal(rel, m[1] || m[2] || m[3]);
      if (target && !seen.has(target)) queue.push(target);
    }
  }
  return [...seen].sort();
}

function fitFingerprint(fontFiles) {
  const fonts = crypto.createHash('sha256');
  for (const f of fontFiles) fonts.update(fs.readFileSync(f));
  return { sources: hashFiles(fitSources()), tools: hashFiles(TOOL_FILES), fonts: fonts.digest('hex') };
}

module.exports = { REPO_ROOT, fitSources, fitFingerprint };
