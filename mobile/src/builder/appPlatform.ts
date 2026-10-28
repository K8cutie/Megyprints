/* ══════════════════════════════════════════════════════════════════════════
   THE APP'S BUILDER PLATFORM: what the website's album builder
   (useBuilderState, shared code) takes from the device, the phone's way
   (shared/platform.ts BuilderPlatform). The builder is the website's own;
   only these pieces are the app's:

     deviceStore   files, one per name, saved before setItem returns (deviceStore.ts)
     sessionStore  memory: this visit only
     photos        the Phase 2 photos by their address, never copied (appPhotos.ts)
     faces         none for now: no on-device face library is in the app yet,
                   so a photo is centred in its frame, as the website does when
                   it finds no face
     photoCheck    not available yet (blur, repeats and closed eyes stay a
                   website feature for now)
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
import type { AppLifecycle, BuilderPlatform, KeyValueStore, TextMeasurer } from '@web/shared/platform';
import { createThemeQuotes } from '@web/lib/themeQuotePool';
import { albumVersionWith, signedInUserIdWith, useAlbumSyncWith } from '@web/lib/albumCloud';
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
}

export function createAppPlatform(deps: AppPlatformDeps): AppPlatform {
  const photoStore = createPhotoStore(deps.deviceStore, deps.inspect);
  const occasion = occasionSignal();
  const { client } = deps;
  return {
    deviceStore: deps.deviceStore,
    sessionStore: deps.sessionStore,
    usePhotoStore: () => photoStore,
    photos: createPhotoIntake(deps.inspect),
    faces: { init: async () => {}, detectFaceCenter: async () => null },
    photoCheck: {
      available: () => false,
      facesForAllPhotos: () => false,
      readable: () => false,
      check: async () => { throw new Error('The photo check is not in the app yet'); },
    },
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
