/* ══════════════════════════════════════════════════════════════════════════
   THE FACE FINDER IN THE APP'S ALBUM (appPlatform faces → ML Kit,
   lib/phonePhotoCheck.ts). The builder is the website's own; these tests
   hold that the app now hands it faces, and what the customer gets:
     • a portrait put in a square frame slides to the face (here near the
       top, so the frame shows the photo's top and the cut comes off the
       bottom), and stays centred when no face is found;
     • "Make my album" looks for faces as its own counted step ("Finding the
       faces. 3 of 24"), never a still screen;
     • a full square page takes a portrait only when its face survives the
       page's cut (the website's rule, which the app could not keep without
       faces).
   ML Kit itself is the phone's (jest has no native half): a made-up finder
   stands in for it, and the default one is checked to be the phone's.
   ══════════════════════════════════════════════════════════════════════════ */
import type { FaceFinder } from '@web/shared/platform';
import type { AlbumPage, UploadedPhoto } from '@web/pages/builder/types';
import { getTemplateById } from '@web/pages/builder/pageTemplates';
import { frameShape, isFullPagePhoto } from '@web/pages/builder/generateAlbum';
import { faceCentrePan, panRoom, slotDesignSize } from '@web/pages/builder/slotPhotoFit';
import { SCENARIOS } from '../../tools/parity/scenarios';
import { makeAlbum, stageLine } from '../src/builder/albumFlow';
import { createPhoneChecks } from '../src/lib/phonePhotoCheck';
import { act, builder, madeAlbum, readyToMake, settle, useEditorBench } from './editorHarness';

useEditorBench();

type Face = { x: number; y: number } | null;

/** A made-up face finder: `at` says where each photo's faces are. */
function finder(at: (url: string) => Face): FaceFinder & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    init: async () => {},
    detectFaceCenter: async (url) => { asked.push(url); return at(url); },
  };
}

/** A face finder that answers only when the test lets it (one at a time). */
function heldFinder(face: Face) {
  const waiting: (() => void)[] = [];
  let firstAsked!: () => void;
  const asked = new Promise<void>((r) => { firstAsked = r; });
  const faces: FaceFinder = {
    init: async () => {},
    detectFaceCenter: (url) => new Promise((resolve) => {
      firstAsked();
      waiting.push(() => resolve(url ? face : null));
    }),
  };
  return {
    faces,
    asked,
    answerOne: () => waiting.shift()?.(),
    answerAll: () => { while (waiting.length) waiting.shift()!(); },
    get waiting() { return waiting.length; },
  };
}

const SC = SCENARIOS[0]; // 40 photos, 8x8: a mix of shapes, a third of them portraits
const isPortrait = (p: UploadedPhoto) => p.height > p.width;

/** A square photo frame in the album (page, frame), not holding a portrait. */
function squareFrame(pages: AlbumPage[], photos: UploadedPhoto[]): { page: number; slot: number } {
  for (let page = 1; page < pages.length; page++) {
    const p = pages[page];
    const t = p.templateId ? getTemplateById(p.templateId) : undefined;
    if (!t) continue;
    for (let slot = 0; slot < t.slots.length; slot++) {
      const f = p.slotFills?.[slot];
      if (f == null || t.slots[slot].kind === 'qr') continue;
      if (Math.abs(frameShape(t, slot, '8x8') - 1) < 0.01 && !isPortrait(photos[f])) return { page, slot };
    }
  }
  throw new Error('No square frame in the album');
}

/** Puts a portrait in a square frame, the way "Replace photo" does. */
async function portraitIntoSquare() {
  const b = builder();
  const at = squareFrame(b.albumPages, b.uploadedPhotos);
  const portrait = b.uploadedPhotos.findIndex((p) => p.width === 3000 && p.height === 4000);
  expect(portrait).toBeGreaterThanOrEqual(0);
  await act(async () => { builder().goToPage(at.page); });
  await act(async () => { builder().fillSlot(at.slot, portrait); });
  await settle();
  const page = builder().albumPages[at.page];
  expect(page.slotFills?.[at.slot]).toBe(portrait);
  return { ...at, portrait, page };
}

describe('a portrait in a square frame', () => {
  it('slides to the face: a face near the top shows the top of the photo, the cut comes off the bottom', async () => {
    const faces = finder(() => ({ x: 0.5, y: 0.2 }));
    await madeAlbum(SC, { faces });
    const { page, slot, portrait } = await portraitIntoSquare();
    expect(faces.asked).toContain(builder().uploadedPhotos[portrait].previewUrl);

    const box = slotDesignSize(page, slot, '8x8', builder().currentPageIndex)!;
    const photo = { w: 3000, h: 4000 };
    const room = panRoom(photo, box, page.slotScales?.[slot]);
    // Width fills the frame (nothing to slide sideways); the extra height is the room.
    expect(room.x).toBe(0);
    expect(room.y).toBeGreaterThan(0);
    const want = faceCentrePan({ x: 0.5, y: 0.2 }, photo, box, page.slotScales?.[slot]);
    expect(page.slotOffsetsX?.[slot]).toBeCloseTo(0, 6);
    expect(page.slotOffsetsY?.[slot]).toBeCloseTo(want.y, 6);
    // The face (20% down) is above the middle the frame can reach, so the
    // photo goes all the way down: its top edge at the frame's top, no gap.
    expect(page.slotOffsetsY?.[slot]).toBeCloseTo(room.y, 6);
  });

  it('a face lower in the photo moves it up only as far as needed', async () => {
    await madeAlbum(SC, { faces: finder(() => ({ x: 0.5, y: 0.55 })) });
    const { page, slot } = await portraitIntoSquare();
    const box = slotDesignSize(page, slot, '8x8', builder().currentPageIndex)!;
    const room = panRoom({ w: 3000, h: 4000 }, box, page.slotScales?.[slot]);
    const y = page.slotOffsetsY?.[slot] ?? 0;
    expect(y).toBeLessThan(0); // up: the face is below the middle
    expect(y).toBeGreaterThan(-room.y); // not to the bottom edge
    expect(y).toBeCloseTo(faceCentrePan({ x: 0.5, y: 0.55 }, { w: 3000, h: 4000 }, box, page.slotScales?.[slot]).y, 6);
  });

  it('no face found: the photo stays centred, cut evenly top and bottom', async () => {
    await madeAlbum(SC, { faces: finder(() => null) });
    const { page, slot } = await portraitIntoSquare();
    expect(page.slotOffsetsX?.[slot] ?? 0).toBe(0);
    expect(page.slotOffsetsY?.[slot] ?? 0).toBe(0);
  });
});

describe('"Make my album" with the face finder', () => {
  it('looks for the faces as its own step, counting each photo', async () => {
    const held = heldFinder({ x: 0.5, y: 0.5 });
    await readyToMake(SC, { faces: held.faces });
    let made!: Promise<boolean>;
    await act(async () => { made = makeAlbum(builder()); await held.asked; });
    expect(builder().generating).toBe('faces');
    const first = stageLine('faces', builder().generatingCount);
    const total = Number(/^Finding the faces\. 0 of (\d+)$/.exec(first)?.[1]);
    expect(total).toBeGreaterThan(0);
    await act(async () => { held.answerOne(); await new Promise((r) => setTimeout(r, 0)); });
    expect(stageLine('faces', builder().generatingCount)).toBe(`Finding the faces. 1 of ${total}`);
    // The rest answer as they are asked.
    let ok = false;
    await act(async () => {
      const all = setInterval(() => held.answerAll(), 1);
      try { ok = await made; } finally { clearInterval(all); }
    });
    await settle();
    expect(ok).toBe(true);
    expect(builder().generatingCount).toBeNull();
  });

  const portraitFullPages = () => {
    const b = builder();
    return b.albumPages.filter((p) => isFullPagePhoto(p) && isPortrait(b.uploadedPhotos[(p.slotFills ?? []).find((f) => f != null)!])).length;
  };

  it('full square pages: more portraits whose faces the cut keeps, fewer whose faces it would cut', async () => {
    // An 8x8 page cuts 12.5% off the top and bottom of a 3:4 portrait. With
    // no faces known (the app before), the extra full pages take only photos
    // that fit; the last few memory pages take the least-cut others.
    await madeAlbum(SC, { faces: finder(() => null) });
    const unknown = portraitFullPages();
    await madeAlbum(SC, { faces: finder(() => ({ x: 0.5, y: 0.5 })) });
    const kept = portraitFullPages();
    await madeAlbum(SC, { faces: finder(() => ({ x: 0.5, y: 0.03 })) });
    const cut = portraitFullPages();
    expect(kept).toBeGreaterThan(unknown);
    expect(cut).toBeLessThanOrEqual(unknown);
  });
});

describe('the default face finder', () => {
  it('is the phone\'s ML Kit one (createPhoneChecks), not a stand-in', () => {
    jest.isolateModules(() => {
      const phoneFaces: FaceFinder = { init: async () => {}, detectFaceCenter: async () => ({ x: 0.1, y: 0.1 }) };
      const phoneCheck = { available: () => true };
      jest.doMock('../src/lib/phonePhotoCheck', () => ({ createPhoneChecks: () => ({ faces: phoneFaces, photoCheck: phoneCheck, remember: () => {} }) }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createAppPlatform } = require('../src/builder/appPlatform') as typeof import('../src/builder/appPlatform');
      const platform = createAppPlatform({
        deviceStore: { getItem: () => null, setItem: () => {}, removeItem: () => {} } as never,
        sessionStore: { getItem: () => null, setItem: () => {}, removeItem: () => {} } as never,
        inspect: async () => [], lifecycle: { onLeave: () => () => {}, onReturn: () => () => {} },
        measurer: () => null, client: {} as never, useUser: () => null,
      });
      expect(platform.faces).toBe(phoneFaces);
      // The photo check (blur, repeats, closed eyes) is the same checker's,
      // since 2.1.2: the faces it finds are found once for both. It is not
      // wanted until the Photos step or "Making your album" opens: opening
      // the app on an album made before starts no check behind the start
      // screen (on the emulator it held a processor core and 460 MB for
      // minutes, 2026-11-17).
      expect(platform.photoCheck.available()).toBe(false);
      platform.wantPhotoCheck();
      expect(platform.photoCheck.available()).toBe(true);
    });
  });

  it('with no ML Kit (jest, an old APK) it finds no face and never throws', async () => {
    const { faces } = createPhoneChecks();
    await expect(faces.init()).resolves.toBeUndefined();
    await expect(faces.detectFaceCenter('content://media/external/images/media/1')).resolves.toBeNull();
  });
});
