import { DRAFT_STORAGE_KEY, loadDraft, makeSaver } from '../src/lib/draftStore';
import { addPhotos, emptyDraft, parseDraft, photoKey, type DraftPhoto } from '../src/lib/photoDraft';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

const photo = (n: number): DraftPhoto => {
  const uri = `content://media/external/images/media/${n}`;
  return { key: photoKey('gallery', uri), source: 'gallery', uri, name: `${n}.jpg`, width: 1, height: 1, capturedAt: n, modifiedAt: null, addedAt: 0 };
};

describe('saving the album on the phone', () => {
  it('saves one after another: a slow older save never lands after a newer one', async () => {
    const written: string[] = [];
    let release: () => void = () => {};
    const slow = new Promise<void>((r) => { release = r; });
    let calls = 0;
    const save = makeSaver(async (text) => {
      calls++;
      if (calls === 1) await slow; // the first write is slow
      written.push(text);
    });
    const one = addPhotos(emptyDraft(), [photo(1)]).draft;
    const two = addPhotos(one, [photo(2)]).draft;
    const p1 = save(one);
    const p2 = save(two);
    release();
    await Promise.all([p1, p2]);
    expect(written.map((t) => parseDraft(t).photos.length)).toEqual([1, 2]);
  });

  it('a failed save is reported and does not stop the next one', async () => {
    const errors: unknown[] = [];
    const written: string[] = [];
    let n = 0;
    const save = makeSaver(async (text) => {
      if (n++ === 0) throw new Error('disk full');
      written.push(text);
    }, (e) => errors.push(e));
    await save(emptyDraft());
    await save(addPhotos(emptyDraft(), [photo(1)]).draft);
    expect(errors).toHaveLength(1);
    expect(written).toHaveLength(1);
  });

  it('reads the saved album under its own key; a broken read gives an empty album', async () => {
    const saved = addPhotos(emptyDraft(), [photo(5), photo(3)], 9).draft;
    const keys: string[] = [];
    const read = async (k: string) => { keys.push(k); return JSON.stringify({ version: 1, updatedAt: 9, photos: saved.photos }); };
    expect(await loadDraft(read)).toEqual(saved);
    expect(keys).toEqual([DRAFT_STORAGE_KEY]);
    expect(await loadDraft(async () => { throw new Error('no storage'); })).toEqual(emptyDraft());
  });
});
