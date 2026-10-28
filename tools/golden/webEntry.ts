/* The website side of the golden check, bundled by renderWeb.mjs and run in
   headless Chromium: the website's own print renderer (printPipeline
   renderPageCanvasForPrint, the picture each print-file page is made from,
   and renderCoverWrapForPrint, which makes the cover file) drawing the
   golden pages and covers. Nothing here draws anything itself.

   A cover is made exactly as for an order (renderCoverWrapForPrint): the
   wrap is caught just before it is JPEG'd (the canvas handed to toBlob:
   the wrap under its words, lossless) and its sharp-words patches come back
   as print made them; renderWeb.mjs lays the patches on the wrap (every
   patch pixel is either fully the word's or untouched) for the picture
   with its words.

   While print draws a page, every line of words it draws is written down
   (each fillText call: the text, where, with which font, colour and
   transform, and the size of the canvas it went on: a cover's front page is
   drawn on its own canvas first). So the app's check compares its words
   with what print really drew, not with a wrap the check worked out itself.

   It also makes, with the website's own code, what an album keeps as a
   picture: a memory QR's PNG (qrMemory generateQrPngDataUrl) and a
   graphic's PNG (ornaments rasterizeOrnamentPng), and the texture tiles
   exactly as print prepares them before it repeats them. */

import { renderPageCanvasForPrint, renderCoverWrapForPrint } from '../../src/pages/builder/printPipeline';
import { coverWrapGeometry } from '../../src/pages/builder/coverGeometry';
import { generateQrPngDataUrl } from '../../src/lib/qrMemory';
import { rasterizeOrnamentPng, findOrnament } from '../../src/pages/builder/ornaments';
import { textureDataUri } from '../../src/pages/builder/textures';
import { DEFAULT_COVER_DESIGN } from '../../src/pages/builder/types';
import type { AlbumPage, AlbumSizePreset, CoverDesign, CoverType, MaterialType, UploadedPhoto } from '../../src/pages/builder/types';

interface FontIn { face: string; weight: number; italic: boolean; base64: string }
interface PhotoIn { id: string; width: number; height: number; image: number }
interface RenderIn { page: AlbumPage; albumSize: AlbumSizePreset; pageIndex: number; photos: PhotoIn[]; words: boolean }
interface CoverIn {
  albumSize: AlbumSizePreset; pageCount: number; cover: CoverType; material: MaterialType;
  coverFront?: AlbumPage; coverDesign?: CoverDesign; photos: PhotoIn[];
}

const toBase64 = (bytes: Uint8Array): string => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

/** One line of words print drew: ctx.fillText(text, x, y) under transform `m`
 *  (a, b, c, d, e, f) on a canvas of size `canvas` (print px, no bleed). */
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
  /** The canvas it was drawn on, [width, height]. */
  canvas: [number, number];
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
      canvas: [this.canvas.width, this.canvas.height],
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

const photosOf = (list: PhotoIn[]): UploadedPhoto[] => list.map((p) => ({
  id: p.id, previewUrl: imageUrls[p.image], name: `${p.id}.png`, type: 'image/png', size: 0, width: p.width, height: p.height,
}));

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

  /** A golden placeholder → the PNG data URL the website stores for it:
   *  'golden:qr:<link>' (a memory QR), 'golden:ornament:<pack>/<id>' (a graphic). */
  async resolve(placeholder: string): Promise<string> {
    const qr = /^golden:qr:(.+)$/.exec(placeholder);
    if (qr) return generateQrPngDataUrl(qr[1]);
    const orn = /^golden:ornament:([^/]+)\/(.+)$/.exec(placeholder);
    if (orn) {
      const def = findOrnament(orn[1], orn[2]);
      if (!def) throw new Error(`no ornament ${orn[1]}/${orn[2]}`);
      return rasterizeOrnamentPng(def.svg);
    }
    throw new Error(`unknown golden placeholder ${placeholder}`);
  },

  /** One golden page as the print file's picture (300 DPI, bleed), as a PNG
   *  data URL: with its words (and every line print drew), or without them. */
  async render(input: RenderIn): Promise<{ png: string; width: number; height: number; lines: DrawnLine[] }> {
    const { result: canvas, lines } = await recordingWords(() =>
      renderPageCanvasForPrint({ page: input.page, photos: photosOf(input.photos), albumSize: input.albumSize, pageIndex: input.pageIndex, words: input.words }));
    return { png: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height, lines };
  },

  /** One golden cover, made as for an order (renderCoverWrapForPrint): the
   *  wrap under its words as a PNG data URL (caught at toBlob, before the
   *  JPEG), its word patches (PNG, wrap px) and every line print drew. */
  async renderCover(input: CoverIn): Promise<{ bare: string; width: number; height: number; patches: { png: string; x: number; y: number; w: number; h: number }[]; lines: DrawnLine[] }> {
    const geom = coverWrapGeometry(input.albumSize, input.pageCount, input.cover, { material: input.material });
    const W = geom.wrap.wPx, H = geom.wrap.hPx;
    const proto = HTMLCanvasElement.prototype;
    const realToBlob = proto.toBlob;
    let bare: string | null = null;
    proto.toBlob = function (this: HTMLCanvasElement, cb: BlobCallback, type?: string, quality?: unknown) {
      if (this.width === W && this.height === H && bare == null) bare = this.toDataURL('image/png');
      return realToBlob.call(this, cb, type, quality);
    };
    try {
      const { result, lines } = await recordingWords(() => renderCoverWrapForPrint({
        albumSize: input.albumSize, pageCount: input.pageCount, cover: input.cover, material: input.material,
        coverDesign: input.coverDesign ?? DEFAULT_COVER_DESIGN, coverFront: input.coverFront, photos: photosOf(input.photos),
      }));
      if (bare == null) throw new Error(`the ${W}x${H} wrap was never handed to toBlob (scaled down? MAX_COVER_SIDE)`);
      const patches = result.words.map((w) => ({ png: toBase64(w.png), x: Math.round(w.x * W), y: Math.round(w.y * H), w: Math.round(w.w * W), h: Math.round(w.h * H) }));
      return { bare, width: W, height: H, patches, lines };
    } finally {
      proto.toBlob = realToBlob;
    }
  },

  /** A texture's tile as print prepares it (printPipeline renderBackground,
   *  case 'texture'): its SVG drawn onto a `px` square canvas. */
  async textureTile(name: string, color: string | undefined, px: number): Promise<string> {
    const img = new Image();
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = reject; img.src = textureDataUri(name, color); });
    const off = document.createElement('canvas');
    off.width = px;
    off.height = px;
    off.getContext('2d')!.drawImage(img, 0, 0, px, px);
    return off.toDataURL('image/png');
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
