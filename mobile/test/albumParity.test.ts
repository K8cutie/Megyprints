/* ══════════════════════════════════════════════════════════════════════════
   THE SAME ALBUM ON THE WEBSITE AND IN THE APP (2.0, Phase 3).

   For each scenario in tools/parity/scenarios.ts (a name, an occasion, a
   size, a roll of 40 to 120 made-up photos, the cover photo and the layout's
   seed), the website's builder makes the album on the website's own device
   pieces (tools/parity/webAlbums.spec.ts: vitest and jsdom, run again by this
   test every time), and this makes it the app's way:
     • the app's platform (src/builder/appPlatform: the file-backed device
       store over files in memory, the photo store and intake by address, the
       Skia caption measurer on CanvasKit, the account on a made-up Supabase
       with nobody signed in);
     • the photos as the Photos step has them (Phase 2 DraftPhotos, put in
       time order by photoDraft.addPhotos, no file sizes from the gallery
       index), into the builder by the app's own step (albumFlow.syncPhotos,
       which asks the phone for the sizes);
     • the app's steps for the name and occasion, the size, the cover tap and
       "Make my album" (albumFlow), the dice seeded the same as the website's
       just before generateAlbum, then the same caption written.
   Both albums must be the same in every page's layout (template id), every
   photo in every frame and caption box, every caption, the frames and pans,
   the background, and the cover (its photo and title).
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'test-renderer';
import { useBuilderState, type BuilderActions } from '@web/pages/builder/useBuilderState';
import { BuilderPlatformContext } from '@web/shared/platform';
import { useAlbumSyncWith } from '@web/lib/albumCloud';
import { SCENARIOS, summarize, seeded, firstCaptionBox, PARITY_CAPTION, type AlbumSummary, type Scenario } from '../../tools/parity/scenarios';
import { createAppPlatform, type AppPlatform } from '../src/builder/appPlatform';
import { fileKeyValueStore, memoryStore, type SyncFiles } from '../src/builder/deviceStore';
import type { PhotoHeader } from '../src/builder/appPhotos';
import { chooseCover, makeAlbum, nameAlbum, occasionOf, syncPhotos } from '../src/builder/albumFlow';
import { addPhotos, emptyDraft, type DraftPhoto } from '../src/lib/photoDraft';
import { PageText } from '../src/render/pageText';
import { skiaTextMeasurer } from '../src/builder/textMeasurer';
import { headlessSkia, fontFiles, REPO_ROOT } from './golden/headless';
import { drawPageImage } from '../src/builder/pageImages';

interface WebAlbums { albums: { scenario: string; album: AlbumSummary }[] }

/** The website's half, made now (it takes a few seconds). */
function websiteAlbums(): WebAlbums {
  execSync('npx vitest run --config tools/parity/vitest.config.ts', { cwd: REPO_ROOT, stdio: 'pipe', timeout: 300_000 });
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'tools', 'parity', 'out', 'web-albums.json'), 'utf8')) as WebAlbums;
}

function memoryFiles(): SyncFiles {
  const files = new Map<string, string>();
  return {
    read: (n) => files.get(n) ?? null,
    write: (n, t) => { files.set(n, t); },
    move: (a, b) => { files.set(b, files.get(a)!); files.delete(a); },
    remove: (n) => { files.delete(n); },
  };
}

const uriOf = (i: number) => `content://media/external/images/media/${5000 + i}`;

/** The phone the scenario's photos are on. */
function phoneFor(sc: Scenario) {
  const byUri = new Map(sc.photos.map((p, i) => [uriOf(i), p]));
  return async (uris: string[]): Promise<PhotoHeader[]> => uris.map((uri) => {
    const p = byUri.get(uri);
    return { uri, readable: !!p, size: p?.size ?? 0, width: p?.width ?? 0, height: p?.height ?? 0, colorSpace: 'sRGB IEC61966-2.1', needsSrgb: false };
  });
}

/** The Photos step's draft: what the gallery index gives (no file size; a
 *  photo with no time in it has its file's time). */
function draftFor(sc: Scenario): DraftPhoto[] {
  const picked: DraftPhoto[] = sc.photos.map((p, i) => ({
    key: `media:${5000 + i}`, source: 'gallery', uri: uriOf(i), name: p.name,
    width: p.width, height: p.height, capturedAt: p.capturedAt, modifiedAt: p.fileTime ?? null, addedAt: 1_000 + i,
  }));
  return addPhotos(emptyDraft(), picked, 2_000).draft.photos;
}

const nobody = {
  auth: { getSession: async () => ({ data: { session: null } }) },
  from: () => {
    const chain = { select: () => chain, eq: () => chain, order: () => chain, limit: () => chain, maybeSingle: async () => ({ data: null, error: null }) };
    return chain;
  },
} as unknown as Parameters<typeof useAlbumSyncWith>[0];

let builder!: BuilderActions;
function Probe() {
  const b = useBuilderState();
  useEffect(() => { builder = b; });
  return null;
}
const settle = () => act(async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); });

let web: WebAlbums;
let measurer: ReturnType<typeof skiaTextMeasurer>;
beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  web = websiteAlbums();
  measurer = skiaTextMeasurer(new PageText(await headlessSkia(), fontFiles()));
}, 300_000);

async function appAlbum(sc: Scenario): Promise<{ album: AlbumSummary; platform: AppPlatform; pages: BuilderActions['albumPages']; cover: BuilderActions['coverFront']; photos: BuilderActions['uploadedPhotos'] }> {
  const inspect = phoneFor(sc);
  const platform = createAppPlatform({
    deviceStore: fileKeyValueStore(memoryFiles()), sessionStore: memoryStore(), inspect,
    lifecycle: { onLeave: () => () => {}, onReturn: () => () => {} },
    measurer: () => measurer, client: nobody, useUser: () => null,
  });
  const root: Root = createRoot();
  await act(async () => { root.render(createElement(BuilderPlatformContext.Provider, { value: platform }, createElement(Probe))); });
  await settle();
  // The app's steps: name + occasion, size, photos, cover, "Make my album".
  await act(async () => { nameAlbum(builder, platform.deviceStore, sc.title, sc.occasion, platform.occasionChanged); });
  await act(async () => { builder.setAlbumSize(sc.size); });
  await act(async () => { await syncPhotos(builder, draftFor(sc), inspect); });
  for (let i = 0; i < 50 && builder.uploadedPhotos.some((p) => !(p.width > 0)); i++) await settle();
  const cover = builder.uploadedPhotos.find((p) => p.name === sc.cover);
  if (!cover) throw new Error(`${sc.name}: no cover photo ${sc.cover}`);
  await act(async () => { chooseCover(builder, cover.id); });
  const spy = jest.spyOn(Math, 'random').mockImplementation(seeded(sc.seed));
  try {
    await act(async () => { await makeAlbum(builder); });
  } finally {
    spy.mockRestore();
  }
  await settle();
  const at = firstCaptionBox(builder.albumPages);
  if (at >= 0) { await act(async () => { builder.setBoxText(0, { text: PARITY_CAPTION }, at); }); await settle(); }
  const album = summarize(builder, occasionOf(platform.deviceStore));
  const made = { pages: builder.albumPages, cover: builder.coverFront, photos: builder.uploadedPhotos };
  await act(async () => { root.unmount(); });
  return { album, platform, ...made };
}

describe("the app's builder path makes the website's album", () => {
  for (const sc of SCENARIOS) {
    it(sc.name, async () => {
      const w = web.albums.find((a) => a.scenario === sc.name)?.album;
      expect(w).toBeDefined();
      const { album, platform } = await appAlbum(sc);
      const same = album.pages.filter((p, i) => JSON.stringify(p) === JSON.stringify(w!.pages[i])).length;
      const templates = album.pages.filter((p, i) => p.templateId === w!.pages[i]?.templateId).length;
      const fills = album.pages.reduce((n, p) => n + p.slots.filter((s) => s != null).length, 0);
      console.log(`${sc.name}: app ${album.pages.length} pages / website ${w!.pages.length}; template ids equal on ${templates}; ${same} pages identical in every field; ${fills} photos placed; captions ${album.pages.flatMap((p) => p.captions).length}; cover ${album.cover.photo} "${album.cover.title}"`);
      // The photos came in by address, never copied, sizes asked of the phone.
      expect(platform.photoStore.records().every((r) => r.uri.startsWith('content://media/'))).toBe(true);
      expect(platform.photoStore.records().every((r) => r.size > 0)).toBe(true);
      expect(album).toEqual(w);
    }, 120_000);
  }

  it('photos with no time: the Photos step shows them where their file time falls, the album puts them near the end (as on the website)', async () => {
    const sc = SCENARIOS.find((s) => /in the middle of the roll/.test(s.name))!;
    const undated = new Set(sc.photos.filter((p) => p.capturedAt == null).map((p) => p.name));
    // The Photos step: in the middle (the words under the grid say so).
    const draftOrder = draftFor(sc).map((p) => p.name);
    const lastDated = Math.max(...draftOrder.map((n, i) => (undated.has(n) ? -1 : i)));
    expect(draftOrder.some((n, i) => undated.has(n) && i < lastDated)).toBe(true);
    // The album (generateAlbum: a group after the dated photos, its pages
    // mixed in with the last few): every one on the album's last fifth.
    const { album } = await appAlbum(sc);
    const pageOf = new Map(album.pages.flatMap((p, i) => p.slots.filter((n): n is string => !!n).map((n) => [n, i] as const)));
    const lastFifth = album.pages.length - Math.ceil(album.pages.length / 5);
    for (const n of undated) expect(pageOf.get(n)).toBeGreaterThanOrEqual(lastFifth);
    // The words under the Photos step's grid say so.
    expect(fs.readFileSync(path.join(REPO_ROOT, 'mobile', 'src', 'app', 'photos.tsx'), 'utf8')).toContain('photos with no date taken go near the end');
  }, 120_000);

  it('can tell two albums apart: another seed gives another album (so "the same" above means something)', async () => {
    const sc = SCENARIOS[0];
    const w = web.albums.find((a) => a.scenario === sc.name)!.album;
    const { album } = await appAlbum({ ...sc, seed: sc.seed + 1 });
    expect(album).not.toEqual(w);
    expect(album.pages.filter((p, i) => JSON.stringify(p) !== JSON.stringify(w.pages[i])).length).toBeGreaterThan(5);
  }, 120_000);

  it("the made album's pages and cover are drawn by the app's renderer, nothing on them left out", async () => {
    const sc = SCENARIOS[1];
    const { pages, cover, photos } = await appAlbum(sc);
    const Sk = await headlessSkia();
    const text = new PageText(Sk, fontFiles());
    // Made-up pictures at each photo's shape (a phone's small copies).
    const images = { image: async (uri: string) => {
      const p = photos.find((x) => x.previewUrl === uri);
      if (!p) return null;
      const s = Sk.Surface.Make(Math.round(p.width / 10), Math.round(p.height / 10))!;
      s.getCanvas().clear(Sk.Color('#4F8FBF'));
      return s.makeImageSnapshot();
    } };
    const notDrawn = new Set<string>();
    for (const [i, page] of pages.slice(0, 8).entries()) {
      const d = await drawPageImage(Sk, text, { page, pageIndex: i, albumSize: sc.size, photos, width: 400 }, images);
      expect(d.missing).toBe(0);
      expect(d.image.width()).toBe(400);
      d.plan.notDrawn.forEach((x) => notDrawn.add(x));
      d.image.dispose();
    }
    expect([...notDrawn]).toEqual([]);
    const c = await drawPageImage(Sk, text, { page: cover, pageIndex: 0, albumSize: sc.size, photos, width: 400, coverMode: true }, images);
    // The cover photo is drawn; its title's font (Cinzel, the website's cover
    // default) is not in the app yet, and the plan says so.
    expect(c.plan.backgroundPhoto?.photoIndex).toBe(photos.findIndex((p) => p.name === sc.cover));
    expect(c.missing).toBe(0);
    expect(c.plan.notDrawn).toEqual([expect.stringMatching(/Cinzel/)]);
    c.image.dispose();
  }, 120_000);
});
