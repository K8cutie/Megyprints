/* The website side of the golden check, bundled by renderWeb.mjs and run in
   headless Chromium: the website's own print renderer (printPipeline
   renderPageCanvasForPrint, the picture each print-file page is made from)
   drawing the golden pages. Nothing here draws anything itself. */

import { renderPageCanvasForPrint } from '../../src/pages/builder/printPipeline';
import { wrapTextLines } from '../../src/pages/builder/wordArt';
import type { AlbumPage, AlbumSizePreset, UploadedPhoto } from '../../src/pages/builder/types';

interface FontIn { face: string; weight: number; italic: boolean; base64: string }
interface PhotoIn { id: string; width: number; height: number; image: number }
interface RenderIn { page: AlbumPage; albumSize: AlbumSizePreset; pageIndex: number; photos: PhotoIn[] }

const fromBase64 = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** Blob URLs of the synthetic photos, by PHOTO_SIZES index. */
let imageUrls: string[] = [];

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

  /** One golden page as the print file's picture (300 DPI, bleed, words in), as a PNG data URL. */
  async render(input: RenderIn): Promise<{ png: string; width: number; height: number }> {
    const photos: UploadedPhoto[] = input.photos.map((p) => ({
      id: p.id, previewUrl: imageUrls[p.image], name: `${p.id}.png`, type: 'image/png', size: 0, width: p.width, height: p.height,
    }));
    const canvas = await renderPageCanvasForPrint({ page: input.page, photos, albumSize: input.albumSize, pageIndex: input.pageIndex });
    return { png: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
  },

  /** How the website breaks a text into lines (wordArt wrapTextLines, the
   *  print renderer's own call) and each line's width, with ctx.font = font. */
  wrap(font: string, text: string, maxWidth: number): { text: string; width: number }[] {
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.font = font;
    return wrapTextLines(ctx, text, maxWidth).map((line) => ({ text: line, width: ctx.measureText(line).width }));
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
