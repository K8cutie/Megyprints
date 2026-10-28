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

type Row = Record<string, unknown>;

/** A made-up Supabase: auth with a saved sign-in, and the albums table in
 *  memory, answering the query shapes lib/albumCloud uses. updated_at is set
 *  by "the database" on every write, as 0001/0040 do. */
function madeUpSupabase(userId: string | null, table: Row[], log: string[]) {
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
    auth: { getSession: async () => ({ data: { session: userId ? { user: { id: userId } } : null } }) },
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
