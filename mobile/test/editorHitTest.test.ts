/* ══════════════════════════════════════════════════════════════════════════
   A TAP ON A PAGE HITS THE ELEMENT THAT IS THERE (2.0 editor, Phase 4).

   The editor's tap areas (src/editor/hitTest.ts) are held to:
     • the page renderer's own boxes (src/render/pagePlan.ts planPage: what
       the app draws, held to the website's print pictures by the golden
       check): every photo, caption and caption-box photo on EVERY layout of
       EVERY album size, on a left page and a right page (the spine side);
     • the website's phone editor geometry: studioPhoneGeom slotRectPx (the
       frame on the phone page, shared) with slotShapeStyle's centred square
       for a circle, and textFit captionBoxSize (a caption box's size);
     • the website's z-order (PageView): a video memory's QR over the photo,
       a caption box over a free text over a frame, a sticker on top; and its
       precedence inside one frame (QR → graphic → words → photo → empty);
   and a tap lands where the screen shows it (toPagePoint), turned and
   stretched free texts and round frames included.
   ══════════════════════════════════════════════════════════════════════════ */
import type { AlbumPage, AlbumSizePreset, QrFill, TextElement } from '@web/pages/builder/types';
import { ALBUM_SIZES } from '@web/pages/builder/types';
import { PAGE_TEMPLATES, getTemplateById, getTemplatesForAlbum, qrBadgeTemplate } from '@web/pages/builder/pageTemplates';
import { slotRectPx } from '@web/pages/builder/studioPhoneGeom';
import { captionBoxSize } from '@web/pages/builder/textFit';
import { getCanvasDimensions } from '@web/pages/builder/layouts';
import { getPrintDimensions } from '@web/pages/builder/printSize';
import { TEXT_LINE_HEIGHT } from '@web/pages/builder/wordArtRules';
import { planPage } from '../src/render/pagePlan';
import { contains, corners, hitTest, pageTargets, toPagePoint, typedLines, type Target } from '../src/editor/hitTest';

const PHOTOS = 400;

/** Every layout a page of this size can have: the live ones, the retired ones
 *  saved albums keep (no sizes: drawn as authored), the video-memory badges. */
const layoutsFor = (size: AlbumSizePreset) => PAGE_TEMPLATES.filter((t) => t.albumSizes.length === 0 || t.albumSizes.includes(size));

function pageOn(templateId: string, size: AlbumSizePreset, extra: Partial<AlbumPage> = {}): AlbumPage {
  return {
    id: 'p', layout: 'collage', templateId, size,
    background: { type: 'solid', solid: '#FFFFFF', opacity: 100 },
    photos: [], textElements: [], ...extra,
  } as AlbumPage;
}

function words(id: string, extra: Partial<TextElement> = {}): TextElement {
  return {
    id, text: 'Our day at the beach', x: 0, y: 0, rotation: 0, opacity: 100,
    fontSize: 28, fontFamily: '"DM Sans", sans-serif', color: '#2D2D2D', bold: false, italic: false, underline: false, alignment: 'center',
    ...extra,
  } as TextElement;
}

const QR = { url: 'https://megyprints.app/m/test', qrPngDataUrl: 'data:image/png;base64,' } as unknown as QrFill;
const GRAPHIC = { id: 'g', pngDataUrl: 'data:image/png;base64,' } as never;

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
const sameRect = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  near(a.x, b.x) && near(a.y, b.y) && near(a.w, b.w) && near(a.h, b.h);

/** A point inside `t` that no target above it covers (null: hidden). */
function visiblePoint(targets: readonly Target[], t: Target): { x: number; y: number } | null {
  const steps = 9;
  for (let i = 1; i < steps; i++) {
    for (let j = 1; j < steps; j++) {
      const x = t.box.x + (t.box.w * i) / steps, y = t.box.y + (t.box.h * j) / steps;
      // Turned / stretched targets: test the point as drawn.
      const p = t.rotation || t.scaleX !== 1 || t.scaleY !== 1 ? asDrawn(t, x, y) : { x, y };
      if (hitTest(targets, p.x, p.y) === t) return p;
    }
  }
  return null;
}
function asDrawn(t: Target, x: number, y: number) {
  const ox = t.pivot === 'center' ? t.box.x + t.box.w / 2 : t.box.x;
  const oy = t.pivot === 'center' ? t.box.y + t.box.h / 2 : t.box.y;
  let dx = x - ox, dy = y - oy;
  if (t.pivot === 'topLeft') { dx *= t.scaleX; dy *= t.scaleY; }
  const r = (t.rotation * Math.PI) / 180;
  return { x: ox + dx * Math.cos(r) - dy * Math.sin(r), y: oy + dx * Math.sin(r) + dy * Math.cos(r) };
}

describe('every layout of every size: the tap areas are the boxes the renderer draws in, and the website\'s', () => {
  const sizes = ALBUM_SIZES.map((s) => s.preset);
  for (const size of sizes) {
    it(`${size}: photos, captions and caption-box photos, left and right pages`, () => {
      const templates = layoutsFor(size);
      expect(templates.length).toBeGreaterThanOrEqual(getTemplatesForAlbum(size).length);
      expect(templates.length).toBeGreaterThan(0);
      const { width: W, height: H } = getPrintDimensions(size);
      const ui = getCanvasDimensions(size);
      // A phone page, as MobileReview sizes it (any width: the geometry is proportional).
      const phoneW = 360, phoneH = (phoneW * H) / W;
      let photosChecked = 0, captionsChecked = 0, boxPhotosChecked = 0;
      for (const t of templates) {
        for (const pageIndex of [0, 1]) {
          // Every frame filled; caption boxes alternately words and a photo.
          const boxes = t.textSlots ?? [];
          const page = pageOn(t.id, size, {
            slotFills: t.slots.map((_s, i) => i),
            textElements: boxes.flatMap((_b, j) => (j % 2 === 0 ? [words(`box-${j}`, { boxIndex: j })] : [])),
            textSlotFills: boxes.map((_b, j) => (j % 2 === 1 ? 100 + j : null)),
          });
          const { targets, width, height } = pageTargets({ page, albumSize: size, pageIndex, photoCount: PHOTOS });
          expect([width, height]).toEqual([W, H]);
          const plan = planPage({ page, albumSize: size, pageIndex, photoCount: PHOTOS });

          for (const item of plan.items) {
            if (item.kind === 'photo') {
              const target = targets.find((x) => x.kind === 'photo' && x.index === item.slotIndex)!;
              expect(target).toBeDefined();
              // The renderer's frame box; a circle, heart or star in its centred square.
              const round = ['circle', 'heart', 'star'].includes(item.slot.shape ?? '');
              const side = Math.min(item.box.w, item.box.h);
              const expected = round ? { x: item.box.x + (item.box.w - side) / 2, y: item.box.y + (item.box.h - side) / 2, w: side, h: side } : item.box;
              expect(sameRect(target.box, expected)).toBe(true);
              expect(target.photoIndex).toBe(item.photoIndex);
              // The website's phone frame (slotRectPx), on a page shown phoneW wide.
              const web = slotRectPx(page, pageIndex, item.slotIndex, phoneW, phoneH, size)!;
              const k = phoneW / W;
              expect(item.box.x * k).toBeCloseTo(web.left, 6);
              expect(item.box.y * k).toBeCloseTo(web.top, 6);
              expect(item.box.w * k).toBeCloseTo(web.width, 6);
              expect(item.box.h * k).toBeCloseTo(web.height, 6);
              photosChecked++;
            } else if (item.kind === 'boxText' && item.source === 'caption') {
              const boxIndex = (item.style as TextElement).boxIndex!;
              const target = targets.find((x) => x.kind === 'boxText' && x.index === boxIndex)!;
              expect(sameRect(target.box, item.box)).toBe(true);
              expect(target.textId).toBe(`box-${boxIndex}`);
              // The website's caption box size (design px → print px).
              const web = captionBoxSize(page, boxIndex, size, pageIndex)!;
              expect(target.box.w).toBeCloseTo(web.w * (W / ui.width), 6);
              expect(target.box.h).toBeCloseTo(web.h * (H / ui.height), 6);
              captionsChecked++;
            } else if (item.kind === 'boxPhoto') {
              const target = targets.find((x) => x.kind === 'boxPhoto' && x.index === item.boxIndex)!;
              expect(sameRect(target.box, item.box)).toBe(true);
              expect(target.photoIndex).toBe(item.photoIndex);
              boxPhotosChecked++;
            }
          }
          // Nothing the renderer draws is missing from the tap areas, and back.
          expect(targets.filter((x) => x.kind === 'photo').length).toBe(plan.items.filter((i) => i.kind === 'photo').length);
          expect(targets.filter((x) => x.kind === 'boxText').length).toBe(plan.items.filter((i) => i.kind === 'boxText').length);
          // Each one can be tapped somewhere (none is wholly under another).
          for (const target of targets) expect(visiblePoint(targets, target)).not.toBeNull();
        }
      }
      expect(photosChecked).toBeGreaterThan(templates.length);
      // Logged so a run shows how much was held (sizes with no caption layouts show 0).
      console.log(`${size}: ${templates.length} layouts, ${photosChecked} photos, ${captionsChecked} captions, ${boxPhotosChecked} caption-box photos`);
    });
  }
});

describe('the website\'s precedence inside a frame and its z-order on the page', () => {
  const size: AlbumSizePreset = '8x8';
  // Three frames and a caption box; one frame and two caption boxes.
  const withBoxes = layoutsFor(size).find((t) => t.slots.length >= 3 && (t.textSlots?.length ?? 0) >= 1)!;
  const twoBoxes = layoutsFor(size).find((t) => (t.textSlots?.length ?? 0) >= 2)!;

  it('a frame holds one thing: QR, then a graphic, then words, then the photo, else it is empty', () => {
    expect(withBoxes).toBeDefined();
    const page = pageOn(withBoxes.id, size, {
      slotFills: [0, 1, 2],
      qrFills: [QR, null, null],
      ornamentFills: [GRAPHIC, GRAPHIC, null],
      slotTexts: [null, { text: 'Hi', fontSize: 24 } as never, { text: 'Hello', fontSize: 24 } as never],
    });
    const kinds = pageTargets({ page, albumSize: size, pageIndex: 1, photoCount: PHOTOS }).targets
      .filter((t) => t.key.startsWith('slot:')).sort((a, b) => a.index - b.index).map((t) => t.kind);
    expect(kinds.slice(0, 3)).toEqual(['slotQr', 'slotGraphic', 'slotText']);
    const empty = pageOn(withBoxes.id, size, { slotFills: [null, 9999, 5] });
    const k2 = pageTargets({ page: empty, albumSize: size, pageIndex: 1, photoCount: PHOTOS }).targets
      .filter((t) => t.key.startsWith('slot:')).sort((a, b) => a.index - b.index).map((t) => t.kind);
    // 9999 is past the album's photos: an empty frame, as PageView shows it.
    expect(k2.slice(0, 3)).toEqual(['emptySlot', 'emptySlot', 'photo']);
  });

  it('a caption box holds one thing: QR, graphic, words, photo, else empty; the words win over a photo left in the box', () => {
    expect(twoBoxes).toBeDefined();
    const page = pageOn(twoBoxes.id, size, {
      textSlotQr: [QR, null],
      textSlotOrnament: [GRAPHIC, GRAPHIC],
      textElements: [words('w1', { boxIndex: 1 })],
      textSlotFills: [null, 3],
    });
    const boxes = pageTargets({ page, albumSize: size, pageIndex: 1, photoCount: PHOTOS }).targets.filter((t) => t.key.startsWith('box:')).sort((a, b) => a.index - b.index);
    expect(boxes.map((b) => b.kind).slice(0, 2)).toEqual(['boxQr', 'boxGraphic']);
    const page2 = pageOn(twoBoxes.id, size, { textElements: [words('w1', { boxIndex: 0 })], textSlotFills: [4, 5] });
    const b2 = pageTargets({ page: page2, albumSize: size, pageIndex: 1, photoCount: PHOTOS }).targets.filter((t) => t.key.startsWith('box:')).sort((a, b) => a.index - b.index);
    expect(b2.map((b) => b.kind).slice(0, 2)).toEqual(['boxText', 'boxPhoto']);
    expect(b2[0].textId).toBe('w1');
  });

  it('on top: a sticker, then a caption box, then a free text, then a QR, then the frame', () => {
    const page = pageOn(withBoxes.id, size, { slotFills: [0, 1, 2], qrFills: [QR] });
    const { targets } = pageTargets({ page, albumSize: size, pageIndex: 1, photoCount: PHOTOS });
    const frame0 = targets.find((t) => t.key === 'slot:0')!;
    const box0 = targets.find((t) => t.key === 'box:0')!;
    // Stack everything on the centre of frame 0.
    const cx = frame0.box.x + frame0.box.w / 2, cy = frame0.box.y + frame0.box.h / 2;
    const { width: W, height: H } = getPrintDimensions(size);
    const ui = getCanvasDimensions(size);
    const s = W / ui.width;
    const free = words('free', { text: 'Title', x: cx / s - 40, y: cy / s - 10, width: 80 });
    const stacked = pageOn(withBoxes.id, size, {
      slotFills: [0, 1, 2], qrFills: [QR], textElements: [free],
      stickers: [{ uid: 'st1', id: 'k', pngDataUrl: '', geom: { cx: cx / W, cy: cy / H, w: 0.05, h: 0.05, rot: 0 } } as never],
    });
    const all = pageTargets({ page: stacked, albumSize: size, pageIndex: 1, photoCount: PHOTOS }).targets;
    expect(hitTest(all, cx, cy)?.kind).toBe('sticker');
    const noSticker = all.filter((t) => t.kind !== 'sticker');
    expect(hitTest(noSticker, cx, cy)?.kind).toBe('freeText');
    expect(hitTest(noSticker.filter((t) => t.kind !== 'freeText'), cx, cy)?.kind).toBe('slotQr');
    // A caption box over a free text where they overlap.
    const bx = box0.box.x + box0.box.w / 2, by = box0.box.y + box0.box.h / 2;
    const overBox = pageOn(withBoxes.id, size, { textElements: [words('free2', { text: 'Over', x: bx / s - 20, y: by / s - 5, width: 40 })] });
    expect(hitTest(pageTargets({ page: overBox, albumSize: size, pageIndex: 1, photoCount: PHOTOS }).targets, bx, by)?.kind).toBe('emptyBox');
    // The page itself, away from everything: nothing.
    expect(hitTest(targets, 1, 1)).toBeNull();
  });

  it('a video memory: the QR badge on a full-page photo is hit at the badge, the photo everywhere else', () => {
    const badge = qrBadgeTemplate(size, 'br')!;
    expect(badge).toBeDefined();
    const qrSlot = badge.slots.findIndex((s) => s.kind === 'qr');
    expect(qrSlot).toBeGreaterThanOrEqual(0);
    const photoSlot = 1 - qrSlot;
    const fills: (number | null)[] = [null, null];
    fills[photoSlot] = 0;
    const qrs: (QrFill | null)[] = [null, null];
    qrs[qrSlot] = QR;
    const page = pageOn(badge.id, size, { slotFills: fills, qrFills: qrs });
    const { targets } = pageTargets({ page, albumSize: size, pageIndex: 1, photoCount: PHOTOS });
    const qr = targets.find((t) => t.kind === 'slotQr')!;
    expect(hitTest(targets, qr.box.x + qr.box.w / 2, qr.box.y + qr.box.h / 2)?.kind).toBe('slotQr');
    const photo = targets.find((t) => t.kind === 'photo')!;
    expect(visiblePoint(targets, photo)).not.toBeNull();
  });
});

describe('shapes, turns and stretches', () => {
  const size: AlbumSizePreset = '8x8';
  const tpl = layoutsFor(size).find((t) => t.slots.length === 1 && !t.fullBleed)!;

  it("a layout's own round frame is a circle to the tap, as print clips it", () => {
    const round = layoutsFor(size).find((t) => t.slots.some((x) => x.shape === 'circle'))!;
    const i = round.slots.findIndex((x) => x.shape === 'circle');
    const page = pageOn(round.id, size, { slotFills: round.slots.map((_x, k) => k) });
    const t = pageTargets({ page, albumSize: size, pageIndex: 1, photoCount: PHOTOS }).targets.find((x) => x.key === `slot:${i}`)!;
    expect(t.kind).toBe('photo');
    expect(t.shape).toBe('ellipse');
  });

  it('a circle mask is hit inside the circle, not in the corner of its square', () => {
    const page = pageOn(tpl.id, size, { slotFills: [0], slotMasks: ['circle'] });
    const t = pageTargets({ page, albumSize: size, pageIndex: 1, photoCount: PHOTOS }).targets.find((x) => x.kind === 'photo')!;
    expect(t.shape).toBe('ellipse');
    expect(t.box.w).toBeCloseTo(t.box.h, 6);
    const { x, y, w } = t.box;
    expect(contains(t, x + w / 2, y + w / 2)).toBe(true);
    expect(contains(t, x + w * 0.05, y + w * 0.05)).toBe(false); // the square's corner
    expect(contains(t, x + w * 0.5, y + w * 0.02)).toBe(true); // the circle's top
  });

  it('a free text turned 30° and stretched is hit where it is drawn (about its top-left), as the renderer and PageView turn it', () => {
    const s = getPrintDimensions(size).width / getCanvasDimensions(size).width;
    const t0 = words('t', { text: 'Summer', x: 200, y: 200, width: 300, rotation: 30, scaleX: 1.5, scaleY: 1 });
    const page = pageOn(tpl.id, size, { textElements: [t0] });
    const t = pageTargets({ page, albumSize: size, pageIndex: 1, photoCount: PHOTOS }).targets.find((x) => x.kind === 'freeText')!;
    expect(t.box.x).toBeCloseTo(200 * s, 6);
    expect(t.box.w).toBeCloseTo(300 * s, 6);
    expect(t.box.h).toBeCloseTo(28 * s * 1.25, 6); // one line
    const c = corners(t);
    expect(c[0].x).toBeCloseTo(t.box.x, 6); // turned about the top-left
    // The far corner, turned and stretched, is inside; the unturned far corner is not.
    const far = c[2];
    const mid = { x: (c[0].x + far.x) / 2, y: (c[0].y + far.y) / 2 };
    expect(contains(t, mid.x, mid.y)).toBe(true);
    expect(contains(t, t.box.x + t.box.w * 0.98, t.box.y + 2)).toBe(false);
  });

  it('a free text is as many lines tall as the renderer wraps it', () => {
    const page = pageOn(tpl.id, size, { textElements: [words('t', { text: 'one\ntwo\nthree', x: 10, y: 10, width: 400 })] });
    const typed = pageTargets({ page, albumSize: size, pageIndex: 1, photoCount: PHOTOS }).targets.find((x) => x.kind === 'freeText')!;
    const four = pageTargets({ page, albumSize: size, pageIndex: 1, photoCount: PHOTOS, countLines: () => 4 }).targets.find((x) => x.kind === 'freeText')!;
    expect(typedLines({ text: 'one\ntwo\nthree', fontSize: 10 }, 100)).toBe(3);
    expect(four.box.h / typed.box.h).toBeCloseTo(4 / 3, 6);
  });

  it('a free text and words in a photo frame sit where the renderer draws them (planPage)', () => {
    const t0 = words('t1', { text: 'Summer', x: 120, y: 340, width: 260, rotation: -12, scaleX: 1.2, scaleY: 0.9 });
    const t1 = words('t2', { text: 'Two\nlines', x: 40, y: 60 });
    const page = pageOn(tpl.id, size, { textElements: [t0, t1], slotTexts: [{ text: 'In the frame', fontSize: 24 } as never] });
    const { targets } = pageTargets({ page, albumSize: size, pageIndex: 1, photoCount: PHOTOS });
    const plan = planPage({ page, albumSize: size, pageIndex: 1, photoCount: PHOTOS });
    for (const item of plan.items) {
      if (item.kind === 'freeText') {
        const t = targets.find((x) => x.textId === item.style.id)!;
        expect(t.kind).toBe('freeText');
        expect([t.box.x, t.box.y, t.box.w]).toEqual([item.x, item.y, item.boxWidth]);
        expect([t.rotation, t.scaleX, t.scaleY, t.pivot]).toEqual([item.rotation, item.scaleX, item.scaleY, 'topLeft']);
        // drawPage freeText: one line every fontSize × TEXT_LINE_HEIGHT.
        expect(t.box.h).toBeCloseTo(item.style.text.split('\n').length * item.fontSize * TEXT_LINE_HEIGHT, 6);
      } else if (item.kind === 'boxText' && item.source === 'slot') {
        const t = targets.find((x) => x.kind === 'slotText')!;
        expect(sameRect(t.box, item.box)).toBe(true);
      }
    }
    expect(plan.items.filter((i) => i.kind === 'freeText')).toHaveLength(2);
    expect(plan.items.some((i) => i.kind === 'boxText' && i.source === 'slot')).toBe(true);
  });

  it('a sticker turns about its centre', () => {
    const page = pageOn(tpl.id, size, { stickers: [{ uid: 's', id: 'k', pngDataUrl: '', geom: { cx: 0.5, cy: 0.5, w: 0.2, h: 0.05, rot: 90 } } as never] });
    const t = pageTargets({ page, albumSize: size, pageIndex: 1, photoCount: PHOTOS }).targets.find((x) => x.kind === 'sticker')!;
    const W = getPrintDimensions(size).width;
    expect(contains(t, W * 0.5, W * 0.58)).toBe(true); // turned: tall now
    expect(contains(t, W * 0.58, W * 0.5)).toBe(false);
  });
});

describe('the cover and the spine side', () => {
  const size: AlbumSizePreset = '8x8';

  it('on the cover an empty frame or box takes no tap, and a title moved by its offset is hit where it is drawn', () => {
    const tpl = layoutsFor(size).find((t) => (t.textSlots?.length ?? 0) >= 1 && t.slots.length >= 1 && !t.fullBleed)!;
    const title = words('title', { boxIndex: 0, offsetX: 0.1, offsetY: -0.05 });
    const page = pageOn(tpl.id, size, { textElements: [title] });
    const inside = pageTargets({ page, albumSize: size, pageIndex: 0, photoCount: PHOTOS });
    const cover = pageTargets({ page, albumSize: size, pageIndex: 0, photoCount: PHOTOS, coverMode: true });
    expect(inside.targets.some((t) => t.kind === 'emptySlot')).toBe(true);
    expect(cover.targets.some((t) => t.kind === 'emptySlot' || t.kind === 'emptyBox')).toBe(false);
    const plan = planPage({ page, albumSize: size, pageIndex: 0, photoCount: PHOTOS, coverMode: true });
    const drawn = plan.items.find((i) => i.kind === 'boxText')!;
    const hit = cover.targets.find((t) => t.kind === 'boxText')!;
    expect(sameRect(hit.box, (drawn as { box: typeof hit.box }).box)).toBe(true);
    // Moved: not where the box is on an inside page.
    const insideBox = inside.targets.find((t) => t.kind === 'boxText')!;
    expect(hit.box.x).not.toBeCloseTo(insideBox.box.x, 3);
  });

  it('page 1 is a right page and page 2 a left one: the spine keep-out moves the frames as the renderer moves them', () => {
    const tpl = layoutsFor(size).find((t) => !t.fullBleed && t.slots.length >= 2)!;
    const page = pageOn(tpl.id, size, { slotFills: tpl.slots.map((_s, i) => i) });
    const right = pageTargets({ page, albumSize: size, pageIndex: 0, photoCount: PHOTOS }).targets.filter((t) => t.kind === 'photo');
    const left = pageTargets({ page, albumSize: size, pageIndex: 1, photoCount: PHOTOS }).targets.filter((t) => t.kind === 'photo');
    expect(right[0].box.x).not.toBeCloseTo(left[0].box.x, 3);
    expect(getTemplateById(tpl.id)).toBeDefined();
  });
});

describe('a tap on the screen lands on the page where it is shown', () => {
  it('screen px → page px at the page\'s shown width', () => {
    expect(toPagePoint(180, 90, 360, 2400)).toEqual({ x: 1200, y: 600 });
    expect(toPagePoint(0, 0, 360, 2400)).toEqual({ x: 0, y: 0 });
  });

  it('the middle of each photo as shown on a 360 px wide page picks that photo', () => {
    const size: AlbumSizePreset = '6x8';
    const tpl = getTemplatesForAlbum(size).find((t) => t.slots.length >= 4)!;
    const page = pageOn(tpl.id, size, { slotFills: tpl.slots.map((_s, i) => i) });
    const { targets, width } = pageTargets({ page, albumSize: size, pageIndex: 3, photoCount: PHOTOS });
    const shown = 360, k = shown / width;
    for (const t of targets.filter((x) => x.kind === 'photo')) {
      const p = toPagePoint((t.box.x + t.box.w / 2) * k, (t.box.y + t.box.h / 2) * k, shown, width);
      expect(hitTest(targets, p.x, p.y)?.key).toBe(t.key);
    }
  });
});
