/* ══════════════════════════════════════════════════════════════════════════
   THE ALBUM BUILDER, FOR EVERY SCREEN OF THE APP.

   One useBuilderState (the website's album builder, shared code) for the
   whole app, on the app's platform (appPlatform.ts), so the Name, Size,
   Photos, Cover and Preview screens all work on the same album, as the
   website's steps do. The page renderer's fonts load here too: they draw the
   pages and measure the captions (the builder's textMeasurer).
   ══════════════════════════════════════════════════════════════════════════ */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import '@shopify/react-native-skia/lib/commonjs/skia/NativeSetup';
import { Skia } from '@shopify/react-native-skia/lib/commonjs/skia/Skia';
import { BuilderPlatformContext, type AppLifecycle, type TextMeasurer } from '@web/shared/platform';
import { useBuilderState, type BuilderActions } from '@web/pages/builder/useBuilderState';
import { inspectPhotos } from '../../modules/photo-files';
import { useAuth } from '../lib/auth';
import { useDraft } from '../lib/draftStore';
import { useDraftFollowsAlbum } from '../lib/draftFollowsAlbum';
import { useAccountSave } from './accountSave';
import { withQrOnOuterSide } from '../lib/memories/qrSide';
import { supabase } from '../lib/supabase';
import { PageText, phoneLightWeightPx } from '../render/pageText';
import { createAppPlatform, type AppPlatform } from './appPlatform';
import { fileKeyValueStore, memoryStore } from './deviceStore';
import { expoSyncFiles } from './expoFiles';
import { loadPageFonts } from './fontAssets';
import { loadDownloadedFonts } from '../editor/text/fonts/appFonts';
import { skiaTextMeasurer } from './textMeasurer';

/** React Native's AppState as the builder's lifecycle: leaving = the app
 *  going to the background, returning = it is on screen again. */
export const appStateLifecycle: AppLifecycle = {
  onLeave(fn) {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'background' || s === 'inactive') fn(); });
    return () => sub.remove();
  },
  onReturn(fn) {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') fn(); });
    return () => sub.remove();
  },
};

/** The page fonts, for drawing pages and measuring captions. */
let pageText: PageText | null = null;
let measurer: TextMeasurer | null = null;
let fontsLoading: Promise<PageText | null> | null = null;
export function pageFonts(): Promise<PageText | null> {
  if (!fontsLoading) {
    fontsLoading = loadPageFonts()
      .then(async (files) => {
        PageText.expectAll(files);
        const t = new PageText(Skia, files, phoneLightWeightPx(Platform.OS));
        // Caption fonts fetched on earlier visits (src/editor/text/fonts), in
        // before the first page is drawn, so it is drawn in them.
        await loadDownloadedFonts(t);
        pageText = t;
        measurer = skiaTextMeasurer(pageText);
        return pageText;
      })
      .catch((e) => {
        console.warn('Could not load the page fonts', e);
        fontsLoading = null;
        return null;
      });
  }
  return fontsLoading;
}

function useSignedInUser(): { id: string } | null {
  const { session } = useAuth();
  const id = session?.user.id ?? null;
  return useMemo(() => (id ? { id } : null), [id]);
}

let platform: AppPlatform | null = null;
/** The app's one platform (made on first use). */
export function appPlatform(): AppPlatform {
  if (!platform) {
    platform = createAppPlatform({
      deviceStore: fileKeyValueStore(expoSyncFiles()),
      sessionStore: memoryStore(),
      inspect: inspectPhotos,
      lifecycle: appStateLifecycle,
      measurer: () => measurer,
      client: supabase,
      useUser: useSignedInUser,
    });
  }
  return platform;
}

interface BuilderValue {
  builder: BuilderActions;
  platform: AppPlatform;
  /** The page fonts, once loaded (null while loading or when they could not load). */
  text: PageText | null;
}

const BuilderContext = createContext<BuilderValue | null>(null);

function BuilderHost({ platform: p, children }: { platform: AppPlatform; children: ReactNode }) {
  // Every screen reads the pages with each video memory's QR on the page's
  // outer edge, away from the binding (lib/memories/qrSide.ts).
  const builder = withQrOnOuterSide(useBuilderState());
  // Signed in, a made album goes to the account (accountSave.ts), whichever
  // screen is open: signing in from Home included.
  const signedIn = !!useAuth().session;
  useAccountSave(builder, p.deviceStore, signedIn);
  // The picked photos are the album's: another album on the phone (opened,
  // or fresh for another account) brings its own (draftFollowsAlbum.ts).
  const { replace } = useDraft();
  const keptAt = useCallback((id: string) => p.photoStore.records().find((r) => r.id === id)?.uri, [p]);
  useDraftFollowsAlbum(builder.getAlbumId, builder.isLoadingCloud, builder.uploadedPhotos, replace, keptAt);
  const [text, setText] = useState<PageText | null>(pageText);
  useEffect(() => {
    let live = true;
    void pageFonts().then((t) => { if (live) setText(t); });
    return () => { live = false; };
  }, []);
  const value = useMemo(() => ({ builder, platform: p, text }), [builder, p, text]);
  return <BuilderContext.Provider value={value}>{children}</BuilderContext.Provider>;
}

export function BuilderProvider({ children }: { children: ReactNode }) {
  const p = appPlatform();
  return (
    <BuilderPlatformContext.Provider value={p}>
      <BuilderHost platform={p}>{children}</BuilderHost>
    </BuilderPlatformContext.Provider>
  );
}

/** The album, or null on a screen drawn outside the provider (a test). The
 *  checkout uses it: opened from the album it orders that album, else its
 *  test album. */
export function useOptionalBuilder(): BuilderValue | null {
  return useContext(BuilderContext);
}

export function useBuilder(): BuilderValue {
  const v = useContext(BuilderContext);
  if (!v) throw new Error('useBuilder must be used inside <BuilderProvider>');
  return v;
}
