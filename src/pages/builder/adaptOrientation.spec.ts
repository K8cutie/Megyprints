import { describe, it, expect } from 'vitest';
import { adaptTemplateToOrientation, getTemplatesForAlbum, getTemplateById } from './pageTemplates';
import { ALBUM_INCHES } from './templateKit';
import type { AlbumSizePreset } from './types';

/* ══════════════════════════════════════════════════════════════════════════
   THE CANVAS MUST DRAW A TEMPLATE EXACTLY AS AUTHORED.

   `template.orientation` describes the PHOTO the layout is built around (it is
   derived from targetRatio), NOT the shape of the page. adaptTemplateToOrientation
   used to read it as the page's orientation and transpose every slot when they
   disagreed. On an 8×6, "Two Tall" holds two 2:3 PORTRAIT photos, so it is
   tagged `portrait` — and the landscape canvas rotated it: two side-by-side
   tall frames became two stacked 8:3 strips, hacking every photo in them.

   The admin thumbnails and the DOM preview never called this, which is why the
   same template looked right in one place and wrong in another.
   ══════════════════════════════════════════════════════════════════════════ */

const SIZES: AlbumSizePreset[] = ['6x6', '8x8', '9x9', '6x4', '8x6', '6x8', '11.5x8', '8.5x11'];

describe('the Fabric canvas never rewrites an authored layout', () => {
  for (const size of SIZES) {
    it(`${size}: every offered template is drawn verbatim`, () => {
      const { w, h } = ALBUM_INCHES[size];
      const list = getTemplatesForAlbum(size);
      for (const t of list) {
        const adapted = adaptTemplateToOrientation(t, w * 100, h * 100);
        expect(adapted, `${t.id} was rewritten by the canvas`).toBe(t);
      }
    });
  }

  it('regression: 8×6 "Two Tall" stays two SIDE-BY-SIDE tall frames', () => {
    const t = getTemplateById('t86-duo-tall')!;
    const a = adaptTemplateToOrientation(t, 800, 600);
    // side by side → the two slots differ in x, share y, and are TALLER than wide
    expect(a.slots).toHaveLength(2);
    expect(a.slots[0].y).toBe(a.slots[1].y);
    expect(a.slots[0].x).not.toBe(a.slots[1].x);
    for (const s of a.slots) {
      const wIn = s.width * 8, hIn = s.height * 6;
      expect(hIn, 'frame must be taller than it is wide').toBeGreaterThan(wIn);
      // and NOT the 8:3 strip the transpose produced
      expect(wIn / hIn).toBeLessThan(1);
    }
  });

  it('regression: a RETIRED template is also drawn verbatim (old pages keep their shape)', () => {
    const t = getTemplateById('t86-fb-duo-big-second');
    if (!t) return; // already deleted — nothing to protect
    expect(adaptTemplateToOrientation(t, 800, 600)).toBe(t);
  });
});
