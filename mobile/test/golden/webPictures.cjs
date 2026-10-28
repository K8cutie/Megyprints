/* ══════════════════════════════════════════════════════════════════════════
   THE WEBSITE PICTURES, MADE BEFORE THE GOLDEN TESTS RUN (jest globalSetup).

   The golden tests (goldenPages / goldenCovers / goldenMistakes) run side by
   side in jest's workers and all read tools/golden/web. So the pictures are
   checked once, before any worker starts: when they are missing, made by an
   older tool, or the website's print code, the golden pages, the tool or the
   fonts changed since (tools/golden/sources.cjs fingerprint), renderWeb.mjs
   makes them again here. Then tools/golden/out is emptied for this run's
   app pictures and diffs. A run that has no golden test in it does nothing.
   ══════════════════════════════════════════════════════════════════════════ */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const MOBILE = path.resolve(__dirname, '..', '..');
const REPO = path.resolve(MOBILE, '..');
const TOOL = path.join(REPO, 'tools', 'golden');
const WEB = path.join(TOOL, 'web');
const OUT = path.join(TOOL, 'out');
const { goldenFingerprint } = require(path.join(TOOL, 'sources.cjs'));
const { bundledFontFiles } = require(path.join(MOBILE, 'scripts', 'golden-phone-assets.cjs'));

/** Why the website pictures must be made again, or null when they are current. */
function goldenIsStale() {
  const manifestFile = path.join(WEB, 'manifest.json');
  if (!fs.existsSync(manifestFile) || !fs.existsSync(path.join(WEB, 'pages.json'))) return 'there are no website pictures yet';
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  if (!manifest.covers || !manifest.tiles) return 'the pictures were made by an older tool (no covers or tiles)';
  const now = goldenFingerprint(bundledFontFiles().map((f) => path.join(MOBILE, 'node_modules', f)));
  if (now.renderer.hash !== manifest.fingerprint.renderer.hash) return "the website's print code changed";
  if (now.tools.hash !== manifest.fingerprint.tools.hash) return 'the golden pages, the test photos or the tool changed';
  if (now.fonts !== manifest.fingerprint.fonts) return 'the font files changed';
  return null;
}

/** Make the website pictures when they are missing or out of date. */
function ensureWebPictures() {
  const why = goldenIsStale();
  if (!why) return;
  if (!fs.existsSync(path.join(TOOL, 'node_modules', 'playwright-core'))) {
    throw new Error(`The website pictures must be made again (${why}), but tools/golden has no packages: run "npm ci" in tools/golden, then the tests again.`);
  }
  console.log(`\nMaking the website pictures again (${why})…`);
  execFileSync(process.execPath, [path.join(TOOL, 'renderWeb.mjs')], { cwd: TOOL, stdio: 'inherit', timeout: 900_000 });
  const still = goldenIsStale();
  if (still) throw new Error(`renderWeb.mjs ran, but the pictures are still out of date: ${still}`);
}

/** Does this jest run include a golden test? (No path filter: yes.) */
function runsGolden(globalConfig) {
  const tp = globalConfig && globalConfig.testPathPatterns;
  let list = [];
  if (tp) list = Array.isArray(tp) ? tp : (tp.patterns || []);
  else if (globalConfig && globalConfig.testPathPattern) list = [globalConfig.testPathPattern];
  return list.length === 0 || list.some((p) => /golden/i.test(String(p)));
}

module.exports = async function globalSetup(globalConfig) {
  if (!runsGolden(globalConfig)) return;
  ensureWebPictures();
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
};
module.exports.goldenIsStale = goldenIsStale;
module.exports.ensureWebPictures = ensureWebPictures;
