import { describe, it, expect } from 'vitest';
import {
  coverSize,
  panRoom,
  slotPhotoRect,
  slotZoom,
  computeFaceOffset,
  faceOffsetToPan,
  faceCentrePan,
  slotDesignSize,
  type Size,
  type Pan,
} from './slotPhotoFit';

/** Where a point of the photo (0–1 fractions) lands in the slot, as 0–1 of the
 *  slot — 0.5 is dead centre. */
function inSlot(point: { x: number; y: number }, img: Size, slot: Size, zoom: number | undefined, pan: Pan) {
  const r = slotPhotoRect(img, slot, zoom, pan);
  return { x: (r.x + point.x * r.w) / slot.w, y: (r.y + point.y * r.h) / slot.h };
}

/** The drawn photo covers the whole slot — no strip of page showing. */
function covers(img: Size, slot: Size, zoom: number | undefined, pan: Pan) {
  const r = slotPhotoRect(img, slot, zoom, pan);
  const e = 1e-9;
  return r.x <= e && r.y <= e && r.x + r.w >= slot.w - e && r.y + r.h >= slot.h - e;
}

/* ── The face auto-centre (bug: it panned ~1 px) ─────────────────────────── */

describe('face auto-centre → a DESIGN-px pan that really centres the face', () => {
  // The live-proof shape: a 2:1 landscape on an 8×8 full-bleed page (703.125 ×
  // 750 design px), face a third of the way in from the left.
  const wide = { w: 2400, h: 1200 };
  const page = { w: 703.125, h: 750 };

  it('moves the photo by hundreds of design px, not by the −1…+1 offset itself', () => {
    const pan = faceCentrePan({ x: 0.33, y: 0.5 }, wide, page);
    // Cover height 750 → width 1500; the face sits (0.5 − 0.33) × 1500 = 255 px
    // left of the photo's centre, so the photo moves 255 px RIGHT.
    expect(pan.x).toBeCloseTo(255, 6);
    expect(pan.y).toBe(0);
    expect(inSlot({ x: 0.33, y: 0.5 }, wide, page, 1, pan).x).toBeCloseTo(0.5, 9);
  });

  it('lands the face dead centre whenever the photo can reach — any shape, any zoom', () => {
    const photos: Size[] = [{ w: 2400, h: 1200 }, { w: 4032, h: 3024 }, { w: 3024, h: 4032 }, { w: 1080, h: 1920 }, { w: 1000, h: 1000 }];
    const slots: Size[] = [{ w: 703.125, h: 750 }, { w: 643.125, h: 690 }, { w: 300, h: 200 }, { w: 200, h: 320 }];
    for (const img of photos) for (const slot of slots) for (const zoom of [1, 1.4, 2]) {
      const vis = { w: slot.w / coverSize(img, slot, zoom).w, h: slot.h / coverSize(img, slot, zoom).h };
      // a face inside the safe zone on each axis
      for (const fx of [0.5 - (1 - vis.w) * 0.45, 0.5, 0.5 + (1 - vis.w) * 0.3]) for (const fy of [0.5 - (1 - vis.h) * 0.4, 0.5 + (1 - vis.h) * 0.45]) {
        const pan = faceCentrePan({ x: fx, y: fy }, img, slot, zoom);
        const at = inSlot({ x: fx, y: fy }, img, slot, zoom, pan);
        expect(at.x, `${img.w}x${img.h} in ${slot.w}x${slot.h} @${zoom}`).toBeCloseTo(0.5, 9);
        expect(at.y, `${img.w}x${img.h} in ${slot.w}x${slot.h} @${zoom}`).toBeCloseTo(0.5, 9);
        expect(covers(img, slot, zoom, pan)).toBe(true);
      }
    }
  });

  it('a face at the photo edge goes as far as the photo allows, and never opens a gap', () => {
    const room = panRoom(wide, page);
    const left = faceCentrePan({ x: 0.02, y: 0.5 }, wide, page);
    expect(left.x).toBeCloseTo(room.x, 9); // photo's left edge on the slot's left edge
    expect(slotPhotoRect(wide, page, 1, left).x).toBeCloseTo(0, 9);
    const right = faceCentrePan({ x: 0.99, y: 0.5 }, wide, page);
    expect(right.x).toBeCloseTo(-room.x, 9);
    for (const pan of [left, right]) expect(covers(wide, page, 1, pan)).toBe(true);
  });

  it('the sign: face on the left → photo moves right; face low → photo moves up', () => {
    expect(faceCentrePan({ x: 0.3, y: 0.5 }, wide, page).x).toBeGreaterThan(0);
    expect(faceCentrePan({ x: 0.7, y: 0.5 }, wide, page).x).toBeLessThan(0);
    const tall = { w: 1000, h: 2000 };
    expect(faceCentrePan({ x: 0.5, y: 0.7 }, tall, page).y).toBeLessThan(0);
    expect(faceCentrePan({ x: 0.5, y: 0.3 }, tall, page).y).toBeGreaterThan(0);
  });

  it('only the cropped axis pans at zoom 1; a zoom crops both, so both centre', () => {
    expect(faceCentrePan({ x: 0.4, y: 0.2 }, wide, page).y).toBe(0);
    const zoomed = faceCentrePan({ x: 0.4, y: 0.4 }, wide, page, 1.5);
    expect(zoomed.y).toBeGreaterThan(0);
    expect(inSlot({ x: 0.4, y: 0.4 }, wide, page, 1.5, zoomed).y).toBeCloseTo(0.5, 9);
  });

  it('computeFaceOffset: −1…+1 is the share of the pan room; the safe zone is [visible/2, 1 − visible/2]', () => {
    // 2:1 photo in a square slot → half the width shows, the view centre can
    // travel 0.25 either side of 0.5.
    expect(computeFaceOffset({ x: 0.25, y: 0.5 }, 2, 1).offsetX).toBeCloseTo(-1, 12);
    expect(computeFaceOffset({ x: 0.375, y: 0.5 }, 2, 1).offsetX).toBeCloseTo(-0.5, 12);
    expect(computeFaceOffset({ x: 0.5, y: 0.5 }, 2, 1).offsetX).toBe(0);
    expect(computeFaceOffset({ x: 0.9, y: 0.5 }, 2, 1).offsetX).toBeCloseTo(1, 12); // clamped
    // 60% visible: centrable band 0.3…0.7. The old maths clamped to 0.2…0.8 and
    // divided by 0.3 instead of 0.2, so a face at 0.4 asked for −0.33 (under-pan).
    expect(computeFaceOffset({ x: 0.4, y: 0.5 }, 1 / 0.6, 1).offsetX).toBeCloseTo(-0.5, 12);
    // nothing cropped on an axis → nothing to pan there
    expect(computeFaceOffset({ x: 0.1, y: 0.9 }, 1, 1)).toEqual({ offsetX: 0, offsetY: 0 });
  });

  it('faceOffsetToPan is px = −offset × overflow / 2', () => {
    const room = panRoom(wide, page).x; // (1500 − 703.125) / 2
    expect(room).toBeCloseTo(398.4375, 9);
    expect(faceOffsetToPan({ offsetX: -1, offsetY: 0 }, wide, page).x).toBeCloseTo(room, 9);
    expect(faceOffsetToPan({ offsetX: 0.5, offsetY: 0 }, wide, page).x).toBeCloseTo(-room / 2, 9);
    expect(faceOffsetToPan({ offsetX: 0, offsetY: 0 }, wide, page)).toEqual({ x: 0, y: 0 });
  });

  it('garbage in → no pan (a NaN face, a photo that never measured)', () => {
    expect(faceCentrePan({ x: NaN, y: 0.5 }, wide, page)).toEqual({ x: 0, y: 0 });
    expect(faceCentrePan({ x: 0.2, y: 0.5 }, { w: 0, h: 0 }, page)).toEqual({ x: 0, y: 0 });
    expect(faceCentrePan({ x: 0.2, y: 0.5 }, wide, { w: 0, h: 750 })).toEqual({ x: 0, y: 0 });
  });
});

/* ── The fit every renderer draws with ────────────────────────────────────── */

describe('slotPhotoRect — cover, zoom, pan', () => {
  const img = { w: 3000, h: 2000 };
  const slot = { w: 400, h: 400 };

  it('cover-fits: fills the slot, the long axis overflows, centred', () => {
    expect(slotPhotoRect(img, slot)).toEqual({ x: -100, y: 0, w: 600, h: 400 });
  });

  it('zoom multiplies the cover fit (it is not a raw image scale)', () => {
    const near = (v: number) => expect.closeTo(v, 9);
    expect(coverSize(img, slot, 1.5)).toEqual({ w: near(900), h: near(600) });
    expect(slotPhotoRect(img, slot, 1.5)).toEqual({ x: near(-250), y: near(-100), w: near(900), h: near(600) });
    expect(slotZoom(undefined)).toBe(1);
    expect(slotZoom(0)).toBe(1);
    expect(slotZoom(-2)).toBe(1);
    expect(slotZoom(NaN)).toBe(1);
  });

  it('pans inside the overflow, and a pan past it stops at the photo edge — never a gap', () => {
    expect(slotPhotoRect(img, slot, 1, { x: 60, y: 0 }).x).toBe(-40);
    expect(slotPhotoRect(img, slot, 1, { x: 500, y: 0 }).x).toBe(0);
    expect(slotPhotoRect(img, slot, 1, { x: -500, y: 0 }).x).toBe(-200);
    // nothing to slide into vertically at zoom 1
    expect(slotPhotoRect(img, slot, 1, { x: 0, y: 80 }).y).toBe(0);
    for (const x of [-1e6, -100, 0, 37, 1e6]) for (const y of [-300, 0, 300]) {
      expect(covers(img, slot, 1, { x, y })).toBe(true);
      expect(covers(img, slot, 2, { x, y })).toBe(true);
    }
    expect(slotPhotoRect(img, slot, 1, { x: NaN, y: 0 }).x).toBe(-100);
  });
});

/* ── The slot box the pan is measured against ─────────────────────────────── */

describe('slotDesignSize — template fractions × the design canvas safe area', () => {
  it('a margined page: 4% margins + the 0.5" binding keep-out on the spine edge', () => {
    // 8×8 canvas 750 × 750: safe width 750 × (1 − 0.04 − 0.04 − 0.0625), height 750 × 0.92.
    const s = slotDesignSize({ templateId: 't88-solo-square' }, 0, '8x8', 0);
    expect(s?.w).toBeCloseTo(643.125, 9);
    expect(s?.h).toBeCloseTo(690, 9);
    // the binding moves sides page to page; the box stays the same size
    const odd = slotDesignSize({ templateId: 't88-solo-square' }, 0, '8x8', 1);
    expect(odd?.w).toBeCloseTo(643.125, 9);
    expect(odd?.h).toBeCloseTo(690, 9);
  });

  it('a full-bleed page keeps only the spine keep-out', () => {
    const s = slotDesignSize({ templateId: 't88-fb-solo' }, 0, '8x8', 1);
    expect(s?.w).toBeCloseTo(703.125, 9);
    expect(s?.h).toBeCloseTo(750, 9);
  });

  it('a cover panel has no spine gutter, so the same slot is wider', () => {
    const s = slotDesignSize({ templateId: 't88-solo-square' }, 0, '8x8', 0, true);
    expect(s?.w).toBeCloseTo(690, 9);
    expect(s?.h).toBeCloseTo(690, 9);
  });

  it('a frame the customer moved or resized in Studio uses its own box', () => {
    const s = slotDesignSize({ templateId: 't88-solo-square', slotGeometries: [{ x: 0.1, y: 0.2, width: 0.5, height: 0.4 }] }, 0, '8x8', 0);
    expect(s?.w).toBeCloseTo(643.125 * 0.5, 9);
    expect(s?.h).toBeCloseTo(690 * 0.4, 9);
  });

  it('no template, or no such slot → null (the auto-centre then leaves the page alone)', () => {
    expect(slotDesignSize({}, 0, '8x8', 0)).toBeNull();
    expect(slotDesignSize({ templateId: 'no-such-template' }, 0, '8x8', 0)).toBeNull();
    expect(slotDesignSize({ templateId: 't88-solo-square' }, 3, '8x8', 0)).toBeNull();
  });
});
