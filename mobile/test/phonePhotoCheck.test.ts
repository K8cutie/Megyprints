/* The phone's photo check and face centring (src/lib/phonePhotoCheck.ts,
   phoneFaces.ts) on a made-up phone: the website's shared rules decide,
   ML Kit's answers are turned into what those rules read, photos are
   decoded a few at a time, and nothing is decoded twice. */
import { basicCheck, checkCopySize, checkIsReady, EYE_CLOSED_EAR, faceVerdict, findRepeats, MIN_FACE_SHARE } from '@web/lib/photoCheck';
import { faceGroupCentre } from '@web/pages/builder/faceCentre';
import type { StoredPhoto } from '@web/shared/platform';
import { createPhoneChecks, PHONE_CHECK_AT_ONCE, type PhoneCheckDevice } from '../src/lib/phonePhotoCheck';
import { earFromOpenChance, EYE_SHUT_BELOW, eyesJudged, fromNative, MIN_EYE_FACE_PX, phoneEyesShut, toCheckFace, type PhoneFace } from '../src/lib/phoneFaces';

jest.mock('expo', () => ({ requireOptionalNativeModule: () => null }));

/* ── ML Kit's eyes → the website's closed-eyes rule ─────────────────── */

const face = (over: Partial<PhoneFace> = {}): PhoneFace => ({
  box: { x: 100, y: 80, width: 200, height: 240 },
  leftEye: { x: 240, y: 170 },
  rightEye: { x: 160, y: 170 },
  leftEyeOpen: 0.95,
  rightEyeOpen: 0.9,
  ...over,
});

describe("ML Kit's eye scores on the website's scale", () => {
  it('the line between open and shut is the same line: EYE_SHUT_BELOW gives EYE_CLOSED_EAR', () => {
    expect(earFromOpenChance(EYE_SHUT_BELOW)).toBeCloseTo(EYE_CLOSED_EAR, 12);
    expect(earFromOpenChance(EYE_SHUT_BELOW - 0.001)).toBeLessThan(EYE_CLOSED_EAR);
    expect(earFromOpenChance(1)).toBeCloseTo(0.3, 12);
    expect(EYE_SHUT_BELOW).toBe(0.1); // see phoneFaces.ts: chosen from tools/photo-check's sample photos
    expect(earFromOpenChance(0)).toBeCloseTo(EYE_CLOSED_EAR / 4, 12);
  });

  it('goes up with the open chance, and stays in range past 0–1', () => {
    const xs = [0, 0.05, 0.1, 0.2, 0.29, 0.3, 0.31, 0.5, 0.9, 1];
    const ears = xs.map(earFromOpenChance);
    for (let i = 1; i < ears.length; i++) expect(ears[i]).toBeGreaterThan(ears[i - 1]);
    expect(earFromOpenChance(-3)).toBe(earFromOpenChance(0));
    expect(earFromOpenChance(7)).toBe(earFromOpenChance(1));
  });

  it('both eyes under the line → shut; one open eye → not shut (the website needs both)', () => {
    const h = 600;
    expect(faceVerdict([toCheckFace(face({ leftEyeOpen: 0.04, rightEyeOpen: 0.08 }))], h)).toEqual({ faces: 1, eyesClosed: true });
    expect(faceVerdict([toCheckFace(face({ leftEyeOpen: 0.04, rightEyeOpen: 0.8 }))], h)).toEqual({ faces: 1, eyesClosed: false });
    expect(faceVerdict([toCheckFace(face({ leftEyeOpen: EYE_SHUT_BELOW, rightEyeOpen: EYE_SHUT_BELOW }))], h)).toEqual({ faces: 1, eyesClosed: false });
    expect(faceVerdict([toCheckFace(face())], h)).toEqual({ faces: 1, eyesClosed: false });
  });

  it('a face ML Kit could not score still counts as a face, but its eyes are not judged', () => {
    const f = toCheckFace(face({ leftEyeOpen: null, rightEyeOpen: 0.02 }));
    expect(f.landmarks).toEqual([]);
    expect(faceVerdict([f], 600)).toEqual({ faces: 1, eyesClosed: false });
  });

  it('a face too small to judge is not counted and its eyes are not read (the same MIN_FACE_SHARE)', () => {
    const h = 600, tiny = h * MIN_FACE_SHARE - 1;
    const small = toCheckFace(face({ box: { x: 10, y: 10, width: tiny, height: tiny }, leftEyeOpen: 0, rightEyeOpen: 0 }));
    expect(faceVerdict([small], h)).toEqual({ faces: 0, eyesClosed: false });
  });

  it("a face under MIN_EYE_FACE_PX (ML Kit's own 100 px guide) counts as a face, but its eyes are not judged", () => {
    const h = 600;
    const at = (side: number) => face({ box: { x: 10, y: 10, width: side, height: side }, leftEye: null, rightEye: null, leftEyeOpen: 0.01, rightEyeOpen: 0.02 });
    expect(MIN_EYE_FACE_PX).toBe(100);
    expect(MIN_EYE_FACE_PX - 1).toBeGreaterThan(h * MIN_FACE_SHARE); // big enough to count
    expect(faceVerdict([toCheckFace(at(MIN_EYE_FACE_PX - 1))], h)).toEqual({ faces: 1, eyesClosed: false });
    expect(faceVerdict([toCheckFace(at(MIN_EYE_FACE_PX))], h)).toEqual({ faces: 1, eyesClosed: true });
    // Narrow but tall is still under the guide.
    expect(eyesJudged(face({ box: { x: 0, y: 0, width: 80, height: 200 } }))).toBe(false);
  });

  it("phoneEyesShut says what the shared rule decides from toCheckFace's points", () => {
    let seed = 7;
    const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const h = 600;
    for (let i = 0; i < 400; i++) {
      const side = 50 + r() * 200;
      const f = face({
        box: { x: 50, y: 50, width: side, height: side * (0.9 + r() * 0.3) },
        leftEyeOpen: r() < 0.1 ? null : r() * 0.3,
        rightEyeOpen: r() < 0.1 ? null : r() * 0.3,
      });
      expect(faceVerdict([toCheckFace(f)], h).eyesClosed).toBe(phoneEyesShut(f));
    }
  });

  it('the eye points sit where ML Kit found the eyes, as wide as a fifth of the face', () => {
    const f = toCheckFace(face());
    expect(f.boxHeight).toBe(240);
    expect(f.landmarks).toHaveLength(68);
    const rightEye = f.landmarks.slice(36, 42), leftEye = f.landmarks.slice(42, 48);
    expect((rightEye[0].x + rightEye[3].x) / 2).toBeCloseTo(160, 9);
    expect((leftEye[0].x + leftEye[3].x) / 2).toBeCloseTo(240, 9);
    expect(leftEye[3].x - leftEye[0].x).toBeCloseTo(40, 9);
  });

  it("no eye points from ML Kit: the eyes go where eyes usually are in the face's box", () => {
    const f = toCheckFace(face({ leftEye: null, rightEye: null, leftEyeOpen: 0.01, rightEyeOpen: 0.01 }));
    expect(f.landmarks[36 + 0].y).toBeCloseTo(80 + 240 * 0.4, 9);
    expect(faceVerdict([f], 600).eyesClosed).toBe(true);
  });
});

describe("the native module's report → a face", () => {
  it('reads the box, the eyes and the open chances', () => {
    expect(fromNative({
      x: 12, y: 30, width: 90, height: 110,
      leftEye: { x: 70, y: 60 },
      rightEye: { x: 35, y: 61 },
      leftEyeOpen: 0.12,
      rightEyeOpen: 0.97,
    })).toEqual({
      box: { x: 12, y: 30, width: 90, height: 110 },
      leftEye: { x: 70, y: 60 },
      rightEye: { x: 35, y: 61 },
      leftEyeOpen: 0.12,
      rightEyeOpen: 0.97,
    });
  });

  it('missing or impossible scores are "could not tell"', () => {
    const f = fromNative({ x: 0, y: 0, width: 10, height: 10, leftEye: null, rightEye: { x: NaN, y: 3 }, leftEyeOpen: -1, rightEyeOpen: 1.5 });
    expect(f).toMatchObject({ leftEye: null, rightEye: null, leftEyeOpen: null, rightEyeOpen: null });
  });
});

/* ── The PhotoChecker and FaceFinder on a made-up phone ─────────────── */

/** A small copy whose pixels depend on the photo's address. */
function pixelsFor(uri: string, w: number, h: number): Uint8Array {
  const seed = [...uri].reduce((s, c) => s + c.charCodeAt(0), 0);
  const out = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const x = i % w, y = Math.floor(i / w);
    out[i * 4] = (x * 7 + y * 3 + seed) % 256;
    out[i * 4 + 1] = ((x ^ y) + seed * 3) % 256;
    out[i * 4 + 2] = (x * y + seed) % 256;
    out[i * 4 + 3] = 255;
  }
  return out;
}

function fakePhone(over: Partial<PhoneCheckDevice> = {}, facesOf: (uri: string) => PhoneFace[] = () => [face()]) {
  const calls = { pixels: [] as string[], find: [] as string[], size: [] as string[] };
  let decoding = 0;
  const log = { mostAtOnce: 0 };
  const device: PhoneCheckDevice = {
    canDecode: true,
    size: async (uri) => { calls.size.push(uri); return { width: 4032, height: 3024 }; },
    pixels: async (uri, w, h) => {
      calls.pixels.push(`${uri}|${w}x${h}`);
      decoding++; log.mostAtOnce = Math.max(log.mostAtOnce, decoding);
      await new Promise((r) => setTimeout(r, 5));
      decoding--;
      return pixelsFor(uri, w, h);
    },
    faces: { init: async () => true, find: async (uri, w, h) => { calls.find.push(`${uri}|${w}x${h}`); return facesOf(uri); } },
    ...over,
  };
  return { device, calls, log };
}

const photo = (n: number, over: Partial<StoredPhoto> = {}): StoredPhoto => ({
  id: `p${n}`, name: `IMG_${n}.jpg`, type: 'image/jpeg', size: 1, width: 4032, height: 3024,
  url: `content://media/external/images/media/${n}`, ...over,
});

describe('the photo check on the phone', () => {
  it('blur and fingerprint: the small copy at checkCopySize, through the shared basicCheck', async () => {
    const { device, calls } = fakePhone();
    const { photoCheck } = createPhoneChecks(device);
    const res = await photoCheck.check(photo(1), 4032, 3024, { faces: false });
    const { w, h } = checkCopySize(4032, 3024);
    expect(calls.pixels).toEqual([`content://media/external/images/media/1|${w}x${h}`]);
    expect(res).toEqual(basicCheck(pixelsFor(photo(1).url, w, h), w, h));
    expect(res.faces).toBeNull();
    expect(calls.find).toEqual([]); // no face work in the blur pass
  });

  it('the face pass: ML Kit on the same small copy, the blur answer reused', async () => {
    const { device, calls } = fakePhone({}, () => [face({ leftEyeOpen: 0.02, rightEyeOpen: 0.05 })]);
    const { photoCheck } = createPhoneChecks(device);
    const basic = await photoCheck.check(photo(1), 4032, 3024, { faces: false });
    const full = await photoCheck.check(photo(1), 4032, 3024);
    expect(full).toEqual({ ...basic, faces: 1, eyesClosed: true });
    expect(calls.pixels).toHaveLength(1);
    expect(calls.find).toEqual(['content://media/external/images/media/1|800x600']);
  });

  it('when ML Kit fails, the photo has no eye test: the blur answer still comes, faces stay unknown (never stuck)', async () => {
    for (const faces of [
      { init: async () => true, find: async (): Promise<PhoneFace[]> => { throw new Error('ML Kit broke'); } },
      { init: async (): Promise<boolean> => { throw new Error('no model'); }, find: async () => [face()] },
    ]) {
      const { device } = fakePhone({ faces });
      const { photoCheck } = createPhoneChecks(device);
      const basic = await photoCheck.check(photo(1), 4032, 3024, { faces: false });
      // The face pass resolves (the builder then stores facesTried: true).
      await expect(photoCheck.check(photo(1), 4032, 3024)).resolves.toEqual(basic);
      expect(basic.faces).toBeNull();
      expect(basic.eyesClosed).toBe(false);
      // Straight to the face pass, with no blur pass first: the same.
      const fresh = createPhoneChecks(fakePhone({ faces }).device).photoCheck;
      await expect(fresh.check(photo(2), 4032, 3024)).resolves.toMatchObject({ faces: null, eyesClosed: false });
    }
  });

  it("a face pass that fails leaves the builder's photo check ready (the shared checkIsReady)", async () => {
    // Two repeats: the face pass runs on both; one fails. The builder's
    // merge (useBuilderState) stores faces + facesTried: true either way.
    const { device } = fakePhone({ faces: { init: async () => true, find: async (uri) => { if (uri.endsWith('/2')) throw new Error('out of memory'); return [face()]; } } });
    const { photoCheck } = createPhoneChecks(device);
    const ps = [photo(1), photo(2)];
    const stored = await Promise.all(ps.map(async (p) => {
      const basic = await photoCheck.check(p, 4032, 3024, { faces: false });
      const full = await photoCheck.check(p, 4032, 3024);
      return { id: p.id, width: 4032, height: 3024, capturedAt: 1_000_000, check: { ...basic, faces: full.faces, eyesClosed: full.eyesClosed, facesTried: true } };
    }));
    // The same pixels for both (a burst): make them repeats.
    stored[1].check.hash = stored[0].check.hash;
    expect(findRepeats(stored)).toHaveLength(1);
    expect(stored[1].check.faces).toBeNull();
    expect(checkIsReady(stored)).toBe(true);
  });

  it('no face finder (or it will not start): faces stay unknown, the blur answer still comes', async () => {
    for (const faces of [null, { init: async () => false, find: async () => [face()] }]) {
      const { device } = fakePhone({ faces });
      const { photoCheck } = createPhoneChecks(device);
      const res = await photoCheck.check(photo(1), 4032, 3024);
      expect(res.faces).toBeNull();
      expect(res.eyesClosed).toBe(false);
      expect(typeof res.sharp).toBe('number');
      expect(photoCheck.facesForAllPhotos()).toBe(faces != null);
    }
  });

  it('decodes at most PHONE_CHECK_AT_ONCE photos at a time (memory)', async () => {
    const { device, log } = fakePhone();
    const { photoCheck } = createPhoneChecks(device);
    await Promise.all(Array.from({ length: 7 }, (_, i) => photoCheck.check(photo(i), 4032, 3024, { faces: false })));
    expect(log.mostAtOnce).toBe(PHONE_CHECK_AT_ONCE);
  });

  it('fewer pixels than asked for is an error, not a wrong answer', async () => {
    const { device } = fakePhone({ pixels: async () => new Uint8Array(10) });
    await expect(createPhoneChecks(device).photoCheck.check(photo(1), 4032, 3024, { faces: false })).rejects.toThrow(/fewer pixels/);
  });

  it("reads only the phone's own photos (content:// and file://), and only where it can decode", () => {
    const { photoCheck } = createPhoneChecks(fakePhone().device);
    expect(photoCheck.readable(photo(1))).toBe(true);
    expect(photoCheck.readable(photo(2, { url: 'file:///data/user/0/x/cache/a.jpg' }))).toBe(true);
    expect(photoCheck.readable(photo(3, { url: 'blob:https://megyprints.vercel.app/1' }))).toBe(false);
    expect(photoCheck.readable(photo(4, { url: 'https://example.com/a.jpg' }))).toBe(false);
    expect(photoCheck.available()).toBe(true);
    expect(createPhoneChecks(fakePhone({ canDecode: false }).device).photoCheck.available()).toBe(false);
  });
});

describe('face centring on the phone', () => {
  const two = [
    face({ box: { x: 40, y: 100, width: 80, height: 80 } }),
    face({ box: { x: 600, y: 300, width: 120, height: 120 } }),
  ];

  it('from scratch: measures the photo, ML Kit on its small copy, the shared faceGroupCentre', async () => {
    const { device, calls } = fakePhone({}, () => two);
    const { faces } = createPhoneChecks(device);
    const c = await faces.detectFaceCenter(photo(1).url);
    expect(calls.size).toEqual([photo(1).url]);
    expect(calls.find).toEqual([`${photo(1).url}|800x600`]);
    expect(c).toEqual(faceGroupCentre(two.map((f) => f.box), 800, 600));
  });

  it('after the face pass: the faces already found are used (no second ML Kit run)', async () => {
    const { device, calls } = fakePhone({}, () => two);
    const { photoCheck, faces } = createPhoneChecks(device);
    await photoCheck.check(photo(1), 4032, 3024);
    const c = await faces.detectFaceCenter(photo(1).url);
    expect(calls.find).toHaveLength(1);
    expect(calls.size).toEqual([]);
    expect(c).toEqual(faceGroupCentre(two.map((f) => f.box), 800, 600));
  });

  it('no face → null (the photo is centred as usual); any failure → null, never an error', async () => {
    expect(await createPhoneChecks(fakePhone({}, () => []).device).faces.detectFaceCenter(photo(1).url)).toBeNull();
    const broken = fakePhone({ faces: { init: async () => true, find: async () => { throw new Error('gone'); } } });
    expect(await createPhoneChecks(broken.device).faces.detectFaceCenter(photo(1).url)).toBeNull();
    const unmeasured = fakePhone({ size: async () => ({ width: 0, height: 0 }) });
    expect(await createPhoneChecks(unmeasured.device).faces.detectFaceCenter(photo(1).url)).toBeNull();
    expect(await createPhoneChecks(fakePhone({ faces: null }).device).faces.detectFaceCenter(photo(1).url)).toBeNull();
    expect(await createPhoneChecks(fakePhone().device).faces.detectFaceCenter('blob:https://x/1')).toBeNull();
  });

  it('init never throws', async () => {
    const { device } = fakePhone({ faces: { init: async () => { throw new Error('no model'); }, find: async () => [] } });
    await expect(createPhoneChecks(device).faces.init()).resolves.toBeUndefined();
  });
});
