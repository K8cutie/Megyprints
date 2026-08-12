import type { CSSProperties } from 'react';

// ──────────────────────────────────────────────────────────────────────────
// WordArt text effects — outline + soft shadow — shared by ALL THREE text
// renderers (BuilderPreview DOM, useCanvasEngine Fabric, printPipeline canvas)
// so a styled caption looks identical everywhere. Widths/offsets are in DESIGN
// px; each renderer multiplies by the same factor it scales fontSize by.
// ──────────────────────────────────────────────────────────────────────────

export interface WordArtStyle {
  outlineColor?: string;
  outlineWidth?: number; // design px; 0/undefined = no outline
  shadow?: boolean;
}

/** Outline width (design px) the editor's Outline toggle applies. */
export const WORDART_OUTLINE_WIDTH = 3;

/** Soft drop-shadow geometry in DESIGN px (scaled per renderer). */
export const WORDART_SHADOW = { color: 'rgba(0,0,0,0.38)', offsetX: 0, offsetY: 2, blur: 3 };

export const hasWordArt = (s: WordArtStyle): boolean =>
  !!s.shadow || !!(s.outlineWidth && s.outlineColor);

/** Pick a contrasting outline color for a fill (dark fills → white, light → ink). */
export function contrastOutline(fill: string): string {
  const hex = (fill || '').replace('#', '');
  if (hex.length < 6) return '#FFFFFF';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#2D2D2D' : '#FFFFFF';
}

/** Extra CSS for a DOM text node. `scale` = the factor the node's fontSize is
 *  multiplied by (so outline/shadow track the on-screen text size). */
export function wordArtDomStyle(s: WordArtStyle, scale: number): CSSProperties {
  const css: CSSProperties = {};
  if (s.outlineWidth && s.outlineColor) {
    (css as any).WebkitTextStrokeWidth = `${s.outlineWidth * scale}px`;
    (css as any).WebkitTextStrokeColor = s.outlineColor;
    (css as any).paintOrder = 'stroke fill';
  }
  if (s.shadow) {
    const { offsetX, offsetY, blur, color } = WORDART_SHADOW;
    css.textShadow = `${offsetX * scale}px ${offsetY * scale}px ${blur * scale}px ${color}`;
  }
  return css;
}

/** Line spacing used by every renderer. The DOM preview hardcodes 1.25, so the
 *  print path must wrap at the same rhythm or a two-line caption sits at a
 *  different height on paper than it does on screen. */
export const TEXT_LINE_HEIGHT = 1.25;

/** Caption alignment resolution — the ELEMENT's own choice wins over the
 *  template slot's default, in ALL THREE renderers. (Print used to resolve
 *  template-first on interior pages, so a left-aligned caption printed centered
 *  on any template that declares ts.align.) */
export function resolveTextSlotAlign(
  element: { alignment?: 'left' | 'center' | 'right' } | null | undefined,
  slot: { align?: 'left' | 'center' | 'right' } | null | undefined,
): 'left' | 'center' | 'right' {
  return element?.alignment ?? slot?.align ?? 'center';
}

/** Free-text wrap width in DESIGN px — the DOM preview's box model, shared with
 *  print so both wrap a title/quote at the same width. (The Fabric editor keeps
 *  a 100px usability floor so a short text stays grabbable — that floor only
 *  differs for texts too short to wrap anyway.) */
export function freeTextBoxWidth(t: { width?: number; text: string; fontSize?: number }): number {
  return t.width || t.text.length * (t.fontSize || 24) * 0.6;
}

/** Underline the lines drawWrappedWordArtText just drew (canvas has no native
 *  underline). `cy` = the line block's vertical CENTER, mirroring that
 *  function's layout; ctx.font must still be set so measureText is accurate. */
export function underlineTextLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  cx: number,
  cy: number,
  fontSize: number,
  align: 'left' | 'center' | 'right',
  color: string,
): void {
  const step = fontSize * TEXT_LINE_HEIGHT;
  const top = cy - ((lines.length - 1) * step) / 2;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, fontSize * 0.05);
  lines.forEach((line, i) => {
    const textW = ctx.measureText(line).width;
    const ux = align === 'left' ? cx : align === 'right' ? cx - textW : cx - textW / 2;
    const uy = top + i * step + fontSize * 0.5;
    ctx.beginPath();
    ctx.moveTo(ux, uy);
    ctx.lineTo(ux + textW, uy);
    ctx.stroke();
  });
  ctx.restore();
}

/** Break `text` into lines that each fit `maxWidth` with the ctx's CURRENT font.
 *  Greedy word wrap; a single word wider than the box is split by character,
 *  matching the DOM's `word-break: break-word`. */
export function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const paragraphs = String(text ?? '').split('\n');
  const lines: string[] = [];
  const fits = (s: string) => ctx.measureText(s).width <= maxWidth;

  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(''); continue; }
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (fits(candidate) || !line) {
        // A lone word too wide for the box → split it by character.
        if (!fits(candidate) && !line && !fits(word)) {
          let chunk = '';
          for (const ch of word) {
            if (chunk && !fits(chunk + ch)) { lines.push(chunk); chunk = ch; } else { chunk += ch; }
          }
          line = chunk;
          continue;
        }
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines.length ? lines : [''];
}

/** Draw WordArt text WRAPPED inside a box, vertically centred on `cy`. Returns
 *  the drawn lines so a caller can underline them. ctx.font/fillStyle/textAlign
 *  must already be set; `fontSize` is the already-scaled pixel size. */
export function drawWrappedWordArtText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  maxWidth: number,
  fontSize: number,
  s: WordArtStyle,
  scale: number,
): string[] {
  const lines = wrapTextLines(ctx, text, maxWidth);
  const step = fontSize * TEXT_LINE_HEIGHT;
  const top = cy - ((lines.length - 1) * step) / 2;
  lines.forEach((line, i) => drawWordArtText(ctx, line, cx, top + i * step, s, scale));
  return lines;
}

/** Draw one line of WordArt text onto a 2D canvas at (x, y) with the current
 *  ctx.font/textAlign already set. `scale` = the factor fontSize was scaled by.
 *  Fill color must be preset on ctx.fillStyle. Handles outline + shadow order so
 *  the shadow is cast once and the fill paints on top of the outline. */
export function drawWordArtText(
  ctx: CanvasRenderingContext2D,
  line: string,
  x: number,
  y: number,
  s: WordArtStyle,
  scale: number,
): void {
  const outline = !!(s.outlineWidth && s.outlineColor);
  const setShadow = () => {
    ctx.shadowColor = WORDART_SHADOW.color;
    ctx.shadowBlur = WORDART_SHADOW.blur * scale;
    ctx.shadowOffsetX = WORDART_SHADOW.offsetX * scale;
    ctx.shadowOffsetY = WORDART_SHADOW.offsetY * scale;
  };
  const clearShadow = () => { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; };
  if (outline) {
    if (s.shadow) setShadow();
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineWidth = (s.outlineWidth as number) * scale;
    ctx.strokeStyle = s.outlineColor as string;
    ctx.strokeText(line, x, y);
    ctx.restore();
    if (s.shadow) clearShadow();
    ctx.fillText(line, x, y);
  } else if (s.shadow) {
    setShadow();
    ctx.fillText(line, x, y);
    clearShadow();
  } else {
    ctx.fillText(line, x, y);
  }
}
