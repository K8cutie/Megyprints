/* A cover title with WordArt that a browser's text can't do (a two-colour fill,
   the words on a curve), for the DOM preview: print's own drawing (wordArt.ts) on
   a canvas over the title's box, so the preview is what prints. The canvas is
   larger than the box and lets the touch through: a curve isn't clipped to the box. */
import { useEffect, useRef } from 'react';
import { CAPTION_PAD_X, drawCurvedWordArtText, drawWrappedWordArtText } from './wordArt';
import type { TextElement } from './types';

export const needsWordArtCanvas = (t: Pick<TextElement, 'fillTo' | 'curve'>): boolean => !!t.fillTo || !!t.curve;

export function WordArtCanvas({ text, boxW, boxH, scale, align, onCover }: {
  text: TextElement;
  boxW: number;
  boxH: number;
  /** Screen px per design px. */
  scale: number;
  align: 'left' | 'center' | 'right';
  onCover: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const fontSize = (text.fontSize || 24) * scale;
  // Room for a curve, or a shadow or glow past the box.
  const padX = boxW / 2;
  const padY = Math.max(boxH, fontSize * 3);
  const w = boxW + padX * 2;
  const h = boxH + padY * 2;
  useEffect(() => {
    let live = true;
    const font = `${text.italic ? 'italic' : 'normal'} ${text.bold ? 'bold' : 'normal'} ${fontSize}px ${text.fontFamily || 'serif'}`;
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
      const pad = boxW * CAPTION_PAD_X;
      const x = padX + (align === 'left' ? pad : align === 'right' ? boxW - pad : boxW / 2);
      const y = padY + boxH / 2;
      if (text.curve) {
        drawCurvedWordArtText(ctx, text.text, x, y, fontSize, align, text.curve, text, scale, onCover);
      } else {
        ctx.beginPath();
        ctx.rect(padX, padY, boxW, boxH);
        ctx.clip();
        drawWrappedWordArtText(ctx, text.text, x, y, boxW - pad * 2, fontSize, text, scale, onCover);
      }
    };
    const ready = document.fonts?.load?.(font) ?? Promise.resolve();
    void ready.catch(() => {}).then(draw);
    return () => { live = false; };
  }, [text, w, h, boxW, boxH, padX, padY, fontSize, scale, align, onCover]);
  return (
    <canvas ref={ref} aria-label={text.text} data-testid="wordart-canvas"
      style={{ position: 'absolute', left: -padX, top: -padY, width: w, height: h, pointerEvents: 'none' }} />
  );
}
