/* The golden test pages, when this build has them (goldenPages.js): a build
   made with `build-android.ps1 -GoldenPages` carries golden-phone/bundle.json
   under the module name 'megy-golden-pages'; every other build gets `null`,
   and the debug screen and its link stay hidden. */
import type { GoldenBundle } from './goldenRun';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bundled = require('megy-golden-pages') as GoldenBundle | null;

export const goldenBundle: GoldenBundle | null =
  bundled && typeof bundled === 'object' && Array.isArray(bundled.cases) ? bundled : null;
