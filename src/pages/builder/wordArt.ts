import type { CSSProperties } from 'react';
import { wordArtShadow, wrapTextLines, firstLineCenter, TEXT_LINE_HEIGHT, type WordArtStyle } from './wordArtRules';

// ──────────────────────────────────────────────────────────────────────────
// WordArt text effects — outline + soft shadow — shared by ALL THREE text
// renderers (BuilderPreview DOM, useCanvasEngine Fabric, printPipeline canvas)
// so a styled caption looks identical everywhere. Widths/offsets are in DESIGN
// px; each renderer multiplies by the same factor it scales fontSize by.
// ──────────────────────────────────────────────────────────────────────────

// The rules (sizes, line rhythm, caption margin, alignment, word wrap) live
// in wordArtRules.ts, which the 2.0 app shares. Everything is re-exported
// here, so the website imports this file as before.
export * from './wordArtRules';

/** Extra CSS for a DOM text node. `scale` = the factor the node's fontSize is
 *  multiplied by (so outline/shadow track the on-screen text size). */
export function wordArtDomStyle(s: WordArtStyle, scale: number, onCover = false): CSSProperties {
  const css: CSSProperties = {};
  if (s.outlineWidth && s.outlineColor) {
    (css as any).WebkitTextStrokeWidth = `${s.outlineWidth * scale}px`;
    (css as any).WebkitTextStrokeColor = s.outlineColor;
    (css as any).paintOrder = 'stroke fill';
  }
  const sh = wordArtShadow(s, onCover);
  if (sh) css.textShadow = `${sh.offsetX * scale}px ${sh.offsetY * scale}px ${sh.blur * scale}px ${sh.color}`;
  return css;
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
  const top = firstLineCenter(lines.length, cy, fontSize);
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
  onCover = false,
): string[] {
  const lines = wrapTextLines(ctx, text, maxWidth);
  const step = fontSize * TEXT_LINE_HEIGHT;
  const top = firstLineCenter(lines.length, cy, fontSize);
  lines.forEach((line, i) => drawWordArtText(ctx, line, cx, top + i * step, s, scale, onCover));
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
  onCover = false,
): void {
  const outline = !!(s.outlineWidth && s.outlineColor);
  const sh = wordArtShadow(s, onCover);
  const setShadow = () => {
    if (!sh) return;
    ctx.shadowColor = sh.color;
    ctx.shadowBlur = sh.blur * scale;
    ctx.shadowOffsetX = sh.offsetX * scale;
    ctx.shadowOffsetY = sh.offsetY * scale;
  };
  const clearShadow = () => { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; };
  if (outline) {
    if (sh) setShadow();
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineWidth = (s.outlineWidth as number) * scale;
    ctx.strokeStyle = s.outlineColor as string;
    ctx.strokeText(line, x, y);
    ctx.restore();
    if (sh) clearShadow();
    ctx.fillText(line, x, y);
  } else if (sh) {
    setShadow();
    ctx.fillText(line, x, y);
    clearShadow();
  } else {
    ctx.fillText(line, x, y);
  }
}
