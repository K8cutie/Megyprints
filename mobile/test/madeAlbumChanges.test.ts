/* ══════════════════════════════════════════════════════════════════════════
   CHANGING THE PHOTOS OR THE SIZE AFTER THE ALBUM IS MADE (2.0, Phase 3
   review fixes).

   The customer can go back from the Preview to the Photos and Size steps.
   On the real shared builder, on the app's platform, through the app's own
   steps (albumFlow):
     • taking a photo out of a made album never moves the others: pages point
       at photos by their place in the builder's list, so the photo is left
       out (the website's way), every frame keeps its photo, and the album
       still opens after a restart (it used to read as broken and be deleted);
     • photos added to a made album wait for "Make the album again";
     • a size tap on a made album asks first and lays every page out again
       for the new shape (it used to set the size alone, the old layout
       squashed onto it);
     • a photo the album is missing on this phone, picked again, goes back in
       its own place (it used to be taken out and added at the end);
     • the same photo picked twice goes in once, a photo the phone can't open
       doesn't go in, and the Photos step's count says so.
   ══════════════════════════════════════════════════════════════════════════ */
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'test-renderer';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useBuilderState, type BuilderActions } from '@web/pages/builder/useBuilderState';
import { BuilderPlatformContext } from '@web/shared/platform';
import { getTemplatesForAlbum } from '@web/pages/builder/pageTemplates';
import { photosShortBy } from '@web/pages/builder/albumMinimum';
import { SCENARIOS, seeded, type Scenario, type ScenarioPhoto } from '../../tools/parity/scenarios';
import { createAppPlatform, type AppPlatform } from '../src/builder/appPlatform';
import { fileKeyValueStore, memoryStore, type SyncFiles } from '../src/builder/deviceStore';
import type { PhotoHeader } from '../src/builder/appPhotos';
import { albumMade, chooseCover, coverStepNext, makeAlbum, nameAlbum, pagesHoldPhotos, photosIn, resizeMadeAlbum, sizeTap, syncNote, syncPhotos } from '../src/builder/albumFlow';
import { addPhotos, emptyDraft, type DraftPhoto } from '../src/lib/photoDraft';

function memoryFiles(): SyncFiles {
  const files = new Map<string, string>();
  return { read: (n) => files.get(n) ?? null, write: (n, t) => { files.set(n, t); }, move: (a, b) => { files.set(b, files.get(a)!); files.delete(a); }, remove: (n) => { files.delete(n); } };
}

/** A made-up phone: the photos on it by address, and the ones deleted from it. */
function madeUpPhone() {
  const photos = new Map<string, ScenarioPhoto>();
  const deleted = new Set<string>();
  const inspect = async (uris: string[]): Promise<PhotoHeader[]> => uris.map((uri) => {
    const p = deleted.has(uri) ? undefined : photos.get(uri);
    return { uri, readable: !!p, size: p?.size ?? 0, width: p?.width ?? 0, height: p?.height ?? 0, colorSpace: null, needsSrgb: false };
  });
  return { photos, deleted, inspect };
}
type Phone = ReturnType<typeof madeUpPhone>;

const nobody = {
  auth: { getSession: async () => ({ data: { session: null } }) },
  from: () => {
    const chain = { select: () => chain, eq: () => chain, order: () => chain, limit: () => chain, maybeSingle: async () => ({ data: null, error: null }) };
    return chain;
  },
} as unknown as SupabaseClient;

function platformOn(phone: Phone, files: SyncFiles): AppPlatform {
  return createAppPlatform({
    deviceStore: fileKeyValueStore(files), sessionStore: memoryStore(), inspect: phone.inspect,
    lifecycle: { onLeave: () => () => {}, onReturn: () => () => {} },
    measurer: () => null, client: nobody, useUser: () => null,
  });
}

const builders: Record<string, BuilderActions> = {};
function Probe({ name }: { name: string }) {
  const b = useBuilderState();
  useEffect(() => { builders[name] = b; });
  return null;
}
const settle = () => act(async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); });
const roots: Root[] = [];
async function open(name: string, platform: AppPlatform) {
  const root = createRoot();
  roots.push(root);
  await act(async () => { root.render(createElement(BuilderPlatformContext.Provider, { value: platform }, createElement(Probe, { name }))); });
  await settle();
  return () => builders[name];
}
const closeAll = async () => { for (const r of roots.splice(0)) await act(async () => { r.unmount(); }); };

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(closeAll);

/** The Photos step's draft for these photos, at these addresses (gallery
 *  photos: no file size from the phone's index). */
function draftOf(phone: Phone, list: { uri: string; p: ScenarioPhoto }[]): DraftPhoto[] {
  for (const { uri, p } of list) phone.photos.set(uri, p);
  return addPhotos(emptyDraft(), list.map(({ uri, p }, i) => ({
    key: `k:${uri}`, source: 'gallery' as const, uri, name: p.name, width: p.width, height: p.height,
    capturedAt: p.capturedAt, modifiedAt: null, addedAt: i,
  })), 1).draft.photos;
}
const at = (base: number) => (p: ScenarioPhoto, i: number) => ({ uri: `content://media/external/images/media/${base + i}`, p });

/** What every frame and caption box shows, by photo name (the customer's view of the pages). */
const frames = (b: BuilderActions) => b.albumPages.map((pg) => [...(pg.slotFills ?? []), ...(pg.textSlotFills ?? [])]
  .map((f) => (f == null ? null : b.uploadedPhotos[f]?.name ?? `#${f} (no photo)`)));

const addressOf = (platform: AppPlatform) => {
  const kept = new Map(platform.photoStore.records().map((r) => [r.id, r.uri]));
  return (id: string) => kept.get(id);
};

/** Name → Size → Photos → Cover → "Make my album", the app's steps. */
async function made(sc: Scenario, phone: Phone, files: SyncFiles, draft: DraftPhoto[]) {
  const platform = platformOn(phone, files);
  const b = await open('phone', platform);
  await act(async () => { nameAlbum(b(), platform.deviceStore, sc.title, sc.occasion, platform.occasionChanged); });
  await act(async () => { b().setAlbumSize(sc.size); });
  await act(async () => { await syncPhotos(b(), draft, phone.inspect, { addressOf: addressOf(platform) }); });
  for (let i = 0; i < 50 && b().uploadedPhotos.some((p) => !(p.width > 0)); i++) await settle();
  await act(async () => { chooseCover(b(), b().uploadedPhotos.find((p) => p.name === sc.cover)!.id); });
  const spy = jest.spyOn(Math, 'random').mockImplementation(seeded(sc.seed));
  try { await act(async () => { await makeAlbum(b()); }); } finally { spy.mockRestore(); }
  await settle();
  expect(albumMade(b().albumPages)).toBe(true);
  return { b, platform };
}

describe('taking photos out of a made album', () => {
  const sc = SCENARIOS[1]; // 57 photos, 6x8

  it('every frame keeps its photo; the photo is left out of the next making; the album opens again after a restart', async () => {
    const phone = madeUpPhone();
    const files = memoryFiles();
    const draft = draftOf(phone, sc.photos.map(at(5000)));
    const { b, platform } = await made(sc, phone, files, draft);
    const before = frames(b());
    const count = b().uploadedPhotos.length;
    const third = draft[2];

    // Back to the Photos step: × on the 3rd photo, then "Keep my pages →".
    let r!: Awaited<ReturnType<typeof syncPhotos>>;
    await act(async () => { r = await syncPhotos(b(), draft.filter((p) => p.key !== third.key), phone.inspect, { addressOf: addressOf(platform) }); });
    await settle();
    expect(r).toMatchObject({ removed: 0, leftOut: 1, added: 0, goingIn: count - 1 });
    expect(b().uploadedPhotos).toHaveLength(count); // never taken out of the list
    expect(frames(b())).toEqual(before); // no page shows another photo
    expect(b().uploadedPhotos.find((p) => p.name === third.name)?.leftOut).toBe(true);
    expect(photosIn(b())).toBe(count - 1);
    expect(coverStepNext(albumMade(b().albumPages), photosIn(b())).go).toBe('pages');

    // Closed and opened again: the same album (a page pointing past the
    // list's end used to read as broken, and the album was deleted).
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await act(async () => { b().saveDraftNow(); platform.photoStore.flush(); });
      await closeAll();
      const again = await open('again', platformOn(phone, files));
      await settle();
      expect(warn.mock.calls.flat().join(' ')).not.toMatch(/corrupted/i);
      expect(again().albumTitle).toBe(sc.title);
      expect(frames(again())).toEqual(before);
    } finally {
      warn.mockRestore();
    }
  }, 120_000);

  it('put back (Undo, or picked again), it comes back', async () => {
    const phone = madeUpPhone();
    const draft = draftOf(phone, sc.photos.map(at(5000)));
    const { b, platform } = await made(sc, phone, memoryFiles(), draft);
    const third = draft[2];
    await act(async () => { await syncPhotos(b(), draft.filter((p) => p.key !== third.key), phone.inspect, { addressOf: addressOf(platform) }); });
    await settle();
    let r!: Awaited<ReturnType<typeof syncPhotos>>;
    await act(async () => { r = await syncPhotos(b(), draft, phone.inspect, { addressOf: addressOf(platform) }); });
    await settle();
    expect(r.goingIn).toBe(sc.photos.length);
    expect(b().uploadedPhotos.find((p) => p.name === third.name)?.leftOut).toBe(false);
  }, 120_000);

  it('"Take out all" and new photos: the pages keep their photos until the album is made again, then show the new ones', async () => {
    const phone = madeUpPhone();
    const draft = draftOf(phone, sc.photos.map(at(5000)));
    const { b, platform } = await made(sc, phone, memoryFiles(), draft);
    const before = frames(b());
    const fresh = draftOf(phone, SCENARIOS[0].photos.map((p) => ({ ...p, name: `NEW_${p.name}` })).map(at(9000)));
    let r!: Awaited<ReturnType<typeof syncPhotos>>;
    await act(async () => { r = await syncPhotos(b(), fresh, phone.inspect, { addressOf: addressOf(platform) }); });
    for (let i = 0; i < 50 && b().uploadedPhotos.some((p) => !(p.width > 0)); i++) await settle();
    expect(r).toMatchObject({ leftOut: sc.photos.length, added: 40, goingIn: 40 });
    expect(frames(b())).toEqual(before); // the old pages, as they were

    // "Make the album again": laid out from the photos going in, the new ones.
    await act(async () => { await makeAlbum(b()); });
    await settle();
    const names = frames(b()).flat().filter((n): n is string => !!n);
    expect(names.length).toBeGreaterThan(0);
    expect(names.every((n) => n.startsWith('NEW_'))).toBe(true);
  }, 120_000);
});

describe('changing the size of a made album', () => {
  it('asks first (the website\'s words), then lays every page out again for the new shape', async () => {
    const sc = SCENARIOS[0]; // 40 photos, 8x8
    const phone = madeUpPhone();
    const draft = draftOf(phone, sc.photos.map(at(5000)));
    const { b } = await made(sc, phone, memoryFiles(), draft);
    const tap = sizeTap(b(), '6x8');
    expect(tap.kind).toBe('ask');
    const question = tap.kind === 'ask' ? tap.question : '';
    expect(question).toContain('lays out every page again for the new shape');
    expect(question).not.toMatch(/Say "yes"/);
    expect(sizeTap(b(), '8x8').kind).toBe('same');

    const square = new Set(getTemplatesForAlbum('8x8').map((t) => t.id));
    const tall = new Set(getTemplatesForAlbum('6x8').map((t) => t.id));
    expect(b().albumPages.every((p) => !p.templateId || square.has(p.templateId))).toBe(true);
    let r!: Awaited<ReturnType<typeof resizeMadeAlbum>>;
    await act(async () => { r = await resizeMadeAlbum(b(), '6x8'); });
    await settle();
    expect(r).toEqual({ done: true, message: 'Album size changed to 6×8. Every page is laid out again for the new shape.' });
    expect(b().albumSize).toBe('6x8');
    expect(b().coverFront.size).toBe('6x8');
    const pages = b().albumPages;
    const onTall = pages.filter((p) => p.templateId && tall.has(p.templateId)).length;
    console.log(`resized 8x8 → 6x8: ${pages.length} pages, ${onTall} on 6x8 layouts, ${pages.filter((p) => p.templateId && square.has(p.templateId)).length} on 8x8 layouts`);
    expect(onTall).toBe(pages.filter((p) => p.templateId).length);
    expect(pages.filter((p) => p.templateId && square.has(p.templateId) && !tall.has(p.templateId))).toHaveLength(0);
  }, 120_000);

  it('before any page holds a photo, a size tap just sets the size', async () => {
    const phone = madeUpPhone();
    const b = await open('fresh', platformOn(phone, memoryFiles()));
    expect(pagesHoldPhotos(b().albumPages, b().coverFront)).toBe(false);
    expect(sizeTap(b(), '6x8')).toEqual({ kind: 'set' });
  });
});

describe('a photo this phone no longer has', () => {
  it('picked again from another address, it goes back in its own place: nothing taken out, every frame the same', async () => {
    const sc = SCENARIOS[1];
    const phone = madeUpPhone();
    const files = memoryFiles();
    const draft = draftOf(phone, sc.photos.map(at(5000)));
    const { b, platform } = await made(sc, phone, files, draft);
    const before = frames(b());
    const gone = draft[6];
    await act(async () => { b().saveDraftNow(); platform.photoStore.flush(); });
    await closeAll();

    // Deleted from the phone while the app was closed: missing when it opens.
    phone.deleted.add(gone.uri);
    const platform2 = platformOn(phone, files);
    const again = await open('again', platform2);
    for (let i = 0; i < 20 && again().uploadedPhotos.find((p) => p.name === gone.name)?.previewUrl; i++) await settle();
    const missing = again().uploadedPhotos.find((p) => p.name === gone.name)!;
    expect(missing.previewUrl).toBe('');
    const place = again().uploadedPhotos.indexOf(missing);

    // The Photos step still lists it (old address), and the same photo is
    // picked again from Files (a copy elsewhere: another address, its size).
    const copy = { uri: 'content://com.android.providers.downloads.documents/document/msf%3A77', p: sc.photos[6] };
    phone.photos.set(copy.uri, copy.p);
    const withCopy = [...draft, { key: 'files:77', source: 'files' as const, uri: copy.uri, name: copy.p.name, width: copy.p.width, height: copy.p.height, capturedAt: copy.p.capturedAt, modifiedAt: null, addedAt: 99 }];
    let r!: Awaited<ReturnType<typeof syncPhotos>>;
    await act(async () => { r = await syncPhotos(again(), withCopy, phone.inspect, { addressOf: addressOf(platform2) }); });
    await settle();
    expect(r).toMatchObject({ removed: 0, leftOut: 0, added: 0, restored: 1, unreadable: 0 });
    expect(again().uploadedPhotos).toHaveLength(sc.photos.length);
    expect(again().uploadedPhotos[place]).toMatchObject({ id: missing.id, name: gone.name, previewUrl: copy.uri });
    expect(frames(again())).toEqual(before);
  }, 120_000);

  it('still listed under its old address only: it stays, missing (not counted as a newly picked photo that failed)', async () => {
    const sc = SCENARIOS[0];
    const phone = madeUpPhone();
    const files = memoryFiles();
    const draft = draftOf(phone, sc.photos.map(at(5000)));
    const { b, platform } = await made(sc, phone, files, draft);
    const before = frames(b());
    await act(async () => { b().saveDraftNow(); platform.photoStore.flush(); });
    await closeAll();
    phone.deleted.add(draft[3].uri);
    const platform2 = platformOn(phone, files);
    const again = await open('again', platform2);
    for (let i = 0; i < 20 && again().uploadedPhotos.find((p) => p.name === draft[3].name)?.previewUrl; i++) await settle();
    let r!: Awaited<ReturnType<typeof syncPhotos>>;
    await act(async () => { r = await syncPhotos(again(), draft, phone.inspect, { addressOf: addressOf(platform2) }); });
    await settle();
    expect(r).toMatchObject({ removed: 0, leftOut: 0, added: 0, unreadable: 0, goingIn: 40 });
    expect(frames(again())).toEqual(before);
  }, 120_000);
});

describe('the Photos step counts what went in', () => {
  it('the same photo picked twice goes in once: 40 picked, 39 in, "Add 1 more photo", and why', async () => {
    const sc = SCENARIOS[0];
    const phone = madeUpPhone();
    const list = sc.photos.map(at(5000));
    // Photo 40 is photo 6 again (same name and size), from another folder.
    list[39] = { uri: 'content://media/external/images/media/6040', p: { ...sc.photos[5] } };
    const draft = draftOf(phone, list);
    const b = await open('fresh', platformOn(phone, memoryFiles()));
    let r!: Awaited<ReturnType<typeof syncPhotos>>;
    await act(async () => { r = await syncPhotos(b(), draft, phone.inspect); });
    await settle();
    expect(r).toMatchObject({ added: 39, skipped: 1, goingIn: 39 });
    expect(photosShortBy(r.goingIn)).toBe(1);
    expect(syncNote(r)).toBe('1 photo is already in your album (the same photo picked twice), so it goes in once.');
    expect(b().uploadedPhotos).toHaveLength(39);
  });

  it('a photo the phone can\'t open is not put in, and is counted', async () => {
    const sc = SCENARIOS[0];
    const phone = madeUpPhone();
    const draft = draftOf(phone, sc.photos.map(at(5000)));
    phone.deleted.add(draft[10].uri); // revoked or deleted after it was picked
    const b = await open('fresh', platformOn(phone, memoryFiles()));
    let r!: Awaited<ReturnType<typeof syncPhotos>>;
    await act(async () => { r = await syncPhotos(b(), draft, phone.inspect); });
    await settle();
    expect(r).toMatchObject({ added: 39, unreadable: 1, goingIn: 39 });
    expect(syncNote(r)).toBe('1 photo could not be opened on this phone, so it is not in the album.');
    expect(b().uploadedPhotos.some((p) => p.previewUrl === draft[10].uri)).toBe(false);
  });
});
