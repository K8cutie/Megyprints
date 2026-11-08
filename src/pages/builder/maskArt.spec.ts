import { describe, it, expect } from 'vitest';
import { applyMask, ART_MASKS, isArtMask, isMaskId, MASKS, type ArtMask } from './maskShapes';
import { allPaints, artBox, FILM, maskArt, TAPE_SIZE, type ArtBox, type MaskArt } from './maskArt';
import { wordsSafeArea } from './freeWords';
import { getCanvasDimensions } from './layouts';
import { getPrintDimensions } from './printSize';
import { slotDesignSize } from './slotPhotoFit';
import type { TemplateSlot } from './types';

/* The masks that paint (owner, 2026-11-08: the film strip, then "all of them
   are good add them to the selection", the 20 on the numbered sheet). One
   description every renderer draws: these hold its promises. */

const slot = { id: 's', x: 0.1, y: 0.1, width: 0.5, height: 0.4, ratio: '1:1' } as unknown as TemplateSlot;
const BOXES: Record<string, ArtBox> = {
  wide: { x: 100, y: 50, w: 600, h: 400 },
  tall: { x: 30, y: 200, w: 300, h: 520 },
  square: { x: 0, y: 0, w: 400, h: 400 },
  thin: { x: 10, y: 10, w: 900, h: 220 },
  print: { x: 1234.5, y: 87.25, w: 1800, h: 1350 },
};

/** Every coordinate pair in path data (arcs: their radii and flags are skipped). */
function points(d: string): [number, number][] {
  const out: [number, number][] = [];
  const re = /([MLQCAZ])([^MLQCAZ]*)/g;
  for (const m of d.matchAll(re)) {
    const nums = m[2].trim().split(/\s+/).filter(Boolean).map(Number);
    if (m[1] === 'A') {
      for (let i = 0; i + 6 < nums.length; i += 7) out.push([nums[i + 5], nums[i + 6]]);
    } else {
      for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i], nums[i + 1]]);
    }
  }
  return out;
}
/** The arcs' extremes: an ellipse's centre is where its two halves meet. */
function arcReach(d: string): ArtBox[] {
  const boxes: ArtBox[] = [];
  for (const m of d.matchAll(/A ([\d.]+) ([\d.]+) [-\d.]+ \d \d ([-\d.]+) ([-\d.]+)/g)) {
    const r = Math.max(Number(m[1]), Number(m[2]));
    boxes.push({ x: Number(m[3]) - 2 * r, y: Number(m[4]) - 2 * r, w: 4 * r, h: 4 * r });
  }
  return boxes;
}
const EPS = 0.01;
const inside = (pt: [number, number], b: ArtBox, slack = 0) =>
  pt[0] >= b.x - slack - EPS && pt[0] <= b.x + b.w + slack + EPS && pt[1] >= b.y - slack - EPS && pt[1] <= b.y + b.h + slack + EPS;

describe('the 20 new masks are in the picker', () => {
  it('every one is a mask the customer can pick, with its own plain name', () => {
    expect(ART_MASKS).toHaveLength(20);
    for (const id of ART_MASKS) {
      expect(isMaskId(id)).toBe(true);
      expect(MASKS.find((m) => m.id === id)?.label).toBeTruthy();
    }
    const labels = MASKS.map((m) => m.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(MASKS.find((m) => m.id === 'film')?.label).toBe('Film strip');
    expect(isArtMask('circle')).toBe(false);
  });
  it('applyMask marks the slot (the art, masked: no frame) and leaves its shape a rectangle', () => {
    for (const id of ART_MASKS) {
      const a = applyMask(slot, id);
      expect(a.art).toBe(id);
      expect(a.masked).toBe(true);
      expect(a.shape).toBe('rectangle');
      expect(a.texture).toBeUndefined();
      expect(a.feather).toBeUndefined();
    }
  });
});

describe('maskArt: what every renderer draws', () => {
  const each = (fn: (id: ArtMask, name: string, b: ArtBox, a: MaskArt) => void) => {
    for (const id of ART_MASKS) for (const [name, b] of Object.entries(BOXES)) fn(id, name, b, maskArt(id, b));
  };

  it('the photo box and the shape stay inside the frame; the shape stays inside the photo box', () => {
    each((id, name, b, a) => {
      const where = `${id} in the ${name} frame`;
      expect(a.photo.w, where).toBeGreaterThan(0);
      expect(a.photo.h, where).toBeGreaterThan(0);
      expect(inside([a.photo.x, a.photo.y], b), where).toBe(true);
      expect(inside([a.photo.x + a.photo.w, a.photo.y + a.photo.h], b), where).toBe(true);
      for (const pt of points(a.clip)) expect(inside(pt, a.photo), `${where}: the shape at ${pt}`).toBe(true);
      for (const r of arcReach(a.clip)) expect(r.w, where).toBeLessThan(a.photo.w * 4 + 1);
    });
  });

  it('every paint stays inside the frame, a line by half its width too (a card\'s shadow only spills)', () => {
    each((id, name, b, a) => {
      for (const p of allPaints(a)) {
        const half = p.kind === 'stroke' ? p.width / 2 : 0;
        for (const pt of points(p.d)) {
          // a stroke clipped to the shape (inside) is held by the clip
          const held = a.inside.includes(p);
          expect(held || inside(pt, inset(b, half)), `${id} in the ${name} frame: a ${p.kind} at ${pt}`).toBe(true);
        }
      }
    });
  });

  it('every path is SVG path data the renderers parse: M first, numbers, closed shapes end in Z', () => {
    each((id, _n, _b, a) => {
      for (const d of [a.clip, ...allPaints(a).map((p) => p.d)]) {
        expect(d.startsWith('M '), id).toBe(true);
        expect(d, id).not.toMatch(/NaN|Infinity|undefined/);
      }
      expect(a.clip.trim().endsWith('Z'), id).toBe(true);
    });
  });

  it('the same mask in another renderer\'s px is the same drawing, moved and scaled', () => {
    for (const id of ART_MASKS) {
      const a = maskArt(id, { x: 0, y: 0, w: 300, h: 200 });
      const b = maskArt(id, { x: 50, y: 70, w: 600, h: 400 });
      const pa = points(a.clip), pb = points(b.clip);
      expect(pb.length, id).toBe(pa.length);
      pa.forEach(([x, y], i) => {
        expect(pb[i][0], id).toBeCloseTo(50 + 2 * x, 1);
        expect(pb[i][1], id).toBeCloseTo(70 + 2 * y, 1);
      });
    }
  });

  it('a white card or line carries a soft shadow, so it shows on a white page', () => {
    for (const id of ['instant', 'slide', 'old-print'] as const) {
      const a = maskArt(id, BOXES.wide);
      expect(a.under).toHaveLength(1);
      expect(a.under[0].kind === 'fill' && a.under[0].shadow?.blur, id).toBeGreaterThan(0);
    }
    const stitches = maskArt('stitched', BOXES.wide).over[0];
    expect(stitches.kind === 'stroke' && stitches.dash && stitches.shadow).toBeTruthy();
  });
});

describe('film strip', () => {
  it('runs along the longer side: holes top and bottom on a wide frame, down the sides on a tall one', () => {
    const wide = maskArt('film', BOXES.wide), tall = maskArt('film', BOXES.tall);
    // the window: full length less the ends, the short side less two bands
    expect(wide.photo.h).toBeCloseTo(BOXES.wide.h * (1 - 2 * FILM.band), 3);
    expect(wide.photo.w).toBeCloseTo(BOXES.wide.w - 2 * FILM.end * BOXES.wide.h, 3);
    expect(tall.photo.w).toBeCloseTo(BOXES.tall.w * (1 - 2 * FILM.band), 3);
    expect(tall.photo.h).toBeCloseTo(BOXES.tall.h - 2 * FILM.end * BOXES.tall.w, 3);
  });
  it('is black film with the window and a whole number of holes punched through (even-odd), as many on both edges', () => {
    const f = maskArt('film', BOXES.wide).over[0];
    expect(f.kind).toBe('fill');
    if (f.kind !== 'fill') return;
    expect(f.evenOdd).toBe(true);
    const rings = f.d.split(' M ').length; // the film, the window, the holes
    const holes = rings - 2;
    expect(holes % 2).toBe(0);
    expect(holes / 2).toBe(Math.round(BOXES.wide.w / (FILM.pitch * BOXES.wide.h)));
  });
  it('fits the photo to the window, so the film hides none of it', () => {
    const a = maskArt('film', BOXES.wide);
    expect(points(a.clip).every((pt) => inside(pt, a.photo))).toBe(true);
    expect(a.photo.w * a.photo.h).toBeGreaterThan(0.5 * BOXES.wide.w * BOXES.wide.h);
  });
});

describe('the other masks keep their promises', () => {
  it('taped on: both pieces of tape stay inside the frame, sticking out past the photo', () => {
    for (const b of Object.values(BOXES)) {
      const a = maskArt('taped', b);
      const tape = points(a.over[0].d);
      expect(tape.every((pt) => inside(pt, b))).toBe(true);
      expect(tape.some((pt) => pt[1] < a.photo.y - 1)).toBe(true); // over the photo's top edge
      expect(a.photo.x - b.x).toBeCloseTo(TAPE_SIZE.margin * Math.min(b.w, b.h), 3);
    }
  });
  it('instant photo: the bottom border is the widest', () => {
    const b = BOXES.tall, a = maskArt('instant', b);
    const top = a.photo.y - b.y, bottom = b.y + b.h - (a.photo.y + a.photo.h);
    expect(bottom).toBeGreaterThan(top * 2);
  });
  it('ticket: the tear line runs across the longer side, between the notches', () => {
    const wide = maskArt('ticket-stub', BOXES.wide).inside[0];
    const tall = maskArt('ticket-stub', BOXES.tall).inside[0];
    const [w0, w1] = points(wide.d), [t0, t1] = points(tall.d);
    expect(w0[0]).toBeCloseTo(w1[0], 3); // up and down on a wide ticket
    expect(t0[1]).toBeCloseTo(t1[1], 3); // across on a tall one
  });
  it('shapes that need a square (flower, badge, puzzle, pebble, paw) stay round in a wide frame', () => {
    for (const id of ['flower', 'badge', 'puzzle', 'pebble', 'paw'] as const) {
      const a = maskArt(id, BOXES.wide);
      expect(a.photo.w, id).toBeCloseTo(a.photo.h, 6);
      expect(a.photo.x - BOXES.wide.x, id).toBeCloseTo(BOXES.wide.x + BOXES.wide.w - (a.photo.x + a.photo.w), 6);
    }
  });
  it('the balloon\'s photo reaches the knot, and its string hangs below the balloon', () => {
    const a = maskArt('balloon', BOXES.tall);
    const shape = points(a.clip);
    const knotBottom = Math.max(...shape.map((p) => p[1]));
    expect(a.photo.y + a.photo.h).toBeGreaterThanOrEqual(knotBottom - EPS);
    const string = points(a.over[0].d);
    expect(Math.max(...string.map((p) => p[1]))).toBeGreaterThan(knotBottom);
  });
});

describe('the same choices in every renderer, and no frame breaks it (review, 2026-11-08)', () => {
  it('an empty frame (bad saved numbers) is a plain rectangle, never a loop without end', () => {
    for (const id of ART_MASKS) {
      for (const b of [{ x: 0, y: 0, w: 0, h: 300 }, { x: 0, y: 0, w: 300, h: 0 }, { x: 0, y: 0, w: NaN, h: 10 }]) {
        const a = maskArt(id, b);
        expect(allPaints(a), id).toHaveLength(0);
      }
    }
  });
  it('film holes, old-print waves and which way things run come from the print size (`ref`), not the renderer\'s rounded px', () => {
    // a frame whose length is exactly 10.5 hole pitches at print size, drawn
    // at a quarter size by a renderer whose page height rounded up a little
    const print = { x: 0, y: 0, w: 1428, h: 1000 };
    const screen = { x: 0, y: 0, w: 357, h: 250.4, ref: { w: 1428, h: 1000 } };
    const holes = (a: MaskArt) => a.over[0].d.split(' M ').length - 2;
    expect(holes(maskArt('film', screen))).toBe(holes(maskArt('film', print)));
    // without the ref, the rounded px would choose another count
    expect(holes(maskArt('film', { x: 0, y: 0, w: 357, h: 250.4 }))).not.toBe(holes(maskArt('film', print)));
    const waves = (a: MaskArt) => points(a.under[0].d).length;
    expect(waves(maskArt('old-print', screen))).toBe(waves(maskArt('old-print', print)));
    // a nearly square frame, a hair taller in the renderer's px but wider at
    // print size, runs the film across (holes top and bottom) as print does
    const nearSquare = { x: 0, y: 0, w: 1000, h: 1000.3, ref: { w: 1000.2, h: 1000 } };
    expect(maskArt('film', nearSquare).photo.w).toBeGreaterThan(maskArt('film', nearSquare).photo.h);
  });
  it('artBox gives every renderer the frame\'s print size (its ref)', () => {
    const size = '8x8' as const;
    const { width: W } = getPrintDimensions(size);
    const { width: uiW } = getCanvasDimensions(size);
    const sx = 600 / uiW; // the preview at 600 px
    const a = artBox({ x: 60, y: 60, w: 300, h: 200 }, { albumSize: size, pageIndex: 0, coverMode: false, fullBleed: false, kx: sx, ky: sx });
    expect(a.ref!.w).toBeCloseTo((300 / sx) * (W / uiW), 6);
  });
  it('face centring works in the window the photo is drawn in (slotDesignSize)', () => {
    const page = { templateId: 't88-solo-landscape', slotMasks: ['film'] };
    const framed = slotDesignSize({ templateId: 't88-solo-landscape' }, 0, '8x8', 0)!;
    const film = slotDesignSize(page, 0, '8x8', 0)!;
    expect(film.h).toBeCloseTo(framed.h * (1 - 2 * FILM.band), 3);
    expect(film.w).toBeLessThan(framed.w);
    const flower = slotDesignSize({ templateId: 't88-solo-landscape', slotMasks: ['flower'] }, 0, '8x8', 0)!;
    expect(flower.w).toBeCloseTo(flower.h, 6);
  });
});

describe('artBox: a full-page photo keeps its mask inside the safe print area', () => {
  const size = '8x8' as const;
  const { width: W, height: H } = getPrintDimensions(size);
  const { width: uiW, height: uiH } = getCanvasDimensions(size);
  const k = { kx: W / uiW, ky: H / uiH };
  const page = (fullBleed: boolean) => ({ albumSize: size, pageIndex: 3, coverMode: false, fullBleed, ...k });

  it('a layout with margins: the frame as it is', () => {
    const b = { x: 300, y: 300, w: 900, h: 700 };
    const a = artBox(b, page(false));
    expect(a).toMatchObject(b);
    expect(a.ref).toEqual({ w: 900, h: 700 }); // print px already
  });
  it('a full-page photo: inside the dotted line words stop at (1/2" at the sides, 1/4" top and bottom)', () => {
    const a = artBox({ x: 0, y: 0, w: W, h: H }, page(true));
    const s = wordsSafeArea(size, 3);
    expect(a.x).toBeCloseTo(s.x * k.kx, 6);
    expect(a.y).toBeCloseTo(s.y * k.ky, 6);
    expect(a.w).toBeCloseTo(s.w * k.kx, 6);
    expect(a.h).toBeCloseTo(s.h * k.ky, 6);
    expect(a.x).toBeCloseTo(0.5 * 300, 0); // 300 DPI
    expect(a.y).toBeCloseTo(0.25 * 300, 0);
  });
  it('a frame in a full-bleed grid moves in only on the sides that touch the trim', () => {
    const cell = { x: W / 2 + 20, y: 0, w: W / 2 - 20, h: H / 2 - 20 };
    const a = artBox(cell, page(true));
    expect(a.x).toBe(cell.x); // the gutter side stays
    expect(a.y).toBeGreaterThan(0); // the top moves in
    expect(a.x + a.w).toBeLessThan(W); // the outer side moves in
    expect(a.y + a.h).toBe(cell.y + cell.h);
  });
  it('the same in the preview\'s px (page corner moved, another scale)', () => {
    const kx = 0.5, ky = 0.5;
    const a = artBox({ x: 10, y: 20, w: uiW * kx, h: uiH * ky }, { ...page(true), kx, ky, ox: 10, oy: 20 });
    const s = wordsSafeArea(size, 3);
    expect(a.x).toBeCloseTo(10 + s.x * kx, 6);
    expect(a.y).toBeCloseTo(20 + s.y * ky, 6);
  });
});

function inset(b: ArtBox, d: number): ArtBox {
  return { x: b.x + d, y: b.y + d, w: b.w - 2 * d, h: b.h - 2 * d };
}
