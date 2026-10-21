/* ══════════════════════════════════════════════════════════════════════════
   canvasTextPainter — the press sheets' words, drawn as pictures by the
   browser (printSheetPdf.TextPainter). A sheet then needs no font: the shop's
   printer had none of ours (2026-10-21). 600 DPI, twice what the sheets print
   at, so a 7 pt label stays sharp.
   ══════════════════════════════════════════════════════════════════════════ */

import type { TextPainter } from '../pages/builder/textPainter';

const PX_PER_PT = 600 / 72;
const FAMILY = 'Helvetica, Arial, sans-serif';

export function canvasTextPainter(): TextPainter {
  const canvas = document.createElement('canvas');
  const g = canvas.getContext('2d');
  if (!g) throw new Error("This browser can't draw the sheet labels. Try Chrome.");
  const fontOf = (sizePt: number, bold?: boolean) => `${bold ? 'bold ' : ''}${sizePt * PX_PER_PT}px ${FAMILY}`;
  return {
    width(text, sizePt, bold) {
      g.font = fontOf(sizePt, bold);
      return g.measureText(text).width / PX_PER_PT;
    },
    png(text, sizePt, color, bold) {
      const c = document.createElement('canvas');
      const x = c.getContext('2d')!;
      x.font = fontOf(sizePt, bold);
      const m = x.measureText(text);
      const ascent = Math.ceil(m.fontBoundingBoxAscent || sizePt * PX_PER_PT * 0.8);
      const descent = Math.ceil(m.fontBoundingBoxDescent || sizePt * PX_PER_PT * 0.2);
      c.width = Math.max(1, Math.ceil(m.width) + 2);
      c.height = ascent + descent;
      // A resize clears the context's settings: set them again.
      x.font = fontOf(sizePt, bold);
      x.fillStyle = color;
      x.textBaseline = 'alphabetic';
      x.fillText(text, 1, ascent);
      const b64 = c.toDataURL('image/png').split(',')[1];
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return { bytes, wPt: c.width / PX_PER_PT, hPt: c.height / PX_PER_PT, descentPt: descent / PX_PER_PT };
    },
  };
}
