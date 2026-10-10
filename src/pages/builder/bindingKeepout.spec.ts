import { describe, it, expect } from 'vitest';
import { getTemplatesForAlbum } from './pageTemplates';
import { ALBUM_INCHES, MIN_FRAME_INCHES } from './templateKit';
import { marginForTemplate, bindingEdge, BINDING_INCHES } from './binding';
import type { AlbumSizePreset } from './types';

/* ══════════════════════════════════════════════════════════════════════════
   NO PHOTO MAY SIT IN THE BINDING GUTTER.

   The book is bound down the spine, so the inner 0.5" of every page curves
   into the binding and is effectively lost. Full-bleed pages used to run to
   ALL FOUR edges, which meant a face near the gutter came out half-eaten —
   the keep-out guide warned about it while nothing moved out of the way.
   A full-bleed page now bleeds off three edges and stops short of the spine.

   The reserved edge ALTERNATES (even page → right, odd page → left), so both
   parities are checked for every layout.
   ══════════════════════════════════════════════════════════════════════════ */

const ALL: AlbumSizePreset[] = ['6x6', '8x8', '9x9', '6x4', '8x6', '6x8', '11.5x8', '8.5x11'];
/** Sizes we author. 11.5×8 / 8.5×11 still run on the legacy generated set,
 *  which carries PRE-EXISTING sub-floor frames (measured identical before and
 *  after the gutter change) — they are excluded from the floor check only, and
 *  are still held to the keep-out rule below. */
const AUTHORED: AlbumSizePreset[] = ['6x6', '8x8', '9x9', '6x4', '8x6', '6x8'];

/** Photo rects in page inches, for one page parity. */
function slotsInInches(size: AlbumSizePreset, pageIndex: number) {
  const { w: iw, h: ih } = ALBUM_INCHES[size];
  return getTemplatesForAlbum(size).flatMap((t) => {
    const m = marginForTemplate(t, t.margin, size, pageIndex);
    const safeX = m.left * iw, safeY = m.top * ih;
    const safeW = iw * (1 - m.left - m.right), safeH = ih * (1 - m.top - m.bottom);
    return t.slots.map((s) => ({
      id: t.id,
      x0: safeX + s.x * safeW, x1: safeX + (s.x + s.width) * safeW,
      y0: safeY + s.y * safeH,
      w: s.width * safeW, h: s.height * safeH,
    }));
  });
}

describe('binding keep-out', () => {
  for (const size of ALL) {
    it(`${size}: no photo enters the 0.5" spine reserve, on either page side`, () => {
      const { w: iw } = ALBUM_INCHES[size];
      for (const pageIndex of [0, 1]) {
        const onLeft = bindingEdge(pageIndex) === 'left';
        const g0 = onLeft ? 0 : iw - BINDING_INCHES;
        const g1 = onLeft ? BINDING_INCHES : iw;
        const intruders = slotsInInches(size, pageIndex)
          .filter((s) => s.x0 < g1 - 1e-6 && s.x1 > g0 + 1e-6)
          .map((s) => `${s.id} [${s.x0.toFixed(2)}–${s.x1.toFixed(2)}"]`);
        expect(intruders, `${size} page${pageIndex}\n  ${intruders.join('\n  ')}`).toEqual([]);
      }
    });
  }

  for (const size of AUTHORED) {
    it(`${size}: reserving the gutter keeps every frame at or above the 2" floor`, () => {
      for (const pageIndex of [0, 1]) {
        const small = slotsInInches(size, pageIndex)
          .filter((s) => Math.min(s.w, s.h) < MIN_FRAME_INCHES - 1e-6)
          .map((s) => `${s.id} ${Math.min(s.w, s.h).toFixed(2)}"`);
        expect(small, `${size} page${pageIndex}\n  ${small.join('\n  ')}`).toEqual([]);
      }
    });
  }

  it('6×6 drops the side heroes (1/3 of its 5.5" usable width is 1.83") but keeps the stacked ones', () => {
    const ids = getTemplatesForAlbum('6x6').map((t) => t.id);
    expect(ids).not.toContain('t66-fb-trio-hero-left-gap');
    expect(ids).not.toContain('t66-fb-trio-hero-right-gap');
    expect(ids).toContain('t66-fb-trio-hero-top-gap');
    // …and the bigger squares keep all four.
    expect(getTemplatesForAlbum('9x9')).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 't99-fb-trio-hero-left-gap' })]),
    );
  });
});
