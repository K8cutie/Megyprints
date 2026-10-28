/* ══════════════════════════════════════════════════════════════════════════
   THE APP'S BUILDER PIECES (src/builder): the device store, the photo store
   and the photo intake, on a made-up phone (files in memory, a made-up
   photo index). The phone's own halves (expo-file-system, modules/
   photo-files) are not in jest; the emulator run covers them.
   ══════════════════════════════════════════════════════════════════════════ */
import { fileKeyValueStore, fileNameFor, memoryStore, type SyncFiles } from '../src/builder/deviceStore';
import { createPhotoIntake, createPhotoStore, PHOTO_INDEX_KEY, toPickedPhoto, type PhotoHeader } from '../src/builder/appPhotos';
import { createAppPlatform } from '../src/builder/appPlatform';
import type { DraftPhoto } from '../src/lib/photoDraft';

/** Files in memory; `failMoves` makes the next move throw (the phone stopping). */
function memoryFiles() {
  const files = new Map<string, string>();
  const log: string[] = [];
  let failMoves = 0;
  const fs: SyncFiles & { files: Map<string, string>; log: string[]; failNextMove(): void } = {
    files, log,
    read: (n) => files.get(n) ?? null,
    write: (n, t) => { log.push(`write ${n}`); files.set(n, t); },
    move: (a, b) => {
      if (failMoves > 0) { failMoves--; throw new Error('the phone stopped'); }
      log.push(`move ${a} -> ${b}`);
      const v = files.get(a);
      if (v == null) throw new Error(`no ${a}`);
      files.set(b, v);
      files.delete(a);
    },
    remove: (n) => { files.delete(n); },
    failNextMove: () => { failMoves++; },
  };
  return fs;
}

describe('the device store (the website\'s localStorage, in files)', () => {
  it('saves each value whole before setItem returns: a second file, then moved over the first', () => {
    const fs = memoryFiles();
    const store = fileKeyValueStore(fs);
    store.setItem('megy-album-v5', '{"albumPages":[]}');
    expect(fs.log).toEqual([`write ${fileNameFor('megy-album-v5')}.next`, `move ${fileNameFor('megy-album-v5')}.next -> ${fileNameFor('megy-album-v5')}`]);
    expect(fs.files.get(fileNameFor('megy-album-v5'))).toBe('{"albumPages":[]}');
  });

  it('a restart reads what was saved; removeItem forgets it', () => {
    const fs = memoryFiles();
    fileKeyValueStore(fs).setItem('megy-album-theme', 'Wedding');
    const after = fileKeyValueStore(fs); // the app opened again
    expect(after.getItem('megy-album-theme')).toBe('Wedding');
    after.removeItem('megy-album-theme');
    expect(fileKeyValueStore(fs).getItem('megy-album-theme')).toBeNull();
  });

  it('the phone stopping between the two steps: the last whole value is read back', () => {
    const fs = memoryFiles();
    const store = fileKeyValueStore(fs);
    store.setItem('k', 'one');
    fs.failNextMove();
    expect(() => store.setItem('k', 'two')).toThrow('the phone stopped');
    // The main file still has the old whole value…
    expect(fileKeyValueStore(fs).getItem('k')).toBe('one');
    // …and with no main file at all, the second file's whole value is read.
    fs.files.delete(fileNameFor('k'));
    expect(fileKeyValueStore(fs).getItem('k')).toBe('two');
  });

  it('reads the file once, then from memory; every write still goes to the file', () => {
    const fs = memoryFiles();
    let reads = 0;
    const counted: SyncFiles = { ...fs, read: (n) => { reads++; return fs.read(n); } };
    const store = fileKeyValueStore(counted);
    store.getItem('megy-album-v5');
    store.getItem('megy-album-v5');
    store.getItem('megy-album-v5');
    expect(reads).toBe(2); // the main file and the second file, once
    store.setItem('megy-album-v5', 'x');
    expect(fs.files.get(fileNameFor('megy-album-v5'))).toBe('x');
  });

  it('names with odd letters become safe file names, never folders', () => {
    expect(fileNameFor('megy-quotes:Lola\'s 80th/party')).not.toMatch(/[/:\\]/);
  });

  it('the session store is this visit only', () => {
    const s = memoryStore();
    s.setItem('megy-fresh-start', '1');
    expect(s.getItem('megy-fresh-start')).toBe('1');
    expect(memoryStore().getItem('megy-fresh-start')).toBeNull();
  });
});

/** A made-up phone index: photos it has, and every call to it. */
function madeUpPhone(have: Record<string, Partial<PhotoHeader>>) {
  const calls: string[][] = [];
  const inspect = async (uris: string[]): Promise<PhotoHeader[]> => {
    calls.push(uris);
    return uris.map((uri) => ({ uri, readable: uri in have, size: 0, width: 0, height: 0, colorSpace: 'sRGB IEC61966-2.1', needsSrgb: false, ...have[uri] }));
  };
  return { inspect, calls };
}

const draftPhoto = (n: number, over: Partial<DraftPhoto> = {}): DraftPhoto => ({
  key: `media:${n}`, source: 'gallery', uri: `content://media/external/images/media/${n}`, name: `IMG_${n}.jpg`,
  width: 4000, height: 3000, capturedAt: Date.UTC(2026, 9, 1, 9, n), modifiedAt: null, addedAt: 1, ...over,
});

describe('the photo store: where each photo is, never a copy', () => {
  it('keeps the address and facts, and says the colour space (sRGB or not) for the print step', async () => {
    const p = toPickedPhoto(draftPhoto(1));
    const phone = madeUpPhone({ [p.uri]: { colorSpace: 'Display P3', needsSrgb: true } });
    const kv = memoryStore();
    const store = createPhotoStore(kv, phone.inspect, { saveDelayMs: 0 });
    const kept = await store.store(p, 'photo-1');
    expect(kept).toEqual({ id: 'photo-1', name: 'IMG_1.jpg', type: 'image/jpeg', size: 0, width: 4000, height: 3000 });
    expect(store.records()[0]).toMatchObject({ id: 'photo-1', uri: p.uri, colorSpace: 'Display P3', needsSrgb: true });
    // Read back: shown from where it is on the phone.
    expect((await store.get('photo-1'))?.url).toBe(p.uri);
  });

  it('a photo deleted from the phone reads back as missing (null), so the album says so', async () => {
    const p = toPickedPhoto(draftPhoto(2));
    const have: Record<string, Partial<PhotoHeader>> = { [p.uri]: {} };
    const store = createPhotoStore(memoryStore(), madeUpPhone(have).inspect, { saveDelayMs: 0 });
    expect(await store.store(p, 'photo-2')).not.toBeNull();
    expect((await store.get('photo-2'))?.url).toBe(p.uri);
    delete have[p.uri]; // deleted in the phone's gallery while the app was closed
    expect(await store.get('photo-2')).toBeNull();
    expect(await store.get('never-kept')).toBeNull();
  });

  it('the index outlives a restart (written soon after a change, and at once when the app leaves)', async () => {
    const p = toPickedPhoto(draftPhoto(3));
    const phone = madeUpPhone({ [p.uri]: {} });
    const kv = memoryStore();
    const store = createPhotoStore(kv, phone.inspect, { saveDelayMs: 60_000 });
    await store.store(p, 'photo-3');
    expect(kv.getItem(PHOTO_INDEX_KEY)).toBeNull(); // not yet
    store.flush(); // the app went to the background
    const reopened = createPhotoStore(kv, phone.inspect);
    expect(reopened.records().map((r) => r.uri)).toEqual([p.uri]);
    expect((await reopened.get('photo-3'))?.url).toBe(p.uri);
    await reopened.deleteMany(['photo-3']);
    expect(reopened.records()).toEqual([]);
  });

  it('asks the phone about many photos in ONE call', async () => {
    const photos = [4, 5, 6, 7].map((n) => toPickedPhoto(draftPhoto(n)));
    const phone = madeUpPhone(Object.fromEntries(photos.map((p) => [p.uri, {}])));
    const store = createPhotoStore(memoryStore(), phone.inspect, { saveDelayMs: 0 });
    await Promise.all(photos.map((p, i) => store.store(p, `id-${i}`)));
    expect(phone.calls).toHaveLength(1);
    expect(phone.calls[0]).toHaveLength(4);
  });

  it('does not keep a photo the phone says it can\'t open (deleted, or access taken back)', async () => {
    const p = toPickedPhoto(draftPhoto(9));
    const store = createPhotoStore(memoryStore(), madeUpPhone({}).inspect, { saveDelayMs: 0 });
    expect(await store.store(p, 'photo-9')).toBeNull();
    expect(store.records()).toEqual([]);
  });

  it('uses what the phone just said about a photo (no second ask)', async () => {
    const header: PhotoHeader = { uri: 'content://media/external/images/media/10', readable: true, size: 2_345_678, width: 0, height: 0, colorSpace: 'Display P3', needsSrgb: true };
    const p = toPickedPhoto(draftPhoto(10), header.size, header);
    const phone = madeUpPhone({ [p.uri]: {} });
    const store = createPhotoStore(memoryStore(), phone.inspect, { saveDelayMs: 0 });
    expect(await store.store(p, 'photo-10')).toMatchObject({ id: 'photo-10', size: 2_345_678 });
    expect(phone.calls).toEqual([]);
    expect(store.records()[0]).toMatchObject({ colorSpace: 'Display P3', needsSrgb: true });
  });

  it('only takes the phone\'s own photos (a website File has no address)', async () => {
    const store = createPhotoStore(memoryStore(), madeUpPhone({}).inspect);
    expect(await store.store({ name: 'a.jpg', size: 1, type: 'image/jpeg' })).toBeNull();
  });
});

describe('the photo intake', () => {
  const p = toPickedPhoto(draftPhoto(8, { capturedAt: 1_700_000_000_000 }));
  const phone = madeUpPhone({ [p.uri]: { width: 1200, height: 1600 } });
  const intake = createPhotoIntake(phone.inspect);

  it('answers from what was read when the photo was picked', async () => {
    expect(await intake.getImageDimensions(p)).toEqual({ width: 4000, height: 3000 });
    expect(await intake.captureTime(p)).toBe(1_700_000_000_000);
    expect(intake.previewUrlOf(p)).toBe(p.uri);
  });

  it('asks the phone when the size was not known', async () => {
    expect(await intake.getImageDimensions({ ...p, width: 0, height: 0 } as typeof p)).toEqual({ width: 1200, height: 1600 });
    expect(await intake.pictureSize(p.uri)).toEqual({ width: 1200, height: 1600 });
    expect(await intake.pictureSize('content://gone/1')).toBeNull();
  });

  it('HEIC goes in by its address: Android opens it, nothing is converted', async () => {
    const heic = toPickedPhoto(draftPhoto(9, { name: 'IMG_9.HEIC', mimeType: 'image/heic' }));
    expect(intake.looksHeic(heic)).toBe(false);
    expect(await intake.toAlbumPhoto(heic)).toBe(heic);
    expect(heic.type).toBe('image/heic');
  });

  it('every address is checked again when an album opens (a photo can be deleted between visits)', () => {
    expect(intake.urlNeedsReload(p.uri)).toBe(true);
  });

  it('a gallery photo with no type is still a photo; the file size is filled in from the phone', () => {
    expect(toPickedPhoto(draftPhoto(10, { name: 'Screenshot_1.png' })).type).toBe('image/png');
    expect(toPickedPhoto(draftPhoto(11, { name: 'no-extension' })).type).toBe('image/jpeg');
    expect(toPickedPhoto(draftPhoto(12), 123_456).size).toBe(123_456);
    expect(toPickedPhoto(draftPhoto(13, { size: 99 }), 123_456).size).toBe(99);
  });
});

describe('the platform', () => {
  it('writes the photo index when the app leaves, then tells the builder', () => {
    let leave: (() => void) | null = null;
    const kv = memoryStore();
    const platform = createAppPlatform({
      deviceStore: kv, sessionStore: memoryStore(), inspect: async () => null,
      lifecycle: { onLeave: (fn) => { leave = fn; return () => {}; }, onReturn: () => () => {} },
      measurer: () => null, client: {} as never, useUser: () => null,
    });
    const order: string[] = [];
    platform.lifecycle.onLeave(() => order.push('builder saved'));
    leave!();
    expect(kv.getItem(PHOTO_INDEX_KEY)).toBe('[]');
    expect(order).toEqual(['builder saved']);
    expect(platform.faces).toBeDefined();
    expect(platform.photoCheck.available()).toBe(false);
    expect(platform.textMeasurer()).toBeNull(); // until the fonts load
  });
});
