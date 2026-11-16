/* ══════════════════════════════════════════════════════════════════════════
   THE WEBSITE'S ALBUM BUILDER RUNS IN THE APP (2.0, Phase 3a).

   useBuilderState (the website's whole album builder: photos, making the
   album, the draft, the account) is on the shared list now, so the app runs
   that same code instead of a copy. This test takes it the way the app
   does: through '@web/…', with the app's React, Babel and the React Native
   test preset, which (like Metro) picks a file's .native.ts twin.

   The device underneath is the app's kind, made up in memory: a key-value
   store, photos kept by file:// URI, its own word measurer, the quote pool
   built on that store (lib/themeQuotePool), and an account built the way the
   app will build it: on a made-up Supabase client, the saved sign-in and the
   version read from lib/albumCloud (signedInUserIdWith, albumVersionWith)
   and the album rows from its useAlbumSyncWith (the ONE way an albums row is
   written). The builder itself is never handed the client. Then 40 photos go
   in and the album is made: every photo placed, the draft kept in the device
   store.

   What this does not prove: it runs under Node with the React Native preset,
   not on Hermes on a phone, and draws nothing (the page drawer is
   mobile/src/render, PR #216). Test photos are made-up names and sizes,
   never real pictures.
   ══════════════════════════════════════════════════════════════════════════ */
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'test-renderer';
import { useBuilderState, type BuilderActions } from '@web/pages/builder/useBuilderState';
import { BuilderPlatformContext, type BuilderPlatform, type KeyValueStore, type PickedPhoto, type StoredPhoto, type TextMeasurer } from '@web/shared/platform';
import { defaultBuilderPlatform } from '@web/lib/defaultBuilderPlatform';
import { defaultMeasurer } from '@web/pages/builder/canvasMeasurer';
import { createThemeQuotes } from '@web/lib/themeQuotePool';
import { albumVersionWith, signedInUserIdWith, useAlbumSyncWith } from '@web/lib/albumCloud';
import { DRAFT_STORAGE_KEY } from '@web/lib/localDraftRules';
import { MIN_ALBUM_PHOTOS } from '@web/pages/builder/albumMinimum';
import type { PhotoCheck } from '@web/lib/photoCheck';

/** A photo picked on the phone: name, size, type, and where it is. */
interface AppPhoto extends PickedPhoto { uri: string }

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, v); },
    removeItem: (k) => { data.delete(k); },
  };
}

/** One made-up phone. */
function makePhone() {
  const deviceStore = memoryStore();
  const kept = new Map<string, StoredPhoto>();
  const asked: string[] = [];
  /** Every letter 0.6 of the font size wide. */
  const measurer: TextMeasurer = {
    font: '',
    measureText(text: string) {
      return { width: text.length * 0.6 * Number(/(\d+(\.\d+)?)px/.exec(this.font)?.[1] ?? 16) };
    },
  };
  /** A made-up Supabase client: nobody signed in, every read empty. */
  const client = {
    auth: { getSession: async () => ({ data: { session: null } }) },
    from: (table: string) => {
      asked.push(table);
      const chain = {
        select: () => chain, eq: () => chain, order: () => chain, limit: () => chain,
        maybeSingle: async () => ({ data: null, error: null }),
      };
      return chain;
    },
  } as unknown as Parameters<typeof useAlbumSyncWith>[0];
  const sizeOf = (name: string) => (Number(/\d+/.exec(name)?.[0] ?? 0) % 3 === 0 ? { width: 3000, height: 4000 } : { width: 4000, height: 3000 });
  const platform: BuilderPlatform = {
    deviceStore,
    sessionStore: memoryStore(),
    usePhotoStore: () => ({
      // The phone keeps a photo where it is: the store's copy is its URI.
      store: async (photo, id) => {
        const key = id ?? `kept-${kept.size}`;
        const record = { id: key, name: photo.name, type: photo.type, size: photo.size, ...sizeOf(photo.name), url: (photo as AppPhoto).uri };
        kept.set(key, record);
        return record;
      },
      get: async (id) => kept.get(id) ?? null,
      deletePhoto: async (id) => { kept.delete(id); },
      deleteMany: async (ids) => { ids.forEach((id) => kept.delete(id)); },
    }),
    photos: {
      looksHeic: (p) => /\.hei[cf]$/i.test(p.name),
      toAlbumPhoto: async (p) => p,
      getImageDimensions: async (p) => sizeOf(p.name),
      captureTime: async (p) => Date.UTC(2026, 8, 12, 9) + Number(/\d+/.exec(p.name)?.[0] ?? 0) * 60_000,
      previewUrlOf: (p) => (p as AppPhoto).uri,
      releasePreviewUrl: () => {},
      urlNeedsReload: (url) => !url.startsWith('file:///photos/'),
      pictureSize: async () => ({ width: 4000, height: 3000 }),
      convertingPreview: 'file:///app/converting.png',
    },
    faces: { init: async () => {}, detectFaceCenter: async () => null },
    photoCheck: {
      available: () => false,
      facesForAllPhotos: () => false,
      readable: () => false,
      check: async () => ({ v: 1, sharp: 50, hash: '0'.repeat(16), faces: null, eyesClosed: false }),
    },
    lifecycle: { onLeave: () => () => {}, onReturn: () => () => {} },
    textMeasurer: () => measurer,
    quotes: createThemeQuotes({ store: deviceStore, endpoint: null }),
    occasionChanged: () => {},
    cloud: {
      signedInUserId: () => signedInUserIdWith(client),
      albumVersion: (albumId) => albumVersionWith(client, albumId),
      useUser: () => null,
      useAlbumSync: () => useAlbumSyncWith(client),
    },
  };
  return { platform, deviceStore, kept, asked };
}

let builder!: BuilderActions;
function Probe() {
  const b = useBuilderState();
  useEffect(() => { builder = b; });
  return null;
}
const settle = () => act(async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); });

let root: Root | null = null;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  await act(async () => { root?.unmount(); });
  root = null;
});

describe("the website's album builder, in the app", () => {
  it('takes the app\'s twins: no browser default for the device pieces or the word measurer', () => {
    expect(defaultBuilderPlatform).toBeNull();
    expect(defaultMeasurer()).toBeNull();
  });

  it('opens on the phone\'s own pieces, takes 40 photos and makes the album', async () => {
    const phone = makePhone();
    root = createRoot();
    await act(async () => {
      root!.render(createElement(BuilderPlatformContext.Provider, { value: phone.platform }, createElement(Probe)));
    });
    await settle();
    expect(builder.uploadedPhotos).toEqual([]);

    const picked: AppPhoto[] = Array.from({ length: MIN_ALBUM_PHOTOS }, (_, i) => ({
      name: `IMG_${String(i + 1).padStart(4, '0')}.jpg`, size: 2_000_000 + i, type: 'image/jpeg', uri: `file:///photos/IMG_${i + 1}.jpg`,
    }));
    let added!: ReturnType<BuilderActions['addPhotos']>;
    await act(async () => { added = builder.addPhotos(picked); });
    await settle();
    expect(added.added).toBe(MIN_ALBUM_PHOTOS);
    expect(builder.uploadedPhotos).toHaveLength(MIN_ALBUM_PHOTOS);
    // Shown from where they are on the phone, measured by the phone.
    expect(builder.uploadedPhotos.every((p) => p.previewUrl.startsWith('file:///photos/'))).toBe(true);
    expect(builder.uploadedPhotos.every((p) => p.width > 0 && p.height > 0)).toBe(true);

    await act(async () => { await builder.generateAlbum(); });
    await settle();
    expect(builder.albumPages.length).toBeGreaterThanOrEqual(MIN_ALBUM_PHOTOS / 2);
    const placed = new Set(builder.albumPages.flatMap((p) => (p.slotFills ?? []).filter((f): f is number => f != null)));
    expect(placed.size).toBe(MIN_ALBUM_PHOTOS); // every photo is in the album

    // The draft is kept in the phone's store, with the photos' URIs.
    await act(async () => { builder.saveDraftNow(); });
    const draft = JSON.parse(phone.deviceStore.getItem(DRAFT_STORAGE_KEY) ?? 'null') as { uploadedPhotos: { previewUrl: string }[]; albumPages: unknown[] } | null;
    expect(draft?.uploadedPhotos).toHaveLength(MIN_ALBUM_PHOTOS);
    expect(draft?.uploadedPhotos[0].previewUrl).toBe('file:///photos/IMG_1.jpg');
    expect(draft?.albumPages.length).toBe(builder.albumPages.length);
  });

  it('a photo the Photos step already checked comes in with its check and "keep it": the builder checks only the others (2.1.2)', async () => {
    const phone = makePhone();
    const calls: string[] = [];
    const known: PhotoCheck = { v: 1, sharp: 321, hash: '0123456789abcdef', faces: null, eyesClosed: false, facesTried: false };
    type Checked = AppPhoto & { check?: PhotoCheck; kept?: boolean };
    const platform: BuilderPlatform = {
      ...phone.platform,
      // The app's photo intake says what the Photos step found (appPhotos.ts).
      photos: { ...phone.platform.photos, known: (p) => ((p as Checked).check || (p as Checked).kept ? { check: (p as Checked).check, kept: (p as Checked).kept } : undefined) },
      photoCheck: {
        available: () => true,
        facesForAllPhotos: () => false,
        readable: () => true,
        check: async (p, _w, _h, opts) => {
          calls.push(`${opts?.faces === false ? 'basic' : 'faces'}:${p.name}`);
          return { v: 1, sharp: 50, hash: 'f'.repeat(16), faces: null, eyesClosed: false };
        },
      },
    };
    root = createRoot();
    await act(async () => {
      root!.render(createElement(BuilderPlatformContext.Provider, { value: platform }, createElement(Probe)));
    });
    await settle();

    const picked: Checked[] = [
      { name: 'IMG_0001.jpg', size: 2_000_001, type: 'image/jpeg', uri: 'file:///photos/IMG_1.jpg', check: known, kept: true },
      { name: 'IMG_0002.jpg', size: 2_000_002, type: 'image/jpeg', uri: 'file:///photos/IMG_2.jpg' },
    ];
    await act(async () => { builder.addPhotos(picked); });
    await settle();
    await settle();
    const [first, second] = builder.uploadedPhotos;
    expect(first.check).toEqual(known);
    expect(first.kept).toBe(true);
    // The one that came in unchecked is checked by the builder, as on the website.
    expect(second.check).toMatchObject({ sharp: 50 });
    expect(second.kept).toBeUndefined();
    expect(calls).toEqual(['basic:IMG_0002.jpg']);
  });

  it('a check that becomes wanted later (the app: at "Making your album") is run by Generate, which waits for it (2.1.2)', async () => {
    const phone = makePhone();
    const calls: string[] = [];
    let wanted = false;
    const platform: BuilderPlatform = {
      ...phone.platform,
      photoCheck: {
        available: () => wanted,
        facesForAllPhotos: () => false,
        readable: () => true,
        check: async (p) => {
          calls.push(p.name);
          const n = Number(/\d+/.exec(p.name)?.[0] ?? 0);
          // Each photo its own fingerprint: no repeats, so no face pass.
          return { v: 1, sharp: 100 + n, hash: (n * 0x1f3d5b79 >>> 0).toString(16).padStart(8, '0').repeat(2), faces: null, eyesClosed: false };
        },
      },
    };
    root = createRoot();
    await act(async () => {
      root!.render(createElement(BuilderPlatformContext.Provider, { value: platform }, createElement(Probe)));
    });
    await settle();
    const picked: AppPhoto[] = Array.from({ length: MIN_ALBUM_PHOTOS }, (_, i) => ({
      name: `IMG_${String(i + 1).padStart(4, '0')}.jpg`, size: 2_000_000 + i, type: 'image/jpeg', uri: `file:///photos/IMG_${i + 1}.jpg`,
    }));
    await act(async () => { builder.addPhotos(picked); });
    await settle();
    // Not wanted yet: nothing is checked behind the screens.
    expect(calls).toEqual([]);
    expect(builder.uploadedPhotos.some((p) => p.check)).toBe(false);

    wanted = true;
    await act(async () => { await builder.generateAlbum(); });
    await settle();
    expect(calls).toHaveLength(MIN_ALBUM_PHOTOS);
    expect(builder.uploadedPhotos.every((p) => p.check)).toBe(true);
    expect(builder.albumPages.length).toBeGreaterThanOrEqual(MIN_ALBUM_PHOTOS / 2);
  });
});
