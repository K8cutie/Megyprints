import { describe, it, expect } from 'vitest';
import { generateAlbum } from './generateAlbum';
import { getTemplatesForAlbum, getTemplateById } from './pageTemplates';
import { MINI_TEMPLATES, miniFrames } from './miniTemplates';
import { planMiniPages, miniShape, miniCrossings, miniReflow } from './miniPlanner';
import { layoutChoicesForPage, relayPageOnTemplate } from './useBuilderState';
import { marginForTemplate } from './binding';
import { spreadHalfOf } from './miniSpread';
import { MINI_SIZE, MINI_PAGES, MINI_MIN_PHOTOS, MINI_MAX_PHOTOS } from '../../lib/megyMini';
import { seedMathRandom, mulberry32 } from '../../test/seededRandom';
import type { AlbumPage, UploadedPhoto } from './types';

seedMathRandom(); // same books every run (generateAlbum deals with Math.random)

/* ═══════════════════════════════════════════════════════════════════════════
   THE MEGY MINI'S OWN LAYOUTS AND PAGE PLANNER (owner, 2026-11-17: "im trying
   to avoid pages with lots of free spaces since the pages for mini are very
   few"). Every page of a Mini is photos edge to edge: no word box, no white
   mat, nothing kept back at the staple fold. A photo goes in a frame of the
   other shape only when no mix of layouts avoids it.
   ═══════════════════════════════════════════════════════════════════════════ */

const W = 148, H = 210;
const THIRD_ROW = ['mini-l-pl', 'mini-l-lp', 'mini-pl-l', 'mini-lp-l'];
const SHAPE = { L: [4032, 3024], P: [3024, 4032], S: [3000, 3000] } as const;
const t0 = Date.UTC(2026, 10, 17, 9);

/** Photos from a string of shapes, a minute apart: 'LPPL…'. */
function photosOf(shapes: string): UploadedPhoto[] {
  return [...shapes].map((c, i) => {
    const [width, height] = SHAPE[c as 'L' | 'P' | 'S'];
    return { id: `ph-${i}`, previewUrl: '', name: `ph-${i}.jpg`, type: 'image/jpeg', size: 1, width, height, capturedAt: t0 + i * 60_000 };
  });
}

/** A roll of `n` with this share of portraits (squares now and then). */
function roll(n: number, portraits: number, seed: number): UploadedPhoto[] {
  const rnd = mulberry32(seed * 7919 + n);
  return photosOf(Array.from({ length: n }, () => { const r = rnd(); return r < 0.04 ? 'S' : r < portraits ? 'P' : 'L'; }).join(''));
}

const photoFills = (p: AlbumPage) => {
  const t = p.templateId ? getTemplateById(p.templateId) : undefined;
  return (p.slotFills ?? []).filter((f, i) => f != null && t?.slots[i]?.kind !== 'qr');
};

describe('the Mini layouts', () => {
  it('are the whole supply for the Mini: no word box, every frame an A-shape or near its photo', () => {
    expect(getTemplatesForAlbum(MINI_SIZE).map((t) => t.id).sort()).toEqual(MINI_TEMPLATES.map((t) => t.id).sort());
    for (const t of MINI_TEMPLATES) {
      expect(t.textSlots ?? [], t.id).toEqual([]);
      expect(t.fullBleed, t.id).toBe(true);
      miniFrames(t).forEach((f, i) => {
        const s = t.slots[i];
        const shape = (s.width * W) / (s.height * H);
        if (THIRD_ROW.includes(t.id)) {
          // a phone photo (4:3 or 3:4) loses under 15% to the frame
          const phone = f === 'L' ? 4 / 3 : 3 / 4;
          expect(1 - Math.min(shape, phone) / Math.max(shape, phone), `${t.id} frame ${i}`).toBeLessThan(0.15);
          expect(f === 'L' ? shape > 1.1 : shape < 0.8, `${t.id} frame ${i} shape`).toBe(true);
        } else {
          // a sheet halved keeps its shape: √2 wide, or 1/√2 tall (the gutters move it a hair)
          expect(Math.abs(Math.log(shape / (f === 'L' ? Math.SQRT2 : Math.SQRT1_2))), `${t.id} frame ${i}`).toBeLessThan(0.03);
        }
      });
    }
  });

  it('leave no free space: the frames meet the four edges and cover the page but for the gutters', () => {
    for (const t of MINI_TEMPLATES) {
      const s = t.slots;
      expect(Math.min(...s.map((x) => x.x)), t.id).toBeCloseTo(0, 9);
      expect(Math.min(...s.map((x) => x.y)), t.id).toBeCloseTo(0, 9);
      expect(Math.max(...s.map((x) => x.x + x.width)), t.id).toBeCloseTo(1, 9);
      expect(Math.max(...s.map((x) => x.y + x.height)), t.id).toBeCloseTo(1, 9);
      for (let a = 0; a < s.length; a++) for (let b = a + 1; b < s.length; b++) {
        const ox = Math.min(s[a].x + s[a].width, s[b].x + s[b].width) - Math.max(s[a].x, s[b].x);
        const oy = Math.min(s[a].y + s[a].height, s[b].y + s[b].height) - Math.max(s[a].y, s[b].y);
        expect(ox > 1e-9 && oy > 1e-9, `${t.id}: frames ${a} and ${b} overlap`).toBe(false);
      }
      const covered = s.reduce((sum, x) => sum + x.width * x.height, 0);
      expect(1 - covered, `${t.id}: paper showing`).toBeLessThan(0.02);
    }
  });

  it('run to the staple fold, on a left page and a right page alike', () => {
    const full = getTemplateById('mini-full')!;
    for (const pageIndex of [0, 1, 6, 9]) {
      expect(marginForTemplate(full, full.margin, MINI_SIZE, pageIndex)).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
    }
  });

  it('keep the first A5 layouts resolving for a Mini made before, never dealt again', () => {
    for (const id of ['ta5-solo', 'ta5-duo-34-framed', 'ta5-trio-grid-box-tr', 'ta5-quad-grid']) {
      expect(getTemplateById(id), id).toBeDefined();
      expect(getTemplatesForAlbum(MINI_SIZE).some((t) => t.id === id), id).toBe(false);
    }
  });
});

describe('the page planner', () => {
  it('crosses no photo in a Mini of 22 to 40 photos with 5 landscapes up to half (thanks to the third-row layout)', () => {
    // A-shapes keep (photos - pages + landscape frames) a multiple of 3, so on
    // their own two rolls in three would need a photo cut to half; the
    // third-row layout (2 landscapes, 1 portrait) adds 1. What still crosses:
    // almost only portraits (0-4 landscapes: 1 or 2 portraits in a landscape
    // frame), and more landscapes than a few photos can pair up (a landscape
    // alone on a page).
    for (let n = 22; n <= MINI_MAX_PHOTOS; n++) {
      for (let land = 5; land <= Math.floor(n / 2); land++) {
        const photos = photosOf('L'.repeat(land) + 'P'.repeat(n - land));
        const pages = generateAlbum(photos, MINI_SIZE);
        const crossed = pages.reduce((k, p) => k + miniCrossings(p.templateId, p.slotFills, photos).length, 0);
        expect(crossed, `${n} photos, ${land} landscapes`).toBe(0);
      }
    }
  });

  it('crosses at most 2 photos when the roll is almost only portraits (20 photos up)', () => {
    // Under 20 photos most pages hold one photo, so a landscape may be alone.
    for (let n = 20; n <= MINI_MAX_PHOTOS; n++) {
      for (let land = 0; land <= 4; land++) {
        const photos = photosOf('L'.repeat(land) + 'P'.repeat(n - land));
        const pages = generateAlbum(photos, MINI_SIZE);
        const crossed = pages.flatMap((p) => miniCrossings(p.templateId, p.slotFills, photos).map((s) => p.slotFills![s]!));
        expect(crossed.length, `${n} photos, ${land} landscapes`).toBeLessThanOrEqual(2);
        // and those are portraits in landscape frames, never a landscape cut to a portrait
        for (const i of crossed) expect(miniShape(photos[i]), `${n} photos, ${land} landscapes`).toBe('P');
      }
    }
  });

  it('fills exactly the pages it is given, every photo once, every frame filled', () => {
    for (let n = 12; n <= 39; n++) {
      for (const portraits of [0, 0.3, 0.6, 1]) {
        const photos = roll(n, portraits, n);
        const plan = planMiniPages(photos, 12);
        expect(plan.length, `${n} photos, ${portraits} portraits`).toBe(12);
        const placed = plan.flatMap((p) => p.photos);
        expect(new Set(placed).size).toBe(n);
        expect(placed.length).toBe(n);
        for (const p of plan) expect(p.photos.length).toBe(getTemplateById(p.templateId)!.slots.length);
      }
    }
  });

  it('puts no photo in a frame of the other shape when the photos allow it', () => {
    for (const shapes of ['LPLPPLPPLLPPPLPLLPLPPPLP', 'PPPPPPPPPPPPPPPPPPPP', 'LLLLLLLLLLLLLLLLLLLLLLLLLLLL', 'PLLPLLPLLPLLPLLPLLPLLPLL']) {
      const photos = photosOf(shapes);
      const plan = planMiniPages(photos, 14);
      expect(plan.flatMap((p) => miniCrossings(p.templateId, p.photos, photos)), shapes).toEqual([]);
    }
  });

  it('fills every page with few, wide photos: a landscape alone gets a full page of its own', () => {
    const photos = photosOf('L'.repeat(16));
    const plan = planMiniPages(photos, 14);
    expect(plan.length).toBe(14);
    // 14 pages from 16 landscapes: 2 pages of two, 12 landscapes on a full page each
    const crossing = plan.filter((p) => miniCrossings(p.templateId, p.photos, photos).length > 0);
    expect(crossing.length).toBe(12);
    for (const p of crossing) expect(p.templateId).toBe('mini-full');
  });

  it('fills every page with portraits only: a portrait in a landscape frame only when the count leaves no other way', () => {
    // 20 portraits on 14 pages: 12 full pages + 2 of four, nothing crossed
    const twenty = photosOf('P'.repeat(20));
    expect(planMiniPages(twenty, 14).flatMap((p) => miniCrossings(p.templateId, p.photos, twenty))).toEqual([]);
    // 21 can't be made of ones and fours on 14 pages: two portraits go in landscape frames
    const photos = photosOf('P'.repeat(21));
    const plan = planMiniPages(photos, 14);
    expect(plan.reduce((n, p) => n + miniCrossings(p.templateId, p.photos, photos).length, 0)).toBe(2);
  });

  it('crosses the least-crossed photo: the squarest portrait goes in a landscape frame', () => {
    const photos = photosOf('P'.repeat(21));
    photos[9] = { ...photos[9], width: 3000, height: 3300 }; // nearly square
    photos[15] = { ...photos[15], width: 3000, height: 3200 };
    const plan = planMiniPages(photos, 14);
    const crossed = plan.flatMap((p) => miniCrossings(p.templateId, p.photos, photos).map((s) => p.photos[s]));
    expect(crossed.sort((a, b) => a - b)).toEqual([9, 15]);
  });

  it('reads in the order the photos were taken', () => {
    const photos = roll(30, 0.55, 3);
    const plan = planMiniPages(photos, 14);
    expect(Math.min(...plan[0].photos)).toBeLessThanOrEqual(2);
    const mean = plan.map((p) => p.photos.reduce((a, b) => a + b, 0) / p.photos.length);
    let ordered = 0;
    for (let i = 1; i < mean.length; i++) if (mean[i] >= mean[i - 1]) ordered++;
    expect(ordered, mean.join(', ')).toBeGreaterThanOrEqual(mean.length - 3);
  });

  it('keeps a page to one scene when the photos allow it', () => {
    // two landscapes and two portraits of one scene, then the same of another
    const photos = photosOf('LLPPLLPP');
    const scene = [0, 0, 0, 0, 1, 1, 1, 1];
    const plan = planMiniPages(photos, 4, () => 0, scene);
    for (const p of plan) expect(new Set(p.photos.map((i) => scene[i])).size, p.templateId).toBe(1);
  });

  it('knows a square as a portrait, so it loses its sides, never a head', () => {
    expect(miniShape({ width: 3000, height: 3000 })).toBe('P');
    expect(miniShape({ width: 4032, height: 3024 })).toBe('L');
  });
});

describe("changing a Mini page's layout", () => {
  it('keeps each photo in a frame of its own shape', () => {
    // Landscape over two portraits → Two portraits over landscape: the
    // landscape moves to the bottom frame, not into a portrait one.
    expect(miniReflow('mini-l-pp', [5, 6, 7], 'mini-pp-l')).toEqual([6, 7, 5]);
    expect(miniReflow('mini-pp-l', [6, 7, 5], 'mini-l-pp')).toEqual([5, 6, 7]);
    // onto a layout with more frames: the extra stays empty; with fewer: what fits
    expect(miniReflow('mini-ll', [1, 2], 'mini-l-pll')).toEqual([1, null, 2, null]);
    expect(miniReflow('mini-l-pll', [1, 9, 2, 3], 'mini-ll')).toEqual([1, 2]);
    // not a Mini layout: not ours to place
    expect(miniReflow('ta5-solo', [1], 'mini-full')).toBeNull();
  });

  it('offers the other ways round of a page layout in "Change layout"', () => {
    const photos = photosOf('LPP');
    const page: AlbumPage = {
      id: 'p', layout: 'freeform', templateId: 'mini-l-pp', size: MINI_SIZE, slotFills: [0, 1, 2],
      background: { type: 'solid', solid: '#FFFFFF' }, photos: [], textElements: [],
    };
    const offered = layoutChoicesForPage(page, photos, MINI_SIZE).map((t) => t.id);
    expect(offered[0]).toBe('mini-l-pp');
    expect(offered).toContain('mini-pp-l');
    const turned = relayPageOnTemplate(page, getTemplateById('mini-pp-l')!);
    expect(turned.slotFills).toEqual([1, 2, 0]);
    expect(miniCrossings(turned.templateId, turned.slotFills, photos)).toEqual([]);
  });
});

describe('a Mini made by Megy', () => {
  it('is 16 full pages for 16 to 40 photos: its own layouts, the spread, full pages, never a word box or an empty frame', () => {
    for (let n = MINI_MIN_PHOTOS; n <= MINI_MAX_PHOTOS; n++) {
      for (const portraits of [0.2, 0.6, 0.9]) {
        const photos = roll(n, portraits, n + 100);
        const pages = generateAlbum(photos, MINI_SIZE);
        const what = `${n} photos, ${portraits} portraits`;
        expect(pages.length, what).toBe(MINI_PAGES);
        for (const p of pages) {
          const t = getTemplateById(p.templateId!)!;
          const own = MINI_TEMPLATES.some((m) => m.id === t.id) || spreadHalfOf(t.id) != null || t.id.startsWith('qr-badge-');
          expect(own, `${what}: page ${p.id} on ${t.id}`).toBe(true);
          expect(t.textSlots ?? [], `${what}: ${t.id}`).toEqual([]);
          const frames = t.slots.filter((s) => s.kind !== 'qr').length;
          expect(photoFills(p).length, `${what}: ${t.id} has an empty frame`).toBe(frames);
        }
        expect(new Set(pages.flatMap(photoFills)).size, `${what}: all placed`).toBe(n);
      }
    }
  });

  it('opens on a full page, keeps two for the videos and the middle spread on pages 8 and 9', () => {
    const pages = generateAlbum(roll(30, 0.6, 1), MINI_SIZE);
    expect(pages[0].templateId).toBe('mini-full');
    expect(pages.filter((p) => p.templateId === 'mini-full').length).toBeGreaterThanOrEqual(3);
    expect(spreadHalfOf(pages[7].templateId)).toBe('left');
    expect(spreadHalfOf(pages[8].templateId)).toBe('right');
  });

  it('marks the photos a crop must move to show their faces', () => {
    const photos = photosOf('L'.repeat(16));
    const pages = generateAlbum(photos, MINI_SIZE);
    const crossed = pages.filter((p) => miniCrossings(p.templateId, p.slotFills, photos).length > 0);
    expect(crossed.length).toBeGreaterThan(0);
    for (const p of crossed) expect(p.templateId).toBe('mini-full');
  });
});
