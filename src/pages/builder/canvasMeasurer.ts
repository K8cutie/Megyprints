/* ══════════════════════════════════════════════════════════════════════════
   canvasMeasurer — measuring words with the browser's canvas, the WEBSITE's
   way of telling whether a caption fits its box (textFit.ts).

   Moved here unchanged from textFit.ts, so textFit (the fit arithmetic) is
   shared with the 2.0 app (src/shared/sharedModules.ts). In the app, Metro
   and its type check take canvasMeasurer.native.ts instead, which has no
   canvas; the app's album builder hands textFit its own measurer (Skia's
   fonts) through its platform (shared/platform.ts BuilderPlatform
   .textMeasurer), exactly as the website's builder hands in this one.
   ══════════════════════════════════════════════════════════════════════════ */

import type { TextMeasurer } from '../../shared/platform';

let shared: TextMeasurer | null | undefined;
/** The browser's text measurer (null without a canvas, e.g. under jsdom). */
export function defaultMeasurer(): TextMeasurer | null {
  if (shared !== undefined) return shared;
  try {
    shared = typeof document !== 'undefined' && !/jsdom/i.test(globalThis.navigator?.userAgent ?? '')
      ? document.createElement('canvas').getContext('2d')
      : null;
  } catch { shared = null; }
  return shared;
}
