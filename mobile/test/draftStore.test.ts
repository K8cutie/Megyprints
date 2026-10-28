import AsyncStorage from '@react-native-async-storage/async-storage';
import { DRAFT_FILE, DRAFT_NEXT_FILE, DRAFT_UNREADABLE_FILE, fileDraftStorage, OLD_DRAFT_KEY, type DraftStorage } from '../src/lib/draftFile';
import { loadDraft, makeSaver, openDraft } from '../src/lib/draftStore';
import { addPhotos, emptyDraft, parseDraft, photoKey, serializeDraft, type DraftPhoto } from '../src/lib/photoDraft';

/* The phone, faked:
   • the app's folder (expo-file-system): a map of file name → text;
   • AsyncStorage as Android's really is: a value over 2 MB is saved, but
     reading it back fails (Android's CursorWindow holds 2 MB per row). */
const mockDisk = new Map<string, string>();
const mockStore = new Map<string, string>();
const MOCK_ROW_LIMIT = 2 * 1024 * 1024;

jest.mock('expo-file-system', () => {
  class File {
    uri: string;
    constructor(dir: { uri: string }, name: string) {
      this.uri = dir.uri + name;
    }
    get exists() {
      return mockDisk.has(this.uri);
    }
    async text() {
      const t = mockDisk.get(this.uri);
      if (t == null) throw new Error('no such file');
      return t;
    }
    async write(text: string) {
      mockDisk.set(this.uri, text);
    }
    async move(to: File, options?: { overwrite?: boolean }) {
      if (mockDisk.has(to.uri) && !options?.overwrite) throw new Error('already there');
      mockDisk.set(to.uri, mockDisk.get(this.uri) as string);
      mockDisk.delete(this.uri);
      this.uri = to.uri;
    }
  }
  return { File, Paths: { document: { uri: 'file:///app/' } } };
});

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => {
    const v = mockStore.get(k);
    if (v != null && v.length > MOCK_ROW_LIMIT) throw new Error('Row too big to fit into CursorWindow');
    return v ?? null;
  }),
  setItem: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
  removeItem: jest.fn(async (k: string) => { mockStore.delete(k); }),
}));

const path = (name: string) => `file:///app/${name}`;

const photo = (n: number): DraftPhoto => {
  const uri = `content://media/external/images/media/${1_000_000_000 + n}`;
  return { key: photoKey('gallery', uri), source: 'gallery', uri, name: `IMG_20261026_${String(n).padStart(6, '0')}.jpg`, width: 3000, height: 4000, capturedAt: 1_761_000_000_000 + n * 1000, modifiedAt: 1_761_000_000_000 + n * 1000, addedAt: 1_761_500_000_000 };
};
const album = (count: number) => addPhotos(emptyDraft(), Array.from({ length: count }, (_, i) => photo(i)), 9).draft;

beforeEach(() => {
  mockDisk.clear();
  mockStore.clear();
  jest.clearAllMocks();
});

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

  it('changes made while a save runs go out together in the next save (no pile-up)', async () => {
    const written: number[] = [];
    let release: () => void = () => {};
    const slow = new Promise<void>((r) => { release = r; });
    const save = makeSaver(async (text) => {
      if (written.length === 0) await slow;
      written.push(parseDraft(text).photos.length);
    });
    void save(album(1));
    void save(album(2));
    void save(album(3));
    const last = save(album(4));
    release();
    await last;
    expect(written).toEqual([1, 4]);
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
});

describe('a very big album (Select all on a phone with many photos)', () => {
  it('Android AsyncStorage could not read back one value this big: why the album is a file', async () => {
    const text = serializeDraft(album(12_000));
    expect(text.length).toBeGreaterThan(MOCK_ROW_LIMIT);
    await AsyncStorage.setItem('x', text);
    await expect(AsyncStorage.getItem('x')).rejects.toThrow(/CursorWindow/);
  });

  it('an album of 12,000 photos saves and opens again, every photo in order', async () => {
    const big = album(12_000);
    await makeSaver((t) => fileDraftStorage.write(t))(big);
    const opened = await openDraft(fileDraftStorage);
    expect(opened.couldNotOpen).toBe(false);
    expect(opened.canSave).toBe(true);
    expect(opened.draft.photos).toHaveLength(12_000);
    expect(opened.draft).toEqual(big);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });
});

describe('the saved file is always a whole album', () => {
  it('a save writes a second file, then moves it over the first', async () => {
    await fileDraftStorage.write(serializeDraft(album(3)));
    expect([...mockDisk.keys()]).toEqual([path(DRAFT_FILE)]);
    expect(parseDraft(mockDisk.get(path(DRAFT_FILE))).photos).toHaveLength(3);
  });

  it('the phone stopping before the move: the last whole save opens', async () => {
    await fileDraftStorage.write(serializeDraft(album(3)));
    mockDisk.set(path(DRAFT_NEXT_FILE), serializeDraft(album(5)).slice(0, 100)); // cut off mid-write
    expect((await loadDraft(fileDraftStorage)).draft.photos).toHaveLength(3);
  });

  it('the phone stopping inside the move (first file gone): the second file opens', async () => {
    mockDisk.set(path(DRAFT_NEXT_FILE), serializeDraft(album(5)));
    const loaded = await loadDraft(fileDraftStorage);
    expect(loaded.state).toBe('loaded');
    expect(loaded.draft.photos).toHaveLength(5);
  });
});

describe('opening the saved album: none, or one that could not be read', () => {
  it('nothing saved: an empty album, and no message', async () => {
    expect(await loadDraft(fileDraftStorage)).toEqual({ draft: emptyDraft(), state: 'none' });
    expect(await openDraft(fileDraftStorage)).toEqual({ draft: emptyDraft(), couldNotOpen: false, canSave: true });
  });

  it('a save that cannot be read is kept aside, never written over, and the person is told', async () => {
    mockDisk.set(path(DRAFT_FILE), '{"version":1,"photos":[{"sou');
    const opened = await openDraft(fileDraftStorage);
    expect(opened).toEqual({ draft: emptyDraft(), couldNotOpen: true, canSave: true });
    expect(mockDisk.get(path(DRAFT_UNREADABLE_FILE))).toBe('{"version":1,"photos":[{"sou');
    // The next save goes to a new file; the kept one is untouched.
    await fileDraftStorage.write(serializeDraft(album(2)));
    expect(mockDisk.get(path(DRAFT_UNREADABLE_FILE))).toBe('{"version":1,"photos":[{"sou');
    expect((await openDraft(fileDraftStorage)).draft.photos).toHaveLength(2);
  });

  it('a save from another version counts as "could not be read", not as "nothing saved"', async () => {
    mockDisk.set(path(DRAFT_FILE), JSON.stringify({ version: 2, photos: [] }));
    expect((await loadDraft(fileDraftStorage)).state).toBe('unreadable');
  });

  it('a read that fails counts as "could not be read"', async () => {
    const failing: DraftStorage = { read: async () => { throw new Error('io'); }, write: async () => {}, keepAside: async () => {} };
    expect(await loadDraft(failing)).toEqual({ draft: emptyDraft(), state: 'unreadable' });
  });

  it('if the unreadable save cannot be moved aside, nothing is saved over it', async () => {
    const stuck: DraftStorage = { read: async () => 'broken', write: async () => {}, keepAside: async () => { throw new Error('no'); } };
    expect(await openDraft(stuck)).toEqual({ draft: emptyDraft(), couldNotOpen: true, canSave: false });
  });

  it('the first test build\'s save (one AsyncStorage value) opens when there is no file yet', async () => {
    mockStore.set(OLD_DRAFT_KEY, serializeDraft(album(4)));
    expect((await openDraft(fileDraftStorage)).draft.photos).toHaveLength(4);
  });

  it('an old save too big to read: the person is told, and it is left as it is', async () => {
    const tooBig = serializeDraft(album(12_000));
    mockStore.set(OLD_DRAFT_KEY, tooBig);
    const opened = await openDraft(fileDraftStorage);
    expect(opened).toEqual({ draft: emptyDraft(), couldNotOpen: true, canSave: true });
    await fileDraftStorage.write(serializeDraft(album(1)));
    expect(mockStore.get(OLD_DRAFT_KEY)).toBe(tooBig);
  });
});
