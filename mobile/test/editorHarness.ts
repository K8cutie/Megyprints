/* ══════════════════════════════════════════════════════════════════════════
   THE EDITOR'S TEST BENCH (not a test itself): an album made through the
   app's own steps (Name → Size → Photos → Cover → "Make my album", albumFlow)
   on the real shared builder (the website's useBuilderState) on the app's
   platform, and the editor's context on the page on screen, built the way
   EditPagesScreen builds it. Every part's tests use it:

     useEditorBench();                       // once per test file
     const platform = await madeAlbum(SCENARIOS[0]);
     await act(async () => { builder().goToPage(3); });
     await tapOn(platform, firstPhoto(platform));
     expect(ctxOn(platform).selected?.kind).toBe('photo');
   ══════════════════════════════════════════════════════════════════════════ */
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'test-renderer';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useBuilderState, type BuilderActions } from '@web/pages/builder/useBuilderState';
import { BuilderPlatformContext } from '@web/shared/platform';
import { seeded, type Scenario, type ScenarioPhoto } from '../../tools/parity/scenarios';
import { createAppPlatform, type AppPlatform } from '../src/builder/appPlatform';
import { fileKeyValueStore, memoryStore, type SyncFiles } from '../src/builder/deviceStore';
import type { PhotoHeader } from '../src/builder/appPhotos';
import { albumMade, chooseCover, makeAlbum, nameAlbum, syncPhotos } from '../src/builder/albumFlow';
import { addPhotos, emptyDraft, type DraftPhoto } from '../src/lib/photoDraft';
import { hitTest, pageTargets, type Target } from '../src/editor/hitTest';
import { selectedTarget, selectTarget } from '../src/editor/selection';
import { runTap, type EditorContext } from '../src/editor/registry';

export { act };

function memoryFiles(): SyncFiles {
  const files = new Map<string, string>();
  return { read: (n) => files.get(n) ?? null, write: (n, t) => { files.set(n, t); }, move: (a, b) => { files.set(b, files.get(a)!); files.delete(a); }, remove: (n) => { files.delete(n); } };
}

function madeUpPhone() {
  const photos = new Map<string, ScenarioPhoto>();
  const inspect = async (uris: string[]): Promise<PhotoHeader[]> => uris.map((uri) => {
    const p = photos.get(uri);
    return { uri, readable: !!p, size: p?.size ?? 0, width: p?.width ?? 0, height: p?.height ?? 0, colorSpace: null, needsSrgb: false };
  });
  return { photos, inspect };
}
type Phone = ReturnType<typeof madeUpPhone>;

/** Nobody signed in, and a Supabase that answers nothing (never the live one). */
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

let current!: BuilderActions;
/** The builder as of the last render. */
export const builder = (): BuilderActions => current;

function Probe() {
  const b = useBuilderState();
  useEffect(() => { current = b; });
  return null;
}
export const settle = () => act(async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); });
let root: Root | null = null;

/** The test file's set-up: React's act environment, and the album taken down after each test. */
export function useEditorBench(): void {
  beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
  afterEach(async () => { await act(async () => { root?.unmount(); }); root = null; });
}

function draftOf(phone: Phone, sc: Scenario): DraftPhoto[] {
  const list = sc.photos.map((p, i) => ({ uri: `content://media/external/images/media/${7000 + i}`, p }));
  for (const { uri, p } of list) phone.photos.set(uri, p);
  return addPhotos(emptyDraft(), list.map(({ uri, p }, i) => ({
    key: `k:${uri}`, source: 'gallery' as const, uri, name: p.name, width: p.width, height: p.height,
    capturedAt: p.capturedAt, modifiedAt: null, addedAt: i,
  })), 1).draft.photos;
}

/** Name → Size → Photos → Cover → "Make my album", the app's steps. */
export async function madeAlbum(sc: Scenario): Promise<AppPlatform> {
  const phone = madeUpPhone();
  const platform = platformOn(phone, memoryFiles());
  root = createRoot();
  await act(async () => { root!.render(createElement(BuilderPlatformContext.Provider, { value: platform }, createElement(Probe))); });
  await settle();
  const addressOf = (id: string) => platform.photoStore.records().find((r) => r.id === id)?.uri;
  await act(async () => { nameAlbum(current, platform.deviceStore, sc.title, sc.occasion, platform.occasionChanged); });
  await act(async () => { current.setAlbumSize(sc.size); });
  await act(async () => { await syncPhotos(current, draftOf(phone, sc), phone.inspect, { addressOf }); });
  for (let i = 0; i < 50 && current.uploadedPhotos.some((p) => !(p.width > 0)); i++) await settle();
  await act(async () => { chooseCover(current, current.uploadedPhotos.find((p) => p.name === sc.cover)!.id); });
  const spy = jest.spyOn(Math, 'random').mockImplementation(seeded(sc.seed));
  try { await act(async () => { await makeAlbum(current); }); } finally { spy.mockRestore(); }
  await settle();
  expect(albumMade(current.albumPages)).toBe(true);
  return platform;
}

/** The editor's context on the page on screen, as EditPagesScreen builds it.
 *  Sheets a tap opens are pushed onto `sheets`; lines it says onto `said`. */
export function ctxOn(platform: AppPlatform, sheets: { id: string; params: unknown }[] = [], said: string[] = []): EditorContext {
  const b = current;
  const pageIndex = b.currentPageIndex;
  const page = b.albumPages[pageIndex];
  const { targets } = pageTargets({ page, albumSize: b.albumSize, pageIndex, photoCount: b.uploadedPhotos.length });
  return {
    builder: b, platform, text: null, pageIndex, page, targets,
    selected: selectedTarget(b.selectedElementId, pageIndex, targets),
    select: (t) => selectTarget(b, pageIndex, t, b.uploadedPhotos),
    openSheet: (id, params) => { sheets.push({ id, params }); },
    closeSheet: () => {},
    say: (m) => { said.push(m); },
  };
}

export const centre = (t: Target) => ({ x: t.box.x + t.box.w / 2, y: t.box.y + t.box.h / 2 });
export const fills = (b: BuilderActions, i: number) => [...(b.albumPages[i].slotFills ?? [])];
export const firstPhoto = (platform: AppPlatform) => ctxOn(platform).targets.find((t) => t.kind === 'photo')!;

/** A tap at the middle of `t`, through the hit test and the registry (as the screen does). */
export async function tapOn(platform: AppPlatform, t: Target, sheets: { id: string; params: unknown }[] = []): Promise<string> {
  const ctx = ctxOn(platform, sheets);
  const p = centre(t);
  const hit = hitTest(ctx.targets, p.x, p.y);
  expect(hit?.key).toBe(t.key);
  let by = '';
  await act(async () => { by = runTap(hit!, ctx); });
  return by;
}
