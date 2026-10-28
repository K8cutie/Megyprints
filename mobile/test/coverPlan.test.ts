/* ══════════════════════════════════════════════════════════════════════════
   THE FRONT COVER'S PLAN (render/pagePlan.ts, coverMode).

   The cover is planned with print's cover rules (printPipeline
   renderPageLayers(coverFront, …, coverMode true)). No golden page holds the
   cover's PICTURE to the website's yet: the website's golden hook
   (printPipeline renderPageCanvasForPrint) has no cover switch, and adding
   one is a website change (it would inherit the HOLD). What this checks is
   that the plan uses the website's own numbers for the cover:
     • the title's box is the box the website's textFit measures the cover
       title in (captionBoxSize coverMode: no binding keep-out), in print px,
       moved by the title's offset;
     • the photo is cover-fitted at the focal point and zoom (bgCoverFit);
     • the words carry the cover's float shadow (onCover);
     • and without coverMode the same page plans differently (the switch
       matters), so an interior page is never drawn as a cover.
   ══════════════════════════════════════════════════════════════════════════ */
import type { AlbumPage } from '@web/pages/builder/types';
import { bgCoverFit } from '@web/pages/builder/types';
import { DEFAULT_COVER_TEMPLATE_ID } from '@web/pages/builder/pageTemplates';
import { withNameTitle } from '@web/pages/builder/useBuilderState';
import { captionBoxSize } from '@web/pages/builder/textFit';
import { getCanvasDimensions } from '@web/pages/builder/layouts';
import { getPrintDimensions } from '@web/pages/builder/printSize';
import { backgroundPhotoRect, planPage, type BoxTextItem } from '../src/render/pagePlan';

const cover = (over: Partial<AlbumPage['background']> = {}, offset = { x: 0, y: 0 }): AlbumPage => {
  const blank: AlbumPage = {
    id: 'cover', layout: 'freeform', templateId: DEFAULT_COVER_TEMPLATE_ID, size: '8x8', slotFills: [],
    background: { type: 'image', image: 'content://media/external/images/media/9', photoId: 'p2', opacity: 100, ...over } as AlbumPage['background'],
    photos: [], textElements: [],
  };
  const named = withNameTitle(blank, "Maria's Wedding");
  return { ...named, textElements: named.textElements.map((t) => ({ ...t, offsetX: offset.x, offsetY: offset.y })) };
};
const ids = ['p0', 'p1', 'p2', 'p3'];

describe('the front cover, planned the way print draws it', () => {
  it('the title sits in the box textFit measures the cover title in, with no binding keep-out, moved by its offset', () => {
    for (const size of ['8x8', '6x4', '8x6', '6x8', '6x6'] as const) {
      const page = { ...cover({}, { x: 0.02, y: -0.05 }), size };
      const plan = planPage({ page, albumSize: size, pageIndex: 0, photoCount: 4, coverMode: true, photoIds: ids });
      const title = plan.items.find((i): i is BoxTextItem => i.kind === 'boxText')!;
      const design = captionBoxSize(page, 0, size, 0, { coverMode: true })!;
      const k = getPrintDimensions(size).width / getCanvasDimensions(size).width;
      expect(title.box.w).toBeCloseTo(design.w * k, 6);
      expect(title.box.h).toBeCloseTo(design.h * (getPrintDimensions(size).height / getCanvasDimensions(size).height), 6);
      expect(title.onCover).toBe(true);
      const flat = planPage({ page: { ...page, textElements: page.textElements.map((t) => ({ ...t, offsetX: 0, offsetY: 0 })) }, albumSize: size, pageIndex: 0, photoCount: 4, coverMode: true, photoIds: ids });
      const still = flat.items.find((i): i is BoxTextItem => i.kind === 'boxText')!;
      expect(title.box.x - still.box.x).toBeCloseTo(0.02 * plan.width, 6);
      expect(title.box.y - still.box.y).toBeCloseTo(-0.05 * plan.height, 6);
    }
  });

  it('the photo is the album photo the cover names, cover-fitted at its focal point and zoom', () => {
    const plan = planPage({ page: cover({ focusX: 0.2, focusY: 0.9, zoom: 1.4 }), albumSize: '8x8', pageIndex: 0, photoCount: 4, coverMode: true, photoIds: ids });
    expect(plan.backgroundPhoto).toMatchObject({ photoIndex: 2, cover: true, zoom: 1.4, focusX: 0.2, focusY: 0.9 });
    const r = backgroundPhotoRect(plan.backgroundPhoto!, 1600, 1067);
    const want = bgCoverFit(1600, 1067, plan.width, plan.height, 1.4, 0.2, 0.9);
    expect(r).toEqual({ x: want.x, y: want.y, w: want.width, h: want.height });
    expect(plan.notDrawn.filter((n) => !/font/i.test(n))).toEqual([]);
  });

  it("a picture that is not one of the album's photos is listed, never faked", () => {
    const plan = planPage({ page: cover({ photoId: 'elsewhere' }), albumSize: '8x8', pageIndex: 0, photoCount: 4, coverMode: true, photoIds: ids });
    expect(plan.backgroundPhoto).toBeNull();
    expect(plan.notDrawn).toContain('picture background');
  });

  it('the cover switch matters: inside the book the same page keeps the binding keep-out and no float shadow', () => {
    const page = cover();
    const asCover = planPage({ page, albumSize: '8x8', pageIndex: 0, photoCount: 4, coverMode: true, photoIds: ids });
    const inside = planPage({ page, albumSize: '8x8', pageIndex: 0, photoCount: 4, photoIds: ids });
    const a = asCover.items.find((i): i is BoxTextItem => i.kind === 'boxText')!;
    const b = inside.items.find((i): i is BoxTextItem => i.kind === 'boxText')!;
    expect(a.box).not.toEqual(b.box);
    expect(b.onCover).toBe(false);
    expect(inside.backgroundPhoto?.cover).toBe(false);
  });
});
