/* ══════════════════════════════════════════════════════════════════════════
   canvasMeasurer, the 2.0 APP's copy (React Native).

   The app's bundler (Metro) and its type check (tsconfig moduleSuffixes
   [".native", ""]) pick this file over canvasMeasurer.ts. There is no
   browser canvas in the app, so the default measurer is none: textFit then
   says "can't measure" (null) instead of guessing. The app's album builder
   never relies on it: it hands textFit the app's own measurer (Skia's fonts)
   through its platform (shared/platform.ts BuilderPlatform.textMeasurer).
   Pure, so it is on the shared list (sharedModules.ts).
   ══════════════════════════════════════════════════════════════════════════ */

import type { TextMeasurer } from '../../shared/platform';

/** No default measurer in the app (see above). */
export function defaultMeasurer(): TextMeasurer | null {
  return null;
}
