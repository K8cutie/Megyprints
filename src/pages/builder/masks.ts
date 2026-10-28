import type { CSSProperties } from 'react';
import { maskTextureUrl, maskOverlayUrl, type TextureMask, type FeatherSide } from './maskShapes';

/* ══════════════════════════════════════════════════════════════════════════
   MASKS (owner, 2026-09-13, Studio): a shape or an edge treatment on ONE
   photo. The photo underneath is untouched; the frame's box is untouched
   (so every Studio guardrail still holds). ONE module, three renderers:
     • BuilderPreview (DOM)   → slotShapeStyle() reads the applied slot
     • useCanvasEngine (Fabric) → clip objects / a feathered offscreen image
     • printPipeline (print)  → applySlotClip() / featherAlpha()
   A mask suppresses the photo's frame/border (like the heart shape already
   did) so a shape never carries a rectangular outline in one renderer and
   none in another.
   ══════════════════════════════════════════════════════════════════════════ */

/* The shapes themselves (which masks there are, applyMask, the outline
   generators) live in maskShapes.ts, which the 2.0 app shares. Everything
   is re-exported here, so the website imports this file as before. */
export * from './maskShapes';

const textureCache = new Map<string, Promise<HTMLImageElement>>();
function loadMaskImage(url: string): Promise<HTMLImageElement> {
  let p = textureCache.get(url);
  if (!p) {
    p = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`mask image ${url} failed to load`));
      img.src = url;
    });
    textureCache.set(url, p);
  }
  return p;
}
export function loadMaskTexture(id: TextureMask): Promise<HTMLImageElement> {
  return loadMaskImage(maskTextureUrl(id));
}
/** The edge's overlay (torn paper's rim), or null when it has none. */
export function loadMaskOverlay(id: TextureMask): Promise<HTMLImageElement | null> {
  const u = maskOverlayUrl(id);
  return u ? loadMaskImage(u) : Promise.resolve(null);
}

/** Canvas: paint the edge's overlay (if any) over the drawn pixels, then
 *  multiply their alpha by the texture — both stretched to the box. */
export function applyTextureAlpha(ctx: CanvasRenderingContext2D, tex: CanvasImageSource, x: number, y: number, w: number, h: number, overlay?: CanvasImageSource | null): void {
  ctx.save();
  if (overlay) ctx.drawImage(overlay, x, y, w, h);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(tex, x, y, w, h);
  ctx.restore();
}

/** DOM: the same texture as a CSS mask. */
export function textureMaskCss(id: TextureMask): CSSProperties {
  const u = `url("${maskTextureUrl(id)}")`;
  return {
    WebkitMaskImage: u, maskImage: u,
    WebkitMaskSize: '100% 100%', maskSize: '100% 100%',
    WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
  } as CSSProperties;
}
/** DOM: the overlay as a layer over the photo, inside the masked frame (so
 *  the frame's texture mask trims it exactly as the canvas does). Null when
 *  the edge has none. */
export function textureOverlayCss(id: TextureMask): CSSProperties | null {
  const u = maskOverlayUrl(id);
  return u ? { position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: `url("${u}")`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' } : null;
}

/* ── Soft edge ───────────────────────────────────────────────────────────── */
/** DOM: a feathered rectangle — all four edges (two intersecting gradient
 *  masks) or the bottom edge only (one gradient). */
export function featherEdgeCss(feather: number, w: number, h: number, side: FeatherSide = 'all'): CSSProperties {
  const f = Math.max(1, Math.round(feather * Math.min(w, h)));
  if (side === 'bottom') {
    const g = `linear-gradient(to bottom, #000 0px, #000 calc(100% - ${f}px), rgba(0,0,0,0) 100%)`;
    return { WebkitMaskImage: g, maskImage: g } as CSSProperties;
  }
  const gx = `linear-gradient(to right, rgba(0,0,0,0) 0px, #000 ${f}px, #000 calc(100% - ${f}px), rgba(0,0,0,0) 100%)`;
  const gy = `linear-gradient(to bottom, rgba(0,0,0,0) 0px, #000 ${f}px, #000 calc(100% - ${f}px), rgba(0,0,0,0) 100%)`;
  return {
    WebkitMaskImage: `${gx}, ${gy}`,
    maskImage: `${gx}, ${gy}`,
    WebkitMaskComposite: 'source-in',
    maskComposite: 'intersect',
  } as CSSProperties;
}

/** Canvas (Fabric offscreen + print): multiply the drawn pixels' alpha by the
 *  same gradients (destination-in keeps only what both keep). */
export function featherAlpha(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, feather: number, side: FeatherSide = 'all'): void {
  const f = Math.max(1, feather * Math.min(w, h));
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  if (side === 'bottom') {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(Math.max(0, 1 - f / h), 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.restore();
    return;
  }
  const gx = ctx.createLinearGradient(x, 0, x + w, 0);
  gx.addColorStop(0, 'rgba(0,0,0,0)'); gx.addColorStop(Math.min(0.5, f / w), 'rgba(0,0,0,1)');
  gx.addColorStop(Math.max(0.5, 1 - f / w), 'rgba(0,0,0,1)'); gx.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gx; ctx.fillRect(x, y, w, h);
  const gy = ctx.createLinearGradient(0, y, 0, y + h);
  gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(Math.min(0.5, f / h), 'rgba(0,0,0,1)');
  gy.addColorStop(Math.max(0.5, 1 - f / h), 'rgba(0,0,0,1)'); gy.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gy; ctx.fillRect(x, y, w, h);
  ctx.restore();
}
