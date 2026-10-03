import { describe, it, expect } from 'vitest';
import { clampStickerGeom, STICKER_MIN_INCHES, pageInches } from './stickers';
import { getTemplatesForAlbum } from './pageTemplates';

/* STUDIO stickers (owner, 2026-09-13): free, but printable. Retired 2026-10-01
   (none can be added), but placed ones can still be moved, so the clamp still
   keeps every one of them printable. */
const ctx = (albumSize: string, pageIndex: number, coverMode = false) => ({ albumSize, pageIndex, template: getTemplatesForAlbum(albumSize as never).find((t) => !t.fullBleed) ?? null, coverMode });

describe('clampStickerGeom', () => {
  it('a sticker pushed into the spine snaps back and says spine; the spine side follows the page side', () => {
    const even = clampStickerGeom({ cx: 0.98, cy: 0.5, w: 0.2, h: 0.2, rot: 0 }, ctx('8x8', 0));
    expect(even.reasons[0]).toBe('spine');
    expect(even.geom.cx + even.geom.w / 2).toBeLessThanOrEqual(1);
    const odd = clampStickerGeom({ cx: 0.02, cy: 0.5, w: 0.2, h: 0.2, rot: 0 }, ctx('8x8', 1));
    expect(odd.reasons[0]).toBe('spine');
    expect(clampStickerGeom({ cx: 0.02, cy: 0.5, w: 0.2, h: 0.2, rot: 0 }, ctx('8x8', 0)).reasons).toEqual(['edge']);
  });
  it('holds the half-inch floor and keeps the aspect', () => {
    const r = clampStickerGeom({ cx: 0.5, cy: 0.5, w: 0.01, h: 0.02, rot: 0 }, ctx('8x8', 0));
    expect(r.reasons).toEqual(['floor']);
    const page = pageInches('8x8');
    expect(Math.min(r.geom.w * page.w, r.geom.h * page.h)).toBeCloseTo(STICKER_MIN_INCHES, 3);
    expect(r.geom.h / r.geom.w).toBeCloseTo(2, 3);
  });
  it('caps a giant sticker to the safe area', () => {
    const r = clampStickerGeom({ cx: 0.5, cy: 0.5, w: 3, h: 3, rot: 0 }, ctx('8x8', 0));
    expect(r.geom.w).toBeLessThanOrEqual(1);
    expect(r.reasons).toContain('edge');
  });
  it('keeps rotation (normalised) and is idempotent', () => {
    const c = ctx('8x8', 0);
    const once = clampStickerGeom({ cx: 0.9, cy: -1, w: 0.3, h: 0.3, rot: -30 }, c);
    expect(once.geom.rot).toBe(330);
    expect(clampStickerGeom(once.geom, c)).toEqual({ geom: once.geom, reasons: [] });
  });
});
