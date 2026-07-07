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
