/* ══════════════════════════════════════════════════════════════════════════
   BUILDER PLATFORM: what the album builder needs from the device it runs on.

   The album builder's state (useBuilderState) is the same on the website and
   in the 2.0 native app (docs/mobile-port-plan.md, Phase 0b). What differs
   is the device underneath: where the album in progress is saved, where the
   photos are kept, how an iPhone photo is opened, how faces are found, when
   the app goes to the background. The builder asks for those through ONE
   object of this shape instead of calling the browser itself.

     • The website passes nothing: the builder falls back to the browser's own
       pieces (lib/browserPlatform.ts: localStorage, IndexedDB, face-api,
       the HEIC worker). Nothing changes on the website.
     • The app wraps the builder in <BuilderPlatformContext.Provider> with its
       own pieces (a synchronous key-value store, photos kept by URI, its own
       face finder and photo decoding). In the app there is no fallback: the
       builder's default comes from lib/defaultBuilderPlatform, and the app's
       bundler picks its .native.ts twin, which is "none" (so the app never
       loads face-api, IndexedDB or the HEIC worker).

   Shapes chosen so a React Native version is natural: photos are shown from
   a URL/URI string, decoding is async, and the builder never touches a Blob
   or a File itself. A picked photo comes in as a PickedPhoto (name, size,
   type): the website hands in browser Files, the app its own picked assets.
   Only each platform's own pieces read the rest of it (the browser's read
   the File's bytes). This file is pure: it runs anywhere (sharedModules.ts).

   Phase 3a added what the builder still took from the website directly:
   measuring words (textMeasurer), the occasion's quote lines (quotes), the
   account (cloud: the Supabase client, who is signed in, the album rows) and
   telling the screens that show the occasion it changed (occasionChanged).
   With those, useBuilderState itself is shared code.
   ══════════════════════════════════════════════════════════════════════════ */

import { createContext } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PhotoCheck } from '../lib/photoCheck';
import type { UseAlbumSyncReturn } from '../lib/albumCloud';
import type { ThemeQuotes } from '../lib/themeQuotePool';
import type { TextMeasurer as WordMeasurer } from '../pages/builder/wordArtRules';

/** Text saved under a name on this device. Synchronous on purpose: the builder
 *  reads its draft before its first screen. Website: localStorage (kept) and
 *  sessionStorage (this visit only). App: a synchronous store (for example
 *  MMKV), or an in-memory copy filled before the builder opens. Any call may
 *  throw (storage blocked or full), as the browser's do: the builder already
 *  guards the calls where that matters. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** A photo as it comes from a pick, before the album takes it. Website: a
 *  browser File. App (Phase 2): its picked asset, which has these three and
 *  its own URI. The builder only reads these fields; each platform reads the
 *  rest of its own kind. On the website a PickedPhoto must be a File
 *  (addPhotos, replacePhoto and setCoverPhoto are only ever called with Files
 *  there); the browser pieces refuse anything else with a plain error rather
 *  than failing deep inside the browser. */
export interface PickedPhoto {
  readonly name: string;
  readonly size: number;
  readonly type: string;
}

/** A picture's size as it will be seen (any EXIF rotation applied). 0×0 when
 *  it couldn't be read. */
export interface PhotoSize {
  width: number;
  height: number;
}

/** What the photo store says about a photo it keeps (no bytes). */
export interface KeptPhoto extends PhotoSize {
  id: string;
  name: string;
  type: string;
  size: number;
}

/** A photo read back from the store, with where its picture shows from. */
export interface StoredPhoto extends KeptPhoto {
  /** Website: a blob: URL (good until the tab closes). App: a file:// or
   *  content:// URI. */
  url: string;
}

/** The photos kept on this device, so an album opens again with its pictures
 *  (website: IndexedDB). Used as a React hook (BuilderPlatform.usePhotoStore),
 *  so a platform can keep per-screen state such as a URL cache. */
export interface PhotoStore {
  /** Keep this photo under `id` (a new id when absent); it measures the photo
   *  on the way in. Null when it couldn't be kept (for example a full disk). */
  store(photo: PickedPhoto, id?: string): Promise<KeptPhoto | null>;
  /** The photo, or null when this device doesn't have it. */
  get(id: string): Promise<StoredPhoto | null>;
  deletePhoto(id: string): Promise<void>;
  /** Just these photos (never "everything": other saved albums share the store). */
  deleteMany(ids: string[]): Promise<void>;
}

/** Photos coming into the album from a pick. */
export interface PhotoIntake {
  /** An iPhone photo (HEIC/HEIF) by its label (type or file name): it is
   *  converted before the album can use it. */
  looksHeic(photo: { type: string; name: string }): boolean;
  /** The photo the album keeps: a JPEG copy of a HEIC, any other photo as it
   *  is (the same object). Throws when it can't be opened. */
  toAlbumPhoto(photo: PickedPhoto): Promise<PickedPhoto>;
  /** Its size as it will be seen, for when the store couldn't keep it. */
  getImageDimensions(photo: PickedPhoto): Promise<PhotoSize>;
  /** When it was taken (ms since 1970), or null when that isn't known. Read
   *  from the photo as PICKED (a HEIC's JPEG copy carries no date). Website:
   *  the photo's EXIF. App: the gallery's own date for the picked asset.
   *  (Open PR #158 adds the file's own date as a fallback and says which one
   *  it was: whichever merges second widens this to { capturedAt, timeSource }.) */
  captureTime(photo: PickedPhoto): Promise<number | null>;
  /** A URL that shows this photo right now (website: a new blob: URL). It may
   *  stop working once the app is closed: see urlNeedsReload. */
  previewUrlOf(photo: PickedPhoto): string;
  /** Whether a picture URL saved with the album on an earlier visit must be
   *  found again in the photo store when the album opens (the builder always
   *  reloads a photo with no URL). Website: a blob: URL, which dies with the
   *  tab. App: any URL that is not the photo store's own lasting copy (a
   *  picker's content:// URI or a cache file can stop working once the app is
   *  closed). Reloading one the store doesn't have shows the photo as missing,
   *  so picking it again puts it back. */
  urlNeedsReload(url: string): boolean;
  /** Let go of a URL from previewUrlOf or the store (website: revokes a blob: URL;
   *  anything else is left alone). */
  releasePreviewUrl(url: string): void;
  /** The size of the picture at `url` once it has loaded; null when it
   *  can't load. */
  pictureSize(url: string): Promise<PhotoSize | null>;
  /** What a photo shows while it is being converted (a URL an image can show). */
  convertingPreview: string;
}

/** Finding faces, so a crop keeps them and a video memory's QR stays off them. */
export interface FaceFinder {
  /** Get the face model ready. Safe to call often; never throws (no model
   *  just means no faces are found). */
  init(): Promise<void>;
  /** The middle of the face(s) in the picture at `url`, as 0–1 of its width
   *  and height (a group: the middle of everyone). Null when there is no
   *  face, or the model isn't ready. */
  detectFaceCenter(url: string): Promise<{ x: number; y: number } | null>;
}

/** Megy's free photo check (blur, repeats, closed eyes), run on the device. */
export interface PhotoChecker {
  /** False where this device can't decode a small copy: no check at all. */
  available(): boolean;
  /** Face checks are quick here, so every photo can have one (not only repeats). */
  facesForAllPhotos(): boolean;
  /** Whether this stored photo's picture can be read for a check. */
  readable(photo: StoredPhoto): boolean;
  /** Check one stored photo. `width`/`height` are its measured size. */
  check(photo: StoredPhoto, width: number, height: number, opts?: { faces?: boolean }): Promise<PhotoCheck>;
}

/** The app going to the background and coming back. */
export interface AppLifecycle {
  /** Calls `fn` when the app goes to the background or is closed (website:
   *  the tab is hidden, or the page is left while hidden). Returns a stop
   *  function. */
  onLeave(fn: () => void): () => void;
  /** Calls `fn` when the customer comes back (website: the tab is shown
   *  again, or the window gets focus while shown). Returns a stop function. */
  onReturn(fn: () => void): () => void;
}

/** Measuring words in a font, so the builder can tell whether a caption fits
 *  its box (pages/builder/textFit). Shaped like a canvas 2D context: set
 *  `font` to a CSS font ('normal bold 24px "DM Sans", serif'), then read
 *  measureText(text).width in px. Website: a browser canvas's own context.
 *  App: one built on Skia's fonts (the faces the app's page drawer bundles). */
export interface TextMeasurer extends WordMeasurer {
  font: string;
}

/** The account the album is saved to: the same Supabase project for the
 *  website and the app. */
export interface BuilderCloud {
  /** The Supabase client (website: lib/supabase; app: its own, with the
   *  sign-in kept on the phone). The builder reads who is signed in from its
   *  saved session (auth.getSession) and an album's version (albums.updated_at)
   *  with it; every write goes through useAlbumSync. */
  readonly client: SupabaseClient;
  /** Who is signed in, or null (a guest). A React hook: call it once per
   *  render. Website: the sign-in context (lib/authContext useAuth().user). */
  useUser(): { id: string } | null;
  /** The account's album rows (save, load), as a React hook: call it once per
   *  render. Both build it on lib/albumCloud's useAlbumSyncWith, the ONE way
   *  an albums row is written (on its version, never an upsert). Website:
   *  lib/useAlbumSync with its own client; app: useAlbumSyncWith(its client). */
  useAlbumSync(): UseAlbumSyncReturn;
}

/** Everything the album builder takes from the device. Must stay the same
 *  object while a builder is open (its pieces are read once per screen). */
export interface BuilderPlatform {
  /** Kept across visits: the album in progress (website: localStorage). */
  deviceStore: KeyValueStore;
  /** This visit only: the "start a new album" signal (website: sessionStorage). */
  sessionStore: KeyValueStore;
  /** The device's photo store. A React hook: call it once per render. */
  usePhotoStore(): PhotoStore;
  photos: PhotoIntake;
  faces: FaceFinder;
  photoCheck: PhotoChecker;
  lifecycle: AppLifecycle;
  /** The measurer for captions, or null where words can't be measured here
   *  (then nothing is said about a caption's fit). Asked each time it is
   *  needed. Website: the browser canvas (null under jsdom). */
  textMeasurer(): TextMeasurer | null;
  /** The occasion's caption lines (lib/themeQuotePool). Website: lib/quotes'
   *  one pool (localStorage); app: createThemeQuotes with its deviceStore. */
  quotes: Pick<ThemeQuotes, 'ensureThemeQuotes'>;
  /** The builder changed the album's occasion in deviceStore (an album opened
   *  from the account brings its own; a new album clears it): tell the
   *  screens that show it. Website: the window event its steps listen for
   *  (lib/albumTheme announceAlbumTheme). */
  occasionChanged(occasion: string): void;
  /** The account (Supabase): who is signed in, and the album rows. */
  cloud: BuilderCloud;
}

/** The platform the album builder runs on. Null (nothing provided) = the
 *  browser's own pieces, which is how the website runs. */
export const BuilderPlatformContext = createContext<BuilderPlatform | null>(null);
