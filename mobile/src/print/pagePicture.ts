/* ══════════════════════════════════════════════════════════════════════════
   AN ALBUM PAGE AS IT GOES IN THE PRINT FILE, made by the app the way the
   website's printPipeline makes it (renderPageManually):
     1. the page drawn at 300 DPI without its words, and again with them
        (src/render, the renderer the golden check holds to the website);
     2. every pixel the words change kept as see-through 300 DPI patches
        (wordPatches.ts, the website's own code);
     3. the page without its words given its 0.125" bleed (mirrored edges),
        shrunk to PRINT_PAGE_MAX_SIDE on its longest side and saved as a
        JPEG at PRINT_PAGE_JPEG_QUALITY (printFileSpec.ts);
     4. the patches placed as fractions of that picture, bleed included.
   With `bakeWords` the words are drawn into the picture instead (the smaller
   file the website falls back to when sharp words tip it past the budget).
   One page's pixels at a time: every picture is let go before returning.
   ══════════════════════════════════════════════════════════════════════════ */

import type { SkImage, Skia } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import { AlphaType, ColorType, FilterMode, ImageFormat, MipmapMode } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import { wordPatches, type PixelSource, type PxPatch } from '@web/pages/builder/wordPatches';
import { PRINT_PAGE_JPEG_QUALITY, PRINT_PAGE_MAX_SIDE } from '@web/pages/builder/printFileSpec';
import type { PagePlan } from '../render/pagePlan';
import type { PageDrawer, PhotoSource } from '../render/drawPage';
import type { PrintPicture } from './printPdf';

/** How a page picture is shrunk to the upload cap. The website's canvas does
 *  it with imageSmoothingQuality 'high'. Measured against the website's own
 *  page JPEGs (2026-10-28, both encoded at 82, pixelmatch 0.05):
 *    • shrunk to 0.73 or more (8x8, 6x4, 6x6, 8x6, 6x8): plain bilinear is
 *      Chromium's: 0.000–0.007% of pixels apart, mean 0.17–0.21 levels
 *      (Mitchell cubic 0.014–0.088%, Catmull-Rom 0.13–0.35%);
 *    • shrunk to about half (11.5x8: 3526 → 1800 px; 8.5x11 too): Chromium
 *      smooths more than bilinear, by a filter not found yet (not bilinear
 *      or trilinear from box or tent mipmaps, nor an area average): 0.7–1.2%
 *      of pixels apart on the test photos' fine stripes. A known gap
 *      (docs/mobile-port-plan.md, Print files in the app).
 *  No mipmaps: CanvasKit ignores them here and the phone's Skia might not,
 *  so the phone draws what the Node check proves. */
export type ShrinkSampling = { kind: 'cubic'; B: number; C: number } | { kind: 'linear'; mipmaps: boolean };
export const SHRINK_SAMPLING: ShrinkSampling = { kind: 'linear', mipmaps: false };

/** A picture's pixels for wordPatches: fresh RGBA rows, not premultiplied. */
export function pixelSource(img: SkImage): PixelSource {
  return {
    getImageData(x, y, w, h) {
      const px = img.readPixels(x, y, { width: w, height: h, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul });
      if (!(px instanceof Uint8Array)) throw new Error('could not read the page back');
      // wordPatches reads the array 32 bits at a time from its own buffer.
      return { data: px.byteOffset === 0 && px.byteLength === px.buffer.byteLength ? px : px.slice() };
    },
  };
}

/** Whether a page plan draws any words (printPipeline pageHasWords). */
export function planHasWords(plan: PagePlan): boolean {
  return plan.items.some((it) => (it.kind === 'boxText' || it.kind === 'freeText') && !!it.style.text?.trim());
}

export class PagePictures {
  constructor(private readonly Skia: Skia, private readonly drawer: PageDrawer, private readonly sampling: ShrinkSampling = SHRINK_SAMPLING) {}

  /** `img` shrunk so its longest side is at most `maxSide`, as a JPEG. */
  jpeg(img: SkImage, maxSide: number, quality: number): Uint8Array {
    const w = img.width(), h = img.height();
    const scale = Math.min(1, maxSide / Math.max(w, h));
    if (scale >= 1) return img.encodeToBytes(ImageFormat.JPEG, Math.round(quality * 100));
    const ow = Math.round(w * scale), oh = Math.round(h * scale);
    const surface = this.Skia.Surface.Make(ow, oh);
    if (!surface) throw new Error(`could not make a ${ow}×${oh} drawing surface`);
    const canvas = surface.getCanvas();
    const src = this.Skia.XYWHRect(0, 0, w, h);
    const dst = this.Skia.XYWHRect(0, 0, ow, oh);
    const s = this.sampling;
    if (s.kind === 'cubic') canvas.drawImageRectCubic(img, src, dst, s.B, s.C, this.Skia.Paint());
    else canvas.drawImageRectOptions(img, src, dst, FilterMode.Linear, s.mipmaps ? MipmapMode.Linear : MipmapMode.None, this.Skia.Paint());
    surface.flush();
    const out = surface.makeImageSnapshot();
    const bytes = out.encodeToBytes(ImageFormat.JPEG, Math.round(quality * 100));
    out.dispose();
    surface.dispose();
    return bytes;
  }

  /** The words a page drawn twice paints, as patches in trim pixels. */
  private lifted(plan: PagePlan, photos: PhotoSource): { bare: SkImage; words: PxPatch[] } {
    const bare = this.drawer.renderTrim(plan, photos, { words: false });
    const full = this.drawer.renderTrim(plan, photos, { words: true });
    try {
      return { bare, words: wordPatches(pixelSource(full), pixelSource(bare), { x: 0, y: 0, w: plan.width, h: plan.height }) };
    } finally {
      full.dispose();
    }
  }

  /** One interior page for "<order>.pdf". */
  interiorPage(plan: PagePlan, photos: PhotoSource, opts: { bakeWords?: boolean } = {}): PrintPicture {
    const { trim, words } = opts.bakeWords || !planHasWords(plan)
      ? { trim: this.drawer.renderTrim(plan, photos, { words: true }), words: [] as PxPatch[] }
      : (() => { const r = this.lifted(plan, photos); return { trim: r.bare, words: r.words }; })();
    const b = plan.bleed;
    const page300 = this.drawer.withBleed(trim, plan);
    trim.dispose();
    const PW = page300.width(), PH = page300.height();
    try {
      const jpeg = this.jpeg(page300, PRINT_PAGE_MAX_SIDE, PRINT_PAGE_JPEG_QUALITY);
      return { jpeg, words: words.map((p) => ({ png: p.png, x: (p.x + b) / PW, y: (p.y + b) / PH, w: p.w / PW, h: p.h / PH })) };
    } finally {
      page300.dispose();
    }
  }
}
