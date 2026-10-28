/* ══════════════════════════════════════════════════════════════════════════
   THE APP'S LINES OF WORDS, next to the ones print really drew.

   tools/golden/webEntry.ts writes down every fillText the website's print
   renderer makes while it draws a golden page: the text, where, the
   transform, the font, the colour, the see-through, whether an outline was
   stroked and a shadow was on. Here the app's page plan gives the same for
   every line it draws, and the two lists must agree line for line: the same
   words broken at the same places, each drawn at the same spot (to 1/100
   px), as wide (to 1 px), in the same colour, outline and shadow. Nothing
   in the check works the lines out a second way: the website's side is
   print itself.
   ══════════════════════════════════════════════════════════════════════════ */
import { wrapTextLines, firstLineCenter, wordArtShadow, TEXT_LINE_HEIGHT } from '@web/pages/builder/wordArtRules';
import type { PagePlan } from '../../src/render/pagePlan';
import type { PageText } from '../../src/render/pageText';
import { MAX_LINE_POSITION_DIFF_PX, MAX_LINE_WIDTH_DIFF_PX, type Area } from './compare';

/** A line print drew (tools/golden/webEntry.ts DrawnLine). */
export interface WebLine {
  text: string; x: number; y: number; width: number;
  font: string; align: string; baseline: string; color: string; alpha: number;
  m: [number, number, number, number, number, number];
  outlined: boolean; shadow: string | null;
}

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
}

type Matrix = [number, number, number, number, number, number];
const apply = (m: Matrix, x: number, y: number) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });

/** A free text's transform: translate, rotate (degrees), scale (drawPage freeText). */
function freeMatrix(x: number, y: number, rotation: number, sx: number, sy: number): Matrix {
  const r = (rotation * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [c * sx, s * sx, -s * sy, c * sy, x, y];
}

const normColor = (c: string) => c.trim().toLowerCase().replace(/\s+/g, '');

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
    const base = {
      item: k, align: it.align, color: it.style.color || '#2D2D2D',
      alpha: it.kind === 'freeText' ? it.opacity / 100 : 1,
      outlined: !!(it.style.outlineWidth && it.style.outlineColor),
      shadow: !!wordArtShadow(it.style),
    };
    let lines: AppLine[];
    let zone: Area;
    const b = plan.bleed;
    if (it.kind === 'boxText') {
      const top = firstLineCenter(words.length, it.centerY, it.fontSize);
      lines = words.map((w, i) => ({ ...base, text: w, pageX: it.anchorX, pageY: top + i * step, width: text.measure(w, look) }));
      zone = { x: it.box.x + b, y: it.box.y + b, w: it.box.w, h: it.box.h };
    } else {
      const m = freeMatrix(it.x, it.y, it.rotation, it.scaleX, it.scaleY);
      lines = words.map((w, i) => {
        const p = apply(m, it.anchorX, step / 2 + i * step);
        return { ...base, text: w, pageX: p.x, pageY: p.y, width: text.measure(w, look) };
      });
      const pad = it.fontSize * 0.5;
      const corners = [[-pad, -pad], [it.boxWidth + pad, -pad], [-pad, words.length * step + pad], [it.boxWidth + pad, words.length * step + pad]]
        .map(([x, y]) => apply(m, x, y));
      const xs = corners.map((p) => p.x), ys = corners.map((p) => p.y);
      zone = { x: Math.min(...xs) + b, y: Math.min(...ys) + b, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    }
    out.push({ lines, zone });
    k++;
  }
  return out;
}

/** How the app's lines differ from print's (empty: they agree). */
export function lineFailures(app: AppLine[], web: WebLine[]): string[] {
  const out: string[] = [];
  if (app.length !== web.length) {
    out.push(`print drew ${web.length} lines, the app ${app.length}: ${JSON.stringify(web.map((l) => l.text))} vs ${JSON.stringify(app.map((l) => l.text))}`);
    return out;
  }
  app.forEach((a, i) => {
    const w = web[i];
    const at = apply(w.m, w.x, w.y);
    const tag = `line ${i + 1} "${w.text}"`;
    if (a.text !== w.text) out.push(`${tag}: the app drew "${a.text}"`);
    if (!(Math.abs(a.pageX - at.x) <= MAX_LINE_POSITION_DIFF_PX && Math.abs(a.pageY - at.y) <= MAX_LINE_POSITION_DIFF_PX)) {
      out.push(`${tag}: drawn at ${a.pageX.toFixed(3)}, ${a.pageY.toFixed(3)}, print at ${at.x.toFixed(3)}, ${at.y.toFixed(3)}`);
    }
    if (!(Math.abs(a.width - w.width) <= MAX_LINE_WIDTH_DIFF_PX)) out.push(`${tag}: ${a.width.toFixed(2)} px wide, print ${w.width.toFixed(2)}`);
    if (a.align !== w.align) out.push(`${tag}: aligned ${a.align}, print ${w.align}`);
    if (normColor(a.color) !== normColor(w.color)) out.push(`${tag}: colour ${a.color}, print ${w.color}`);
    if (Math.abs(a.alpha - w.alpha) > 1e-6) out.push(`${tag}: see-through ${a.alpha}, print ${w.alpha}`);
    if (a.outlined !== w.outlined) out.push(`${tag}: outline ${a.outlined}, print ${w.outlined}`);
    if (a.shadow !== !!w.shadow) out.push(`${tag}: shadow ${a.shadow}, print ${w.shadow}`);
  });
  return out;
}
