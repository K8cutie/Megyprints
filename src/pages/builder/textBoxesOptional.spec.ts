import { describe, it, expect, vi } from 'vitest';
import { generateAlbum, isFullPagePhoto, memorySingleTemplate, photosPerPageNote } from './generateAlbum';
import { getTemplateById, getTemplatesForAlbum, withBoxes, pagesHaveBoxes, BOX_FREE_SUFFIX, PAGE_TEMPLATES } from './pageTemplates';
import { DENSITY_BY_SIZE } from './densities';
import type { AlbumPage, AlbumSizePreset, PageTemplate, UploadedPhoto } from './types';
import { seedMathRandom, mulberry32, TEST_SEED } from '../../test/seededRandom';

seedMathRandom(); // same albums every run (generateAlbum deals with Math.random)

/* ══════════════════════════════════════════════════════════════════════════
   TEXT & AI BOXES ARE OPTIONAL (owner, 2026-11-13: "make text box and AI box
   optional … off by default … We can still meet minimum page requirement as
   long as they have 40 pics … to maximize the pages for the users pictures").
   Off: the box-free deck, each box layout's photos centred where its box was
   a band ("box-free twins"), and a one-photo page over the whole sheet where
   the photo fills it safely ("Full page if safe").
   ══════════════════════════════════════════════════════════════════════════ */

const SIZES = Object.keys(DENSITY_BY_SIZE) as AlbumSizePreset[];
const hasBox = (t: PageTemplate | undefined) => (t?.textSlots?.length ?? 0) > 0;
const tOf = (p: AlbumPage) => (p.templateId ? getTemplateById(p.templateId) : undefined);
const photosOn = (p: AlbumPage) => (p.slotFills ?? []).filter((f) => f != null).length;

/** A phone roll: 3 landscape : 2 portrait, plus a few squares. */
const roll = (n: number): UploadedPhoto[] => Array.from({ length: n }, (_, i) => {
  const shape = i % 7 === 6 ? [3000, 3000] : i % 5 >= 3 ? [3024, 4032] : [4032, 3024];
  return { id: `r${i}`, previewUrl: '', name: `r${i}.jpg`, type: 'image/jpeg', size: 1, width: shape[0], height: shape[1], capturedAt: i * 1000 };
});
const shot = (w: number, h: number, n: number): UploadedPhoto[] => Array.from({ length: n }, (_, i) => (
  { id: `s${i}`, previewUrl: '', name: `s${i}.jpg`, type: 'image/jpeg', size: 1, width: w, height: h, capturedAt: i * 1000 }));

describe('the two decks', () => {
  it('boxes on is the deck as it was: no twins in it', () => {
    for (const size of SIZES) {
      expect(getTemplatesForAlbum(size).some((t) => t.boxFreeOf)).toBe(false);
      expect(withBoxes(true, () => getTemplatesForAlbum(size)).map((t) => t.id)).toEqual(getTemplatesForAlbum(size).map((t) => t.id));
    }
  });

  it('boxes off has no box layout at any size', () => {
    for (const size of SIZES) {
      const off = withBoxes(false, () => getTemplatesForAlbum(size));
      expect(off.length).toBeGreaterThan(0);
      expect(off.filter(hasBox)).toEqual([]);
    }
  });

  it('withBoxes is only for the length of the call, even when it throws', () => {
    const before = getTemplatesForAlbum('8x8').length;
    expect(() => withBoxes(false, () => { throw new Error('x'); })).toThrow('x');
    expect(getTemplatesForAlbum('8x8').length).toBe(before);
    expect(getTemplatesForAlbum('8x8').some(hasBox)).toBe(true);
  });

  it('twins never reach /admin or the old Templates tab (PAGE_TEMPLATES)', () => {
    expect(PAGE_TEMPLATES.some((t) => t.boxFreeOf || t.id.endsWith(BOX_FREE_SUFFIX))).toBe(false);
  });
});

describe('a box-free twin is its box layout with the box taken off', () => {
  const twins = SIZES.flatMap((size) => withBoxes(false, () => getTemplatesForAlbum(size)).filter((t) => t.boxFreeOf));

  it('every size with box layouts has twins', () => {
    for (const size of ['6x4', '6x6', '8x8', '8x6', '6x8'] as AlbumSizePreset[]) {
      expect(twins.some((t) => t.albumSizes.includes(size))).toBe(true);
    }
  });

  it('the same frames, the same size, moved to the centre, on the page, and printable from its id', () => {
    for (const twin of twins) {
      const src = getTemplateById(twin.boxFreeOf!)!;
      expect(hasBox(src)).toBe(true);
      expect(getTemplateById(twin.id)).toBe(twin);
      expect(twin.textSlots).toBeUndefined();
      expect(twin.slots.length).toBe(src.slots.length);
      const dx = twin.slots[0].x - src.slots[0].x, dy = twin.slots[0].y - src.slots[0].y;
      twin.slots.forEach((s, i) => {
        expect(s.width).toBe(src.slots[i].width);
        expect(s.height).toBe(src.slots[i].height);
        expect(s.ratio).toBe(src.slots[i].ratio);
        expect(s.x - src.slots[i].x).toBeCloseTo(dx, 9);
        expect(s.y - src.slots[i].y).toBeCloseTo(dy, 9);
        expect(s.x).toBeGreaterThanOrEqual(-1e-9);
        expect(s.y).toBeGreaterThanOrEqual(-1e-9);
        expect(s.x + s.width).toBeLessThanOrEqual(1 + 1e-9);
        expect(s.y + s.height).toBeLessThanOrEqual(1 + 1e-9);
      });
      const minX = Math.min(...twin.slots.map((s) => s.x)), maxX = Math.max(...twin.slots.map((s) => s.x + s.width));
      const minY = Math.min(...twin.slots.map((s) => s.y)), maxY = Math.max(...twin.slots.map((s) => s.y + s.height));
      expect(minX).toBeCloseTo(1 - maxX, 6);
      expect(minY).toBeCloseTo(1 - maxY, 6);
    }
  });

  it('a box that sat in a grid cell (three squares + a box) has no twin: an empty cell reads as a missing photo', () => {
    expect(getTemplateById(`t88-fb-sq-box-br-gap${BOX_FREE_SUFFIX}`)).toBeUndefined();
    expect(getTemplateById(`t86-trio-grid-box-tl${BOX_FREE_SUFFIX}`)).toBeUndefined();
    expect(getTemplateById(`t88-fb-solo-ls-box-below${BOX_FREE_SUFFIX}`)?.name).toBe('Landscape');
  });

  it('a box layout an operator hides takes its twin with it', async () => {
    const { setInactiveTemplateIds } = await import('./pageTemplates');
    const id = 't88-fb-duo-exact-v-gap';
    try {
      setInactiveTemplateIds(new Set([id]));
      expect(withBoxes(false, () => getTemplatesForAlbum('8x8')).some((t) => t.boxFreeOf === id)).toBe(false);
    } finally {
      setInactiveTemplateIds(new Set());
    }
    expect(withBoxes(false, () => getTemplatesForAlbum('8x8')).some((t) => t.boxFreeOf === id)).toBe(true);
  });
});

describe('40 photos still fill 40 pages with the boxes off', () => {
  for (const size of SIZES) {
    for (const ppp of [undefined, ...DENSITY_BY_SIZE[size]]) {
      it(`${size}, ${ppp ?? 'Surprise'} per page: 40 pages, none blank, all 40 placed, not one box`, () => {
        const pages = generateAlbum(roll(40), size, ppp, undefined, { boxes: false });
        expect(pages).toHaveLength(40);
        expect(pages.filter((p) => photosOn(p) === 0)).toHaveLength(0);
        expect(new Set(pages.flatMap((p) => (p.slotFills ?? []).filter((f) => f != null))).size).toBe(40);
        expect(pages.filter((p) => hasBox(tOf(p)))).toHaveLength(0);
      });
    }
  }

  it('bigger albums: every photo placed, no blank page, no box (100 and 200 photos, every size and density)', () => {
    for (const size of SIZES) {
      for (const ppp of [undefined, ...DENSITY_BY_SIZE[size]]) {
        for (const n of [100, 200]) {
          const pages = generateAlbum(roll(n), size, ppp, undefined, { boxes: false });
          expect(pages.length).toBeGreaterThanOrEqual(40);
          expect(pages.filter((p) => photosOn(p) === 0)).toHaveLength(0);
          expect(new Set(pages.flatMap((p) => (p.slotFills ?? []).filter((f) => f != null))).size).toBe(n);
          expect(pages.filter((p) => hasBox(tOf(p)))).toHaveLength(0);
        }
      }
    }
  });
});

describe('Full page if safe (the owner\'s pick for photos the page shape doesn\'t match)', () => {
  it('8×8, landscapes: every page is the whole sheet (the sides go, as on a memory page)', () => {
    const pages = generateAlbum(shot(4032, 3024, 40), '8x8', 1, undefined, { boxes: false });
    expect(pages).toHaveLength(40);
    expect(pages.every(isFullPagePhoto)).toBe(true);
    // With the boxes on the same photos sat over a box on most pages.
    const on = generateAlbum(shot(4032, 3024, 40), '8x8', 1);
    expect(on.filter(isFullPagePhoto).length).toBeLessThan(40);
  });

  it('8×6, portraits: never the whole sheet (it would lose half); their own shape, centred, paper either side', () => {
    const pages = generateAlbum(shot(3024, 4032, 40), '8x6', 1, undefined, { boxes: false });
    expect(pages).toHaveLength(40);
    for (const p of pages) {
      const t = tOf(p)!;
      expect(isFullPagePhoto(p)).toBe(false);
      expect(t.boxFreeOf).toBeTruthy();
      const s = t.slots[0];
      expect(s.x).toBeGreaterThan(0.1);
      expect(s.x).toBeCloseTo(1 - (s.x + s.width), 6);
    }
  });

  it('8×8, portraits: a cut across the top and bottom only where a known face stays in', () => {
    const photos = shot(3024, 4032, 40);
    const plain = generateAlbum(photos, '8x8', 1, undefined, { boxes: false });
    const portraitsOnPaper = plain.filter((p) => tOf(p)?.boxFreeOf).length;
    expect(portraitsOnPaper).toBeGreaterThan(0);
    // Faces in the middle of every photo: those pages may go full.
    const faces = Object.fromEntries(photos.map((_, i) => [i, { x: 0.5, y: 0.5 }]));
    const withFaces = generateAlbum(photos, '8x8', 1, undefined, { boxes: false, faceCenters: faces });
    expect(withFaces.filter((p) => tOf(p)?.boxFreeOf).length).toBeLessThan(portraitsOnPaper);
    expect(withFaces.filter(isFullPagePhoto).every((p) => tOf(p)?.id === memorySingleTemplate('8x8')?.id
      || !!(p.qrFills ?? []).length)).toBe(true);
  });
});

describe('boxes on is the album as before', () => {
  it('no option and boxes: true make the same pages', () => {
    const dealt = (fn: () => AlbumPage[]) => {
      const spy = vi.spyOn(Math, 'random').mockImplementation(mulberry32(TEST_SEED));
      try { return fn().map((p) => [p.templateId, p.slotFills]); } finally { spy.mockRestore(); }
    };
    for (const size of ['8x8', '6x4', '8x6'] as AlbumSizePreset[]) {
      const a = dealt(() => generateAlbum(roll(70), size, undefined));
      const b = dealt(() => generateAlbum(roll(70), size, undefined, undefined, { boxes: true }));
      expect(b).toEqual(a);
    }
  });

  it('a small album made with the boxes on still has box pages', () => {
    expect(generateAlbum(roll(40), '8x8', undefined).some((p) => hasBox(tOf(p)))).toBe(true);
  });
});

describe('pagesHaveBoxes: how an album opened without its own choice reads it', () => {
  it('made with boxes → on; made without, or not made → off; junk never throws', () => {
    expect(pagesHaveBoxes(generateAlbum(roll(40), '8x8', undefined))).toBe(true);
    expect(pagesHaveBoxes(generateAlbum(roll(40), '8x8', undefined, undefined, { boxes: false }))).toBe(false);
    expect(pagesHaveBoxes([{}, { templateId: 'nope' }, null, 3])).toBe(false);
    expect(pagesHaveBoxes([])).toBe(false);
  });
});

describe('the upload step\'s note reads the deck the album will be made from', () => {
  it('runs on both decks and leaves the deck as it found it', () => {
    const photos = roll(200);
    const on = photosPerPageNote(photos, '8x8', 3);
    const off = photosPerPageNote(photos, '8x8', 3, undefined, false);
    expect(typeof on === 'string' || on === null).toBe(true);
    expect(typeof off === 'string' || off === null).toBe(true);
    expect(getTemplatesForAlbum('8x8').some(hasBox)).toBe(true);
  });
});
