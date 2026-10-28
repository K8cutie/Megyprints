/* ══════════════════════════════════════════════════════════════════════════
   DRAW ONE ALBUM PAGE with Skia, from its plan (pagePlan.ts).

   The drawing follows the website's print renderer call by call
   (printPipeline renderBackground / renderSlotPhoto / applySlotClip /
   renderTextElement / renderSlotText, wordArt.ts, printBleed.ts), with the
   same canvas rules where Skia's defaults differ:
     • a photo is drawn with bilinear sampling and no mipmaps (canvas
       imageSmoothingQuality 'low'), and its own edges are smoothed only
       when the drawing is turned off the page's axes (Chromium's rule:
       a picture's edges are smoothed when the transform does not keep
       them level, as in the template's turned slot);
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
import { ClipOp, FilterMode, MipmapMode, PaintStyle, StrokeCap, TileMode, BlurStyle } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import { slotPhotoRect } from '@web/pages/builder/slotPhotoFit';
import { archRy, heartCurves, isPathShape, maskPathD, starPoints } from '@web/pages/builder/maskShapes';
import { PRINT_FRAME, type PrintFrameShadow } from '@web/pages/builder/printFrameSpec';
import { mirrorOps } from '@web/pages/builder/bleedGeometry';
import { wrapTextLines, firstLineCenter, TEXT_LINE_HEIGHT } from '@web/pages/builder/wordArtRules';
import { FRAME_PX, type BoxPhotoItem, type BoxTextItem, type Fill, type FreeTextItem, type PagePlan, type PhotoItem, type Rect } from './pagePlan';
import type { PageText, TextLook } from './pageText';

/** The page's photos, by album photo index (null = not loaded: drawn empty). */
export type PhotoSource = (photoIndex: number) => SkImage | null;

interface Shadow { color: string; blur: number; dx: number; dy: number }

export interface DrawOptions {
  /** Draw the page's words (default). false: the page under them. */
  words?: boolean;
}

export class PageDrawer {
  constructor(private readonly Skia: Skia, private readonly text: PageText) {}

  private paint(color: string): SkPaint {
    const p = this.Skia.Paint();
    p.setAntiAlias(true);
    p.setColor(this.Skia.Color(color));
    return p;
  }

  private rect(r: Rect) {
    return this.Skia.XYWHRect(r.x, r.y, r.w, r.h);
  }

  /** ctx.drawImage(img, x, y, w, h): bilinear, no mipmaps; the picture's
   *  edges smoothed only when the canvas is turned off the page's axes. */
  private image(canvas: SkCanvas, img: SkImage, src: Rect, dst: Rect): void {
    const p = this.Skia.Paint();
    const m = canvas.getTotalMatrix().get();
    const level = (m[1] === 0 && m[3] === 0) || (m[0] === 0 && m[4] === 0);
    p.setAntiAlias(!level);
    canvas.drawImageRectOptions(img, this.rect(src), this.rect(dst), FilterMode.Linear, MipmapMode.None, p);
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

  private fill(f: Fill): SkPaint {
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

  private photo(canvas: SkCanvas, item: PhotoItem, photos: PhotoSource): void {
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
    this.image(canvas, img, { x: 0, y: 0, w: img.width(), h: img.height() }, { x: sx + fit.x, y: sy + fit.y, w: fit.w, h: fit.h });
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
    this.image(canvas, img, { x: 0, y: 0, w: img.width(), h: img.height() }, { x: bx + (bw - dw) / 2, y: by + (bh - dh) / 2, w: dw, h: dh });
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

  /** The page at print size, no bleed, onto `canvas` (W × H). `words: false`
   *  leaves out every word (a caption, a text in a photo frame, a free text)
   *  and draws the rest the same, like the website's drawPrintPage. */
  draw(canvas: SkCanvas, plan: PagePlan, photos: PhotoSource, { words = true }: DrawOptions = {}): void {
    const W = plan.width, H = plan.height;
    const all = this.Skia.XYWHRect(0, 0, W, H);
    canvas.drawRect(all, this.paint('#ffffff'));
    canvas.drawRect(all, this.fill(plan.background));
    if (plan.wash) canvas.drawRect(all, this.paint(plan.wash));
    for (const item of plan.items) {
      if (item.kind === 'photo') this.photo(canvas, item, photos);
      else if (item.kind === 'boxText') { if (words) this.boxText(canvas, item, plan.onCover); }
      else if (item.kind === 'freeText') { if (words) this.freeText(canvas, item, plan.onCover); }
      else this.boxPhoto(canvas, item, photos);
    }
  }

  /** The page at print size, no bleed, as a picture (the caller disposes it). */
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

  /** A page picture at print size with its bleed mirrored round every edge
   *  (printBleed withBleed). The caller disposes both pictures. */
  withBleed(trim: SkImage, plan: PagePlan): SkImage {
    const W = plan.width, H = plan.height, b = plan.bleed;
    const outSurface = this.Skia.Surface.Make(W + 2 * b, H + 2 * b);
    if (!outSurface) throw new Error(`could not make a ${W + 2 * b}×${H + 2 * b} drawing surface`);
    const out = outSurface.getCanvas();
    out.drawRect(this.Skia.XYWHRect(0, 0, W + 2 * b, H + 2 * b), this.paint('#ffffff'));
    this.image(out, trim, { x: 0, y: 0, w: W, h: H }, { x: b, y: b, w: W, h: H });
    this.drawMirroredEdges(out, trim, { x: b, y: b, w: W, h: H }, { top: b, right: b, bottom: b, left: b });
    outSurface.flush();
    const image = outSurface.makeImageSnapshot();
    outSurface.dispose();
    return image;
  }

  /** A picture drawn the way the website's canvas drawImage draws it (see image()). */
  drawPicture(canvas: SkCanvas, img: SkImage, src: Rect, dst: Rect): void {
    this.image(canvas, img, src, dst);
  }

  /** The mirrored strips round a picture already drawn at `box` (printBleed
   *  drawMirroredEdges): the bleed of a page, the turn-in round the cover. */
  drawMirroredEdges(canvas: SkCanvas, src: SkImage, box: Rect, m: { top: number; right: number; bottom: number; left: number }): void {
    for (const op of mirrorOps(src.width(), src.height(), box, m)) {
      canvas.save();
      canvas.translate(op.flipX ? op.dx + op.dw : op.dx, op.flipY ? op.dy + op.dh : op.dy);
      canvas.scale(op.flipX ? -1 : 1, op.flipY ? -1 : 1);
      this.image(canvas, src, { x: op.sx, y: op.sy, w: op.sw, h: op.sh }, { x: 0, y: 0, w: op.dw, h: op.dh });
      canvas.restore();
    }
  }

  /** The page as the print file's picture: drawn at print size, then its
   *  bleed mirrored round every edge (printBleed withBleed). The caller
   *  disposes the image. */
  renderPrintPage(plan: PagePlan, photos: PhotoSource, options: DrawOptions = {}): SkImage {
    const trim = this.renderTrim(plan, photos, options);
    const image = this.withBleed(trim, plan);
    trim.dispose();
    return image;
  }
}
