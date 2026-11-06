/* ══════════════════════════════════════════════════════════════════════════
   THE LINES OF WORDS A PAGE PLAN DRAWS, and each text's box.

   For every text on the page (a caption, a text in a photo frame, a free
   text), in drawing order: each line as drawPage.ts draws it (the same wrap,
   the same measurer, the same anchor), already on the page in print px, and
   the box its ink stays in (print-file px, bleed included).

   The golden check holds these lines to the ones the website's print
   renderer really drew (test/golden/words.ts lineFailures), and uses the
   boxes to tell each text's ink apart from the rest of the page. It lives
   with the renderer, not the test, because the same lines are worked out on
   the phone too (src/dev/goldenRun.ts): there the measuring is the phone's
   own Skia, which is exactly what the on-phone golden run has to prove.
   ══════════════════════════════════════════════════════════════════════════ */
import { curveCentreX, curveGlyphs, wrapTextLines, firstLineCenter, wordArtShadow, TEXT_LINE_HEIGHT, WORDART_GLOW_PASSES } from '@web/pages/builder/wordArtRules';
import type { PagePlan } from './pagePlan';
import type { PageText } from './pageText';

export interface Area { x: number; y: number; w: number; h: number }

/** A line the app draws, already on the page (print px, no bleed). */
export interface AppLine {
  item: number;
  text: string;
  /** Where the line's anchor lands on the page. */
  pageX: number;
  pageY: number;
  width: number;
  align: string;
  color: string;
  alpha: number;
  outlined: boolean;
  shadow: boolean;
  /** A letter on a curve: where it sits comes from measured widths. */
  onCurve?: boolean;
}

export type Matrix = [number, number, number, number, number, number];
export const applyMatrix = (m: Matrix, x: number, y: number) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });

/** A free text's transform: translate, rotate (degrees), scale (drawPage freeText). */
function freeMatrix(x: number, y: number, rotation: number, sx: number, sy: number): Matrix {
  const r = (rotation * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [c * sx, s * sx, -s * sy, c * sy, x, y];
}

export interface TextItemLines { lines: AppLine[]; zone: Area }

/** Every text on the page, in drawing order: its lines and its box (print-file
 *  px, bleed included; a free text's turned and stretched box, padded half a
 *  font size round). */
export function appWords(plan: PagePlan, text: PageText): TextItemLines[] {
  const out: TextItemLines[] = [];
  let k = 0;
  for (const it of plan.items) {
    if (it.kind !== 'boxText' && it.kind !== 'freeText') continue;
    const look = { family: it.style.fontFamily, size: it.fontSize, bold: it.style.bold, italic: it.style.italic };
    const words = wrapTextLines(text.measurer(look), it.style.text, it.kind === 'boxText' ? it.maxWidth : it.boxWidth);
    const step = it.fontSize * TEXT_LINE_HEIGHT;
    const plainColor = it.style.color || '#2D2D2D';
    const base = {
      item: k, align: it.align, color: it.style.fillTo ? 'gradient' : plainColor,
      alpha: it.kind === 'freeText' ? it.opacity / 100 : 1,
      outlined: !!(it.style.outlineWidth && it.style.outlineColor),
      shadow: !!wordArtShadow(it.style, plan.onCover),
    };
    let lines: AppLine[];
    let zone: Area;
    const b = plan.bleed;
    if (it.kind === 'boxText' && it.source === 'caption' && it.style.curve) {
      // Each letter, as drawPage draws them: with no outline the shadow is cast
      // by a pass of its own, under the fills.
      const curve = curveGlyphs(it.style.text, text.measurer(look), it.fontSize, it.style.curve);
      const cx = curveCentreX(it.anchorX, it.align, curve.width);
      const letters = (over: Partial<AppLine>): AppLine[] => curve.glyphs.map((g) => ({
        ...base, align: 'center', onCurve: true, text: g.text, pageX: cx + g.x, pageY: it.centerY + g.y, width: text.measure(g.text, look), ...over,
      }));
      const casts = it.style.glow ? WORDART_GLOW_PASSES : 1;
      lines = base.shadow && !base.outlined
        ? [...Array.from({ length: casts }, () => letters({ color: plainColor, shadow: true })).flat(), ...letters({ shadow: false })]
        : letters({});
      const pad = it.fontSize;
      const W = plan.width + 2 * b, H = plan.height + 2 * b;
      const left = Math.max(0, cx - curve.width / 2 - pad + b), top = Math.max(0, it.centerY - curve.height / 2 - pad + b);
      zone = { x: left, y: top, w: Math.min(W, cx + curve.width / 2 + pad + b) - left, h: Math.min(H, it.centerY + curve.height / 2 + pad + b) - top };
    } else if (it.kind === 'boxText') {
      const top = firstLineCenter(words.length, it.centerY, it.fontSize);
      // A glow with no outline: each line is drawn once for each time it is cast.
      const casts = it.style.glow && !base.outlined ? WORDART_GLOW_PASSES : 1;
      lines = words.flatMap((w, i) => Array.from({ length: casts }, () => ({ ...base, text: w, pageX: it.anchorX, pageY: top + i * step, width: text.measure(w, look) })));
      zone = { x: it.box.x + b, y: it.box.y + b, w: it.box.w, h: it.box.h };
    } else {
      const m = freeMatrix(it.x, it.y, it.rotation, it.scaleX, it.scaleY);
      lines = words.map((w, i) => {
        const p = applyMatrix(m, it.anchorX, step / 2 + i * step);
        return { ...base, text: w, pageX: p.x, pageY: p.y, width: text.measure(w, look) };
      });
      const pad = it.fontSize * 0.5;
      const corners = [[-pad, -pad], [it.boxWidth + pad, -pad], [-pad, words.length * step + pad], [it.boxWidth + pad, words.length * step + pad]]
        .map(([x, y]) => applyMatrix(m, x, y));
      const xs = corners.map((p) => p.x), ys = corners.map((p) => p.y);
      zone = { x: Math.min(...xs) + b, y: Math.min(...ys) + b, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    }
    out.push({ lines, zone });
    k++;
  }
  return out;
}
