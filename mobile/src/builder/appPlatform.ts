/* ══════════════════════════════════════════════════════════════════════════
   THE APP'S BUILDER PLATFORM: what the website's album builder
   (useBuilderState, shared code) takes from the device, the phone's way
   (shared/platform.ts BuilderPlatform). The builder is the website's own;
   only these pieces are the app's:

     deviceStore   files, one per name, saved before setItem returns (deviceStore.ts)
     sessionStore  memory: this visit only
     photos        the Phase 2 photos by their address, never copied (appPhotos.ts)
     faces         Google ML Kit on the phone (lib/phonePhotoCheck.ts, the
                   website's face rules), so the builder does what the website
                   does with faces: a photo put in a frame slides to its faces
                   (a portrait in a square frame moves up or down to them),
                   "Make my album" prefers, for the full pages, photos whose
                   faces the page's cut keeps (among those it can look at in
                   its 8 s), and a video memory's QR goes in the corner away
                   from the faces. No face, or no ML Kit in
                   the build (jest, an old APK): the photo stays centred, as
                   the website does when it finds no face
     photoCheck    Megy's photo check on the phone (lib/phonePhotoCheck.ts,
                   the website's rules: blur, repeats, closed eyes), since
                   2.1.2. The Photos step runs it on the picked photos and
                   shows what Megy would leave out (lib/draftPhotoCheck.ts);
                   the builder runs it on the album's photos, as on the
                   website (full pages from sharp, eyes-open photos; the
                   cover's photos best first). One checker for both and for
                   the face finder above, so a photo is looked at once.
                   NOT WANTED until the Photos step or "Making your album"
                   opens (wantPhotoCheck): opening the app on an album made
                   before must not start checking every photo of it behind
                   the start screen (seen on the emulator, 2026-11-17: more
                   than a processor core and 460 MB held for minutes)
     lifecycle     React Native's AppState
     textMeasurer  the page renderer's Skia fonts, once they have loaded
                   (textMeasurer.ts); null until then, so nothing is said about
                   a caption's fit rather than a guess
     quotes        the website's quote pool on this device store, curated lines
                   only (no AI call: the bank is off on the website too,
                   generateAlbum DEAL_BANK_QUOTES)
     cloud         the app's own Supabase client and sign-in: signed out, the
                   album stays on the phone (like a website guest); signed in,
                   it saves through the website's one albums write
                   (albumCloud useAlbumSyncWith), the same row the website
                   opens on another device

   Made once for the app's life (the builder needs the same object for as
   long as it is open). Everything that touches the phone comes in through
   `deps`, so jest builds the same platform on a made-up phone.
   ══════════════════════════════════════════════════════════════════════════ */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppLifecycle, BuilderPlatform, FaceFinder, KeyValueStore, PhotoChecker, TextMeasurer } from '@web/shared/platform';
import { createThemeQuotes } from '@web/lib/themeQuotePool';
import { albumVersionWith, signedInUserIdWith, useAlbumSyncWith } from '@web/lib/albumCloud';
import { createPhoneChecks, type PhoneChecks } from '../lib/phonePhotoCheck';
import { createPhotoIntake, createPhotoStore, type AppPhotoStore, type InspectPhotos } from './appPhotos';

export interface AppPlatformDeps {
  deviceStore: KeyValueStore;
  sessionStore: KeyValueStore;
  inspect: InspectPhotos;
  lifecycle: AppLifecycle;
  /** The caption measurer, once the fonts have loaded. */
  measurer: () => TextMeasurer | null;
  client: SupabaseClient;
  /** Who is signed in (a React hook: the app's sign-in context). */
  useUser: () => { id: string } | null;
  /** The face finder; default: the phone's own (ML Kit, createPhoneChecks
   *  on the native modules). Tests pass a made-up one. */
  faces?: FaceFinder;
  /** The photo check; default: the phone's own (the same createPhoneChecks).
   *  Tests pass a made-up one. */
  photoCheck?: PhotoChecker;
}

/** Tells the screens that show the occasion that the builder changed it. */
export function occasionSignal() {
  const listeners = new Set<(occasion: string) => void>();
  return {
    announce: (occasion: string) => { listeners.forEach((fn) => { try { fn(occasion); } catch { /* a screen's problem */ } }); },
    listen(fn: (occasion: string) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  };
}

export interface AppPlatform extends BuilderPlatform {
  photoStore: AppPhotoStore;
  occasion: ReturnType<typeof occasionSignal>;
  /** A blur answer already known for a photo (saved with the picked photos):
   *  the checker does not decode the photo again for it. */
  rememberCheck: PhoneChecks['remember'];
  /** The photo check is wanted from now on (the Photos step, or "Making
   *  your album", is open). Until then photoCheck.available() is false, so
   *  nothing is checked behind the start screen or the Preview. */
  wantPhotoCheck(): void;
}

export function createAppPlatform(deps: AppPlatformDeps): AppPlatform {
  const photoStore = createPhotoStore(deps.deviceStore, deps.inspect);
  const occasion = occasionSignal();
  const { client } = deps;
  // One checker: the face finder and the photo check share the faces found.
  const checks = createPhoneChecks();
  const phoneCheck = deps.photoCheck ?? checks.photoCheck;
  let checkWanted = false;
  return {
    deviceStore: deps.deviceStore,
    sessionStore: deps.sessionStore,
    usePhotoStore: () => photoStore,
    photos: createPhotoIntake(deps.inspect),
    faces: deps.faces ?? checks.faces,
    photoCheck: { ...phoneCheck, available: () => checkWanted && phoneCheck.available() },
    rememberCheck: checks.remember,
    wantPhotoCheck: () => { checkWanted = true; },
    lifecycle: {
      // The photo index is written when the app leaves, with the album.
      onLeave: (fn) => deps.lifecycle.onLeave(() => { photoStore.flush(); fn(); }),
      onReturn: (fn) => deps.lifecycle.onReturn(fn),
    },
    textMeasurer: () => deps.measurer(),
    quotes: createThemeQuotes({ store: deps.deviceStore, endpoint: null }),
    occasionChanged: (o) => occasion.announce(o),
    cloud: {
      signedInUserId: () => signedInUserIdWith(client),
      albumVersion: (albumId) => albumVersionWith(client, albumId),
      useUser: () => deps.useUser(),
      useAlbumSync: () => useAlbumSyncWith(client),
    },
    photoStore,
    occasion,
  };
}
