/* ══════════════════════════════════════════════════════════════════════════
   MEASURING CAPTION WORDS IN THE APP (shared/platform.ts TextMeasurer).

   The album builder asks whether a caption fits its box (textFit.ts, shared
   code: "Too long for this box", "Make it fit (size 22)", a new caption made
   smaller to fit). On the website the browser's canvas measures the words;
   here the page renderer's own Skia fonts do (render/pageText.ts PageText),
   so the size the builder picks is the size the app's pages draw.

   Shaped like a canvas: set `font` to a CSS font ('italic bold 24px "DM
   Sans", serif'), read measureText(text).width. PageText measures the way
   Chromium's canvas does (each word and space shaped on its own). The
   golden check holds those widths to Chromium's; test/textMeasurer.test.ts
   holds textFit's answers with this measurer to the website's own answers
   in Chromium for the golden captions.

   A font the app does not bundle (Georgia, the default caption font, and 70
   others) is measured in the phone's fallback for its family list, as the
   page renderer draws it (render/fontTable.ts). The website measures those
   in the browser's own font, so for them the two can differ.
   ══════════════════════════════════════════════════════════════════════════ */
import type { TextMeasurer } from '@web/shared/platform';
import type { PageText, TextLook } from '../render/pageText';

const STYLE = /^(normal|italic|oblique)$/i;
const WEIGHT = /^(normal|bold|bolder|lighter|[1-9]00)$/i;
const SIZE = /^(\d+(?:\.\d+)?)px(?:\/\S+)?$/i;

/** A CSS font string, as textFit writes it, as the renderer's TextLook.
 *  'italic bold 24px "DM Sans", serif' → { family: '"DM Sans", serif', size: 24, bold, italic }. */
export function parseCssFont(font: string): TextLook {
  const parts = font.trim().split(/\s+/);
  let italic = false;
  let bold = false;
  let size = 10; // the canvas default, '10px sans-serif'
  let i = 0;
  for (; i < parts.length; i++) {
    const p = parts[i];
    const m = SIZE.exec(p);
    if (m) { size = Number(m[1]); i++; break; }
    // 'normal' can stand for the style or the weight ('italic normal 24px'):
    // it changes neither, so an italic before it stays italic.
    if (/^normal$/i.test(p)) continue;
    if (STYLE.test(p)) italic = true;
    else if (WEIGHT.test(p)) bold = /^bold(er)?$/i.test(p) || (/^\d+$/.test(p) && Number(p) >= 600);
    // 'small-caps', 'normal' stretch: no effect on what the app draws
  }
  const family = parts.slice(i).join(' ') || 'sans-serif';
  return { family, size, bold, italic };
}

/** A canvas-shaped measurer on the page renderer's fonts. */
export function skiaTextMeasurer(text: PageText): TextMeasurer {
  let font = '10px sans-serif';
  let look = parseCssFont(font);
  return {
    get font() { return font; },
    set font(v: string) { font = v; look = parseCssFont(v); },
    measureText: (s: string) => ({ width: text.measure(s, look) }),
  };
}
