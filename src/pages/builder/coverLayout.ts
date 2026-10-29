/* ═══════════════════════════════════════════════════════════════════════════
   coverLayout.ts — the SINGLE shared layout for the cover wrap.
   ───────────────────────────────────────────────────────────────────────────
   Both cover renderers consume this: the DOM preview (CoverWrapPreview) and the
   print canvas (renderCoverWrapForPrint). Computing WHERE every element goes in
   exactly one place is what keeps "what you design" identical to "what prints" —
   the same discipline the three page renderers follow. Each consumer only
   differs in HOW it paints (CSS vs canvas), never in the geometry.

   All rects are in WRAP-PX (the 300-DPI flat-wrap space from coverGeometry).
   The DOM preview multiplies by a display scale; print draws at full px.
   ═══════════════════════════════════════════════════════════════════════════ */

/* Everything that needs no browser (the layout, the spine and the reserved
   back derived from the front page, a cover text's lines) lives in
   coverLayoutRules.ts, which the 2.0 app shares; re-exported here. This file
   adds the browser's own text measure, the default the website's spine fit
   uses, so the website imports coverLayout.ts exactly as before. */
export * from './coverLayoutRules';
import { deriveSpine as deriveSpineWith, fitSpineLine as fitSpineLineWith, type SpineInfo, type SpineMeasure } from './coverLayoutRules';
import type { AlbumPage, TextStyle } from './types';
import type { CoverWrapGeometry } from './coverGeometry';

let measureCtx: CanvasRenderingContext2D | null | undefined;
/** The canvas's own measure (the print canvas draws the spine with the same
 *  font string); an estimate where there is no canvas. */
export const measureSpineText: SpineMeasure = (text, style, fontSize) => {
  if (measureCtx === undefined) {
    try {
      measureCtx = typeof document !== 'undefined' && !/jsdom/i.test(globalThis.navigator?.userAgent ?? '')
        ? document.createElement('canvas').getContext('2d')
        : null;
    } catch { measureCtx = null; }
  }
  if (measureCtx) {
    measureCtx.font = `${style.italic ? 'italic' : 'normal'} ${style.bold ? 'bold' : 'normal'} ${fontSize}px ${style.fontFamily || 'serif'}`;
    return measureCtx.measureText(text).width;
  }
  return Array.from(text).length * fontSize * 0.62;
};

/** The spine line (coverLayoutRules.fitSpineLine), measured by this browser
 *  unless told otherwise. */
export function fitSpineLine(
  title: string, style: TextStyle, max: number, min: number, length: number,
  measure: SpineMeasure = measureSpineText,
): { text: string; fontSize: number; shortened: boolean } {
  return fitSpineLineWith(title, style, max, min, length, measure);
}

/** The spine derived from the front cover page (coverLayoutRules.deriveSpine),
 *  measured by this browser unless told otherwise. */
export function deriveSpine(front: AlbumPage, g: CoverWrapGeometry, measure: SpineMeasure = measureSpineText): SpineInfo {
  return deriveSpineWith(front, g, measure);
}
