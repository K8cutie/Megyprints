/** ═══════════════════════════════════════════════════════════════
    PRINT PIPELINE — High-Resolution Page Export
    Generates 300 DPI print-ready output from album page data.
    ═══════════════════════════════════════════════════════════════ */

import type { AlbumPage, UploadedPhoto, AlbumSizePreset } from './types';
import { ALBUM_SIZES, CORNER_POSITIONS, cornerImageUrl, resolveBgImageSrc } from './types';
import { dedupeSlotFills } from './slotUtils';
import { getTemplateById, adaptTemplateToOrientation } from './pageTemplates';
import { marginForTemplate } from './binding';
import { qrRect } from '../../lib/qrMemory';
import { ornamentFit } from './ornaments';
import { drawWordArtText } from './wordArt';
import type { QrFill, OrnamentFill, SlotText, CoverDesign, CoverType } from './types';
import { textureDataUri, TEXTURE_TILE_PX } from './textures';
import { coverWrapGeometry } from './coverGeometry';
import { coverLayout, type PositionedText } from './coverLayout';

/** Print resolution in DPI (dots per inch) */
export const PRINT_DPI = 300;

/** Multiplier for 300 DPI export relative to UI canvas */
export function getPrintMultiplier(albumSize: AlbumSizePreset): number {
  const uiSize = getUISize(albumSize);
  const printSize = getPrintDimensions(albumSize);
  // Use the larger dimension to determine scale
  const scale = Math.max(
    printSize.width / uiSize.width,
    printSize.height / uiSize.height,
  );
  return Math.ceil(scale);
}

/** UI canvas dimensions (must match useCanvasEngine.ts) */
function getUISize(albumSize: AlbumSizePreset) {
  switch (albumSize) {
    case '6x6': return { width: 432, height: 432 };
    case '8x8': return { width: 576, height: 576 };
    case '6x4': return { width: 432, height: 288 };
    case '11.5x8': return { width: 690, height: 480 };
    case '8.5x11': return { width: 510, height: 660 };
    default: return { width: 576, height: 576 };
  }
}

/** Print dimensions in pixels at 300 DPI.
 *  ALBUM_SIZES already stores the print pixel size at 300 DPI
 *  (e.g. an 8" side = 8 × 300 = 2400px), so we return it directly. */
export function getPrintDimensions(albumSize: AlbumSizePreset) {
  const config = ALBUM_SIZES.find((s) => s.preset === albumSize);
  if (!config) return { width: 2400, height: 2400 };
  return { width: config.width, height: config.height };
}

/** Generate a print-ready page image at 300 DPI.
 *  Uses the Fabric.js canvas from the design phase, scaled up.
 *  Falls back to manual canvas compositing if Fabric is not available. */
export async function renderPageForPrint(
  options: {
    page: AlbumPage;
    photos: UploadedPhoto[];
    albumSize: AlbumSizePreset;
    /** Page index — drives the mirrored binding (gutter) keep-out edge */
    pageIndex?: number;
    /** Optional: Fabric.js canvas instance — if provided, uses it for high-quality export */
    fabricCanvas?: any;
  },
): Promise<Blob> {
  const { page, photos, albumSize, pageIndex = 0, fabricCanvas } = options;

  // ── Method 1: Fabric.js canvas export (highest quality) ──
  if (fabricCanvas) {
    const multiplier = getPrintMultiplier(albumSize);
    const dataUrl = fabricCanvas.toDataURL({
      format: 'png',
      quality: 1,
      multiplier,
    });
    return dataURLToBlob(dataUrl);
  }

  // ── Method 2: Manual canvas compositing (fallback) ──
  return renderPageManually(page, photos, albumSize, pageIndex);
}

/** Manual canvas compositing — loads original photos at full resolution
 *  and composites them onto a high-res canvas. */
async function renderPageManually(
  page: AlbumPage,
  photos: UploadedPhoto[],
  albumSize: AlbumSizePreset,
  pageIndex: number,
): Promise<Blob> {
  const { width: W, height: H } = getPrintDimensions(albumSize);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Paper is white — fill the whole canvas first so the JPEG export (no alpha
  // channel) can never turn an uncovered/transparent area black.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // ── Background ──
  await renderBackground(ctx, page, W, H, photos);

  // ── Slot Photos ──
  // Match the editor/preview geometry EXACTLY: adapt the template to the page
  // orientation, compute the safe area from its margins PLUS the 0.5" binding
  // keep-out on the inner (spine) edge, then place each slot as a fraction of
  // that safe area. (Slot coords are fractions 0–1, not percentages.)
  const template = page.templateId ? getTemplateById(page.templateId) : null;
  // NOTE: `|| page.qrFills || page.slotTexts || page.ornamentFills` so a QR-only,
  // text-only or ornament-only page (no photo fills) still renders its content.
  if (template && (page.slotFills || page.qrFills || page.slotTexts || page.ornamentFills)) {
    const adapted = adaptTemplateToOrientation(template, W, H);
    const m = marginForTemplate(adapted, adapted.margin, albumSize, pageIndex);
    const safeX = W * m.left;
    const safeY = H * m.top;
    const safeW = W * (1 - m.left - m.right);
    const safeH = H * (1 - m.top - m.bottom);
    const fills = dedupeSlotFills(page.slotFills ?? []);

    for (let i = 0; i < adapted.slots.length; i++) {
      const slot = adapted.slots[i];
      const sx = safeX + slot.x * safeW;
      const sy = safeY + slot.y * safeH;
      const sw = slot.width * safeW;
      const sh = slot.height * safeH;

      // Content precedence is DRIVEN BY page data (not slot.kind): QR → ornament
      // → text → photo. QR uses qrFills[i]; ornament uses ornamentFills[i];
      // per-slot text uses slotTexts[i].
      const qr = page.qrFills?.[i] ?? null;
      if (qr) {
        await renderSlotQr(ctx, qr, sx, sy, sw, sh);
        continue;
      }
      const ornament = page.ornamentFills?.[i] ?? null;
      if (ornament) {
        await renderSlotOrnament(ctx, ornament, sx, sy, sw, sh);
        continue;
      }
      const st = page.slotTexts?.[i] ?? null;
      if (st) {
        renderSlotText(ctx, st, sx, sy, sw, sh, W);
        continue;
      }

      const photoIdx = fills[i];
      if (photoIdx == null || photoIdx < 0) continue;

      const photo = photos[photoIdx];
      if (!photo) continue;

      await renderSlotPhoto(ctx, photo, slot, sx, sy, sw, sh, page, i, adapted.fullBleed ?? false);
    }
  }

  // ── Decorative theme corners (one set, all four corners) ──
  if (page.cornerBase) {
    const cornerSize = Math.min(W, H) * 0.25;
    for (const pos of CORNER_POSITIONS) {
      try {
        const cimg = await loadImage(cornerImageUrl(page.cornerBase, pos));
        const isTop = pos === 'tl' || pos === 'tr';
        const isLeft = pos === 'tl' || pos === 'bl';
        const cx = isLeft ? 0 : W - cornerSize;
        const cy = isTop ? 0 : H - cornerSize;
        ctx.drawImage(cimg, cx, cy, cornerSize, cornerSize);
      } catch { /* missing corner asset — skip */ }
    }
  }

  // ── Text Elements ──
  // Bound captions (boxIndex) print INSIDE their textbox region; free text keeps
  // its x/y. Each element's chosen font is loaded before drawing so the canvas
  // doesn't silently fall back to the default serif.
  const textTpl = template ? adaptTemplateToOrientation(template, W, H) : null;
  const tm = textTpl ? marginForTemplate(textTpl, textTpl.margin, albumSize, pageIndex) : null;
  for (const text of page.textElements || []) {
    const fam = text.fontFamily || 'serif';
    const primary = fam.match(/"([^"]+)"/)?.[1];
    if (primary) {
      try { await document.fonts.load(`${(text.fontSize || 24) * (W / 576)}px "${primary}"`); } catch { /* ignore */ }
    }
    let slot: { x: number; y: number; w: number; h: number; align?: 'left' | 'center' | 'right' } | null = null;
    if (text.boxIndex != null && textTpl && tm) {
      const ts = textTpl.textSlots?.[text.boxIndex];
      if (ts) {
        const sX = W * tm.left, sY = H * tm.top, sW = W * (1 - tm.left - tm.right), sH = H * (1 - tm.top - tm.bottom);
        slot = { x: sX + ts.x * sW, y: sY + ts.y * sH, w: ts.width * sW, h: ts.height * sH, align: ts.align };
      }
    }
    renderTextElement(ctx, text, W, H, slot);
  }

  // ── Caption-box CONTENT (photo / QR) ──
  // Mirrors the photo-slot content pass but keyed to template.textSlots. TEXT
  // captions already printed via the boxIndex branch above; here we draw QR and
  // photo with precedence qr → (text already drawn) → photo. Drawn last so the
  // caption layer sits above the photos (consistent with DOM/Fabric z-order).
  if (textTpl && tm && (page.textSlotFills || page.textSlotQr || page.textSlotOrnament)) {
    const sX = W * tm.left, sY = H * tm.top, sW = W * (1 - tm.left - tm.right), sH = H * (1 - tm.top - tm.bottom);
    const textSlots = textTpl.textSlots ?? [];
    for (let j = 0; j < textSlots.length; j++) {
      const ts = textSlots[j];
      const bx = sX + ts.x * sW;
      const by = sY + ts.y * sH;
      const bw = ts.width * sW;
      const bh = ts.height * sH;
      // (1) QR — reuse the photo-slot QR renderer.
      const tqr = page.textSlotQr?.[j] ?? null;
      if (tqr) {
        await renderSlotQr(ctx, tqr, bx, by, bw, bh);
        continue;
      }
      // (1b) ORNAMENT — reuse the photo-slot ornament renderer.
      const torn = page.textSlotOrnament?.[j] ?? null;
      if (torn) {
        await renderSlotOrnament(ctx, torn, bx, by, bw, bh);
        continue;
      }
      // (2) TEXT already handled by the boxIndex branch — never overdraw it.
      if ((page.textElements || []).some((t) => t.boxIndex === j)) continue;
      // (3) PHOTO — cover-fit clipped to the box rect (no frame).
      const tPhotoIdx = page.textSlotFills?.[j] ?? null;
      if (tPhotoIdx == null || tPhotoIdx < 0) continue;
      const tPhoto = photos[tPhotoIdx];
      if (!tPhoto) continue;
      try {
        const img = await loadImage(tPhoto.previewUrl);
        const coverScale = Math.max(bw / img.width, bh / img.height);
        const drawW = img.width * coverScale;
        const drawH = img.height * coverScale;
        ctx.save();
        ctx.beginPath();
        ctx.rect(bx, by, bw, bh);
        ctx.clip();
        ctx.drawImage(img, bx + (bw - drawW) / 2, by + (bh - drawH) / 2, drawW, drawH);
        ctx.restore();
      } catch { /* photo failed to load — leave the box empty */ }
    }
  }

  // Fit Supabase Storage's upload cap. We composite at full 300 DPI above (crisp
  // text / QR / edges), then downscale + JPEG-compress the ENCODED image so a
  // whole album PDF stays well under the limit. Lossless PNG was 10–50 MB/PAGE
  // (→ hundreds of MB / rejected). ~1800 px longest side ≈ 225 DPI at 8–9" —
  // solid photo-book quality — keeps a ~50-page album under ~40 MB. Raise
  // MAX_SIDE / quality once the storage plan allows bigger uploads.
  const MAX_SIDE = 1800;
  const scale = Math.min(1, MAX_SIDE / Math.max(W, H));
  let out: HTMLCanvasElement = canvas;
  if (scale < 1) {
    out = document.createElement('canvas');
    out.width = Math.round(W * scale);
    out.height = Math.round(H * scale);
    const octx = out.getContext('2d')!;
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(canvas, 0, 0, out.width, out.height);
  }
  return new Promise((resolve) => {
    out.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.82);
  });
}

/** Render background at print resolution */
async function renderBackground(
  ctx: CanvasRenderingContext2D,
  page: AlbumPage,
  W: number,
  H: number,
  photos: UploadedPhoto[],
) {
  const bg = page.background;
  if (!bg) {
    ctx.fillStyle = '#FFFBF7';
    ctx.fillRect(0, 0, W, H);
    return;
  }

  switch (bg.type) {
    case 'solid':
      ctx.fillStyle = bg.solid || '#FFFBF7';
      ctx.fillRect(0, 0, W, H);
      break;

    case 'gradient': {
      const grad = bg.gradient;
      if (!grad) {
        ctx.fillStyle = '#FFFBF7';
        ctx.fillRect(0, 0, W, H);
        break;
      }
      const angleRad = ((grad.angle ?? 135) * Math.PI) / 180;
      const x1 = W / 2 - (W / 2) * Math.cos(angleRad);
      const y1 = H / 2 - (H / 2) * Math.sin(angleRad);
      const x2 = W / 2 + (W / 2) * Math.cos(angleRad);
      const y2 = H / 2 + (H / 2) * Math.sin(angleRad);
      const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
      for (const stop of grad.stops) {
        gradient.addColorStop(stop.offset, stop.color);
      }
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, W, H);
      break;
    }

    case 'image': {
      const src = resolveBgImageSrc(bg, photos);
      if (src && !src.includes('gradient(')) {
        try {
          const img = await loadImage(src);
          ctx.drawImage(img, 0, 0, W, H);
        } catch {
          ctx.fillStyle = '#FFFBF7';
          ctx.fillRect(0, 0, W, H);
        }
      } else {
        // gradient-string presets or no source → neutral fill
        ctx.fillStyle = '#FFFBF7';
        ctx.fillRect(0, 0, W, H);
      }
      break;
    }

    case 'texture': {
      // Material texture — tile the procedural SVG data URI across the page.
      // PARITY: the tile is TEXTURE_TILE_PX on the on-screen UI canvas; the
      // print canvas is 300 DPI (W ≫ UI width), so we upscale the tile by the
      // same DPI ratio onto an offscreen canvas before createPattern, else the
      // material would read far denser in print than on screen.
      // OPACITY: applied via ctx.globalAlpha (true layer-alpha, matching screen)
      // — NOT the white-overlay trick below, which we skip for texture.
      try {
        const tile = await loadImage(textureDataUri((bg as any).texture, (bg as any).textureColor));
        const dpiScale = W / getUISize(page.size).width;
        const tilePx = Math.max(1, Math.round(TEXTURE_TILE_PX * dpiScale));
        // Pre-scale one tile onto an offscreen canvas at the print tile size so
        // createPattern repeats it at the correct on-page scale.
        const off = document.createElement('canvas');
        off.width = tilePx;
        off.height = tilePx;
        const octx = off.getContext('2d');
        let pat: CanvasPattern | null = null;
        if (octx) {
          octx.drawImage(tile, 0, 0, tilePx, tilePx);
          pat = ctx.createPattern(off, 'repeat');
        }
        if (pat) {
          ctx.save();
          ctx.globalAlpha = (bg.opacity ?? 100) / 100;
          ctx.fillStyle = pat;
          ctx.fillRect(0, 0, W, H);
          ctx.restore();
        } else {
          ctx.fillStyle = '#FFFBF7';
          ctx.fillRect(0, 0, W, H);
        }
      } catch {
        ctx.fillStyle = '#FFFBF7';
        ctx.fillRect(0, 0, W, H);
      }
      // Opacity already applied via globalAlpha → skip the white-overlay block.
      return;
    }

    default:
      ctx.fillStyle = '#FFFBF7';
      ctx.fillRect(0, 0, W, H);
  }

  // Apply opacity overlay if needed
  const opacity = bg.opacity ?? 100;
  if (opacity < 100) {
    ctx.fillStyle = `rgba(255, 251, 247, ${(100 - opacity) / 100})`;
    ctx.fillRect(0, 0, W, H);
  }
}

/** Render a QR living-memory slot at print resolution: a centered square QR
 *  (PNG, already crisp) on a white backing for reliable scanning. */
async function renderSlotQr(
  ctx: CanvasRenderingContext2D,
  qr: QrFill,
  sx: number, sy: number, sw: number, sh: number,
) {
  const { dx, dy, side } = qrRect(sx, sy, sw, sh);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(dx, dy, side, side);
  try {
    const img = await loadImage(qr.qrPngDataUrl);
    ctx.drawImage(img, dx, dy, side, side);
  } catch { /* QR failed to load — leave the white square (still prints clean) */ }
}

/** Render a single slot ornament at print resolution. The stored pngDataUrl is a
 *  crisp square PNG (rasterized at pick-time), so drawImage prints sharp — no
 *  white backing (transparent accent), contained via ornamentFit like all renderers. */
async function renderSlotOrnament(
  ctx: CanvasRenderingContext2D,
  ornament: OrnamentFill,
  sx: number, sy: number, sw: number, sh: number,
) {
  const { dx, dy, side } = ornamentFit(sx, sy, sw, sh);
  try {
    const img = await loadImage(ornament.pngDataUrl);
    ctx.drawImage(img, dx, dy, side, side);
  } catch { /* ornament failed to load — leave the slot empty (clean) */ }
}

/** Render a single slot photo at print resolution */
async function renderSlotPhoto(
  ctx: CanvasRenderingContext2D,
  photo: UploadedPhoto,
  slot: any,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  page: AlbumPage,
  slotIndex: number,
  fullBleed: boolean,
) {
  // Load original photo at full resolution
  let img: HTMLImageElement;
  try {
    img = await loadImage(photo.previewUrl);
  } catch {
    return;
  }

  // ── Frame / border spec (single source: types.ts FRAME_STYLES) ──────────
  // 1 UI css-px → PX print-px. Matches the border scale (frameWidth*PRINT_DPI/72)
  // used below and the raw-px insets/pads of the Fabric + DOM renderers, so the
  // three renderers stay in lockstep.
  const PX = PRINT_DPI / 72;
  const effFrameStyle = (fullBleed ? 'none' : page.frameStyle) ?? 'none';
  const effBorderStyle = page.photoBorderStyle ?? 'solid';
  const frameColor = page.photoBorderColor ?? slot.borderColor ?? '#FFFFFF';
  // Frames mirror Fabric: suppressed for full-bleed pages and the heart shape.
  const drawFrame = effFrameStyle !== 'none' && slot.shape !== 'heart';
  const isRect = slot.shape !== 'circle' && slot.shape !== 'oval';

  // ── Decorative mat (matte / polaroid) — drawn BEHIND the photo, OUTSIDE the
  // slot clip so it extends past the slot edge. Polaroid is weighted at the
  // bottom and casts a stronger drop shadow.
  if (drawFrame && (effFrameStyle === 'matte' || effFrameStyle === 'polaroid')) {
    const pad = 8 * PX;
    const bottomPad = (effFrameStyle === 'polaroid' ? 28 : 8) * PX;
    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    if (effFrameStyle === 'polaroid') {
      ctx.shadowColor = 'rgba(0,0,0,0.22)';
      ctx.shadowBlur = 16 * PX;
      ctx.shadowOffsetY = 6 * PX;
    } else {
      ctx.shadowColor = 'rgba(0,0,0,0.18)';
      ctx.shadowBlur = 6 * PX;
    }
    if (isRect) {
      ctx.fillRect(sx - pad, sy - pad, sw + pad * 2, sh + pad + bottomPad);
    } else {
      ctx.beginPath();
      ctx.ellipse(
        sx + sw / 2,
        sy + sh / 2 + (bottomPad - pad) / 2,
        sw / 2 + pad,
        sh / 2 + (pad + bottomPad) / 2,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.restore();
  }

  // ── Shadowbox — outer drop shadow cast by the photo itself. Drawn as a filled
  // backing rect (under the photo) carrying the shadow, since the clipped photo
  // can't cast one outward.
  if (drawFrame && effFrameStyle === 'shadowbox') {
    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 14 * PX;
    ctx.shadowOffsetY = 4 * PX;
    if (isRect) {
      ctx.fillRect(sx, sy, sw, sh);
    } else {
      ctx.beginPath();
      ctx.ellipse(sx + sw / 2, sy + sh / 2, sw / 2, sh / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  ctx.save();

  // Clip to slot shape. Rounded frame clips with a 10% corner radius.
  const clipRadius = drawFrame && effFrameStyle === 'rounded' ? Math.min(sw, sh) * 0.1 : 0;
  applySlotClip(ctx, slot, sx, sy, sw, sh, clipRadius);

  // Apply rotation around slot center
  const rotation = slot.rotation || 0;
  if (rotation !== 0) {
    ctx.translate(sx + sw / 2, sy + sh / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-(sx + sw / 2), -(sy + sh / 2));
  }

  // Apply slot transform (scale/offset from user editing)
  const slotScale = page.slotScales?.[slotIndex] ?? 1;
  const slotOffsetX = page.slotOffsetsX?.[slotIndex] ?? 0;
  const slotOffsetY = page.slotOffsetsY?.[slotIndex] ?? 0;

  // Cover-fit calculation at print resolution
  const imgAspect = img.naturalWidth / img.naturalHeight;
  const slotAspect = sw / sh;
  let drawW: number, drawH: number;
  if (imgAspect > slotAspect) {
    drawH = sh;
    drawW = drawH * imgAspect;
  } else {
    drawW = sw;
    drawH = drawW / imgAspect;
  }

  // Apply user zoom
  if (slotScale !== 1) {
    drawW *= slotScale;
    drawH *= slotScale;
  }

  // Center and apply offset
  const drawX = sx + sw / 2 - drawW / 2 + slotOffsetX * (sw / 100);
  const drawY = sy + sh / 2 - drawH / 2 + slotOffsetY * (sh / 100);

  ctx.drawImage(img, drawX, drawY, drawW, drawH);

  // Draw the photo frame. The theme-baked page frame overrides the per-slot
  // template border when present; falls back to the slot border for old albums.
  // The `rounded` decorative frame thickens a thin border to 3px (matches
  // Fabric's max(borderWidth,3)) so the soft corner reads.
  let frameWidth = fullBleed ? 0 : (page.photoBorderWidth ?? slot.borderWidth);
  if (drawFrame && effFrameStyle === 'rounded') frameWidth = Math.max(frameWidth ?? 0, 3);
  if (frameWidth) {
    ctx.strokeStyle = frameColor;
    // Dashed / dotted border style — mirrors the DOM (border-style) + Fabric
    // (strokeDashArray) renderers. The line dash is in print px, so scale by PX.
    const lw = frameWidth * PX * 2;
    if (effBorderStyle === 'dashed') ctx.setLineDash([lw, lw]);
    else if (effBorderStyle === 'dotted') ctx.setLineDash([1, lw]);
    else ctx.setLineDash([]);
    if (effBorderStyle === 'dotted') ctx.lineCap = 'round';
    // The active slot clip halves a centered stroke (only the inner half shows),
    // so draw it 2x to make the visible inner half equal the intended width.
    ctx.lineWidth = lw;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineCap = 'butt';
  }

  ctx.restore();

  // ── Decorative inset line frames (thin / double) ───────────────────────────
  // Drawn AFTER the clip is released so the lines sit cleanly inside the slot
  // edge (mirrors the Fabric inset rects/ellipses + the DOM inset box-shadow /
  // outline). 1px (thin) and the inner gap (3px) scale by PX to print res.
  if (drawFrame && (effFrameStyle === 'thin' || effFrameStyle === 'double')) {
    ctx.save();
    ctx.strokeStyle = frameColor;
    ctx.lineWidth = 1 * PX;
    const inset = (effFrameStyle === 'double' ? 3 : 1) * PX;
    if (isRect) {
      ctx.strokeRect(sx + inset, sy + inset, sw - inset * 2, sh - inset * 2);
    } else {
      ctx.beginPath();
      ctx.ellipse(sx + sw / 2, sy + sh / 2, sw / 2 - inset, sh / 2 - inset, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** Apply clip path for special shapes.
 *  `cornerRadius` (print px) rounds the default rect clip — used by the
 *  `rounded` decorative frame so the photo corners match the DOM/Fabric
 *  renderers' 10% radius. */
function applySlotClip(
  ctx: CanvasRenderingContext2D,
  slot: any,
  x: number,
  y: number,
  w: number,
  h: number,
  cornerRadius = 0,
) {
  ctx.beginPath();

  switch (slot.shape) {
    case 'circle': {
      const size = Math.min(w, h);
      const cx = x + w / 2;
      const cy = y + h / 2;
      ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
      break;
    }
    case 'heart': {
      const size = Math.min(w, h);
      const cx = x + w / 2;
      const cy = y + h / 2;
      const s = size / 24;
      ctx.moveTo(cx, cy + 7 * s);
      ctx.bezierCurveTo(cx, cy + 4 * s, cx - 9 * s, cy - 4 * s, cx - 9 * s, cy - 6 * s);
      ctx.bezierCurveTo(cx - 9 * s, cy - 10 * s, cx - 5 * s, cy - 12 * s, cx, cy - 7 * s);
      ctx.bezierCurveTo(cx + 5 * s, cy - 12 * s, cx + 9 * s, cy - 10 * s, cx + 9 * s, cy - 6 * s);
      ctx.bezierCurveTo(cx + 9 * s, cy - 4 * s, cx, cy + 4 * s, cx, cy + 7 * s);
      break;
    }
    case 'star': {
      const cx = x + w / 2;
      const cy = y + h / 2;
      const outerR = Math.min(w, h) / 2;
      const innerR = outerR * 0.4;
      for (let i = 0; i < 10; i++) {
        const radius = i % 2 === 0 ? outerR : innerR;
        const angle = (i * Math.PI) / 5 - Math.PI / 2;
        const px = cx + radius * Math.cos(angle);
        const py = cy + radius * Math.sin(angle);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    }
    default: {
      const r = Math.min(cornerRadius, Math.min(w, h) / 2);
      if (r > 0) {
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.arcTo(x + w, y, x + w, y + r, r);
        ctx.lineTo(x + w, y + h - r);
        ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h);
        ctx.arcTo(x, y + h, x, y + h - r, r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
      } else {
        ctx.rect(x, y, w, h);
      }
    }
  }

  ctx.clip();
}

/** Render a text element at print resolution */
function renderTextElement(
  ctx: CanvasRenderingContext2D,
  text: any,
  W: number,
  _H: number,
  slot?: { x: number; y: number; w: number; h: number; align?: 'left' | 'center' | 'right' } | null,
) {
  const fontSize = (text.fontSize || 24) * (W / 576); // Scale relative to 8x8 reference
  const fontFamily = text.fontFamily || 'serif';
  const fontWeight = text.bold ? 'bold' : 'normal';
  const fontStyle = text.italic ? 'italic' : 'normal';
  const align = (slot?.align ?? text.alignment ?? 'center') as CanvasTextAlign;

  ctx.save();
  ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
  ctx.fillStyle = text.color || '#2D2D2D';
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';

  if (slot) {
    // Caption bound to a textbox region — draw it INSIDE the slot (centred
    // vertically, aligned horizontally), matching the editor + preview. Without
    // this, box-bound text (x=y=0) printed in the top-left corner.
    const pad = slot.w * 0.04;
    const cx = align === 'left' ? slot.x + pad : align === 'right' ? slot.x + slot.w - pad : slot.x + slot.w / 2;
    drawWordArtText(ctx, text.text, cx, slot.y + slot.h / 2, text, W / 576);
  } else if (text.rotation) {
    ctx.translate(text.x * (W / 576), text.y * (W / 576));
    ctx.rotate((text.rotation * Math.PI) / 180);
    drawWordArtText(ctx, text.text, 0, 0, text, W / 576);
  } else {
    drawWordArtText(ctx, text.text, text.x * (W / 576), text.y * (W / 576), text, W / 576);
  }

  ctx.restore();
}

/** Render per-slot text (page.slotTexts[i]) centered inside its slot rect.
 *  Mirrors the caption-in-slot branch of renderTextElement byte-for-byte (same
 *  font-string, same W/576 scale, same centered-in-rect placement) so print
 *  matches the DOM + Fabric renderers. Underline is drawn manually (canvas has
 *  no native text underline). */
function renderSlotText(
  ctx: CanvasRenderingContext2D,
  st: SlotText,
  x: number,
  y: number,
  w: number,
  h: number,
  W: number,
) {
  const fontSize = (st.fontSize || 24) * (W / 576);
  const fontFamily = st.fontFamily || 'serif';
  const fontWeight = st.bold ? 'bold' : 'normal';
  const fontStyle = st.italic ? 'italic' : 'normal';
  const align = (st.alignment ?? 'center') as CanvasTextAlign;

  ctx.save();
  ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
  ctx.fillStyle = st.color || '#2D2D2D';
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';

  const pad = w * 0.04;
  const cx = align === 'left' ? x + pad : align === 'right' ? x + w - pad : x + w / 2;
  const cy = y + h / 2;
  drawWordArtText(ctx, st.text, cx, cy, st, W / 576);

  if (st.underline) {
    const metrics = ctx.measureText(st.text);
    const textW = metrics.width;
    const ux = align === 'left' ? cx : align === 'right' ? cx - textW : cx - textW / 2;
    const uy = cy + fontSize * 0.5;
    ctx.strokeStyle = st.color || '#2D2D2D';
    ctx.lineWidth = Math.max(1, fontSize * 0.05);
    ctx.beginPath();
    ctx.moveTo(ux, uy);
    ctx.lineTo(ux + textW, uy);
    ctx.stroke();
  }

  ctx.restore();
}

/** Convert data URL to Blob */
function dataURLToBlob(dataUrl: string): Blob {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)![1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

/** Load image from URL */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Generate print-ready images for ALL pages.
 *  Returns an array of { pageIndex, blob, filename } */
export async function renderAlbumForPrint(
  pages: AlbumPage[],
  photos: UploadedPhoto[],
  albumSize: AlbumSizePreset,
  onProgress?: (completed: number, total: number) => void,
): Promise<Array<{ pageIndex: number; blob: Blob; filename: string }>> {
  const results: Array<{ pageIndex: number; blob: Blob; filename: string }> = [];

  for (let i = 0; i < pages.length; i++) {
    const blob = await renderPageForPrint({
      page: pages[i],
      photos,
      albumSize,
      pageIndex: i,
    });
    results.push({
      pageIndex: i,
      blob,
      filename: `megyprints-page-${String(i + 1).padStart(2, '0')}.jpg`,
    });
    onProgress?.(i + 1, pages.length);
  }

  return results;
}

/* ═══════════════════════════════════════════════════════════════
   COVER WRAP (front · spine · back) — a SEPARATE print artifact.
   Uses the SAME coverLayout the DOM preview uses, so what the customer
   designs is what prints. Rendered at FULL 300 DPI — the MAX_SIDE=1800
   page cap is NOT applied here: the cap exists to keep a ~50-page album
   PDF under the storage cap, but the cover is ONE page, so a wide wrap
   downscaled to 1800px would collapse the spine text to ~100 DPI. A
   single full-res JPEG stays a few MB — well within budget.
   ═══════════════════════════════════════════════════════════════ */

/** Defensive canvas cap (a normal wrap is ~5–7k px; browsers dislike >~16k). */
const MAX_COVER_SIDE = 8000;

export interface CoverPrintInput {
  albumSize: AlbumSizePreset;
  /** Interior page count (drives spine thickness). */
  pageCount: number;
  /** Binding material chosen at checkout (softcover vs hardcover geometry). */
  cover: CoverType;
  coverDesign: CoverDesign;
  photos: UploadedPhoto[];
}

/** Render the flat cover wrap to a full-resolution JPEG Blob. */
export async function renderCoverWrapForPrint(input: CoverPrintInput): Promise<Blob> {
  const { albumSize, pageCount, cover, coverDesign, photos } = input;
  const geom = coverWrapGeometry(albumSize, pageCount, cover);
  const layout = coverLayout(geom, coverDesign);
  const W = geom.wrap.wPx;
  const H = geom.wrap.hPx;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  // Full-bleed base so the wrap has NO white edges in the turn-in / bleed zone:
  // the back colour bleeds everywhere left of the spine, the front colour right
  // of it (the spine colour follows the front). Panels then paint on top.
  const panelBg = (name: 'back' | 'front') => layout.panels.find((p) => p.panel === name)?.bg || '#FFFFFF';
  const splitX = layout.foldXPx[0];
  ctx.fillStyle = panelBg('back');
  ctx.fillRect(0, 0, splitX, H);
  ctx.fillStyle = panelBg('front');
  ctx.fillRect(splitX, 0, W - splitX, H);

  for (const p of layout.panels) {
    if (p.bg) {
      ctx.fillStyle = p.bg;
      ctx.fillRect(p.rect.x, p.rect.y, p.rect.width, p.rect.height);
    }
    if (p.photoId) {
      const src = resolveBgImageSrc({ photoId: p.photoId }, photos);
      if (src) {
        try {
          const img = await loadImage(src);
          const s = Math.max(p.rect.width / img.width, p.rect.height / img.height);
          const dw = img.width * s;
          const dh = img.height * s;
          ctx.save();
          ctx.beginPath();
          ctx.rect(p.rect.x, p.rect.y, p.rect.width, p.rect.height);
          ctx.clip();
          ctx.drawImage(img, p.rect.x + (p.rect.width - dw) / 2, p.rect.y + (p.rect.height - dh) / 2, dw, dh);
          ctx.restore();
        } catch { /* photo failed — the panel bg shows through */ }
      }
    }
    for (const t of p.texts) drawCoverText(ctx, t);
    if (p.brandMark) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `600 ${Math.round(p.brandMark.height * 0.62)}px Cinzel, Georgia, serif`;
      ctx.fillText('Megy Prints', p.brandMark.x + p.brandMark.width / 2, p.brandMark.y + p.brandMark.height / 2);
      ctx.restore();
    }
  }

  let out: HTMLCanvasElement = canvas;
  const cap = Math.min(1, MAX_COVER_SIDE / Math.max(W, H));
  if (cap < 1) {
    out = document.createElement('canvas');
    out.width = Math.round(W * cap);
    out.height = Math.round(H * cap);
    const octx = out.getContext('2d')!;
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(canvas, 0, 0, out.width, out.height);
  }
  return new Promise((resolve) => out.toBlob((b) => resolve(b!), 'image/jpeg', 0.9));
}

/** Simple greedy word-wrap to a pixel width (ctx.font must be preset). */
function wrapCoverText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = (text || '').split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let cur = words[0];
  for (let i = 1; i < words.length; i++) {
    const test = `${cur} ${words[i]}`;
    if (ctx.measureText(test).width <= maxWidth) cur = test;
    else { lines.push(cur); cur = words[i]; }
  }
  lines.push(cur);
  return lines;
}

/** Draw one positioned cover text. fontSize/outlineWidth are already in wrap-px,
 *  so WordArt scale = 1 (mirrors the DOM preview, which uses displayScale). */
function drawCoverText(ctx: CanvasRenderingContext2D, t: PositionedText): void {
  const st = t.style;
  if (!st.text || !st.text.trim()) return;
  const fontSize = st.fontSize || 24;
  ctx.save();
  ctx.font = `${st.italic ? 'italic' : 'normal'} ${st.bold ? 'bold' : 'normal'} ${fontSize}px ${st.fontFamily || 'serif'}`;
  ctx.fillStyle = st.color || '#2D2D2D';
  ctx.textBaseline = 'middle';

  // Spine: rotate around the panel centre and draw one centred line.
  if (t.rotateDeg) {
    ctx.translate(t.rect.x + t.rect.width / 2, t.rect.y + t.rect.height / 2);
    ctx.rotate((t.rotateDeg * Math.PI) / 180);
    ctx.textAlign = 'center';
    drawWordArtText(ctx, st.text, 0, 0, st, 1);
    ctx.restore();
    return;
  }

  const align = (st.alignment ?? 'center') as CanvasTextAlign;
  ctx.textAlign = align;
  const pad = t.rect.width * 0.02;
  const anchorX = align === 'left' ? t.rect.x + pad : align === 'right' ? t.rect.x + t.rect.width - pad : t.rect.x + t.rect.width / 2;

  const lines = wrapCoverText(ctx, st.text, t.rect.width - pad * 2);
  const lineH = fontSize * 1.25;
  const blockH = lines.length * lineH;
  const startY =
    t.valign === 'top' ? t.rect.y + lineH / 2
    : t.valign === 'bottom' ? t.rect.y + t.rect.height - blockH + lineH / 2
    : t.rect.y + t.rect.height / 2 - blockH / 2 + lineH / 2;

  lines.forEach((line, i) => drawWordArtText(ctx, line, anchorX, startY + i * lineH, st, 1));
  ctx.restore();
}
