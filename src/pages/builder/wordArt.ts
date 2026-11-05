import type { CSSProperties } from 'react';
import { curveCentreX, curveGlyphs, wordArtShadow, wrapTextLines, firstLineCenter, TEXT_LINE_HEIGHT, WORDART_GLOW_PASSES, type WordArtCurve, type WordArtStyle } from './wordArtRules';

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
  if (sh) {
    const one = `${sh.offsetX * scale}px ${sh.offsetY * scale}px ${sh.blur * scale}px ${sh.color}`;
    css.textShadow = s.glow ? Array(WORDART_GLOW_PASSES).fill(one).join(', ') : one;
  }
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

/** The two-colour fill for a line of `size` px (scaled) whose middle is at `y`,
 *  from the colour already on ctx.fillStyle; null for a one-colour fill. */
function fillGradient(ctx: CanvasRenderingContext2D, s: WordArtStyle, y: number, size: number): CanvasGradient | null {
  if (!s.fillTo) return null;
  const g = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2);
  g.addColorStop(0, ctx.fillStyle as string);
  g.addColorStop(1, s.fillTo);
  return g;
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
  const fill = () => {
    const g = fillGradient(ctx, s, y, (s.fontSize || 24) * scale);
    if (!g) { ctx.fillText(line, x, y); return; }
    const plain = ctx.fillStyle;
    ctx.fillStyle = g;
    ctx.fillText(line, x, y);
    ctx.fillStyle = plain;
  };
  // A glow is cast more than once (the shadow, once).
  const casts = s.glow ? WORDART_GLOW_PASSES : 1;
  if (outline) {
    if (sh) setShadow();
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineWidth = (s.outlineWidth as number) * scale;
    ctx.strokeStyle = s.outlineColor as string;
    for (let i = 0; i < casts; i++) ctx.strokeText(line, x, y);
    ctx.restore();
    if (sh) clearShadow();
    fill();
  } else if (sh) {
    setShadow();
    for (let i = 0; i < casts; i++) fill();
    clearShadow();
  } else {
    fill();
  }
}

/** Draw the words on `curve` around (anchorX, cy), anchored as a straight line
 *  is. ctx.font and fillStyle must be set; `fontSize` is the scaled pixel size.
 *  All the letters' shadows first, then their outlines, then their fills, so no
 *  letter's shadow or outline lies over its neighbour's fill. */
export function drawCurvedWordArtText(
  ctx: CanvasRenderingContext2D,
  text: string,
  anchorX: number,
  cy: number,
  fontSize: number,
  align: 'left' | 'center' | 'right',
  curve: WordArtCurve,
  s: WordArtStyle,
  scale: number,
  onCover = false,
): void {
  const { glyphs, width } = curveGlyphs(text, ctx, fontSize, curve);
  const cx = curveCentreX(anchorX, align, width);
  const outline = !!(s.outlineWidth && s.outlineColor);
  const sh = wordArtShadow(s, onCover);
  ctx.save();
  ctx.textAlign = 'center';
  const letters = (draw: (ch: string) => void) => glyphs.forEach((g) => {
    ctx.save();
    ctx.translate(cx + g.x, cy + g.y);
    ctx.rotate(g.angle);
    draw(g.text);
    ctx.restore();
  });
  const strokeLook = () => {
    ctx.lineJoin = 'round';
    ctx.lineWidth = (s.outlineWidth as number) * scale;
    ctx.strokeStyle = s.outlineColor as string;
  };
  if (sh) {
    ctx.save();
    ctx.shadowColor = sh.color;
    ctx.shadowBlur = sh.blur * scale;
    ctx.shadowOffsetX = sh.offsetX * scale;
    ctx.shadowOffsetY = sh.offsetY * scale;
    if (outline) strokeLook();
    for (let i = 0; i < (s.glow ? WORDART_GLOW_PASSES : 1); i++) {
      letters((ch) => (outline ? ctx.strokeText(ch, 0, 0) : ctx.fillText(ch, 0, 0)));
    }
    ctx.restore();
  }
  if (outline) {
    ctx.save();
    strokeLook();
    letters((ch) => ctx.strokeText(ch, 0, 0));
    ctx.restore();
  }
  const g = fillGradient(ctx, s, 0, fontSize);
  if (g) ctx.fillStyle = g;
  letters((ch) => ctx.fillText(ch, 0, 0));
  ctx.restore();
}
