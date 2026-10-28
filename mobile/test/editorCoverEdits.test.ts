/* ══════════════════════════════════════════════════════════════════════════
   PART 3: WHAT THE COVER EDITOR DOES TO THE COVER, on the real shared builder
   (the website's useBuilderState on the app's platform, an album made through
   the app's steps: test/editorHarness.ts). This file belongs to the cover part.

     • every control makes CoverEditor.tsx's call with CoverEditor's arguments
       (a recording builder), and on the real builder changes the cover and
       nothing else (the pages stay as they were), except "Use <colour> on
       every page", which is meant to;
     • with the builder's cover scope off, a control does nothing at all, so a
       cover change can never land on a page;
     • the cover is not in the undo history: Undo after cover changes leaves
       the cover as it is;
     • the album's name is the cover title until the customer types their own;
     • the warnings: a blank cover, a title too long ("Make it fit"), a title
       colour that wouldn't show on the cover's colour;
     • where the title is and how far it moves: the website's box, the same
       box the hit test and the renderer use, kept on the cover;
     • the small pieces: what a finger on the cover drags, the slider's
       steps, the photos shown before "Show all".
   ══════════════════════════════════════════════════════════════════════════ */
import type { AlbumPage } from '@web/pages/builder/types';
import { getPrintDimensions } from '@web/pages/builder/printSize';
import { PAGE_COLORS } from '@web/pages/builder/pageColors';
import { SCENARIOS } from '../../tools/parity/scenarios';
import { nameAlbum } from '../src/builder/albumFlow';
import { pageTargets } from '../src/editor/hitTest';
import { planPage } from '../src/render';
import { coverBlank, titleFontInApp, titleInkNeeded, titleTooLong } from '../src/editor/cover/coverChecks';
import {
  canRemoveCoverPhoto, colourEveryPage, colourTheCover, COVER_PAPER, coverCrop, coverHasPhoto, coverTitleOf, fitTitle,
  moveCoverTitle, panCoverPhoto, putPhotoOnCover, removeCoverPhoto, resetCoverCrop, setTitleAlignment, setTitleColour,
  setTitleFont, setTitleSize, shownCoverPhotos, titleBoxOf, titleRectOf, toggleTitleBold, toggleTitleItalic,
  toggleTitleShadow, typeTitle, zoomCoverPhoto, type CoverBuilder,
} from '../src/editor/cover/coverEdits';
import { dragTarget } from '../src/editor/cover/CoverStage';
import { snap } from '../src/editor/cover/Slider';
import { act, builder, madeAlbum, useEditorBench } from './editorHarness';

useEditorBench();

const sc = SCENARIOS[0];
const PLAYFAIR = '"Playfair Display", Georgia, serif';

/** A builder that only writes down what it is asked to do. */
function recording(cover: AlbumPage, scope: 'coverFront' | 'interior' = 'coverFront') {
  const calls: unknown[][] = [];
  const rec = (name: string) => (...args: unknown[]) => { calls.push([name, ...args]); };
  const b = {
    editScope: scope, coverFront: cover,
    setBoxText: rec('setBoxText'), setBoxTextOffset: rec('setBoxTextOffset'), setPageBackground: rec('setPageBackground'),
    setPageColor: rec('setPageColor'), applyPageColorToAllPages: rec('applyPageColorToAllPages'), setBackgroundCrop: rec('setBackgroundCrop'),
  } as unknown as CoverBuilder;
  return { b, calls };
}

const coverOn = async () => { await act(async () => { builder().setEditScope('coverFront'); }); };
const json = (v: unknown) => JSON.stringify(v);
const titleEl = (c: AlbumPage) => c.textElements.find((t) => t.boxIndex === 0);

describe("each control makes CoverEditor's call, with CoverEditor's arguments", () => {
  it('photo, colour, crop, Remove photo, title controls, title drag', async () => {
    await madeAlbum(sc);
    const real = builder().coverFront;
    const photo = builder().uploadedPhotos[3];
    const t = coverTitleOf(real);
    const box = titleBoxOf(real)!;

    const { b, calls } = recording(real);
    putPhotoOnCover(b, photo);
    colourTheCover(b, '#1F75FE');
    colourEveryPage(b, '#1F75FE');
    panCoverPhoto(b, { focusX: 0.5, focusY: 0.5 }, 0.2, -0.7);
    zoomCoverPhoto(b, 1.7);
    resetCoverCrop(b);
    typeTitle(b, 'Our Wedding Day');
    setTitleFont(b, PLAYFAIR);
    setTitleColour(b, '#C9A24B');
    setTitleAlignment(b, 'left');
    toggleTitleBold(b);
    toggleTitleItalic(b);
    toggleTitleShadow(b);
    setTitleSize(b, 44.4);
    fitTitle(b, 21);
    moveCoverTitle(b, { offsetX: 0, offsetY: 0 }, 0.05, -2);

    expect(calls).toEqual([
      ['setPageBackground', { type: 'image', image: photo.previewUrl, photoId: photo.id, opacity: real.background.opacity ?? 100 }],
      ['setPageColor', '#1F75FE'],
      ['applyPageColorToAllPages', '#1F75FE'],
      ['setBackgroundCrop', { focusX: 0.3, focusY: 1 }], // drag right/up: focus left, clamped to the edge
      ['setBackgroundCrop', { zoom: 1.7 }],
      ['setBackgroundCrop', { focusX: 0.5, focusY: 0.5, zoom: 1 }],
      ['setBoxText', 0, { text: 'Our Wedding Day' }],
      ['setBoxText', 0, { text: t.text, fontFamily: PLAYFAIR }],
      ['setBoxText', 0, { text: t.text, color: '#C9A24B' }],
      ['setBoxText', 0, { text: t.text, alignment: 'left' }],
      ['setBoxText', 0, { text: t.text, bold: !t.bold }],
      ['setBoxText', 0, { text: t.text, italic: !t.italic }],
      ['setBoxText', 0, { text: t.text, shadow: false }], // on → off is false
      ['setBoxText', 0, { text: t.text, fontSize: 44 }], // whole px
      ['setBoxText', 0, { text: t.text, fontSize: 21 }],
      ['setBoxTextOffset', 0, 0.05, -box.baseY], // dragged far up: stops at the top edge
    ]);
    expect(real.background.type).toBe('image'); // the cover step put a photo on

    // Shadow off → on is "no setting" (every cover floats until switched off).
    const off = { ...real, textElements: real.textElements.map((x) => (x.boxIndex === 0 ? { ...x, shadow: false } : x)) };
    const r2 = recording(off);
    toggleTitleShadow(r2.b);
    expect(r2.calls).toEqual([['setBoxText', 0, { text: t.text, shadow: undefined }]]);
    expect(Object.prototype.hasOwnProperty.call(r2.calls[0][2], 'shadow')).toBe(true);
  });

  it('the size and zoom stay in the website\'s ranges; Remove photo only for a photo that is not one of the album\'s', async () => {
    await madeAlbum(sc);
    const real = builder().coverFront;
    const { b, calls } = recording(real);
    setTitleSize(b, 4);
    setTitleSize(b, 300);
    zoomCoverPhoto(b, 0.2);
    zoomCoverPhoto(b, 9);
    expect(calls.map((c) => c[2] ?? c[1])).toEqual([
      { text: coverTitleOf(real).text, fontSize: 16 }, { text: coverTitleOf(real).text, fontSize: 96 }, { zoom: 1 }, { zoom: 3 },
    ]);

    // An album photo on the cover: no Remove photo (another photo or a colour changes it).
    expect(canRemoveCoverPhoto(real)).toBe(false);
    expect(removeCoverPhoto(b)).toBe(false);
    // A cover photo of its own (picked from the phone on the website): Remove photo.
    const own = { ...real, background: { type: 'image' as const, image: 'content://media/9', localPhotoId: 'cover-x' } };
    const r = recording(own);
    expect(canRemoveCoverPhoto(own)).toBe(true);
    expect(removeCoverPhoto(r.b)).toBe(true);
    expect(r.calls).toEqual([['setPageBackground', { type: 'solid', solid: COVER_PAPER }]]);
    // A colour cover: no crop to move.
    const plain = { ...real, background: { type: 'solid' as const, solid: '#EE204D' } };
    const p = recording(plain);
    expect([panCoverPhoto(p.b, coverCrop(plain), 0.1, 0.1), zoomCoverPhoto(p.b, 2), resetCoverCrop(p.b)]).toEqual([false, false, false]);
    expect(p.calls).toEqual([]);
  });

  it('with the builder\'s cover scope off, no control calls anything (a cover change never lands on a page)', async () => {
    await madeAlbum(sc);
    const { b, calls } = recording(builder().coverFront, 'interior');
    const results = [
      putPhotoOnCover(b, builder().uploadedPhotos[0]), colourTheCover(b, '#232323'), colourEveryPage(b, '#232323'),
      panCoverPhoto(b, { focusX: 0.5, focusY: 0.5 }, 0.1, 0.1), zoomCoverPhoto(b, 2), resetCoverCrop(b), removeCoverPhoto(b),
      typeTitle(b, 'x'), setTitleFont(b, PLAYFAIR), setTitleColour(b, '#FFFFFF'), setTitleAlignment(b, 'right'),
      toggleTitleBold(b), toggleTitleItalic(b), toggleTitleShadow(b), setTitleSize(b, 40), fitTitle(b, 20),
      moveCoverTitle(b, { offsetX: 0, offsetY: 0 }, 0.1, 0.1),
    ];
    expect(results.every((r) => r === false)).toBe(true);
    expect(calls).toEqual([]);
  });
});

describe('on the real builder: the cover changes, the pages do not', () => {
  it('a photo, the crop, a colour and every title control change only the cover', async () => {
    await madeAlbum(sc);
    await coverOn();
    const pages = json(builder().albumPages);
    const other = builder().uploadedPhotos.find((p) => p.id !== (builder().coverFront.background as { photoId?: string }).photoId)!;

    await act(async () => { putPhotoOnCover(builder(), other); });
    expect(builder().coverFront.background).toMatchObject({ type: 'image', photoId: other.id });
    await act(async () => { panCoverPhoto(builder(), coverCrop(builder().coverFront), -0.25, 0.1); });
    await act(async () => { zoomCoverPhoto(builder(), 2.25); });
    expect(coverCrop(builder().coverFront)).toEqual({ focusX: 0.75, focusY: 0.4, zoom: 2.25 });
    expect(builder().coverFront.background).toMatchObject({ type: 'image', photoId: other.id }); // the crop keeps the photo
    await act(async () => { resetCoverCrop(builder()); });
    expect(coverCrop(builder().coverFront)).toEqual({ focusX: 0.5, focusY: 0.5, zoom: 1 });

    await act(async () => { typeTitle(builder(), 'Maria & Jose'); });
    await act(async () => { setTitleFont(builder(), PLAYFAIR); });
    await act(async () => { setTitleColour(builder(), '#C9A24B'); });
    await act(async () => { setTitleAlignment(builder(), 'right'); });
    await act(async () => { toggleTitleItalic(builder()); });
    await act(async () => { toggleTitleShadow(builder()); });
    await act(async () => { setTitleSize(builder(), 48); });
    const t = coverTitleOf(builder().coverFront);
    expect(t).toMatchObject({ text: 'Maria & Jose', fontFamily: PLAYFAIR, color: '#C9A24B', alignment: 'right', italic: true, shadow: false, fontSize: 48 });
    await act(async () => { toggleTitleShadow(builder()); });
    expect(coverTitleOf(builder().coverFront).shadow).toBe(true);
    expect(titleEl(builder().coverFront)!.shadow).toBeUndefined();

    await act(async () => { moveCoverTitle(builder(), { offsetX: 0, offsetY: 0 }, 0, -0.3); });
    expect(coverTitleOf(builder().coverFront).offsetY).toBeCloseTo(-0.3, 10);

    // A colour cover (the website's recolorPage): a title colour that shows on
    // it stays (gold on black); one that wouldn't (charcoal on black)
    // switches to an ink that does.
    await act(async () => { colourTheCover(builder(), '#232323'); });
    expect(builder().coverFront.background).toEqual({ type: 'solid', solid: '#232323' });
    expect(coverTitleOf(builder().coverFront).color).toBe('#C9A24B');
    await act(async () => { setTitleColour(builder(), '#2D2D2D'); });
    await act(async () => { colourTheCover(builder(), '#FFFFFF'); });
    await act(async () => { colourTheCover(builder(), '#232323'); });
    expect(coverTitleOf(builder().coverFront).color).toBe('#FFFFFF');

    expect(json(builder().albumPages)).toBe(pages);
  });

  it('"Use <colour> on every page" colours the cover and every page', async () => {
    await madeAlbum(sc);
    await coverOn();
    await act(async () => { colourEveryPage(builder(), PAGE_COLORS[5].hex); });
    expect(builder().coverFront.background).toEqual({ type: 'solid', solid: PAGE_COLORS[5].hex });
    expect(builder().albumPages.every((p) => p.background?.type === 'solid' && p.background.solid === PAGE_COLORS[5].hex)).toBe(true);
  });

  it('the cover is not in the undo history: Undo after cover changes leaves the cover as it is', async () => {
    await madeAlbum(sc);
    await coverOn();
    const pages = json(builder().albumPages);
    await act(async () => { typeTitle(builder(), 'Kept'); });
    await act(async () => { colourTheCover(builder(), '#1CAC78'); });
    const cover = json(builder().coverFront);
    while (builder().canUndo) {
      await act(async () => { builder().undo(); });
      expect(json(builder().coverFront)).toBe(cover);
      if (json(builder().albumPages) !== pages) break; // reached a page step from before
    }
    expect(json(builder().coverFront)).toBe(cover);
  });
});

describe("the album's name on the cover", () => {
  it('is the cover title until the customer types their own; a rename then leaves it', async () => {
    const platform = await madeAlbum(sc);
    expect(titleEl(builder().coverFront)).toMatchObject({ text: sc.title, fromAlbumName: true });
    await act(async () => { nameAlbum(builder(), platform.deviceStore, 'Maria and Jose', sc.occasion); });
    expect(coverTitleOf(builder().coverFront).text).toBe('Maria and Jose');
    await coverOn();
    await act(async () => { typeTitle(builder(), 'Forever Us'); });
    expect(titleEl(builder().coverFront)!.fromAlbumName).toBeUndefined();
    await act(async () => { builder().setEditScope('interior'); });
    await act(async () => { nameAlbum(builder(), platform.deviceStore, 'Another Name', sc.occasion); });
    expect(coverTitleOf(builder().coverFront).text).toBe('Forever Us');
  });
});

describe('the warnings', () => {
  it('a blank cover: no photo and no title', async () => {
    await madeAlbum(sc);
    await coverOn();
    expect(coverBlank(builder().coverFront)).toBe(false);
    await act(async () => { typeTitle(builder(), '   '); }); // empty words clear the title
    expect(titleEl(builder().coverFront)).toBeUndefined();
    expect(coverBlank(builder().coverFront)).toBe(false); // the photo is still on
    await act(async () => { colourTheCover(builder(), '#FFFFFF'); });
    expect(coverBlank(builder().coverFront)).toBe(true);
    await act(async () => { putPhotoOnCover(builder(), builder().uploadedPhotos[0]); });
    expect(coverBlank(builder().coverFront)).toBe(false);
  });

  it('a title colour that wouldn\'t show on the cover\'s colour, and the ink that does', async () => {
    await madeAlbum(sc);
    await coverOn();
    expect(titleInkNeeded(builder().coverFront)).toBeNull(); // a photo cover is not judged
    await act(async () => { colourTheCover(builder(), '#FCE883'); }); // yellow
    expect(titleInkNeeded(builder().coverFront)).toBeNull();
    await act(async () => { setTitleColour(builder(), '#FFFFFF'); }); // white on yellow
    expect(titleInkNeeded(builder().coverFront)).toBe('#2D2D2D');
    await act(async () => { setTitleColour(builder(), titleInkNeeded(builder().coverFront)!); });
    expect(titleInkNeeded(builder().coverFront)).toBeNull();
  });

  it('a title too long for its box, measured only in a font the app has; "Make it fit" makes it fit', async () => {
    await madeAlbum(sc);
    await coverOn();
    /** Every letter 0.6 of the font size wide (sharedBuilder.test.ts). */
    const measurer = { font: '', measureText(text: string) { return { width: text.length * 0.6 * Number(/(\d+(\.\d+)?)px/.exec(this.font)?.[1] ?? 16) }; } };
    const long = 'Our Big Beautiful Family Reunion At Lola And Lolo House In Batangas Summer Two Thousand Twenty Six';
    await act(async () => { typeTitle(builder(), long); });
    await act(async () => { setTitleSize(builder(), 96); });
    // The default title font (Cinzel) is not in the app: no guess.
    expect(titleFontInApp(builder().coverFront)).toBe(false);
    expect(titleTooLong(builder().coverFront, builder().albumSize, measurer)).toBeNull();
    await act(async () => { setTitleFont(builder(), PLAYFAIR); });
    const tooLong = titleTooLong(builder().coverFront, builder().albumSize, measurer);
    expect(tooLong?.fitsAt).toBeGreaterThanOrEqual(8);
    await act(async () => { fitTitle(builder(), tooLong!.fitsAt!); });
    expect(coverTitleOf(builder().coverFront).fontSize).toBe(tooLong!.fitsAt);
    expect(titleTooLong(builder().coverFront, builder().albumSize, measurer)).toBeNull();
    // Without the fonts loaded nothing is said.
    expect(titleTooLong(builder().coverFront, builder().albumSize, null)).toBeNull();
  });
});

describe('where the title is, and how far it moves', () => {
  const sizes = ['6x6', '8x8', '6x4', '8x6', '6x8', '11.5x8', '8.5x11'] as const;

  it('the website\'s box is the box the hit test and the renderer use, offset included, on every size and both cover layouts', async () => {
    await madeAlbum(sc);
    const base = builder().coverFront;
    for (const templateId of ['cover-hero', 'cover-plain']) {
      for (const offset of [{ x: 0, y: 0 }, { x: 0.07, y: -0.41 }]) {
        const cover: AlbumPage = {
          ...base, templateId,
          textElements: base.textElements.map((t) => (t.boxIndex === 0 ? { ...t, offsetX: offset.x, offsetY: offset.y } : t)),
        };
        const rect = titleRectOf(cover)!;
        for (const albumSize of sizes) {
          const { width: W, height: H } = getPrintDimensions(albumSize);
          const hit = pageTargets({ page: cover, albumSize, pageIndex: 0, photoCount: builder().uploadedPhotos.length, coverMode: true }).targets.find((t) => t.key === 'box:0')!;
          expect(hit.kind).toBe('boxText');
          expect(hit.box.x / W).toBeCloseTo(rect.x, 6);
          expect(hit.box.y / H).toBeCloseTo(rect.y, 6);
          expect(hit.box.w / W).toBeCloseTo(rect.w, 6);
          expect(hit.box.h / H).toBeCloseTo(rect.h, 6);
          // The renderer draws the title there (the cover's only caption).
          const plan = planPage({ page: cover, albumSize, pageIndex: 0, photoCount: builder().uploadedPhotos.length, coverMode: true, photoIds: builder().uploadedPhotos.map((p) => p.id) });
          const drawn = plan.items.filter((i) => i.kind === 'boxText' && i.source === 'caption');
          expect(drawn).toHaveLength(1);
          const d = drawn[0] as { box: { x: number; y: number; w: number; h: number } };
          expect(d.box.x / W).toBeCloseTo(rect.x, 6);
          expect(d.box.y / H).toBeCloseTo(rect.y, 6);
          expect(d.box.w / W).toBeCloseTo(rect.w, 6);
          expect(d.box.h / H).toBeCloseTo(rect.h, 6);
        }
      }
    }
  });

  it('the title goes to every edge of the cover and never off it', async () => {
    await madeAlbum(sc);
    await coverOn();
    const box = titleBoxOf(builder().coverFront)!;
    const from = { offsetX: 0, offsetY: 0 };
    for (const [dx, dy, edge] of [[-5, 0, 'left'], [5, 0, 'right'], [0, -5, 'top'], [0, 5, 'bottom']] as const) {
      await act(async () => { moveCoverTitle(builder(), from, dx, dy); });
      const r = titleRectOf(builder().coverFront)!;
      if (edge === 'left') expect(r.x).toBeCloseTo(0, 10);
      if (edge === 'right') expect(r.x + r.w).toBeCloseTo(1, 10);
      if (edge === 'top') expect(r.y).toBeCloseTo(0, 10);
      if (edge === 'bottom') expect(r.y + r.h).toBeCloseTo(1, 10);
    }
    expect(box.clampX(0.01)).toBe(0.01);
    // No words, nothing to move.
    await act(async () => { typeTitle(builder(), ''); });
    const { b, calls } = recording(builder().coverFront);
    expect(moveCoverTitle(b, from, 0.1, 0.1)).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe('the small pieces', () => {
  it('a finger on the cover drags the title inside its box, else the photo (when there is one)', () => {
    const title = { x: 0.08, y: 0.62, w: 0.84, h: 0.22 };
    expect(dragTarget(0.5, 0.7, title, true)).toBe('title');
    expect(dragTarget(0.5, 0.3, title, true)).toBe('photo');
    expect(dragTarget(0.5, 0.3, title, false)).toBeNull();
    expect(dragTarget(0.5, 0.7, null, true)).toBe('photo');
  });

  it('the slider keeps to its steps and range', () => {
    expect(snap(1.234, 1, 3, 0.01)).toBe(1.23);
    expect(snap(0.4, 1, 3, 0.01)).toBe(1);
    expect(snap(3.7, 1, 3, 0.01)).toBe(3);
    expect(snap(44.6, 16, 96, 1)).toBe(45);
  });

  it('the photos shown before "Show all": the best few, the one on the cover always among them', () => {
    const photos = Array.from({ length: 14 }, (_v, i) => ({ id: `p${i}` }));
    expect(shownCoverPhotos(photos, false, 'p2', 10).map((p) => p.id)).toEqual(photos.slice(0, 10).map((p) => p.id));
    expect(shownCoverPhotos(photos, false, 'p12', 10).map((p) => p.id)).toEqual(['p12', ...photos.slice(0, 9).map((p) => p.id)]);
    expect(shownCoverPhotos(photos, true, 'p12', 10)).toHaveLength(14);
    expect(shownCoverPhotos(photos.slice(0, 8), false, null, 10)).toHaveLength(8);
  });

  it('a photo is on the cover after the app\'s steps (the cover step\'s tap)', async () => {
    await madeAlbum(sc);
    expect(coverHasPhoto(builder().coverFront)).toBe(true);
  });
});
