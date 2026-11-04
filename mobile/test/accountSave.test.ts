/* ══════════════════════════════════════════════════════════════════════════
   THE ALBUM GOES TO THE ACCOUNT, AND ANOTHER DEVICE OPENS IT (2.0, Phase 3).

   Signed in, the app saves the album the website's way: the builder's
   manualSave → lib/albumCloud useAlbumSyncWith → saveAlbumRowWith →
   serializeAlbum, the ONE albums write the website uses too, with the app's
   own client. Here the client is a made-up Supabase holding an albums table
   in memory (no network, never the live project: Docker's engine did not
   answer on this PC, so no local Supabase ran; see the plan doc).

   Then a SECOND device signed in to the same account opens the album by its
   id with the same builder (loadAlbum → deserializeAlbum, the code the
   website runs when an album is opened from Your Projects): the same pages,
   the photos' names, sizes and times, the cover and the occasion; every
   photo shows as missing there (its pixels stay on the phone), so adding the
   same photos on that device puts each back in its place (photoRelink).
   ══════════════════════════════════════════════════════════════════════════ */
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'test-renderer';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useBuilderState, type BuilderActions } from '@web/pages/builder/useBuilderState';
import { BuilderPlatformContext } from '@web/shared/platform';
import { deserializeAlbum } from '@web/lib/albumCloud';
import { SCENARIOS, seeded, type Scenario } from '../../tools/parity/scenarios';
import { createAppPlatform, type AppPlatform } from '../src/builder/appPlatform';
import { fileKeyValueStore, memoryStore, type SyncFiles } from '../src/builder/deviceStore';
import type { PhotoHeader } from '../src/builder/appPhotos';
import { chooseCover, makeAlbum, nameAlbum, occasionOf, syncPhotos } from '../src/builder/albumFlow';
import { addPhotos, emptyDraft, type DraftPhoto } from '../src/lib/photoDraft';
import { useAccountSave } from '../src/builder/accountSave';
import { useDraftFollowsAlbum } from '../src/lib/draftFollowsAlbum';

type Row = Record<string, unknown>;

/** A made-up Supabase: auth with a saved sign-in, and the albums table in
 *  memory, answering the query shapes lib/albumCloud uses. updated_at is set
 *  by "the database" on every write, as 0001/0040 do. */
function madeUpSupabase(userId: string | null | (() => string | null), table: Row[], log: string[]) {
  const signedIn = typeof userId === 'function' ? userId : () => userId;
  let clock = Date.UTC(2026, 9, 29, 3, 0);
  const stamp = () => new Date(clock += 1000).toISOString();
  const query = (op: 'select' | 'insert' | 'update' | 'delete', payload?: Row) => {
    const where: [string, unknown][] = [];
    let ordered = false;
    let limit = Infinity;
    const run = (): { data: Row[]; error: null | { code: string; message: string } } => {
      if (op === 'insert') {
        if (table.some((r) => r.id === payload!.id)) return { data: [], error: { code: '23505', message: 'duplicate key' } };
        const row: Row = { ...payload!, created_at: stamp(), updated_at: stamp() };
        table.push(row);
        log.push(`insert ${String(row.id)}`);
        return { data: [row], error: null };
      }
      let rows = table.filter((r) => where.every(([k, v]) => r[k] === v));
      if (op === 'update') {
        rows.forEach((r) => Object.assign(r, payload, { updated_at: stamp() }));
        log.push(`update ${rows.length}`);
      }
      if (op === 'delete') { rows.forEach((r) => table.splice(table.indexOf(r), 1)); }
      if (ordered) rows = [...rows].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
      return { data: rows.slice(0, limit), error: null };
    };
    const chain = {
      select: () => chain,
      eq: (k: string, v: unknown) => { where.push([k, v]); return chain; },
      order: () => { ordered = true; return chain; },
      limit: (n: number) => { limit = n; return chain; },
      maybeSingle: async () => { const r = run(); return { data: r.data[0] ?? null, error: r.error }; },
      single: async () => { const r = run(); return { data: r.data[0] ?? null, error: r.error }; },
      then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad),
    };
    return chain;
  };
  return {
    auth: { getSession: async () => { const id = signedIn(); return { data: { session: id ? { user: { id } } : null } }; } },
    from: (t: string) => {
      if (t !== 'albums') throw new Error(`no table ${t} in this made-up database`);
      return {
        select: () => query('select'),
        insert: (r: Row) => query('insert', r),
        update: (r: Row) => query('update', r),
        delete: () => query('delete'),
      };
    },
  } as unknown as SupabaseClient;
}

function memoryFiles(): SyncFiles {
  const files = new Map<string, string>();
  return { read: (n) => files.get(n) ?? null, write: (n, t) => { files.set(n, t); }, move: (a, b) => { files.set(b, files.get(a)!); files.delete(a); }, remove: (n) => { files.delete(n); } };
}

const uriOf = (i: number) => `content://media/external/images/media/${7000 + i}`;
function phoneFor(sc: Scenario, has = true) {
  return async (uris: string[]): Promise<PhotoHeader[]> => uris.map((uri) => {
    const i = Number(uri.split('/').pop()) - 7000;
    const p = has ? sc.photos[i] : undefined;
    return { uri, readable: !!p, size: p?.size ?? 0, width: p?.width ?? 0, height: p?.height ?? 0, colorSpace: null, needsSrgb: false };
  });
}

function devicePlatform(client: SupabaseClient, userId: string | null, inspect: ReturnType<typeof phoneFor>, files: SyncFiles = memoryFiles()): AppPlatform {
  return createAppPlatform({
    deviceStore: fileKeyValueStore(files), sessionStore: memoryStore(), inspect,
    lifecycle: { onLeave: () => () => {}, onReturn: () => () => {} },
    measurer: () => null, client, useUser: () => (userId ? { id: userId } : null),
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

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(async () => { for (const r of roots.splice(0)) await act(async () => { r.unmount(); }); });

const sc = SCENARIOS[0];
const draft = (): DraftPhoto[] => addPhotos(emptyDraft(), sc.photos.map((p, i) => ({
  key: `media:${7000 + i}`, source: 'gallery' as const, uri: uriOf(i), name: p.name, width: p.width, height: p.height,
  capturedAt: p.capturedAt, modifiedAt: null, addedAt: i,
})), 1).draft.photos;

async function makeOnPhone(client: SupabaseClient, userId: string | null, files?: SyncFiles) {
  const inspect = phoneFor(sc);
  const platform = devicePlatform(client, userId, inspect, files);
  const b = await open('phone', platform);
  await act(async () => { nameAlbum(b(), platform.deviceStore, sc.title, sc.occasion, platform.occasionChanged); });
  await act(async () => { b().setAlbumSize(sc.size); });
  await act(async () => { await syncPhotos(b(), draft(), inspect); });
  for (let i = 0; i < 50 && b().uploadedPhotos.some((p) => !(p.width > 0)); i++) await settle();
  await act(async () => { chooseCover(b(), b().uploadedPhotos.find((p) => p.name === sc.cover)!.id); });
  const spy = jest.spyOn(Math, 'random').mockImplementation(seeded(sc.seed));
  try { await act(async () => { await makeAlbum(b()); }); } finally { spy.mockRestore(); }
  await settle();
  return { b, platform };
}

describe('the album on the phone', () => {
  it('survives the app being closed: the same album opens again, its photos where they are', async () => {
    const files = memoryFiles();
    const nobody = madeUpSupabase(null, [], []);
    const { b, platform } = await makeOnPhone(nobody, null, files);
    const before = { pages: b().albumPages, photos: b().uploadedPhotos.map((p) => [p.id, p.name, p.previewUrl]), title: b().albumTitle, cover: b().coverFront };
    // The app goes to the background: the builder saves now (lifecycle.onLeave → saveDraftNow).
    await act(async () => { b().saveDraftNow(); platform.photoStore.flush(); });
    for (const r of roots.splice(0)) await act(async () => { r.unmount(); });

    // Opened again: a new platform on the same files, the same photos on the phone.
    const again = await open('again', devicePlatform(nobody, null, phoneFor(sc), files));
    await settle();
    expect(again().albumTitle).toBe(before.title);
    expect(again().albumSize).toBe(sc.size);
    expect(again().albumPages.map((p) => [p.templateId, p.slotFills])).toEqual(before.pages.map((p) => [p.templateId, p.slotFills]));
    expect(again().uploadedPhotos.map((p) => [p.id, p.name, p.previewUrl])).toEqual(before.photos);
    expect((again().coverFront.background as { photoId?: string }).photoId).toBe((before.cover.background as { photoId?: string }).photoId);
  }, 120_000);

  it('a photo deleted from the phone while the app was closed shows as missing when the album opens', async () => {
    const files = memoryFiles();
    const nobody = madeUpSupabase(null, [], []);
    const { b, platform } = await makeOnPhone(nobody, null, files);
    await act(async () => { b().saveDraftNow(); platform.photoStore.flush(); });
    const gone = b().uploadedPhotos[5];
    for (const r of roots.splice(0)) await act(async () => { r.unmount(); });
    const has = phoneFor(sc);
    const phoneWithout = async (uris: string[]) => (await has(uris)).map((h) => (h.uri === gone.previewUrl ? { ...h, readable: false } : h));
    const again = await open('again2', devicePlatform(nobody, null, phoneWithout, files));
    await settle();
    expect(again().uploadedPhotos.find((p) => p.id === gone.id)?.previewUrl).toBe('');
    expect(again().uploadedPhotos.filter((p) => !p.previewUrl)).toHaveLength(1);
  }, 120_000);
});

describe('signing in saves the album on the phone (accountSave.useAccountSave), never into another account', () => {
  /** The app's builder with the whole app's sign-in save (BuilderProvider), signed in as `who`. */
  const who: { id: string | null } = { id: null };
  /** What the picked photos became each time the album on the phone changed (BuilderProvider). */
  const picked: DraftPhoto[][] = [];
  function SignedInProbe({ name, platform }: { name: string; platform: AppPlatform }) {
    const b = useBuilderState();
    useAccountSave(b, platform.deviceStore, !!b.user);
    useDraftFollowsAlbum(b.getAlbumId, b.isLoadingCloud, b.uploadedPhotos, (d) => { picked.push(d); }, (id) => platform.photoStore.records().find((r) => r.id === id)?.uri);
    useEffect(() => { builders[name] = b; });
    return null;
  }
  async function phoneFor2(table: Row[], log: string[]) {
    // The phone answers about its photos when `gate.wait` lets it (a real
    // phone takes a moment: loadAlbum waits for it with the pages already in).
    const gate: { wait: Promise<void> | null } = { wait: null };
    const onPhone = phoneFor(sc);
    const inspect = async (uris: string[]) => { if (gate.wait) await gate.wait; return onPhone(uris); };
    const files = memoryFiles();
    // The saved sign-in is whoever is signed in now (reset asks it directly).
    const client = madeUpSupabase(() => who.id, table, log);
    const platformOn = () => createAppPlatform({
      deviceStore: fileKeyValueStore(files), sessionStore: memoryStore(), inspect,
      lifecycle: { onLeave: () => () => {}, onReturn: () => () => {} },
      measurer: () => null, client, useUser: () => (who.id ? { id: who.id } : null),
    });
    let platform = platformOn();
    let root = createRoot();
    roots.push(root);
    const draw = () => act(async () => { root.render(createElement(BuilderPlatformContext.Provider, { value: platform }, createElement(SignedInProbe, { name: 'shared', platform }))); });
    await draw();
    await settle();
    const b = () => builders.shared;
    const make = async (title = sc.title, size = sc.size) => {
      await act(async () => { nameAlbum(b(), platform.deviceStore, title, sc.occasion, platform.occasionChanged); });
      await act(async () => { b().setAlbumSize(size); });
      await act(async () => { await syncPhotos(b(), draft(), inspect); });
      for (let i = 0; i < 50 && b().uploadedPhotos.some((p) => !(p.width > 0)); i++) await settle();
      await act(async () => { chooseCover(b(), b().uploadedPhotos.find((p) => p.name === sc.cover)!.id); });
      const spy = jest.spyOn(Math, 'random').mockImplementation(seeded(sc.seed));
      try { await act(async () => { await makeAlbum(b()); }); } finally { spy.mockRestore(); }
      await settle();
    };
    const signIn = async (id: string | null) => { who.id = id; await draw(); await settle(); await settle(); };
    /** The app closed (its album saved on the phone) and opened again. */
    const relaunch = async () => {
      await act(async () => { b().saveDraftNow(); platform.photoStore.flush(); });
      await act(async () => { root.unmount(); });
      roots.splice(roots.indexOf(root), 1);
      platform = platformOn();
      root = createRoot();
      roots.push(root);
      await draw();
      for (let i = 0; i < 3; i++) await settle();
    };
    return { b, make, signIn, gate, relaunch };
  }

  it('an album opened from My albums is not saved again when the app opens next: nobody changed it ("Changed just now", round 4)', async () => {
    const table: Row[] = [];
    const log: string[] = [];
    who.id = 'user-a';
    const { b, make, relaunch } = await phoneFor2(table, log);
    await make();
    const firstId = b().getAlbumId()!;
    await act(async () => { b().reset(); });
    await settle();
    await new Promise((r) => setTimeout(r, 5));
    await make('Second album', sc.size === '6x6' ? '8x8' : '6x6');
    await act(async () => { await b().loadAlbum(firstId); });
    await settle();
    expect(b().getAlbumId()).toBe(firstId);
    const first = table.find((r) => r.id === firstId)!;
    const before = first.updated_at;
    await relaunch();
    expect(b().getAlbumId()).toBe(firstId);
    expect(first.updated_at).toBe(before);
  }, 120_000);

  it('"Start a new album" puts the album away without saving it again when nobody changed it; a change still goes (round 4b)', async () => {
    const table: Row[] = [];
    const log: string[] = [];
    who.id = 'user-a';
    const { b, make } = await phoneFor2(table, log);
    await make();
    const firstId = b().getAlbumId()!;
    const rowOf = (id: string) => table.find((r) => r.id === id)!;
    const before = rowOf(firstId).updated_at;
    await act(async () => { b().reset(); });
    await settle();
    expect(b().getAlbumId()).not.toBe(firstId);
    expect(rowOf(firstId).updated_at).toBe(before);

    // Opened again from My albums and renamed: putting it away saves the new name.
    await act(async () => { await b().loadAlbum(firstId); });
    await settle();
    expect(rowOf(firstId).updated_at).toBe(before);
    await act(async () => { b().setAlbumTitle('First album, renamed'); });
    await act(async () => { b().reset(); });
    await settle();
    expect(rowOf(firstId).title).toBe('First album, renamed');
  }, 120_000);

  it('opening another album (My albums) never saves its pages into the album that was on the phone (round 3)', async () => {
    const table: Row[] = [];
    const log: string[] = [];
    who.id = 'user-a';
    const { b, make, gate } = await phoneFor2(table, log);
    await make();
    const firstId = b().getAlbumId()!;
    // A second album, another size, made on the same phone with the same photos.
    await act(async () => { b().reset(); });
    await settle();
    await new Promise((r) => setTimeout(r, 5)); // made at another moment (madeAt)
    const otherSize = sc.size === '6x6' ? '8x8' : '6x6';
    await make('Second album', otherSize);
    const secondId = b().getAlbumId()!;
    expect(secondId).not.toBe(firstId);
    const rowOf = (id: string) => table.find((r) => r.id === id)!;
    const second = JSON.parse(JSON.stringify(rowOf(secondId)));
    const first = JSON.parse(JSON.stringify(rowOf(firstId)));
    expect(second.album_size).not.toBe(first.album_size);

    // Open the first album while the phone takes its time over the photos.
    let letGo!: () => void;
    gate.wait = new Promise<void>((r) => { letGo = r; });
    let opening!: Promise<void>;
    await act(async () => { opening = b().loadAlbum(firstId); });
    await settle();
    await settle();
    gate.wait = null;
    letGo();
    await act(async () => { await opening; });
    await settle();

    expect(b().getAlbumId()).toBe(firstId);
    // The picked photos are the opened album's own (here the same phone photos), once.
    expect(picked.at(-1)!.map((p) => p.name).sort()).toEqual(b().uploadedPhotos.map((p) => p.name).sort());
    // The second album's row still holds its own pages and size.
    const after = rowOf(secondId);
    expect(after.pages).toEqual(second.pages);
    expect(after.album_size).toBe(second.album_size);
    // Nobody changed either album: neither is saved again ("Changed just now"
    // on both cards, and My albums reordered, for albums nobody touched).
    expect(after.updated_at).toBe(second.updated_at);
    expect(rowOf(firstId).updated_at).toBe(first.updated_at);
    // The first album's row holds its own pages too.
    expect(rowOf(firstId).pages).toEqual(first.pages);

    // A change not yet in the account still goes there before another album opens.
    await act(async () => { b().setAlbumTitle('First album, renamed'); });
    await act(async () => { await b().loadAlbum(secondId); });
    await settle();
    expect(b().getAlbumId()).toBe(secondId);
    expect(rowOf(firstId).title).toBe('First album, renamed');
    // Its own layout (opened, its pages carry the empty lists an open adds).
    const layout = (pages: unknown) => (pages as { templateId: string; slotFills: unknown }[]).map((p) => [p.templateId, p.slotFills]);
    expect(layout(rowOf(firstId).pages)).toEqual(layout(first.pages));
  }, 120_000);

  it('made signed out, then signed in: it goes to that account, once', async () => {
    const table: Row[] = [];
    const log: string[] = [];
    who.id = null;
    const { b, make, signIn } = await phoneFor2(table, log);
    await make();
    expect(table).toEqual([]);
    await signIn('user-a');
    expect(table.map((r) => [r.user_id, r.title])).toEqual([['user-a', sc.title]]);
    expect(table[0].id).toBe(b().getAlbumId());
  }, 120_000);

  it('another account signing in on the same phone never gets the album on it (the builder gives it a fresh album)', async () => {
    const table: Row[] = [];
    const log: string[] = [];
    who.id = 'user-a';
    const { b, make, signIn } = await phoneFor2(table, log);
    await make();
    expect(table.map((r) => r.user_id)).toEqual(['user-a']);
    picked.length = 0;
    await signIn(null);
    await signIn('user-b');
    expect(table.filter((r) => r.user_id === 'user-b')).toEqual([]);
    // The photos A picked are not B's picked photos either ("Continue my album" carried them, round 3).
    expect(picked).toEqual([[]]);
    // B has a fresh album: blank pages, none of A's photos or title.
    expect(b().albumTitle).not.toBe(sc.title);
    expect(b().albumPages.some((p) => (p.slotFills ?? []).some((f) => f != null))).toBe(false);
  }, 120_000);
});

describe('the album in the account', () => {
  it('signed out: nothing is written anywhere but the phone', async () => {
    const table: Row[] = [];
    const log: string[] = [];
    const { b } = await makeOnPhone(madeUpSupabase(null, table, log), null);
    let saved = true;
    await act(async () => { saved = await b().manualSave(); });
    expect(saved).toBe(false);
    expect(table).toEqual([]);
    expect(log).toEqual([]);
  }, 120_000);

  it('signed in: the website\'s albums row, and a second device opens it as layout and photo facts', async () => {
    const table: Row[] = [];
    const log: string[] = [];
    const { b, platform } = await makeOnPhone(madeUpSupabase('user-a', table, log), 'user-a');
    let saved = false;
    await act(async () => { saved = await b().manualSave(); });
    await settle();
    expect(saved).toBe(true);
    expect(table).toHaveLength(1);
    const row = table[0];
    // The row the website writes: its columns, the account, the album's id.
    expect(row).toMatchObject({ user_id: 'user-a', id: b().getAlbumId(), title: sc.title, album_size: sc.size, occasion: sc.occasion });
    expect(row.pages).toEqual(b().albumPages);
    // Photos: facts only (name, bytes, pixels, time), never where they are on the phone.
    const photos = row.photos as Row[];
    expect(photos).toHaveLength(sc.photos.length);
    expect(photos.map((p) => p.name)).toEqual(b().uploadedPhotos.map((p) => p.name));
    expect(photos.every((p) => typeof p.size === 'number' && (p.size as number) > 0 && (p.width as number) > 0)).toBe(true);
    expect(JSON.stringify(photos)).not.toContain('content://');
    expect(photos.every((p) => !('previewUrl' in p))).toBe(true);
    expect((row.cover_front as { background?: { photoId?: string } }).background?.photoId).toBe(b().uploadedPhotos.find((p) => p.name === sc.cover)!.id);
    expect(occasionOf(platform.deviceStore)).toBe(sc.occasion);

    // A second device, same account, none of the photos: opens it by its id.
    const other = devicePlatform(madeUpSupabase('user-a', table, log), 'user-a', phoneFor(sc, false));
    const second = await open('second', other);
    await act(async () => { await second().loadAlbum(String(row.id)); });
    await settle();
    expect(second().albumTitle).toBe(sc.title);
    expect(second().albumSize).toBe(sc.size);
    // The same pages (the builder fills in its empty lists as it opens any album).
    const layout = (pages: BuilderActions['albumPages']) => pages.map((p) => [p.id, p.templateId, p.slotFills, p.slotScales, p.slotOffsetsX, p.slotOffsetsY, p.textElements, p.background]);
    expect(layout(second().albumPages)).toEqual(layout(deserializeAlbum(row).pages as unknown as BuilderActions['albumPages']));
    expect(layout(second().albumPages)).toEqual(layout(b().albumPages));
    expect(second().uploadedPhotos.map((p) => [p.name, p.size, p.width, p.height, p.capturedAt ?? null]))
      .toEqual(b().uploadedPhotos.map((p) => [p.name, p.size, p.width, p.height, p.capturedAt ?? null]));
    // The photos are missing there: shown as such, waiting to be added again.
    expect(second().uploadedPhotos.every((p) => !p.previewUrl)).toBe(true);
    expect((second().coverFront.background as { photoId?: string }).photoId).toBe((b().coverFront.background as { photoId?: string }).photoId);
    expect(occasionOf(other.deviceStore)).toBe(sc.occasion);

    // A change on the phone saves onto the same row, on its version (never a new row).
    await act(async () => { b().setAlbumTitle('Maria and Jun'); });
    await act(async () => { saved = await b().manualSave(); });
    expect(saved).toBe(true);
    expect(table).toHaveLength(1);
    expect(table[0].title).toBe('Maria and Jun');
    expect(log).toEqual(['insert ' + String(row.id), 'update 1']);
  }, 120_000);
});
