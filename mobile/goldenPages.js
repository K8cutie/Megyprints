/* ══════════════════════════════════════════════════════════════════════════
   THE GOLDEN PAGES IN A TEST BUILD (read by metro.config.js).

   The debug screen src/app/golden-pages.tsx draws the 45 golden pages on the
   phone. Their data, test photos and font files (about 8 MB) go into a build
   only when it is made for that on purpose:

       scripts\build-android.ps1 -Variant release -GoldenPages

   which runs scripts/golden-phone-assets.cjs (writes golden-phone/bundle.json,
   not in git) and sets MEGY_GOLDEN_PAGES=1 for Metro. Then the module name
   'megy-golden-pages' is that file. In every other build (and in jest) it is
   src/dev/noGoldenPages.json, which is just `null`, so a customer build never
   carries the test pages and never shows the screen's link.
   ══════════════════════════════════════════════════════════════════════════ */
const fs = require('node:fs');
const path = require('node:path');

const GOLDEN_MODULE = 'megy-golden-pages';
const BUNDLE_FILE = path.join(__dirname, 'golden-phone', 'bundle.json');
const NO_BUNDLE_FILE = path.join(__dirname, 'src', 'dev', 'noGoldenPages.json');

/** The file 'megy-golden-pages' stands for in this build. */
function goldenModuleFile(env = process.env, bundleFile = BUNDLE_FILE) {
  if (env.MEGY_GOLDEN_PAGES !== '1') return NO_BUNDLE_FILE;
  if (!fs.existsSync(bundleFile)) {
    throw new Error(`MEGY_GOLDEN_PAGES=1 but ${bundleFile} is missing: run node scripts/golden-phone-assets.cjs first.`);
  }
  return bundleFile;
}

module.exports = { GOLDEN_MODULE, BUNDLE_FILE, NO_BUNDLE_FILE, goldenModuleFile };
