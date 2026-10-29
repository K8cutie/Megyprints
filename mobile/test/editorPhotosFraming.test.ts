/* ══════════════════════════════════════════════════════════════════════════
   MOVING AND ZOOMING A PHOTO IN ITS FRAME (photos part: src/editor/photos/
   framing.ts), held to the page renderer and the website's fit:
     • the frame it works in is planPage's photo box (the box the app draws
       the photo in), on EVERY layout of EVERY album size, left and right
       pages, with a moved frame and a mask too; the pan it stores is the pan
       planPage reads back (design px × the page's px per design px);
     • where it shows the photo is drawPage's own call (slotPhotoRect with
       planPage's numbers), so the finger shows what is drawn and printed;
     • a finger's move: held to the photo's overflow (never an edge of the
       frame showing), stored once when the finger work ends, in design px;
       a tap stores nothing; pushed past the edge, it moves back at once;
     • a pinch: between the cover fit (1) and the website's slider top (10);
       a move and a pinch in one gesture are stored as two separate steps,
       each the moment that finger work ends;
     • printSharpness (slotGeometry) says when a zoom prints soft.
   ══════════════════════════════════════════════════════════════════════════ */
import type { AlbumPage, AlbumSizePreset } from '@web/pages/builder/types';
import { ALBUM_SIZES } from '@web/pages/builder/types';
import { PAGE_TEMPLATES } from '@web/pages/builder/pageTemplates';
import { getCanvasDimensions } from '@web/pages/builder/layouts';
import { getPrintDimensions } from '@web/pages/builder/printSize';
import { panRoom, slotPhotoRect } from '@web/pages/builder/slotPhotoFit';
import { printSharpness } from '@web/pages/builder/slotGeometry';
import { planPage, type PhotoItem } from '../src/render/pagePlan';
import { pageFlick } from '../src/editor/photos/FramingOverlay';
import { FramingGesture, frameCell, heldPan, photoRect, softAt, storedFraming, TAP_SLOP, ZOOM_MAX, ZOOM_MIN, type FrameCell, type FramingChange } from '../src/editor/photos/framing';

const PHOTOS = 400;
const layoutsFor = (size: AlbumSizePreset) => PAGE_TEMPLATES.filter((t) => t.albumSizes.length === 0 || t.albumSizes.includes(size));

function pageOn(templateId: string, size: AlbumSizePreset, extra: Partial<AlbumPage> = {}): AlbumPage {
  return { id: 'p', layout: 'collage', templateId, size, background: { type: 'solid', solid: '#FFFFFF', opacity: 100 }, photos: [], textElements: [], ...extra } as AlbumPage;
}
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));
const sameRect = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  near(a.x, b.x) && near(a.y, b.y) && near(a.w, b.w) && near(a.h, b.h);

describe('the frame and the fit are the renderer\'s, on every layout of every size', () => {
  for (const size of ALBUM_SIZES.map((s) => s.preset)) {
    it(`${size}: frame box, turn, stored pan and drawn photo match planPage / drawPage, left and right pages`, () => {
      const { width: W, height: H } = getPrintDimensions(size);
      const ui = getCanvasDimensions(size);
      const portrait = { w: 3000, h: 4000 }, landscape = { w: 4032, h: 3024 };
      let checked = 0;
      for (const t of layoutsFor(size)) {
        for (const pageIndex of [0, 1]) {
          const n = t.slots.length;
          const page = pageOn(t.id, size, {
            slotFills: t.slots.map((_s, i) => i),
            slotScales: t.slots.map((_s, i) => 1 + (i % 3) * 0.4),
            slotOffsetsX: t.slots.map((_s, i) => (i % 2 ? -1 : 1) * 37.5),
            slotOffsetsY: t.slots.map((_s, i) => (i % 2 ? 1 : -1) * 21.25),
            // A moved frame and a mask on the first one (the Studio's).
            slotGeometries: n ? [{ x: 0.1, y: 0.1, width: 0.5, height: 0.45 }] : [],
            slotMasks: n ? ['circle'] : [],
          });
          const plan = planPage({ page, albumSize: size, pageIndex, photoCount: PHOTOS });
          for (const item of plan.items.filter((i): i is PhotoItem => i.kind === 'photo')) {
            const cell = frameCell(page, item.slotIndex, size, pageIndex)!;
            expect(cell).not.toBeNull();
            expect(sameRect(cell.box, item.box)).toBe(true);
            expect(cell.rotation).toBe(item.slot.rotation ?? 0);
            expect(cell.k).toEqual({ x: W / ui.width, y: H / ui.height });
            const f = storedFraming(page, item.slotIndex, cell);
            expect(near(f.pan.x, item.pan.x)).toBe(true);
            expect(near(f.pan.y, item.pan.y)).toBe(true);
            expect(f.zoom).toBeCloseTo(item.zoom ?? 1, 9);
            for (const img of [portrait, landscape]) {
              // drawPage: slotPhotoRect(img, { w: sw, h: sh }, item.zoom, item.pan).
              const drawn = slotPhotoRect(img, { w: item.box.w, h: item.box.h }, item.zoom, item.pan);
              expect(sameRect(photoRect(img, cell, f), drawn)).toBe(true);
            }
            checked++;
          }
        }
      }
      expect(checked).toBeGreaterThan(10);
    });
  }

  it('no frame: null (a page with no layout, a frame the layout lacks)', () => {
    const page = pageOn('nope', '8x8');
    expect(frameCell({ ...page, templateId: undefined }, 0, '8x8', 0)).toBeNull();
    const t = layoutsFor('8x8')[0];
    expect(frameCell(pageOn(t.id, '8x8'), t.slots.length + 3, '8x8', 0)).toBeNull();
  });
});

/* ── The gesture ───────────────────────────────────────────────────────── */

const size: AlbumSizePreset = '8x8';
const template = layoutsFor(size).find((t) => t.slots.length === 1 && !t.fullBleed) ?? layoutsFor(size)[0];
const IMG = { w: 4000, h: 3000 }; // a landscape photo
/** Screen px per page px (a page shown ~360 px wide). */
const K = 360 / getPrintDimensions(size).width;

function setup(extra: Partial<AlbumPage> = {}) {
  const page = pageOn(template.id, size, { slotFills: [0], ...extra });
  const cell = frameCell(page, 0, size, 0)!;
  return { page, cell, g: new FramingGesture(IMG, cell, storedFraming(page, 0, cell), K) };
}
const frameOf = (cell: FrameCell) => ({ w: cell.box.w, h: cell.box.h });
/** The pan the builder will hold after `changes` (page px), from `start`. */
function storedAfter(cell: FrameCell, start: { x: number; y: number }, changes: FramingChange[]) {
  let x = start.x / cell.k.x, y = start.y / cell.k.y;
  for (const c of changes) if (c.kind === 'offset') { x += c.dx; y += c.dy; }
  return { x: x * cell.k.x, y: y * cell.k.y };
}

describe('one finger moves the photo in its frame', () => {
  it('a small move is a tap: nothing is stored', () => {
    const { g } = setup();
    g.touches([{ x: 100, y: 100 }]);
    g.touches([{ x: 100 + TAP_SLOP - 2, y: 100 }]);
    expect(g.isTap).toBe(true);
    expect(g.end()).toEqual([]);
  });

  it('a move is stored once, when the finger is up, in design px (setSlotOffset adds it)', () => {
    const { g, cell } = setup({ slotScales: [2] });
    expect(g.touches([{ x: 100, y: 100 }])).toEqual([]);
    expect(g.touches([{ x: 130, y: 112 }])).toEqual([]);
    expect(g.touches([{ x: 140, y: 120 }])).toEqual([]);
    const changes = g.end();
    expect(changes).toHaveLength(1);
    const c = changes[0] as Extract<FramingChange, { kind: 'offset' }>;
    expect(c.kind).toBe('offset');
    // 40 x 20 screen px → page px → design px (inside the room at zoom 2).
    expect(c.dx).toBeCloseTo(40 / K / cell.k.x, 9);
    expect(c.dy).toBeCloseTo(20 / K / cell.k.y, 9);
    expect(g.isTap).toBe(false);
  });

  it('pushed past the edge, the photo stops there (the frame never shows an edge) and moves back at once', () => {
    const { g, cell } = setup();
    const room = panRoom(IMG, frameOf(cell), 1);
    expect(room.x).toBeGreaterThan(0); // landscape photo in a frame narrower than it: room sideways
    g.touches([{ x: 0, y: 0 }]);
    g.touches([{ x: 5000, y: 0 }]);
    expect(g.live.pan.x).toBeCloseTo(room.x, 9);
    const r = photoRect(IMG, cell, g.live);
    expect(r.x).toBeCloseTo(0, 6); // the photo's left edge on the frame's left edge
    // Turning back 10 px moves it 10 px at once: no dead zone past the edge.
    g.touches([{ x: 4990, y: 0 }]);
    expect(g.live.pan.x).toBeCloseTo(room.x - 10 / K, 9);
    const changes = g.end();
    expect(storedAfter(cell, { x: 0, y: 0 }, changes).x).toBeCloseTo(room.x - 10 / K, 6);
  });

  it('a pan stored past the overflow (an old album) starts from where the photo is drawn, and a tap leaves it as it is', () => {
    const far = 9999;
    const { g, cell, page } = setup({ slotOffsetsX: [far], slotScales: [3] });
    const room = panRoom(IMG, frameOf(cell), 3);
    expect(g.live.pan.x).toBeCloseTo(room.x, 9);
    g.touches([{ x: 50, y: 50 }]);
    expect(g.end()).toEqual([]);
    const { g: g2 } = setup({ slotOffsetsX: [far], slotScales: [3] });
    g2.touches([{ x: 50, y: 50 }]);
    g2.touches([{ x: 30, y: 50 }]);
    const changes = g2.end();
    const after = storedAfter(cell, storedFraming(page, 0, cell).pan, changes);
    expect(after.x).toBeCloseTo(room.x - 20 / K, 6);
  });
});

describe('a swipe that could not move the photo', () => {
  it("one finger's travel is kept (the overlay turns the page with it); a pinch has none", () => {
    const { g } = setup();
    g.touches([{ x: 300, y: 100 }]);
    g.touches([{ x: 200, y: 110 }]);
    expect(g.oneFingerTravel).toEqual({ dx: -100, dy: 10 });
    const { g: two } = setup();
    two.touches([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    two.touches([{ x: -80, y: 0 }]);
    expect(two.oneFingerTravel).toBeNull();
  });
});

describe('a quick sideways flick over a selected photo turns the page (FramingOverlay pageFlick)', () => {
  it('fast and short turns the page, even where the photo could move; a slow drag moves the photo', () => {
    expect(pageFlick({ dx: -120, dy: 10 }, -1.2, 180)).toBe('forward');
    expect(pageFlick({ dx: 120, dy: -8 }, 0.9, 250)).toBe('back');
    expect(pageFlick({ dx: -120, dy: 10 }, -0.2, 180)).toBeNull(); // slow: a move
    expect(pageFlick({ dx: -120, dy: 10 }, -1.2, 900)).toBeNull(); // long: a move
    expect(pageFlick({ dx: -30, dy: 2 }, -1.5, 120)).toBeNull(); // too short to be a swipe
    expect(pageFlick({ dx: -80, dy: 90 }, -1.5, 120)).toBeNull(); // mostly up or down
    expect(pageFlick({ dx: -120, dy: 0 }, 1.0, 150)).toBeNull(); // lifted moving the other way
    expect(pageFlick(null, -2, 100)).toBeNull(); // two fingers
  });
});

describe('two fingers zoom it', () => {
  it('a pinch is stored once, between the cover fit and the website\'s slider top, the pan drawn held to the new room', () => {
    const { g, cell } = setup();
    g.touches([{ x: 100, y: 100 }]);
    g.touches([{ x: 100, y: 100 }, { x: 200, y: 100 }]);
    g.touches([{ x: 50, y: 100 }, { x: 250, y: 100 }]); // twice as far apart
    expect(g.live.zoom).toBeCloseTo(2, 9);
    const changes = g.end();
    expect(changes).toEqual([{ kind: 'scale', zoom: 2 }]);
    // Way past the top, and way under the cover fit.
    const { g: big } = setup();
    big.touches([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
    big.touches([{ x: 0, y: 0 }, { x: 1000, y: 0 }]);
    expect(big.live.zoom).toBe(ZOOM_MAX);
    const { g: small } = setup({ slotScales: [3] });
    small.touches([{ x: 0, y: 0 }, { x: 1000, y: 0 }]);
    small.touches([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
    expect(small.live.zoom).toBe(ZOOM_MIN);
    expect(heldPan(IMG, frameOf(cell), ZOOM_MIN, { x: 1e6, y: -1e6 })).toEqual({ x: panRoom(IMG, frameOf(cell), 1).x, y: -panRoom(IMG, frameOf(cell), 1).y });
  });

  it('an old album zoomed under the cover fit is brought up to it by a pinch', () => {
    const { g } = setup({ slotScales: [0.5] });
    expect(g.live.zoom).toBe(0.5); // drawn as stored until a pinch
    g.touches([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    g.touches([{ x: 0, y: 0 }, { x: 110, y: 0 }]);
    expect(g.end()).toEqual([{ kind: 'scale', zoom: ZOOM_MIN }]);
  });

  it('a move then a second finger: the move is stored as the second finger comes down, the pinch when the fingers are up', () => {
    const { g, cell } = setup({ slotScales: [2] });
    g.touches([{ x: 100, y: 100 }]);
    expect(g.touches([{ x: 150, y: 100 }])).toEqual([]);
    const atSecond = g.touches([{ x: 150, y: 100 }, { x: 250, y: 100 }]);
    expect(atSecond).toHaveLength(1);
    expect(atSecond[0].kind).toBe('offset');
    expect((atSecond[0] as { dx: number }).dx).toBeCloseTo(50 / K / cell.k.x, 9);
    g.touches([{ x: 125, y: 100 }, { x: 275, y: 100 }]); // 1.5× apart
    expect(g.end()).toEqual([{ kind: 'scale', zoom: 3 }]);
  });

  it('a pinch then one finger lifted: the zoom is stored then, the move when the last finger is up', () => {
    const { g } = setup();
    g.touches([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    g.touches([{ x: 0, y: 0 }, { x: 300, y: 0 }]);
    const atLift = g.touches([{ x: 0, y: 0 }]);
    expect(atLift).toEqual([{ kind: 'scale', zoom: 3 }]);
    g.touches([{ x: -40, y: 0 }]);
    const changes = g.end();
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe('offset');
  });
});

describe('a zoom that prints soft is said (slotGeometry printSharpness)', () => {
  it('softAt is printSharpness on the frame made zoom times bigger', () => {
    const { cell } = setup();
    const small = { width: 900, height: 675 };
    const big = { width: 6000, height: 4500 };
    for (const z of [1, 2, 4, 8]) {
      const box = { ...cell.slot, width: cell.slot.width * z, height: cell.slot.height * z };
      expect(softAt(small, cell, z)).toBe(printSharpness(small, box, cell.guard) === 'soft');
    }
    expect(softAt(big, cell, 1)).toBe(false);
    expect(softAt(big, cell, 10)).toBe(true);
    expect(softAt(undefined, cell, 10)).toBe(false); // unknown size: never said
  });
});
