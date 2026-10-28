/* ══════════════════════════════════════════════════════════════════════════
   DRAW ONE ALBUM PAGE with Skia, from its plan (pagePlan.ts).

   The drawing follows the website's print renderer call by call
   (printPipeline renderBackground / renderSlotPhoto / applySlotClip /
   renderTextElement / renderSlotText, wordArt.ts, printBleed.ts), with the
   same canvas rules where Skia's defaults differ:
     • a picture is sampled the way Chrome's canvas samples it
       (sampling.ts): drawn level, with Skia's older 1/16-pixel bilinear;
       drawn turned, with float bilinear; a picture file drawn at under
       half size, from Chrome's halved copy; one with see-through pixels,
       premultiplied. Its own edges are smoothed only when the drawing is
       turned off the page's axes (Chromium's rule: a picture's edges are
       smoothed when the transform does not keep them level, as in the
       template's turned slot);
     • clips are smoothed; a stroke keeps the canvas miter limit (10);
     • a shadow is the shape blurred with sigma = shadowBlur / 2, offset,
       under the shape (HTML canvas shadows);
     • the border stroke follows the clip path the way ctx.stroke() does: a
       path-shape mask (hexagon, scallop…) has no current path in canvas, so
       it gets no border line there either.

   It takes the Skia API as an argument, so the same code draws on the phone
   (JSI Skia) and headless in Node (CanvasKit: the golden check). A print
   page is drawn on a CPU surface (Skia.Surface.Make) on both: the same kind
   of drawing the check proves, and no GPU texture size limit on the phone.

   PHOTOS MUST ARRIVE AS sRGB. On the phone a Skia surface has no colour
   space, so Skia draws a photo's numbers as they are: a photo saved with a
   Display P3 or Adobe RGB profile would print duller than the website
   prints it (Chrome turns every photo into sRGB as it draws it). Turning
   photos into sRGB is the photo intake's job (Phase 2: decode with the
   target colour space set to sRGB, keep that file); the golden set has a
   photo with a Display P3 profile so the on-device golden run (a gate
   before Phase 5) shows whether that was done. In Node, CanvasKit's surface
   is sRGB and converts it, like Chrome.
   ══════════════════════════════════════════════════════════════════════════ */

import type { SkCanvas, SkImage, SkPaint, SkPath, Skia } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import { AlphaType, BlendMode, ClipOp, ColorType, FilterMode, MipmapMode, PaintStyle, StrokeCap, TileMode, BlurStyle } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import { slotPhotoRect } from '@web/pages/builder/slotPhotoFit';
import { archRy, featherGradients, heartCurves, isPathShape, maskOverlayUrl, maskPathD, maskTextureUrl, starPoints } from '@web/pages/builder/maskShapes';
import { PRINT_FRAME, type PrintFrameShadow } from '@web/pages/builder/printFrameSpec';
import { mirrorOps, type Margins } from '@web/pages/builder/bleedGeometry';
import { wrapTextLines, firstLineCenter, TEXT_LINE_HEIGHT } from '@web/pages/builder/wordArtRules';
import { applyLookToPixels, lookOps, type LookId } from '@web/pages/builder/lookRules';
import { bgCoverFit } from '@web/pages/builder/types';
import { FRAME_PX, type BoxPhotoItem, type BoxTextItem, type CornerItem, type Fill, type FreeGraphicItem, type FreeQrItem, type FreeTextItem, type GraphicItem, type PagePlan, type PhotoItem, type QrItem, type Rect } from './pagePlan';
import type { PageText, TextLook } from './pageText';
import { makeTextureTile } from './textureTile';
import { ChromeSampling, mipLevelFor } from './sampling';

/** The page's photos, by album photo index (null = not loaded: drawn empty). */
export type PhotoSource = (photoIndex: number) => SkImage | null;

/** The pictures a page names by address (PagePlan.assets), opened by the
 *  caller: a QR code's or a graphic's PNG data: URL, a mask edge, a corner
 *  file, a picture background. null = not available (drawn as print draws a
 *  picture that fails to load). */
export type AssetSource = (src: string) => SkImage | null;

interface Shadow { color: string; blur: number; dx: number; dy: number }

export interface DrawOptions {
  /** Draw the page's words (default). false: the page under them. */
  words?: boolean;
  /** The page's named pictures (PagePlan.assets). Default: none. */
  assets?: AssetSource;
  /** Told about each named picture `assets` did not have. */
  onMissing?: (src: string) => void;
}

const PAPER = '#FFFBF7';

export class PageDrawer {
  /** Texture tiles already drawn, by material, tint and size. */
  private readonly tiles = new Map<string, SkImage>();
  /** Pictures prepared the way Chrome samples them (premultiplied, halved). */
  private readonly sampling: ChromeSampling;

  constructor(private readonly Skia: Skia, private readonly text: PageText) {
    this.sampling = new ChromeSampling(Skia);
  }

  /** Let go of the texture tiles and prepared pictures kept between pages. */
  dispose(): void {
    this.tiles.forEach((t) => t.dispose());
    this.tiles.clear();
    this.sampling.dispose();
  }

  private textureTile(name: string, color: string | undefined, tilePx: number): SkImage {
    const key = `${name}|${color ?? ''}|${tilePx}`;
    let tile = this.tiles.get(key);
    if (!tile) {
      tile = makeTextureTile(this.Skia, name, color, tilePx);
      this.tiles.set(key, tile);
    }
    return tile;
  }

  private paint(color: string): SkPaint {
    const p = this.Skia.Paint();
    p.setAntiAlias(true);
    p.setColor(this.Skia.Color(color));
    return p;
  }

  private rect(r: Rect) {
    return this.Skia.XYWHRect(r.x, r.y, r.w, r.h);
  }

  /** ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h), sampled as Chrome's
   *  canvas samples it (sampling.ts). `decoded`: a picture file the browser
   *  decoded (a photo, a QR code, a graphic, a mask edge), which Chrome
   *  draws from a halved copy when it is drawn at under half its size; a
   *  canvas drawn onto another (`decoded` false) never is. The picture's
   *  edges are smoothed only when the canvas is turned off the page's axes. */
  private image(canvas: SkCanvas, img: SkImage, src: Rect, dst: Rect, { paint, decoded = false }: { paint?: SkPaint; decoded?: boolean } = {}): void {
    const p = paint ?? this.Skia.Paint();
    const m = canvas.getTotalMatrix().get();
    const level = (m[1] === 0 && m[3] === 0) || (m[0] === 0 && m[4] === 0);
    let pic = img;
    let from = src;
    if (decoded) {
      // The draw's scale on the page (cc ExtractScale): a level draw's own
      // scales; a turned one's, taken apart from its turn.
      const kx = dst.w / src.w, ky = dst.h / src.h;
      const a = m[0] * kx, b = m[3] * kx, c = m[1] * ky, d = m[4] * ky;
      let sx: number, sy: number;
      if (b === 0 && c === 0) { sx = Math.abs(a); sy = Math.abs(d); }
      else { sx = Math.hypot(a, b); sy = sx ? Math.abs(a * d - b * c) / sx : 0; }
      const L = mipLevelFor(Math.round(src.w), Math.round(src.h), Math.round(src.w * sx), Math.round(src.h * sy));
      pic = this.sampling.decoded(img, L);
      if (L) {
        const fx = pic.width() / img.width(), fy = pic.height() / img.height();
        from = { x: src.x * fx, y: src.y * fy, w: src.w * fx, h: src.h * fy };
      }
    }
    if (level && from.w === dst.w && from.h === dst.h && Math.abs(m[0]) === 1 && Math.abs(m[4]) === 1
      && Number.isInteger(m[0] * dst.x + m[2]) && Number.isInteger(m[4] * dst.y + m[5])) {
      // Pixel for pixel onto whole pixels (the page into its bleed, a mirrored
      // strip, the cover's front panel): a plain copy, whatever the sampling.
      p.setAntiAlias(false);
      canvas.drawImageRectOptions(pic, this.rect(from), this.rect(dst), FilterMode.Nearest, MipmapMode.None, p);
    } else if (level) {
      p.setAntiAlias(false);
      p.setShader(this.sampling.levelShader(pic, from, dst));
      canvas.drawRect(this.rect(dst), p);
    } else {
      p.setAntiAlias(true);
      canvas.drawImageRectOptions(pic, this.rect(from), this.rect(dst), FilterMode.Linear, MipmapMode.None, p);
    }
  }

  private fillShape(canvas: SkCanvas, path: SkPath, color: string, shadow?: Shadow): void {
    if (shadow) {
      const sp = this.paint(shadow.color);
      if (shadow.blur > 0) sp.setMaskFilter(this.Skia.MaskFilter.MakeBlur(BlurStyle.Normal, shadow.blur / 2, false));
      canvas.save();
      canvas.translate(shadow.dx, shadow.dy);
      canvas.drawPath(path, sp);
      canvas.restore();
    }
    canvas.drawPath(path, this.paint(color));
  }

  private fill(f: Extract<Fill, { kind: 'solid' | 'linear' | 'radial' }>): SkPaint {
    if (f.kind === 'solid') return this.paint(f.color);
    const p = this.Skia.Paint();
    p.setAntiAlias(true);
    const colors = f.stops.map((s) => this.Skia.Color(s.color));
    const pos = f.stops.map((s) => s.offset);
    p.setShader(f.kind === 'linear'
      ? this.Skia.Shader.MakeLinearGradient(this.Skia.Point(f.x1, f.y1), this.Skia.Point(f.x2, f.y2), colors, pos, TileMode.Clamp)
      : this.Skia.Shader.MakeRadialGradient(this.Skia.Point(f.cx, f.cy), f.r, colors, pos, TileMode.Clamp));
    return p;
  }

  /** applySlotClip's path. `stroked`: whether ctx.stroke() would draw it. */
  private slotPath(slot: PhotoItem['slot'], x: number, y: number, w: number, h: number, cornerRadius: number): { path: SkPath; stroked: boolean } {
    if (isPathShape(slot.shape)) {
      const path = this.Skia.Path.MakeFromSVGString(maskPathD(slot.shape, x, y, w, h));
      if (!path) throw new Error(`mask path for ${slot.shape} did not parse`);
      return { path, stroked: false };
    }
    const b = this.Skia.PathBuilder.Make();
    switch (slot.shape) {
      case 'circle':
        b.addCircle(x + w / 2, y + h / 2, Math.min(w, h) / 2);
        break;
      case 'heart': {
        const heart = heartCurves(x + w / 2, y + h / 2, Math.min(w, h));
        b.moveTo(heart.start.x, heart.start.y);
        for (const c of heart.curves) b.cubicTo(...c);
        break; // left open, as in canvas: the clip closes it
      }
      case 'star': {
        const pts = starPoints(x + w / 2, y + h / 2, Math.min(w, h) / 2);
        pts.forEach((pt, i) => (i === 0 ? b.moveTo(pt.x, pt.y) : b.lineTo(pt.x, pt.y)));
        b.close();
        break;
      }
      case 'arch': {
        const ry = archRy(w, h);
        b.moveTo(x, y + h);
        b.lineTo(x, y + ry);
        b.arcToOval(this.Skia.XYWHRect(x, y, w, ry * 2), 180, 180, false);
        b.lineTo(x + w, y + h);
        b.close();
        break;
      }
      default: {
        // Every other shape prints as a rectangle on the website today,
        // 'oval' and 'rounded' masks included (applySlotClip has no case for
        // them): kept the same here, reported in the PR.
        const r = Math.min(cornerRadius, Math.min(w, h) / 2);
        if (r > 0) {
          b.moveTo(x + r, y);
          b.lineTo(x + w - r, y);
          b.arcToTangent(x + w, y, x + w, y + r, r);
          b.lineTo(x + w, y + h - r);
          b.arcToTangent(x + w, y + h, x + w - r, y + h, r);
          b.lineTo(x + r, y + h);
          b.arcToTangent(x, y + h, x, y + h - r, r);
          b.lineTo(x, y + r);
          b.arcToTangent(x, y, x + r, y, r);
          b.close();
        } else {
          b.addRect(this.Skia.XYWHRect(x, y, w, h));
        }
      }
    }
    return { path: b.build(), stroked: true };
  }

  private shapePath(isRect: boolean, x: number, y: number, w: number, h: number): SkPath {
    const b = this.Skia.PathBuilder.Make();
    if (isRect) b.addRect(this.Skia.XYWHRect(x, y, w, h));
    else b.addOval(this.Skia.XYWHRect(x, y, w, h));
    return b.build();
  }

  /** A photo with a colour look, a soft edge or a textured edge, baked the
   *  way print bakes it (renderSlotPhoto): drawn into its own box (the slot
   *  rounded up to whole pixels), the look applied to those pixels
   *  (lookRules.applyLookToPixel on each, as applyLookPixels does), then the
   *  soft edge's gradients (featherGradients) or the edge's overlay and its
   *  texture cutting the alpha. The caller draws it at the slot's corner. */
  private bakedPhoto(img: SkImage, fit: { x: number; y: number; w: number; h: number }, sw: number, sh: number, item: PhotoItem, assets: AssetSource, onMissing?: (src: string) => void): SkImage {
    const Sk = this.Skia;
    const tw = Math.max(1, Math.ceil(sw)), th = Math.max(1, Math.ceil(sh));
    const surface = Sk.Surface.Make(tw, th);
    if (!surface) throw new Error(`could not make a ${tw}×${th} drawing surface`);
    const tc = surface.getCanvas();
    tc.clear(Sk.Color('transparent'));
    this.image(tc, img, { x: 0, y: 0, w: img.width(), h: img.height() }, fit, { decoded: true });
    if (item.look) {
      surface.flush();
      const drawn = surface.makeImageSnapshot();
      const looked = this.withLook(drawn, item.look);
      drawn.dispose();
      const p = Sk.Paint();
      p.setBlendMode(BlendMode.Src);
      tc.drawImage(looked, 0, 0, p);
      looked.dispose();
    }
    const { slot } = item;
    if (slot.feather) {
      for (const g of featherGradients(0, 0, tw, th, slot.feather, slot.featherSide)) {
        const p = Sk.Paint();
        p.setBlendMode(BlendMode.DstIn);
        p.setShader(Sk.Shader.MakeLinearGradient(
          Sk.Point(g.x0, g.y0), Sk.Point(g.x1, g.y1),
          g.stops.map((s) => Sk.Color(`rgba(0,0,0,${s.alpha})`)), g.stops.map((s) => s.offset), TileMode.Clamp,
        ));
        tc.drawRect(Sk.XYWHRect(0, 0, tw, th), p);
      }
    }
    if (slot.texture) {
      const texSrc = maskTextureUrl(slot.texture);
      const overlaySrc = maskOverlayUrl(slot.texture);
      const tex = assets(texSrc);
      const overlay = overlaySrc ? assets(overlaySrc) : null;
      if (!tex) onMissing?.(texSrc);
      if (overlaySrc && !overlay) onMissing?.(overlaySrc);
      // Print draws the plain photo when an edge's files don't load.
      if (tex && (!overlaySrc || overlay)) {
        const box = { x: 0, y: 0, w: tw, h: th };
        if (overlay) this.image(tc, overlay, { x: 0, y: 0, w: overlay.width(), h: overlay.height() }, box, { decoded: true });
        const p = Sk.Paint();
        p.setBlendMode(BlendMode.DstIn);
        this.image(tc, tex, { x: 0, y: 0, w: tex.width(), h: tex.height() }, box, { paint: p, decoded: true });
      }
    }
    surface.flush();
    const out = surface.makeImageSnapshot();
    surface.dispose();
    return out;
  }

  /** applyLookPixels: each pixel's colour (not premultiplied) through the
   *  look, see-through pixels left alone. */
  private withLook(img: SkImage, look: LookId): SkImage {
    const ops = lookOps(look);
    const w = img.width(), h = img.height();
    const info = { width: w, height: h, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul };
    const px = img.readPixels(0, 0, info);
    if (!(px instanceof Uint8Array)) throw new Error('could not read the photo back for its look');
    applyLookToPixels(px, ops); // lookRules.applyLookToPixel on each pixel, matrices built once
    const out = this.Skia.Image.MakeImage(info, this.Skia.Data.fromBytes(px), w * 4);
    if (!out) throw new Error('could not make the photo with its look');
    return out;
  }

  private photo(canvas: SkCanvas, item: PhotoItem, photos: PhotoSource, assets: AssetSource, onMissing?: (src: string) => void): void {
    const img = photos(item.photoIndex);
    if (!img) return;
    const { x: sx, y: sy, w: sw, h: sh } = item.box;
    const { frame, slot } = item;
    const PX = FRAME_PX;

    // The frame's numbers are print's own (printFrameSpec.ts), in design px.
    const shadowOf = (s: PrintFrameShadow): Shadow => ({ color: s.color, blur: s.blur * PX, dx: 0, dy: s.offsetY * PX });

    // Mat (matte / polaroid), behind the photo, outside its clip.
    if (frame.decorated && (frame.style === 'matte' || frame.style === 'polaroid')) {
      const pad = PRINT_FRAME.mat.pad * PX;
      const bottomPad = (frame.style === 'polaroid' ? PRINT_FRAME.mat.polaroidBottom : PRINT_FRAME.mat.pad) * PX;
      const shadow = shadowOf(frame.style === 'polaroid' ? PRINT_FRAME.polaroidShadow : PRINT_FRAME.matteShadow);
      const path = frame.isRect
        ? this.shapePath(true, sx - pad, sy - pad, sw + pad * 2, sh + pad + bottomPad)
        : (() => {
          const rx = sw / 2 + pad, ry = sh / 2 + (pad + bottomPad) / 2;
          const cy = sy + sh / 2 + (bottomPad - pad) / 2;
          return this.shapePath(false, sx + sw / 2 - rx, cy - ry, rx * 2, ry * 2);
        })();
      this.fillShape(canvas, path, PRINT_FRAME.mat.color, shadow);
    }
    if (frame.decorated && frame.style === 'shadowbox') {
      this.fillShape(canvas, this.shapePath(frame.isRect, sx, sy, sw, sh), PRINT_FRAME.shadowbox.color, shadowOf(PRINT_FRAME.shadowbox.shadow));
    }

    canvas.save();
    const clipRadius = frame.decorated && frame.style === 'rounded' ? Math.min(sw, sh) * PRINT_FRAME.rounded.radius : 0;
    const clip = this.slotPath(slot, sx, sy, sw, sh, clipRadius);
    canvas.clipPath(clip.path, ClipOp.Intersect, true);

    canvas.save();
    if (slot.rotation) canvas.rotate(slot.rotation, sx + sw / 2, sy + sh / 2);
    const fit = slotPhotoRect({ w: img.width(), h: img.height() }, { w: sw, h: sh }, item.zoom, item.pan);
    if (slot.feather || slot.texture || item.look) {
      const baked = this.bakedPhoto(img, fit, sw, sh, item, assets, onMissing);
      this.image(canvas, baked, { x: 0, y: 0, w: baked.width(), h: baked.height() }, { x: sx, y: sy, w: baked.width(), h: baked.height() });
      baked.dispose();
    } else {
      this.image(canvas, img, { x: 0, y: 0, w: img.width(), h: img.height() }, { x: sx + fit.x, y: sy + fit.y, w: fit.w, h: fit.h }, { decoded: true });
    }
    canvas.restore();

    // The border line: drawn 2× wide on the clip path, so its inner half shows.
    if (frame.borderWidth && clip.stroked) {
      const lw = frame.borderWidth * PX * PRINT_FRAME.borderStroke;
      const p = this.paint(frame.color);
      p.setStyle(PaintStyle.Stroke);
      p.setStrokeWidth(lw);
      p.setStrokeMiter(10);
      if (frame.borderStyle === 'dashed') p.setPathEffect(this.Skia.PathEffect.MakeDash([lw, lw], 0));
      else if (frame.borderStyle === 'dotted') {
        p.setPathEffect(this.Skia.PathEffect.MakeDash([1, lw], 0));
        p.setStrokeCap(StrokeCap.Round);
      }
      canvas.drawPath(clip.path, p);
    }
    canvas.restore();

    // Inset line frames (thin / double), after the clip is released.
    if (frame.decorated && (frame.style === 'thin' || frame.style === 'double')) {
      const inset = (frame.style === 'double' ? PRINT_FRAME.inset.double : PRINT_FRAME.inset.thin) * PX;
      const p = this.paint(frame.color);
      p.setStyle(PaintStyle.Stroke);
      p.setStrokeWidth(PRINT_FRAME.inset.lineWidth * PX);
      p.setStrokeMiter(10);
      canvas.drawPath(this.shapePath(frame.isRect, sx + inset, sy + inset, sw - inset * 2, sh - inset * 2), p);
    }
  }

  private boxPhoto(canvas: SkCanvas, item: BoxPhotoItem, photos: PhotoSource): void {
    const img = photos(item.photoIndex);
    if (!img) return;
    const { x: bx, y: by, w: bw, h: bh } = item.box;
    const k = Math.max(bw / img.width(), bh / img.height());
    const dw = img.width() * k, dh = img.height() * k;
    canvas.save();
    canvas.clipRect(this.rect(item.box), ClipOp.Intersect, true);
    this.image(canvas, img, { x: 0, y: 0, w: img.width(), h: img.height() }, { x: bx + (bw - dw) / 2, y: by + (bh - dh) / 2, w: dw, h: dh }, { decoded: true });
    canvas.restore();
  }

  private look(s: BoxTextItem['style'], size: number): TextLook {
    return { family: s.fontFamily, size, bold: s.bold, italic: s.italic };
  }

  private boxText(canvas: SkCanvas, item: BoxTextItem, onCover: boolean): void {
    const look = this.look(item.style, item.fontSize);
    canvas.save();
    canvas.clipRect(this.rect(item.box), ClipOp.Intersect, true);
    const lines = wrapTextLines(this.text.measurer(look), item.style.text, item.maxWidth);
    const top = firstLineCenter(lines.length, item.centerY, item.fontSize);
    const step = item.fontSize * TEXT_LINE_HEIGHT;
    lines.forEach((line, i) => this.text.drawLine(canvas, line, item.anchorX, top + i * step, look, item.align, item.style, item.scale, 1, onCover));
    if (item.style.underline) this.text.underline(canvas, lines, item.anchorX, top, look, item.align, item.style.color || '#2D2D2D');
    canvas.restore();
  }

  private freeText(canvas: SkCanvas, item: FreeTextItem, onCover: boolean): void {
    const look = this.look(item.style, item.fontSize);
    const alpha = item.opacity / 100;
    canvas.save();
    canvas.translate(item.x, item.y);
    if (item.rotation) canvas.rotate(item.rotation, 0, 0);
    canvas.scale(item.scaleX, item.scaleY);
    const step = item.fontSize * TEXT_LINE_HEIGHT;
    const lines = wrapTextLines(this.text.measurer(look), item.style.text, item.boxWidth);
    lines.forEach((line, i) => this.text.drawLine(canvas, line, item.anchorX, step / 2 + i * step, look, item.align, item.style, item.scale, alpha, onCover));
    if (item.style.underline) {
      const blockCenter = step / 2 + ((lines.length - 1) * step) / 2;
      this.text.underline(canvas, lines, item.anchorX, firstLineCenter(lines.length, blockCenter, item.fontSize), look, item.align, item.style.color || '#2D2D2D', alpha);
    }
    canvas.restore();
  }

  /** A picture the page names, or null (told to onMissing). */
  private named(src: string, assets: AssetSource, onMissing?: (src: string) => void): SkImage | null {
    const img = assets(src);
    if (!img) onMissing?.(src);
    return img;
  }

  private whole(img: SkImage): Rect {
    return { x: 0, y: 0, w: img.width(), h: img.height() };
  }

  /** renderBackground: white paper, then the colour, wash, texture or picture. */
  private background(canvas: SkCanvas, plan: PagePlan, photos: PhotoSource, assets: AssetSource, onMissing?: (src: string) => void): void {
    const W = plan.width, H = plan.height;
    const all = this.Skia.XYWHRect(0, 0, W, H);
    canvas.drawRect(all, this.paint('#ffffff'));
    const f = plan.background;
    if (f.kind === 'texture') {
      // The tile at its print size, repeated from the page's top-left at the
      // background's opacity over the white paper (createPattern + globalAlpha).
      const tile = this.textureTile(f.name, f.color, f.tilePx);
      const p = this.Skia.Paint();
      p.setShader(tile.makeShaderOptions(TileMode.Repeat, TileMode.Repeat, FilterMode.Nearest, MipmapMode.None));
      p.setAlphaf(f.alpha);
      canvas.drawRect(all, p);
      return; // the opacity is the texture's alpha: no wash
    }
    if (f.kind === 'image') {
      const img = 'photo' in f.image ? photos(f.image.photo) : this.named(f.image.src, assets, onMissing);
      if (!img) canvas.drawRect(all, this.paint(PAPER));
      else if (f.cover) {
        const r = bgCoverFit(img.width(), img.height(), W, H, f.cover.zoom, f.cover.focusX, f.cover.focusY);
        this.image(canvas, img, this.whole(img), { x: r.x, y: r.y, w: r.width, h: r.height }, { decoded: true });
      } else this.image(canvas, img, this.whole(img), { x: 0, y: 0, w: W, h: H }, { decoded: true });
    } else canvas.drawRect(all, this.fill(f));
    if (plan.wash) canvas.drawRect(all, this.paint(plan.wash));
  }

  /** renderSlotQr: a white square, the code's PNG over it. */
  private qr(canvas: SkCanvas, it: QrItem, assets: AssetSource, onMissing?: (src: string) => void): void {
    const box = { x: it.x, y: it.y, w: it.side, h: it.side };
    canvas.drawRect(this.rect(box), this.paint('#ffffff'));
    const img = this.named(it.src, assets, onMissing);
    if (img) this.image(canvas, img, this.whole(img), box, { decoded: true });
  }

  /** A moved caption-box QR: the white square at its size and turn, the code contained in it. */
  private freeQr(canvas: SkCanvas, it: FreeQrItem, assets: AssetSource, onMissing?: (src: string) => void): void {
    const side = Math.min(it.w, it.h);
    canvas.save();
    canvas.translate(it.cx, it.cy);
    if (it.rot) canvas.rotate(it.rot, 0, 0);
    canvas.drawRect(this.Skia.XYWHRect(-it.w / 2, -it.h / 2, it.w, it.h), this.paint('#ffffff'));
    const img = this.named(it.src, assets, onMissing);
    if (img) this.image(canvas, img, this.whole(img), { x: -side / 2, y: -side / 2, w: side, h: side }, { decoded: true });
    canvas.restore();
  }

  /** renderSlotOrnament (and a corner of corner art): the PNG in its square, no backing. */
  private graphic(canvas: SkCanvas, it: GraphicItem | CornerItem, assets: AssetSource, onMissing?: (src: string) => void): void {
    const img = this.named(it.src, assets, onMissing);
    const side = it.kind === 'corner' ? it.size : it.side;
    if (img) this.image(canvas, img, this.whole(img), { x: it.x, y: it.y, w: side, h: side }, { decoded: true });
  }

  /** A sticker, or a moved caption-box graphic: at its centre, size and turn. */
  private freeGraphic(canvas: SkCanvas, it: FreeGraphicItem, assets: AssetSource, onMissing?: (src: string) => void): void {
    const img = this.named(it.src, assets, onMissing);
    if (!img) return;
    canvas.save();
    canvas.translate(it.cx, it.cy);
    if (it.rot) canvas.rotate(it.rot, 0, 0);
    this.image(canvas, img, this.whole(img), { x: -it.w / 2, y: -it.h / 2, w: it.w, h: it.h }, { decoded: true });
    canvas.restore();
  }

  /** The page at print size, no bleed, onto `canvas` (W × H). `words: false`
   *  leaves out every word (a caption, a text in a photo frame, a free text)
   *  and draws the rest the same, like the website's drawPrintPage. */
  draw(canvas: SkCanvas, plan: PagePlan, photos: PhotoSource, { words = true, assets = () => null, onMissing }: DrawOptions = {}): void {
    this.background(canvas, plan, photos, assets, onMissing);
    for (const item of plan.items) {
      switch (item.kind) {
        case 'photo': this.photo(canvas, item, photos, assets, onMissing); break;
        case 'boxText': if (words) this.boxText(canvas, item, plan.onCover); break;
        case 'freeText': if (words) this.freeText(canvas, item, plan.onCover); break;
        case 'boxPhoto': this.boxPhoto(canvas, item, photos); break;
        case 'qr': this.qr(canvas, item, assets, onMissing); break;
        case 'freeQr': this.freeQr(canvas, item, assets, onMissing); break;
        case 'graphic':
        case 'corner': this.graphic(canvas, item, assets, onMissing); break;
        case 'freeGraphic': this.freeGraphic(canvas, item, assets, onMissing); break;
      }
    }
  }

  /** The page at print size (no bleed) as a picture. The caller disposes it. */
  renderTrim(plan: PagePlan, photos: PhotoSource, options: DrawOptions = {}): SkImage {
    const W = plan.width, H = plan.height;
    const surface = this.Skia.Surface.Make(W, H);
    if (!surface) throw new Error(`could not make a ${W}×${H} drawing surface`);
    this.draw(surface.getCanvas(), plan, photos, options);
    surface.flush();
    const image = surface.makeImageSnapshot();
    surface.dispose();
    return image;
  }

  /** printBleed drawMirroredEdges: `img`, already drawn at `box`, carries on
   *  outward by `m` on each side as its own mirror image. */
  mirrorEdges(canvas: SkCanvas, img: SkImage, box: Rect, m: Margins): void {
    for (const op of mirrorOps(img.width(), img.height(), box, m)) {
      canvas.save();
      canvas.translate(op.flipX ? op.dx + op.dw : op.dx, op.flipY ? op.dy + op.dh : op.dy);
      canvas.scale(op.flipX ? -1 : 1, op.flipY ? -1 : 1);
      this.image(canvas, img, { x: op.sx, y: op.sy, w: op.sw, h: op.sh }, { x: 0, y: 0, w: op.dw, h: op.dh });
      canvas.restore();
    }
  }

  /** ctx.drawImage(img, x, y, w, h), for a drawing outside the page (the
   *  cover): `decoded` for a picture file (a photo), not for a canvas. */
  drawPicture(canvas: SkCanvas, img: SkImage, dst: Rect, decoded = false): void {
    this.image(canvas, img, this.whole(img), dst, { decoded });
  }

  /** The page as the print file's picture: drawn at print size, then its
   *  bleed mirrored round every edge (printBleed withBleed). The caller
   *  disposes the image. */
  renderPrintPage(plan: PagePlan, photos: PhotoSource, options: DrawOptions = {}): SkImage {
    const W = plan.width, H = plan.height, b = plan.bleed;
    const trim = this.renderTrim(plan, photos, options);
    const outSurface = this.Skia.Surface.Make(W + 2 * b, H + 2 * b);
    if (!outSurface) throw new Error(`could not make a ${W + 2 * b}×${H + 2 * b} drawing surface`);
    const out = outSurface.getCanvas();
    out.drawRect(this.Skia.XYWHRect(0, 0, W + 2 * b, H + 2 * b), this.paint('#ffffff'));
    this.image(out, trim, { x: 0, y: 0, w: W, h: H }, { x: b, y: b, w: W, h: H });
    this.mirrorEdges(out, trim, { x: b, y: b, w: W, h: H }, { top: b, right: b, bottom: b, left: b });
    outSurface.flush();
    const image = outSurface.makeImageSnapshot();
    trim.dispose();
    outSurface.dispose();
    return image;
  }
}
