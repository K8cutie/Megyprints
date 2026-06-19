/** ═══════════════════════════════════════════════════════════════
    PRINT PIPELINE — High-Resolution Page Export
    Generates 300 DPI print-ready output from album page data.
    ═══════════════════════════════════════════════════════════════ */

import type { AlbumPage, UploadedPhoto, AlbumSizePreset } from './types';
import { ALBUM_SIZES, CORNER_POSITIONS, cornerImageUrl } from './types';
import { dedupeSlotFills } from './slotUtils';
import { getTemplateById, adaptTemplateToOrientation } from './pageTemplates';
import { applyBindingMargin } from './binding';

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

  // ── Background ──
  await renderBackground(ctx, page, W, H);

  // ── Slot Photos ──
  // Match the editor/preview geometry EXACTLY: adapt the template to the page
  // orientation, compute the safe area from its margins PLUS the 0.5" binding
  // keep-out on the inner (spine) edge, then place each slot as a fraction of
  // that safe area. (Slot coords are fractions 0–1, not percentages.)
  const template = page.templateId ? getTemplateById(page.templateId) : null;
  if (template && page.slotFills) {
    const adapted = adaptTemplateToOrientation(template, W, H);
    const m = applyBindingMargin(adapted.margin, albumSize, pageIndex);
    const safeX = W * m.left;
    const safeY = H * m.top;
    const safeW = W * (1 - m.left - m.right);
    const safeH = H * (1 - m.top - m.bottom);
    const fills = dedupeSlotFills(page.slotFills);

    for (let i = 0; i < adapted.slots.length; i++) {
      const slot = adapted.slots[i];
      const photoIdx = fills[i];
      if (photoIdx == null || photoIdx < 0) continue;

      const photo = photos[photoIdx];
      if (!photo) continue;

      const sx = safeX + slot.x * safeW;
      const sy = safeY + slot.y * safeH;
      const sw = slot.width * safeW;
      const sh = slot.height * safeH;

      await renderSlotPhoto(ctx, photo, slot, sx, sy, sw, sh, page, i);
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
  for (const text of page.textElements || []) {
    renderTextElement(ctx, text, W, H);
  }

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), 'image/png', 1);
  });
}

/** Render background at print resolution */
async function renderBackground(
  ctx: CanvasRenderingContext2D,
  page: AlbumPage,
  W: number,
  H: number,
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

    case 'image':
      if (bg.image) {
        try {
          const img = await loadImage(bg.image);
          ctx.drawImage(img, 0, 0, W, H);
        } catch {
          ctx.fillStyle = '#FFFBF7';
          ctx.fillRect(0, 0, W, H);
        }
      }
      break;

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
) {
  // Load original photo at full resolution
  let img: HTMLImageElement;
  try {
    img = await loadImage(photo.previewUrl);
  } catch {
    return;
  }

  ctx.save();

  // Clip to slot shape
  applySlotClip(ctx, slot, sx, sy, sw, sh);

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
  const frameWidth = page.photoBorderWidth ?? slot.borderWidth;
  const frameColor = page.photoBorderColor ?? slot.borderColor ?? '#FFFFFF';
  if (frameWidth) {
    ctx.strokeStyle = frameColor;
    // The active slot clip halves a centered stroke (only the inner half shows),
    // so draw it 2x to make the visible inner half equal the intended width.
    ctx.lineWidth = frameWidth * (PRINT_DPI / 72) * 2;
    ctx.stroke();
  }

  ctx.restore();
}

/** Apply clip path for special shapes */
function applySlotClip(
  ctx: CanvasRenderingContext2D,
  slot: any,
  x: number,
  y: number,
  w: number,
  h: number,
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
    default:
      ctx.rect(x, y, w, h);
  }

  ctx.clip();
}

/** Render a text element at print resolution */
function renderTextElement(
  ctx: CanvasRenderingContext2D,
  text: any,
  W: number,
  _H: number,
) {
  const fontSize = (text.fontSize || 24) * (W / 576); // Scale relative to 8x8 reference
  const fontFamily = text.fontFamily || 'serif';
  const fontWeight = text.bold ? 'bold' : 'normal';
  const fontStyle = text.italic ? 'italic' : 'normal';

  ctx.save();
  ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
  ctx.fillStyle = text.color || '#2D2D2D';
  ctx.textAlign = (text.alignment as CanvasTextAlign) || 'center';
  ctx.textBaseline = 'middle';

  if (text.rotation) {
    ctx.translate(text.x * (W / 576), text.y * (W / 576));
    ctx.rotate((text.rotation * Math.PI) / 180);
    ctx.fillText(text.text, 0, 0);
  } else {
    ctx.fillText(
      text.text,
      text.x * (W / 576),
      text.y * (W / 576),
    );
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
      filename: `megyprints-page-${String(i + 1).padStart(2, '0')}.png`,
    });
    onProgress?.(i + 1, pages.length);
  }

  return results;
}
