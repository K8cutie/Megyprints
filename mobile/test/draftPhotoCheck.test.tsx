/* ══════════════════════════════════════════════════════════════════════════
   MEGY'S PHOTO CHECK ON THE PICKED PHOTOS (2.1.2): the Photos step checks
   the photos for blur and repeats with the website's own rules, saves what
   it found with the picked photos, and shows what Megy would leave out.
   ══════════════════════════════════════════════════════════════════════════ */
import { renderHook, waitFor } from '@testing-library/react-native';
import type { PhotoChecker } from '@web/shared/platform';
import { checkFrom, type PhotoCheck } from '@web/lib/photoCheck';
import { draftCheckView, runDraftCheck, toCheckable, useDraftPhotoCheck, type DraftCheckStore } from '../src/lib/draftPhotoCheck';
import {
  addPhotos, bringBackPhotos, emptyDraft, idsInAlbum, keepPhotos, leaveOutPhotos, parseDraft, photoKey, photoStep,
  serializeDraft, setChecks, type AlbumDraft, type DraftPhoto,
} from '../src/lib/photoDraft';

const T0 = Date.UTC(2026, 9, 1);
const photo = (n: number, over: Partial<DraftPhoto> = {}): DraftPhoto => {
  const uri = `content://media/external/images/media/${n}`;
  return {
    key: photoKey('gallery', uri), source: 'gallery', uri, name: `IMG_${n}.jpg`, width: 4000, height: 3000,
    // Ten minutes apart: two photos are repeats only when a test says so.
    capturedAt: T0 + n * 600_000, modifiedAt: T0, addedAt: 1, ...over,
  };
};
const key = (n: number) => `media:${n}`;
/** A sharp photo's answer; each `n` gets a fingerprint far from the others. */
const fingerprint = (n: number): string => {
  let s = Math.imul(n, 0x9e3779b1) >>> 0;
  let out = '';
  for (let i = 0; i < 8; i++) {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
    out += (s & 0xff).toString(16).padStart(2, '0');
  }
  return out;
};
const SHARP = (n: number): PhotoCheck => checkFrom(900, fingerprint(n));
const BLURRY = (n: number): PhotoCheck => ({ ...SHARP(n), sharp: 5 });

/** A made-up checker: `answers` by photo number, a miss throws (unreadable). */
function fakeChecker(answers: Record<number, PhotoCheck>, over: Partial<PhotoChecker> = {}) {
  const calls: string[] = [];
  const checker: PhotoChecker = {
    available: () => true,
    facesForAllPhotos: () => true,
    readable: (p) => p.url.startsWith('content://'),
    check: async (p, _w, _h, opts) => {
      const n = Number(p.url.split('/').pop());
      calls.push(`${opts?.faces === false ? 'basic' : 'faces'}:${n}`);
      const a = answers[n];
      if (!a) throw new Error('cannot read');
      return opts?.faces === false ? a : { ...a, faces: 1, eyesClosed: n % 2 === 0 };
    },
    ...over,
  };
  return { checker, calls };
}

/** Runs the check to its end over `photos`, as the hook does. */
async function runOn(photos: DraftPhoto[], checker: PhotoChecker) {
  const found = new Map<string, PhotoCheck>();
  const now = () => photos.map((p) => (found.has(p.key) ? { ...p, check: found.get(p.key) } : p));
  await runDraftCheck(checker, { photos: now, found: (k, c) => found.set(k, c), stopped: () => false, tried: new Set(), breathe: async () => {} });
  return now();
}

describe('the check on the picked photos', () => {
  it('every photo gets its blur answer, in order, once', async () => {
    const { checker, calls } = fakeChecker({ 1: SHARP(1), 2: SHARP(2), 3: SHARP(3) });
    const out = await runOn([photo(1), photo(2), photo(3)], checker);
    expect(calls).toEqual(['basic:1', 'basic:2', 'basic:3']);
    expect(out.map((p) => p.check?.sharp)).toEqual([900, 900, 900]);
    expect(out.every((p) => p.check?.faces === null && p.check?.facesTried === false)).toBe(true);
  });

  it('a photo already checked (saved with the picked photos) is not checked again', async () => {
    const { checker, calls } = fakeChecker({ 2: SHARP(2) });
    await runOn([photo(1, { check: SHARP(1) }), photo(2)], checker);
    expect(calls).toEqual(['basic:2']);
  });

  it('only the photos in a set of repeats get the face pass here (it picks the shot Megy keeps); the album builder does the rest', async () => {
    // 1 and 2: the same fingerprint, taken a minute apart → repeats. 3 is on its own.
    const same = SHARP(1);
    const { checker, calls } = fakeChecker({ 1: same, 2: same, 3: SHARP(3) });
    const out = await runOn([photo(1), photo(2, { capturedAt: photo(1).capturedAt! + 60_000 }), photo(3)], checker);
    expect(calls).toEqual(['basic:1', 'basic:2', 'basic:3', 'faces:1', 'faces:2']);
    expect(out[0].check).toMatchObject({ faces: 1, eyesClosed: false, facesTried: true });
    expect(out[1].check).toMatchObject({ faces: 1, eyesClosed: true, facesTried: true });
    expect(out[2].check).toMatchObject({ faces: null, facesTried: false });
    // The shut-eyes shot is the one suggested out; the other is kept.
    expect(draftCheckView(out, true).suggestion).toEqual({ blurry: [], repeats: [key(2)], keeperOf: { [key(2)]: key(1) } });
  });

  it('a photo the phone cannot read is left alone: nothing loops, the others are checked', async () => {
    const { checker, calls } = fakeChecker({ 1: SHARP(1), 3: SHARP(3) });
    const files = photo(4, { uri: 'https://example.test/a.jpg', key: 'files:https://example.test/a.jpg' });
    const out = await runOn([photo(1), photo(2), photo(3), files], checker);
    expect(calls).toEqual(['basic:1', 'basic:2', 'basic:3']); // 4 is not the phone's own: never asked
    expect(out.map((p) => !!p.check)).toEqual([true, false, true, false]);
  });

  it('stops when the screen is gone', async () => {
    const { checker, calls } = fakeChecker({ 1: SHARP(1), 2: SHARP(2) });
    let gone = false;
    await runDraftCheck(checker, { photos: () => [photo(1), photo(2)], found: () => { gone = true; }, stopped: () => gone, tried: new Set(), breathe: async () => {} });
    expect(calls).toEqual(['basic:1']);
  });
});

describe('what the Photos step shows', () => {
  const checked = [photo(1, { check: SHARP(1) }), photo(2, { check: BLURRY(2) }), photo(3, { check: SHARP(3) })];

  it('while photos are still to check: not ready, with the count', () => {
    const v = draftCheckView([photo(1, { check: SHARP(1) }), photo(2), photo(3)], true);
    expect(v.ready).toBe(false);
    expect(v.progress).toEqual({ done: 1, total: 3 });
  });

  it('checked: the blurry shot is suggested out, by the website\'s rule (soft against the album\'s own sharpness)', () => {
    const v = draftCheckView(checked, true);
    expect(v.ready).toBe(true);
    expect(v.suggestion.blurry).toEqual([key(2)]);
    expect(v.leftOut).toBe(0);
  });

  it('a photo the phone could not check does not hold the check up, and is never suggested', () => {
    const photos = [...checked, photo(4)];
    expect(draftCheckView(photos, true).ready).toBe(false);
    const v = draftCheckView(photos, true, new Set([key(4)]));
    expect(v.ready).toBe(true);
    expect(v.progress).toEqual({ done: 3, total: 3 });
    expect([...v.suggestion.blurry, ...v.suggestion.repeats]).toEqual([key(2)]);
  });

  it('kept photos are not suggested again; left-out ones are counted, not suggested', () => {
    expect(draftCheckView(checked.map((p) => (p.key === key(2) ? { ...p, kept: true } : p)), true).suggestion.blurry).toEqual([]);
    const out = draftCheckView(checked.map((p) => (p.key === key(2) ? { ...p, leftOut: true } : p)), true);
    expect(out.suggestion.blurry).toEqual([]);
    expect(out.leftOut).toBe(1);
    // A kept photo is said, so the card does not call the album "all sharp".
    expect(draftCheckView(checked, true).keptAny).toBe(false);
    expect(draftCheckView(checked.map((p) => (p.key === key(2) ? { ...p, kept: true } : p)), true).keptAny).toBe(true);
  });

  it('the shared rules read a picked photo by its key', () => {
    expect(toCheckable(photo(7, { check: SHARP(7), kept: true }))).toEqual({
      id: key(7), width: 4000, height: 3000, capturedAt: photo(7).capturedAt, check: SHARP(7), kept: true, leftOut: undefined,
    });
  });
});

describe('the picked photos remember the check and the answer', () => {
  const draftOf = (photos: DraftPhoto[]): AlbumDraft => ({ ...addPhotos(emptyDraft(), photos, 50).draft });

  it('what the check found is saved with the photo; the picked photos are the same, so the draft\'s time stays', () => {
    const d = setChecks(draftOf([photo(1), photo(2)]), new Map([[key(1), SHARP(1)]]));
    expect(d.photos[0].check).toEqual(SHARP(1));
    expect(d.photos[1].check).toBeUndefined();
    expect(d.updatedAt).toBe(50);
    expect(parseDraft(serializeDraft(d)).photos[0].check).toEqual(SHARP(1));
  });

  it('a saved check that is not one is dropped (the photo is checked again), never trusted', () => {
    const text = serializeDraft(draftOf([photo(1)])).replace('"name"', '"check":{"v":1,"sharp":"x","hash":"zz"},"name"');
    expect(parseDraft(text).photos[0].check).toBeUndefined();
    expect(parseDraft(text).photos).toHaveLength(1);
  });

  it('"Leave them out": the photos stay picked but do not count; the album needs its 40 without them', () => {
    const forty = Array.from({ length: 41 }, (_, i) => photo(i + 1));
    const d = leaveOutPhotos(draftOf(forty), [key(3), key(4)], 99);
    expect(d.photos.filter((p) => p.leftOut).map((p) => p.key)).toEqual([key(3), key(4)]);
    expect(d.updatedAt).toBe(99);
    expect(photoStep(draftOf(forty).photos).canGoOn).toBe(true);
    const step = photoStep(d.photos);
    expect(step.count).toBe(39);
    expect(step.canGoOn).toBe(false);
    expect(step.mainLabel).toBe('Add 1 more photo');
    expect(parseDraft(serializeDraft(d)).photos.filter((p) => p.leftOut)).toHaveLength(2);
  });

  it('"Keep it": not left out, and remembered (saved); keeping a photo that was in anyway does not move the draft\'s time', () => {
    const d = keepPhotos(draftOf([photo(1), photo(2)]), [key(2)], 99);
    expect(d.photos[1].kept).toBe(true);
    expect(d.updatedAt).toBe(50);
    expect(parseDraft(serializeDraft(d)).photos[1].kept).toBe(true);
    expect(keepPhotos(d, [key(2)], 120)).toBe(d); // nothing to change
  });

  it('"Bring them back": every left-out photo is in again, kept, so it is not suggested again', () => {
    const out = leaveOutPhotos(draftOf([photo(1), photo(2), photo(3)]), [key(1), key(3)], 60);
    const back = bringBackPhotos(out, 70);
    expect(back.photos.map((p) => [p.leftOut, p.kept])).toEqual([[undefined, true], [undefined, undefined], [undefined, true]]);
    expect(back.updatedAt).toBe(70);
  });

  it('a left-out photo can be picked again in the grid: that puts it back, kept', () => {
    const out = leaveOutPhotos(draftOf([photo(1), photo(2)]), [key(2)], 60);
    // Not marked "In album" in the picker while it is left out.
    expect([...idsInAlbum([photo(1).uri, photo(2).uri], out.photos)]).toEqual([photo(1).uri]);
    const r = addPhotos(out, [photo(2)], 80);
    expect(r.added).toBe(1);
    expect(r.draft.photos[1]).toMatchObject({ key: key(2), kept: true });
    expect(r.draft.photos[1].leftOut).toBeUndefined();
    expect(r.draft.photos).toHaveLength(2);
  });
});

describe('the Photos step\'s check (useDraftPhotoCheck)', () => {
  function store(photos: DraftPhoto[]) {
    let draft: AlbumDraft = { version: 1, photos, updatedAt: 1 };
    const writes: number[] = [];
    const api: DraftCheckStore = {
      get draft() { return draft; },
      peek: () => draft,
      setChecks: (found) => { writes.push(found.size); draft = setChecks(draft, found); },
    };
    return { api, writes, now: () => draft };
  }

  it('checks the picked photos, saves the answers a few at a time, then says what it found', async () => {
    const { checker } = fakeChecker({ 1: SHARP(1), 2: BLURRY(2), 3: SHARP(3) });
    const s = store([photo(1), photo(2), photo(3)]);
    const { result, rerender } = await renderHook(() => useDraftPhotoCheck(checker, { draft: s.api.draft, peek: s.api.peek, setChecks: s.api.setChecks }));
    expect(result.current.ready).toBe(false);
    await waitFor(() => expect(s.now().photos.every((p) => p.check)).toBe(true));
    // Not one write per photo.
    expect(s.writes.length).toBeLessThan(3);
    await rerender({});
    expect(result.current.ready).toBe(true);
    expect(result.current.suggestion.blurry).toEqual([key(2)]);
  });

  it('a phone that cannot check: nothing runs, and the step shows no card (available false)', async () => {
    const { checker, calls } = fakeChecker({ 1: SHARP(1) }, { available: () => false });
    const s = store([photo(1)]);
    const { result } = await renderHook(() => useDraftPhotoCheck(checker, s.api));
    expect(result.current.available).toBe(false);
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toEqual([]);
  });

  it('answers saved on an earlier visit are told to the checker, so the album builder does not decode those photos again', async () => {
    const { checker, calls } = fakeChecker({});
    const s = store([photo(1, { check: SHARP(1) }), photo(2, { check: SHARP(2) })]);
    const remember = jest.fn();
    await renderHook(() => useDraftPhotoCheck(checker, s.api, remember));
    expect(remember.mock.calls).toEqual([[photo(1).uri, 4000, 3000, SHARP(1)], [photo(2).uri, 4000, 3000, SHARP(2)]]);
    expect(calls).toEqual([]);
  });
});
