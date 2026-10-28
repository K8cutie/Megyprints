/* The website side of the golden check, bundled by renderWeb.mjs and run in
   headless Chromium: the website's own print renderer (printPipeline
   renderPageCanvasForPrint, the picture each print-file page is made from)
   drawing the golden pages. Nothing here draws anything itself.

   While print draws a page, every line of words it draws is written down
   (each fillText call: the text, where, with which font, colour and
   transform). So the app's check compares its words with what print really
   drew, not with a wrap the check worked out itself. */

import { renderPageCanvasForPrint } from '../../src/pages/builder/printPipeline';
import type { AlbumPage, AlbumSizePreset, UploadedPhoto } from '../../src/pages/builder/types';

interface FontIn { face: string; weight: number; italic: boolean; base64: string }
interface PhotoIn { id: string; width: number; height: number; image: number }
interface RenderIn { page: AlbumPage; albumSize: AlbumSizePreset; pageIndex: number; photos: PhotoIn[]; words: boolean }

/** One line of words print drew: ctx.fillText(text, x, y) under transform `m`
 *  (a, b, c, d, e, f) on the page canvas (print px, no bleed). */
export interface DrawnLine {
  text: string;
  x: number;
  y: number;
  /** canvas measureText(text).width with the font in force. */
  width: number;
  font: string;
  align: string;
  baseline: string;
  color: string;
  alpha: number;
  m: [number, number, number, number, number, number];
  /** strokeText calls for this same line before it (an outline). */
  outlined: boolean;
  /** A shadow was set when it (or its outline) was drawn. */
  shadow: string | null;
}

const fromBase64 = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** Blob URLs of the synthetic photos, by image index. */
let imageUrls: string[] = [];

/** Run `draw` while every fillText / strokeText on any canvas is written down. */
async function recordingWords<T>(draw: () => Promise<T>): Promise<{ result: T; lines: DrawnLine[] }> {
  const proto = CanvasRenderingContext2D.prototype;
  const realFill = proto.fillText;
  const realStroke = proto.strokeText;
  const lines: DrawnLine[] = [];
  let pendingOutline: { text: string; shadow: string | null } | null = null;
  const shadowOf = (ctx: CanvasRenderingContext2D): string | null =>
    ctx.shadowColor && ctx.shadowColor !== 'rgba(0, 0, 0, 0)' && (ctx.shadowBlur || ctx.shadowOffsetX || ctx.shadowOffsetY)
      ? `${ctx.shadowColor} ${ctx.shadowOffsetX} ${ctx.shadowOffsetY} ${ctx.shadowBlur}`
      : null;
  proto.strokeText = function (this: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth?: number) {
    pendingOutline = { text: String(text), shadow: shadowOf(this) };
    return maxWidth === undefined ? realStroke.call(this, text, x, y) : realStroke.call(this, text, x, y, maxWidth);
  };
  proto.fillText = function (this: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth?: number) {
    const t = this.getTransform();
    const outline = pendingOutline && pendingOutline.text === String(text) ? pendingOutline : null;
    pendingOutline = null;
    lines.push({
      text: String(text), x, y, width: this.measureText(String(text)).width,
      font: this.font, align: this.textAlign, baseline: this.textBaseline,
      color: String(this.fillStyle), alpha: this.globalAlpha,
      m: [t.a, t.b, t.c, t.d, t.e, t.f],
      outlined: !!outline, shadow: outline ? outline.shadow : shadowOf(this),
    });
    return maxWidth === undefined ? realFill.call(this, text, x, y) : realFill.call(this, text, x, y, maxWidth);
  };
  try {
    return { result: await draw(), lines };
  } finally {
    proto.fillText = realFill;
    proto.strokeText = realStroke;
  }
}

const api = {
  /** The bundled fonts, from the very TTF files the app uses. */
  async registerFonts(fonts: FontIn[]): Promise<number> {
    for (const f of fonts) {
      const face = new FontFace(f.face, fromBase64(f.base64), { weight: String(f.weight), style: f.italic ? 'italic' : 'normal' });
      await face.load();
      document.fonts.add(face);
    }
    return document.fonts.size;
  },

  setImages(pngs: string[]): number {
    imageUrls.forEach((u) => URL.revokeObjectURL(u));
    imageUrls = pngs.map((b64) => URL.createObjectURL(new Blob([fromBase64(b64) as BlobPart], { type: 'image/png' })));
    return imageUrls.length;
  },

  /** One golden page as the print file's picture (300 DPI, bleed), as a PNG
   *  data URL: with its words (and every line print drew), or without them. */
  async render(input: RenderIn): Promise<{ png: string; width: number; height: number; lines: DrawnLine[] }> {
    const photos: UploadedPhoto[] = input.photos.map((p) => ({
      id: p.id, previewUrl: imageUrls[p.image], name: `${p.id}.png`, type: 'image/png', size: 0, width: p.width, height: p.height,
    }));
    const { result: canvas, lines } = await recordingWords(() =>
      renderPageCanvasForPrint({ page: input.page, photos, albumSize: input.albumSize, pageIndex: input.pageIndex, words: input.words }));
    return { png: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height, lines };
  },

  /** What the browser measures a line at (a check on the app's measuring). */
  measure(font: string, text: string): { width: number; ascent: number; descent: number } {
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.font = font;
    const m = ctx.measureText(text);
    return { width: m.width, ascent: m.fontBoundingBoxAscent, descent: m.fontBoundingBoxDescent };
  },
};

(globalThis as unknown as { golden: typeof api }).golden = api;
