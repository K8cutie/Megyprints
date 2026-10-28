// @vitest-environment jsdom
/* ══════════════════════════════════════════════════════════════════════════
   THE WEBSITE'S HALF OF THE ALBUM PARITY CHECK (see scenarios.ts).

     npx vitest run --config tools/parity/vitest.config.ts   (from the repo root)

   The website's own useBuilderState with nothing provided, so it runs on the
   website's own device pieces (lib/browserPlatform: localStorage, the
   IndexedDB photo store, the EXIF reader, face-api, the account). jsdom has
   no IndexedDB, can't decode a picture or run face-api, so those are made up
   the way the website's builder specs make them up: the photo store keeps
   each photo and measures it from the scenario, the EXIF reader returns the
   scenario's time, no faces, nobody signed in. The steps are the website's
   own calls for its steps: the name (setAlbumTitle) and the occasion
   (writeAlbumTheme), the size, the photos (addPhotos with browser Files),
   the cover (setCoverToPhoto, a tap in the cover step), "Make my album"
   (generateAlbum). Writes tools/parity/out/web-albums.json.
   ══════════════════════════════════════════════════════════════════════════ */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import fs from 'node:fs';
import path from 'node:path';

const scenarioPhotos = vi.hoisted(() => new Map<string, { width: number; height: number; capturedAt: number | null }>());

vi.mock('../../src/lib/authContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../../src/lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
  supabaseConfigured: false,
}));
vi.mock('../../src/lib/useAlbumSync', async (importOriginal) => {
  const sync = {
    save: async () => ({ success: true }), load: async () => null, loadAll: async () => [],
    deleteAlbum: async () => ({ success: true }), loading: false, error: null, clearError: () => {},
  };
  return { ...(await importOriginal<Record<string, unknown>>()), useAlbumSync: () => sync };
});
vi.mock('../../src/lib/useIndexedDBPhotos', () => {
  const kept = new Map<string, { id: string; name: string; type: string; size: number; width: number; height: number }>();
  const measure = (name: string) => scenarioPhotos.get(name) ?? { width: 0, height: 0 };
  const idb = {
    store: async (file: File, id?: string) => {
      const key = id ?? `local-${kept.size}`;
      const { width, height } = measure(file.name);
      const rec = { id: key, name: file.name, type: file.type, size: file.size, width, height };
      kept.set(key, rec);
      return { ...rec, storedAt: '' };
    },
    get: async (id: string) => { const r = kept.get(id); return r ? { ...r, url: `blob:kept/${id}`, storedAt: '', blob: new Blob() } : null; },
    getMany: async () => new Map(),
    deletePhoto: async (id: string) => { kept.delete(id); },
    deleteMany: async (ids: string[]) => { ids.forEach((id) => kept.delete(id)); },
    list: async () => [],
    loading: false, error: null, clearError: () => {},
  };
  return { useIndexedDBPhotos: () => idb, getImageDimensions: async (file: File) => { const m = measure(file.name); return { width: m.width, height: m.height }; } };
});
vi.mock('../../src/pages/builder/exif', () => ({
  readCaptureTime: async (file: File) => scenarioPhotos.get(file.name)?.capturedAt ?? null,
}));
vi.mock('../../src/pages/builder/faceDetection', () => ({ initFaceApi: async () => {}, detectFaceCenter: async () => null }));

import { useBuilderState, type BuilderActions } from '../../src/pages/builder/useBuilderState';
import { readAlbumTheme, writeAlbumTheme } from '../../src/lib/albumTheme';
import { firstCaptionBox, PARITY_CAPTION, SCENARIOS, summarize, seeded, type AlbumSummary } from './scenarios';

let builder!: BuilderActions;
function Probe() {
  const b = useBuilderState();
  useEffect(() => { builder = b; });
  return null;
}
const settle = () => act(async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); });

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  let n = 0;
  Object.defineProperty(URL, 'createObjectURL', { value: () => `blob:session/${++n}`, configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: () => {}, configurable: true });
  localStorage.clear();
  sessionStorage.clear();
});

describe("the website's builder makes each scenario's album", () => {
  it('writes the albums for the app to be compared with', async () => {
    const out: { scenario: string; album: AlbumSummary }[] = [];
    for (const sc of SCENARIOS) {
      localStorage.clear();
      scenarioPhotos.clear();
      for (const p of sc.photos) scenarioPhotos.set(p.name, p);
      const root = createRoot(document.createElement('div'));
      await act(async () => { root.render(createElement(Probe)); });
      await settle();
      // Step 1: the name and the occasion; step 2: the size.
      await act(async () => { builder.setAlbumTitle(sc.title); writeAlbumTheme(sc.occasion); });
      await act(async () => { builder.setAlbumSize(sc.size); });
      // Step 3: the photos, as browser Files (the bytes don't matter: measured above).
      const files = sc.photos.map((p) => new File([new Uint8Array(8)], p.name, { type: 'image/jpeg' }));
      for (const [i, f] of files.entries()) Object.defineProperty(f, 'size', { value: sc.photos[i].size });
      await act(async () => { builder.addPhotos(files); });
      for (let i = 0; i < 50 && builder.uploadedPhotos.some((p) => !(p.width > 0)); i++) await settle();
      expect(builder.uploadedPhotos.every((p) => p.width > 0)).toBe(true);
      // Step 4: the cover photo, then "Make my album", the dice seeded.
      const cover = builder.uploadedPhotos.find((p) => p.name === sc.cover);
      expect(cover).toBeDefined();
      await act(async () => { builder.setCoverToPhoto(cover!.id); });
      const spy = vi.spyOn(Math, 'random').mockImplementation(seeded(sc.seed));
      try {
        await act(async () => { await builder.generateAlbum(); });
      } finally {
        spy.mockRestore();
      }
      await settle();
      expect(builder.albumPages.length).toBeGreaterThanOrEqual(40);
      // A caption in the album's first caption box (the preview's tap-to-edit save).
      const at = firstCaptionBox(builder.albumPages);
      if (at >= 0) { await act(async () => { builder.setBoxText(0, { text: PARITY_CAPTION }, at); }); await settle(); }
      out.push({ scenario: sc.name, album: summarize(builder, readAlbumTheme()) });
      await act(async () => { root.unmount(); });
    }
    const dir = path.join(__dirname, 'out');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'web-albums.json'), JSON.stringify({ note: 'Made by tools/parity/webAlbums.spec.ts. Do not edit.', madeAt: new Date().toISOString(), albums: out }, null, 1));
  }, 120_000);
});
