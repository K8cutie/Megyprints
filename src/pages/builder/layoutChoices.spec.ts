// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/* ══════════════════════════════════════════════════════════════════════════
   "CHANGE LAYOUT" SHOWS THE PAGE'S OWN LAYOUT, AND ITS SIBLINGS (phone walk,
   2026-10-08: 412×915, 120 phone photos, an 8×8 album the app generated).
   Page 1 held three landscape photos on Hero Top — one big photo on top, two
   below. "Change layout" listed only "Four Landscapes + Box Above" and "Four
   Landscapes + Box Below": no "✓ Current", and no 3-photo layout at all.
   The sheet wanted layouts built for the photos' EXACT ratio (4:3). The
   generator puts a 4:3 in any frame of its own orientation that crops it no
   more than 16% (templatesForPhotoRatio) — Hero Top's frames are 3:2, an 11%
   crop — so the page's own layout and its sibling Hero Bottom were never on
   the sheet. Now the sheet lists the page's layout first, then the layouts
   that hold its photos the same way: same photo count first.
   ══════════════════════════════════════════════════════════════════════════ */

vi.mock('./faceDetection', () => ({ initFaceApi: async () => {}, detectFaceCenter: async () => null }));

import { layoutChoicesForPage, nextLayoutInCycle, relayPageOnTemplate } from './useBuilderState';
import { generateAlbum } from './generateAlbum';
import { getTemplateById, photoSlotCount, qrBadgeTemplate } from './pageTemplates';
import { analyzePhotos, getRatioValue } from './photoAnalyzer';
import { ALBUM_INCHES } from './templateKit';
import LayoutPicker from './LayoutPicker';
import type { AlbumPage, AlbumSizePreset, PageTemplate, QrFill, UploadedPhoto } from './types';
import { seedMathRandom } from '../../test/seededRandom';

seedMathRandom(); // generateAlbum deals with Math.random

/** The walk's roll: 120 phone photos, two landscapes (4:3) to every portrait (3:4). */
const roll: UploadedPhoto[] = Array.from({ length: 120 }, (_, i) => {
  const land = i % 3 !== 2;
  return {
    id: `p${i}`, previewUrl: `https://example.test/IMG_${1000 + i}.jpg`, name: `IMG_${1000 + i}.jpg`, type: 'image/jpeg', size: 1,
    width: land ? 4032 : 3024, height: land ? 3024 : 4032, capturedAt: 1791100000000 + i * 60_000,
  };
});
const landscapes = roll.map((_, i) => i).filter((i) => roll[i].width > roll[i].height);
const portraits = roll.map((_, i) => i).filter((i) => roll[i].width < roll[i].height);

const heroTop = getTemplateById('t88-fb-trio-hero-top-gap')!;
const heroBottom = getTemplateById('t88-fb-trio-hero-bottom-gap')!;
const heroLeft = getTemplateById('t88-fb-trio-hero-left-gap')!;
const heroRight = getTemplateById('t88-fb-trio-hero-right-gap')!;

/** A page of `t` holding these photos, the way a layout change lays it. */
function pageOn(t: PageTemplate, fills: number[], size: AlbumSizePreset = '8x8'): AlbumPage {
  return relayPageOnTemplate({
    id: 'page-1', layout: 'freeform', size, background: { type: 'solid', solid: '#FFFFFF' },
    photos: [], textElements: [], templateId: t.id, slotFills: fills,
  } as unknown as AlbumPage, t);
}

/* The rule, said again here so the spec doesn't just read the code back: a
   photo sits in a frame of its own orientation, cropped at most 16%. A frame
   that covers the whole sheet prints at the page's shape (1:1 on an 8×8). */
const orient = (v: number) => (v > 1.02 ? 'landscape' : v < 0.98 ? 'portrait' : 'square');
function frameShape(t: PageTemplate, i: number, size: AlbumSizePreset): number {
  const s = t.slots[i];
  const wholeSheet = !!t.fullBleed && s.x <= 0.001 && s.y <= 0.001 && s.width >= 0.999 && s.height >= 0.999;
  return wholeSheet ? ALBUM_INCHES[size].w / ALBUM_INCHES[size].h : getRatioValue(s.ratio ?? t.targetRatio);
}
/** What laying `page` on `t` would do to its photos that would be a bad crop. */
function badCrops(page: AlbumPage, t: PageTemplate, photos: UploadedPhoto[] = roll, size: AlbumSizePreset = '8x8'): string[] {
  const ratioOf = analyzePhotos(photos).assignments;
  const relaid = relayPageOnTemplate(page, t);
  const bad: string[] = [];
  (relaid.slotFills ?? []).forEach((f, i) => {
    if (f == null) return;
    const photo = getRatioValue(ratioOf[f]);
    const frame = frameShape(t, i, size);
    const crop = 1 - Math.min(photo, frame) / Math.max(photo, frame);
    if (orient(photo) !== orient(frame) || crop > 0.16 + 1e-9) bad.push(`${t.id} slot ${i}: ${ratioOf[f]} photo, ${Math.round(crop * 100)}% crop`);
  });
  return bad;
}

describe('the walk\'s page: three landscapes on Hero Top', () => {
  const page = pageOn(heroTop, landscapes.slice(0, 3));
  const choices = layoutChoicesForPage(page, roll, '8x8');
  const names = choices.map((t) => t.name);

  it('the sheet starts with the page\'s own layout, so it says ✓ Current', () => {
    expect(choices[0]?.id).toBe(heroTop.id);
  });
  it('the other 3-photo layout for three landscapes is there: Hero Bottom', () => {
    expect(choices.filter((t) => photoSlotCount(t) === 3).map((t) => t.id)).toEqual([heroTop.id, heroBottom.id]);
  });
  it('3-photo layouts come before the ones that hold more or fewer photos', () => {
    const counts = choices.map((t) => Math.abs(photoSlotCount(t) - 3));
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
  });
  it('the layouts it offered before are still there, and so are the other landscape layouts', () => {
    expect(names).toEqual(expect.arrayContaining([
      'Four Landscapes + Box Above', 'Four Landscapes + Box Below', 'Two Landscapes + Box', 'Landscape + Box Below',
    ]));
  });
  it('no layout that would crop these photos badly: no portraits, no squares, no square full page', () => {
    for (const t of choices) expect(badCrops(page, t)).toEqual([]);
    expect(choices).not.toContainEqual(heroLeft);
    expect(choices).not.toContainEqual(heroRight);
    expect(names).not.toContain('Full Page');
    expect(names).not.toContain('Hero Top + Three');
    expect(names.some((n) => n.startsWith('Three Squares'))).toBe(false);
  });
  it('Megy\'s "next layout" goes to Hero Bottom and back — never to a portrait or square layout', () => {
    expect(nextLayoutInCycle(page, roll, '8x8')?.id).toBe(heroBottom.id);
    expect(nextLayoutInCycle(pageOn(heroBottom, landscapes.slice(0, 3)), roll, '8x8')?.id).toBe(heroTop.id);
  });
});

describe('the same for portraits and squares', () => {
  it('three portraits on Hero Left: Hero Right is the other choice, nothing landscape', () => {
    const page = pageOn(heroLeft, portraits.slice(0, 3));
    const choices = layoutChoicesForPage(page, roll, '8x8');
    expect(choices[0]?.id).toBe(heroLeft.id);
    expect(choices.filter((t) => photoSlotCount(t) === 3).map((t) => t.id)).toEqual([heroLeft.id, heroRight.id]);
    for (const t of choices) expect(badCrops(page, t)).toEqual([]);
  });
  it('three squares keep their square layouts', () => {
    const squares: UploadedPhoto[] = Array.from({ length: 3 }, (_, i) => ({ id: `s${i}`, previewUrl: '', name: `${i}.jpg`, type: 'image/jpeg', size: 1, width: 2000, height: 2000 }));
    const tl = getTemplateById('t88-fb-sq-box-tl-gap')!;
    const page = pageOn(tl, [0, 1, 2]);
    const choices = layoutChoicesForPage(page, squares, '8x8');
    expect(choices[0]?.id).toBe(tl.id);
    expect(choices.filter((t) => photoSlotCount(t) === 3).map((t) => t.name)).toEqual([
      'Three Squares, Box Top Left', 'Three Squares, Box Bottom Left', 'Three Squares, Box Bottom Right', 'Three Squares, Box Top Right',
    ]);
  });
  it('a page whose photo doesn\'t fit its own layout (a portrait put in a landscape frame) still shows that layout first', () => {
    const page = pageOn(heroTop, [landscapes[0], portraits[0], landscapes[1]]);
    const choices = layoutChoicesForPage(page, roll, '8x8');
    expect(choices[0]?.id).toBe(heroTop.id);
    for (const t of choices.slice(1)) expect(badCrops(page, t)).toEqual([]);
  });
});

describe('every page of the album the app generates from the walk\'s roll', () => {
  const album = generateAlbum(roll, '8x8');

  it('the album has the walk\'s page: three landscapes on a hero trio', () => {
    const trios = album.filter((p) => p.templateId === heroTop.id || p.templateId === heroBottom.id);
    expect(trios.length).toBeGreaterThan(0);
  });
  it('on every page the sheet starts with the page\'s layout, and offers only layouts that hold its photos well', () => {
    for (const [n, page] of album.entries()) {
      const choices = layoutChoicesForPage(page, roll, '8x8');
      expect(choices[0]?.id, `page ${n + 1}`).toBe(page.templateId);
      for (const t of choices.slice(1)) expect(badCrops(page, t), `page ${n + 1}`).toEqual([]);
    }
  });
  it('every hero-trio page has its sibling on the sheet', () => {
    for (const page of album.filter((p) => p.templateId === heroTop.id || p.templateId === heroBottom.id)) {
      const sibling = page.templateId === heroTop.id ? heroBottom.id : heroTop.id;
      expect(layoutChoicesForPage(page, roll, '8x8').map((t) => t.id)).toContain(sibling);
    }
  });
});

describe('every size, from a roll of every shape (phone, camera, square, wide)', () => {
  const shapes: [number, number][] = [[4032, 3024], [3024, 4032], [6000, 4000], [4000, 6000], [2000, 2000], [1920, 1080]];
  const mixed: UploadedPhoto[] = Array.from({ length: 120 }, (_, i) => ({
    id: `m${i}`, previewUrl: `https://example.test/m${i}.jpg`, name: `m${i}.jpg`, type: 'image/jpeg', size: 1,
    width: shapes[i % 6][0], height: shapes[i % 6][1], capturedAt: 1791100000000 + i * 60_000,
  }));
  for (const size of ['6x6', '8x8', '9x9', '6x4', '8x6', '6x8', '11.5x8', '8.5x11'] as AlbumSizePreset[]) {
    it(`${size}: every page's sheet starts with its own layout, and the rest hold its photos well`, () => {
      for (const [n, page] of generateAlbum(mixed, size).entries()) {
        const choices = layoutChoicesForPage(page, mixed, size);
        expect(choices[0]?.id, `page ${n + 1}`).toBe(page.templateId);
        for (const t of choices.slice(1)) expect(badCrops(page, t, mixed, size), `page ${n + 1}`).toEqual([]);
      }
    });
  }
});

/* ── the sheet itself ── */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement | undefined;
let root: Root | undefined;
afterEach(() => { if (root) act(() => root!.unmount()); host?.remove(); root = undefined; host = undefined; });

function openSheet(page: AlbumPage, photos: UploadedPhoto[], size: AlbumSizePreset, offered?: PageTemplate[]): Element[] {
  const actions = {
    layoutPickerOpen: true, currentPageIndex: 0, albumSize: size, albumPages: [page], uploadedPhotos: photos,
    availableTemplatesForCurrentPage: () => offered ?? layoutChoicesForPage(page, photos, size),
    layoutChangeLoses: () => ({ photos: 0, captions: 0 }), applyPageLayout: vi.fn(), setLayoutPickerOpen: vi.fn(),
  };
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  act(() => root!.render(createElement(LayoutPicker, { actions } as never)));
  return [...host.querySelectorAll('button[aria-pressed]')];
}
// A tile = the page drawn on that layout + its name underneath.
const label = (b: Element) => b.querySelector(':scope > span')?.textContent;

describe('the Change layout sheet', () => {
  it('the first tile is "✓ Current" (Hero Top), then Hero Bottom', () => {
    const tiles = openSheet(pageOn(heroTop, landscapes.slice(0, 3)), roll, '8x8');
    expect(tiles.map(label).slice(0, 2)).toEqual(['✓ Current', 'Hero Bottom']);
    expect(tiles[0].getAttribute('aria-pressed')).toBe('true');
    expect(tiles.filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
    expect(host!.textContent).not.toContain('No other layouts fit this page.');
  });
  it('a wide (16:9) shot on a 6×4 full page: nothing else holds it, and the sheet says so under "✓ Current"', () => {
    const wide: UploadedPhoto[] = [{ id: 'w', previewUrl: 'https://example.test/w.jpg', name: 'w.jpg', type: 'image/jpeg', size: 1, width: 1920, height: 1080 }];
    const solo = getTemplateById('t64-fb-solo')!;
    const page = pageOn(solo, [0], '6x4');
    expect(layoutChoicesForPage(page, wide, '6x4').map((t) => t.id)).toEqual([solo.id]);
    expect(openSheet(page, wide, '6x4').map(label)).toEqual(['✓ Current']);
    expect(host!.textContent).toContain('No other layouts fit this page.');
  });
  it('a page with a video memory: the sheet gives the memory note only, not a second "No other layouts" note', () => {
    // The builder offers a memory page only itself (availableTemplatesForCurrentPage).
    const badge = qrBadgeTemplate('8x8', 'tl')!;
    const qrFills: (QrFill | null)[] = badge.slots.map((s) => (s.kind === 'qr' ? {
      code: 'MEM12345', destination: 'https://example.test/clip.mp4', qrPngDataUrl: 'data:image/png;base64,AA',
      memoryUrl: 'https://megyprints.com/m/MEM12345', createdAt: 1791100000000, kind: 'clip',
    } : null));
    const page = { ...pageOn(badge, [0]), qrFills } as AlbumPage;
    expect(openSheet(page, roll, '8x8', [badge]).map(label)).toEqual(['✓ Current']);
    expect(host!.querySelector('[data-testid="layout-memory-note"]')).not.toBeNull();
    expect(host!.textContent).not.toContain('No other layouts fit this page.');
  });
});
