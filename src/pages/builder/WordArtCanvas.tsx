/* Words with WordArt that a browser's text can't do (a two-colour fill, the
   words on a curve), for the DOM preview: print's own drawing (wordArt.ts) on
   a canvas over the words' box, so the preview is what prints. The canvas is
   larger than the box and lets the touch through: a curve isn't clipped to the box.
   `free`: a free text's box (words placed by hand, freeWords.ts), drawn as
   print's free branch draws it: lines from the top of the box, not clipped. */
import { useEffect, useMemo, useRef } from 'react';
import { CAPTION_PAD_X, drawCurvedWordArtText, drawWordArtText, drawWrappedWordArtText, TEXT_LINE_HEIGHT, underlineTextLines, wrapTextLines } from './wordArt';
import type { TextStyle } from './types';

/** How many lines a free text wraps to in its box (the canvas is as tall as they are). */
function freeLines(text: TextStyle, font: string, boxW: number): number {
  const ctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  if (!ctx) return Math.max(1, String(text.text ?? '').split('\n').length);
  ctx.font = font;
  return wrapTextLines(ctx, text.text, boxW).length;
}

export const needsWordArtCanvas = (t: Pick<TextStyle, 'fillTo' | 'curve'>): boolean => !!t.fillTo || !!t.curve;

export function WordArtCanvas({ text, boxW, boxH, scale, align, onCover, free = false }: {
  text: TextStyle;
  boxW: number;
  boxH: number;
  /** Screen px per design px. */
  scale: number;
  align: 'left' | 'center' | 'right';
  onCover: boolean;
  free?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const fontSize = (text.fontSize || 24) * scale;
  const font = `${text.italic ? 'italic' : 'normal'} ${text.bold ? 'bold' : 'normal'} ${fontSize}px ${text.fontFamily || 'serif'}`;
  // A free text's box is as tall as its lines (print's free branch: lines from its top).
  const step = fontSize * TEXT_LINE_HEIGHT;
  const tall = useMemo(() => (free && !text.curve ? freeLines(text, font, boxW) * step : boxH), [free, text, font, boxW, step, boxH]);
  // Room for a curve, or a shadow or glow past the box.
  const padX = boxW / 2;
  const padY = Math.max(tall, fontSize * 3);
  const w = boxW + padX * 2;
  const h = tall + padY * 2;
  useEffect(() => {
    let live = true;
    const draw = () => {
      const canvas = ref.current;
      const ctx = canvas?.getContext('2d');
      if (!live || !canvas || !ctx) return;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = font;
      ctx.fillStyle = text.color || '#2D2D2D';
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      const ink = text.color || '#2D2D2D';
      if (free) {
        const x = padX + (align === 'left' ? 0 : align === 'right' ? boxW : boxW / 2);
        if (text.curve) { drawCurvedWordArtText(ctx, text.text, x, padY + step / 2, fontSize, align, text.curve, text, scale, onCover); return; }
        const lines = wrapTextLines(ctx, text.text, boxW);
        lines.forEach((line, i) => drawWordArtText(ctx, line, x, padY + step / 2 + i * step, text, scale, onCover));
        // Underlined as print underlines a free text (its block's middle).
        if (text.underline) underlineTextLines(ctx, lines, x, padY + step / 2 + ((lines.length - 1) * step) / 2, fontSize, align, ink);
        return;
      }
      const pad = boxW * CAPTION_PAD_X;
      const x = padX + (align === 'left' ? pad : align === 'right' ? boxW - pad : boxW / 2);
      const y = padY + boxH / 2;
      if (text.curve) {
        drawCurvedWordArtText(ctx, text.text, x, y, fontSize, align, text.curve, text, scale, onCover);
      } else {
        ctx.beginPath();
        ctx.rect(padX, padY, boxW, boxH);
        ctx.clip();
        const lines = drawWrappedWordArtText(ctx, text.text, x, y, boxW - pad * 2, fontSize, text, scale, onCover);
        if (text.underline) underlineTextLines(ctx, lines, x, y, fontSize, align, ink);
      }
    };
    const ready = document.fonts?.load?.(font) ?? Promise.resolve();
    void ready.catch(() => {}).then(draw);
    return () => { live = false; };
  }, [text, w, h, boxW, boxH, padX, padY, fontSize, font, step, scale, align, onCover, free]);
  return (
    <canvas ref={ref} aria-label={text.text} data-testid="wordart-canvas"
      style={{ position: 'absolute', left: -padX, top: -padY, width: w, height: h, pointerEvents: 'none' }} />
  );
}
