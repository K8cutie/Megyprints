/* ══════════════════════════════════════════════════════════════════════════
   THE APP'S LINES OF WORDS, next to the ones print really drew.

   tools/golden/webEntry.ts writes down every fillText the website's print
   renderer makes while it draws a golden page: the text, where, the
   transform, the font, the colour, the see-through, whether an outline was
   stroked and a shadow was on. The app's page plan gives the same for every
   line it draws (src/render/pageWords.ts appWords: the renderer's own code,
   so the phone works its lines out the same way, with its own Skia), and the
   two lists must agree line for line: the same words broken at the same
   places, each drawn at the same spot (to 1/100 px), as wide (to 1 px), in
   the same colour, outline and shadow. Nothing in the check works the lines
   out a second way: the website's side is print itself.
   ══════════════════════════════════════════════════════════════════════════ */
import { applyMatrix, type AppLine, type Matrix } from '../../src/render/pageWords';
import { MAX_LINE_POSITION_DIFF_PX, MAX_LINE_WIDTH_DIFF_PX } from './compare';

export { appWords, type AppLine, type TextItemLines } from '../../src/render/pageWords';

/** A line print drew (tools/golden/webEntry.ts DrawnLine). */
export interface WebLine {
  text: string; x: number; y: number; width: number;
  font: string; align: string; baseline: string; color: string; alpha: number;
  m: Matrix;
  outlined: boolean; shadow: string | null;
}

/** A line print drew, and the size of the canvas it drew it on (the wrap,
 *  or the cover's front page drawn on its own canvas). */
export interface WebLineOn extends WebLine { canvas: [number, number] }

/** Print's lines on a cover, all on the wrap (W x H): a line drawn on the
 *  front page's own canvas is moved onto the front panel `front` (as the
 *  page is). */
export function coverWebLines(lines: WebLineOn[], W: number, H: number, front: { x: number; y: number; w: number; h: number } | null): WebLine[] {
  return lines.map((l) => {
    if (l.canvas[0] === W && l.canvas[1] === H) return l;
    if (!front) throw new Error('a line drawn off the wrap, and the cover has no front page');
    const kx = front.w / l.canvas[0], ky = front.h / l.canvas[1];
    const [a, b, c, d, e, f] = l.m;
    return { ...l, m: [a * kx, b * ky, c * kx, d * ky, e * kx + front.x, f * ky + front.y] as WebLine['m'] };
  });
}

const normColor = (c: string) => c.trim().toLowerCase().replace(/\s+/g, '');

/** How the app's lines differ from print's (empty: they agree). */
export function lineFailures(app: AppLine[], web: WebLine[]): string[] {
  const out: string[] = [];
  if (app.length !== web.length) {
    out.push(`print drew ${web.length} lines, the app ${app.length}: ${JSON.stringify(web.map((l) => l.text))} vs ${JSON.stringify(app.map((l) => l.text))}`);
    return out;
  }
  app.forEach((a, i) => {
    const w = web[i];
    const at = applyMatrix(w.m, w.x, w.y);
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
