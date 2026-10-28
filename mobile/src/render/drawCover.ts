/* ══════════════════════════════════════════════════════════════════════════
   DRAW THE COVER FILE with Skia, from its plan (coverPlan.ts): the flat wrap
   at 300 DPI, the way the website's drawCoverWrap draws it before the cover
   file is made from it.

   Every step is drawn with the page renderer's own pieces: the front page is
   PageDrawer.renderTrim of its coverMode plan (the same drawing as an inside
   page), copied into its panel and mirrored past its trim with the same
   mirror maths as a page's bleed (bleedGeometry mirrorOps); the words are
   PageText.drawLine at scale 1 (cover words are sized in wrap px), the
   spine's line turned up the spine about its centre.
   ══════════════════════════════════════════════════════════════════════════ */

import type { SkCanvas, SkImage, Skia } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import { ClipOp } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import type { PageDrawer, AssetSource, PhotoSource } from './drawPage';
import type { PageText, TextLook } from './pageText';
import type { CoverLine, CoverPlan } from './coverPlan';
import { appWords, applyMatrix, type AppLine, type Area, type Matrix, type TextItemLines } from './pageWords';
import { wordArtShadow } from '@web/pages/builder/wordArtRules';

export interface CoverDrawOptions {
  /** Draw the cover's words (default). false: the wrap under them. */
  words?: boolean;
  assets?: AssetSource;
  onMissing?: (src: string) => void;
}

const lookOf = (l: CoverLine): TextLook => ({ family: l.style.fontFamily, size: l.style.fontSize || 24, bold: l.style.bold, italic: l.style.italic });

/** The transform a cover line is drawn under (a turned spine line). */
function lineMatrix(l: CoverLine): Matrix {
  if (!l.turn) return [1, 0, 0, 1, 0, 0];
  const r = (l.turn.deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [c, s, -s, c, l.turn.cx, l.turn.cy];
}

export class CoverDrawer {
  constructor(private readonly Skia: Skia, private readonly text: PageText, private readonly pages: PageDrawer) {}

  private line(canvas: SkCanvas, l: CoverLine): void {
    canvas.save();
    if (l.turn) {
      canvas.translate(l.turn.cx, l.turn.cy);
      canvas.rotate(l.turn.deg, 0, 0);
    }
    this.text.drawLine(canvas, l.text, l.x, l.y, lookOf(l), l.align, l.style, 1);
    canvas.restore();
  }

  private photo(canvas: SkCanvas, img: SkImage, r: { x: number; y: number; w: number; h: number }): void {
    const s = Math.max(r.w / img.width(), r.h / img.height());
    const dw = img.width() * s, dh = img.height() * s;
    canvas.save();
    canvas.clipRect(this.Skia.XYWHRect(r.x, r.y, r.w, r.h), ClipOp.Intersect, true);
    this.pages.drawPicture(canvas, img, { x: r.x + (r.w - dw) / 2, y: r.y + (r.h - dh) / 2, w: dw, h: dh }, true);
    canvas.restore();
  }

  /** The wrap onto `canvas` (plan.width × plan.height). */
  draw(canvas: SkCanvas, plan: CoverPlan, photos: PhotoSource, options: CoverDrawOptions = {}): void {
    // One drawing for the whole wrap: the front page's photos are prepared
    // once for its two drawings (with and without words), freed at the end.
    this.pages.drawing(() => this.steps(canvas, plan, photos, options));
  }

  private steps(canvas: SkCanvas, plan: CoverPlan, photos: PhotoSource, { words = true, assets = () => null, onMissing }: CoverDrawOptions): void {
    for (const step of plan.steps) {
      switch (step.kind) {
        case 'fill': {
          const p = this.Skia.Paint();
          p.setAntiAlias(true);
          p.setColor(this.Skia.Color(step.color));
          canvas.drawRect(this.Skia.XYWHRect(step.rect.x, step.rect.y, step.rect.w, step.rect.h), p);
          break;
        }
        case 'line':
          if (words) this.line(canvas, step.line);
          break;
        case 'front': {
          // Print's cover file: in the panel, the front page with its words
          // (the page under them, its word patches on top); past the trim,
          // the page UNDER its words, mirrored (drawMirroredEdges mirrors
          // the bare page; the patches cover the panel only). So a title
          // near the edge never shows again in the turn-in or the bleed.
          const hasWords = step.plan.items.some((it) => it.kind === 'boxText' || it.kind === 'freeText');
          const bare = this.pages.renderTrim(step.plan, photos, { words: false, assets, onMissing });
          const full = words && hasWords ? this.pages.renderTrim(step.plan, photos, { words: true, assets, onMissing }) : bare;
          this.pages.drawPicture(canvas, full, step.rect);
          this.pages.mirrorEdges(canvas, bare, step.rect, step.mirror);
          if (full !== bare) full.dispose();
          bare.dispose();
          break;
        }
        case 'photo': {
          const img = 'photo' in step.image ? photos(step.image.photo) : assets(step.image.src);
          if (!img && 'src' in step.image) onMissing?.(step.image.src);
          if (img) this.photo(canvas, img, step.rect);
          break;
        }
      }
    }
  }

  /** The wrap as a picture (the cover file's picture before it is JPEG'd).
   *  The caller disposes it. */
  render(plan: CoverPlan, photos: PhotoSource, options: CoverDrawOptions = {}): SkImage {
    // On the page drawer's surfaces (kept for reuse: surfaces.ts says why).
    const d = this.pages.surfaces.take(plan.width, plan.height);
    this.draw(d.canvas, plan, photos, options);
    return this.pages.surfaces.snapshot(d);
  }
}

/** Every text on the cover, in drawing order: its lines (on the wrap, wrap
 *  px) and the box its ink stays in. The front page's texts come from its
 *  own plan (pageWords.appWords), moved onto its panel. */
export function appCoverWords(plan: CoverPlan, text: PageText): TextItemLines[] {
  const out: TextItemLines[] = [];
  let group: { id: number; lines: AppLine[]; zone: Area } | null = null;
  const flush = () => { if (group) out.push({ lines: group.lines, zone: group.zone }); group = null; };
  for (const step of plan.steps) {
    if (step.kind === 'front') {
      flush();
      const kx = step.rect.w / step.plan.width, ky = step.rect.h / step.plan.height;
      const b = step.plan.bleed;
      for (const t of appWords(step.plan, text)) {
        out.push({
          lines: t.lines.map((l) => ({ ...l, item: out.length, pageX: step.rect.x + l.pageX * kx, pageY: step.rect.y + l.pageY * ky })),
          zone: { x: step.rect.x + (t.zone.x - b) * kx, y: step.rect.y + (t.zone.y - b) * ky, w: t.zone.w * kx, h: t.zone.h * ky },
        });
      }
      continue;
    }
    if (step.kind !== 'line') continue;
    const l = step.line;
    if (!group || group.id !== l.textIndex) {
      flush();
      group = { id: l.textIndex, lines: [], zone: zoneOf(l, text) };
    }
    const look = lookOf(l);
    const at = applyMatrix(lineMatrix(l), l.x, l.y);
    group.lines.push({
      item: out.length, text: l.text, pageX: at.x, pageY: at.y, width: text.measure(l.text, look), align: l.align,
      color: l.style.color || '#2D2D2D', alpha: 1, outlined: !!(l.style.outlineWidth && l.style.outlineColor),
      shadow: !!wordArtShadow(l.style, false),
    });
  }
  flush();
  return out;
}

/** Where a cover text's ink stays: its box padded by half its font size;
 *  the spine's turned line, its own measured box turned and padded. */
function zoneOf(l: CoverLine, text: PageText): Area {
  const f = l.style.fontSize || 24, pad = f * 0.5;
  if (!l.turn) return { x: l.box.x - pad, y: l.box.y - pad, w: l.box.w + 2 * pad, h: l.box.h + 2 * pad };
  const w = text.measure(l.text, lookOf(l));
  const m = lineMatrix(l);
  const corners = [[-w / 2 - pad, -f - pad], [w / 2 + pad, -f - pad], [-w / 2 - pad, f + pad], [w / 2 + pad, f + pad]].map(([x, y]) => applyMatrix(m, x, y));
  const xs = corners.map((p) => p.x), ys = corners.map((p) => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}
