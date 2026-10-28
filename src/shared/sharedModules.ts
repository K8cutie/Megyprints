/* ══════════════════════════════════════════════════════════════════════════
   SHARED ALBUM CODE: the files the 2.0 native Android app may import.

   Megy Prints 2.0 is a React Native app (docs/mobile-port-plan.md). It does
   not get its own copy of the album rules: it imports these files straight
   from the website's code. One copy of how an album is laid out, priced and
   cut for print, so the website and the app can never disagree.

   Every file here runs anywhere JavaScript runs: no browser (document,
   window, localStorage, canvas…), no web-only package (fabric, jsPDF,
   pdf-lib, Supabase…). A listed file imports only other listed files, or a
   package in SHARED_NPM_PACKAGES, or types only from one in
   SHARED_TYPE_ONLY_PACKAGES. sharedModules.spec.ts checks all of it on
   every test run, and names the file and line that breaks it.

   Nothing on the website imports this list: it changes nothing a customer
   sees. It is the contract between the website and the app.

   To add a file: list it here (keep the list in order) and run the tests.
   If a file you need fails the check, split it: the pure rules in one file
   (listed), the browser part in another (not listed). Phase 0b of the plan
   does exactly that for the photo store and the album state.

   Made 2026-10-28 from every non-spec .ts file in src/pages/builder and
   src/lib that passes the check: 70 files, about 13,000 lines.
   Phase 0b added lib/heicRules (knowing an iPhone photo by its label),
   shared/platform (what the album builder needs from the device: the
   website passes the browser's pieces, the app passes its own) and
   lib/defaultBuilderPlatform.native (the app's default for those: none).
   Phase 3a added the album builder itself (pages/builder/useBuilderState)
   and what it needs: the pure parts split out of masks (maskShapes), looks
   (lookRules), fonts (fontCatalog), wordArt (wordArtRules), coverLayout
   (colorContrast), assistant/wizard (wizardSteps), albumTheme
   (albumThemeRules), quotes (themeQuotePool), localDraft (localDraftRules),
   draftAlbum (draftAlbumRow) and useAlbumSync (albumCloud); pageColors,
   textFit and albumSyncRecord as they are; and canvasMeasurer.native (the
   app has no browser canvas: its builder measures words with its own).
   The phone's photo check added pages/builder/faceCentre (the face-group
   centre, split out of faceDetection, which needs face-api).

   A TWIN: a file listed as name.native.ts stands in for name.ts in the app.
   The app's bundler (Metro) and type check (tsconfig moduleSuffixes) pick
   the .native.ts file, so a listed file may import name.ts (the website's,
   not listed) when its twin is listed. The twin must export the same names.
   ══════════════════════════════════════════════════════════════════════════ */

/** Repo-relative paths, in plain sort order. */
export const SHARED_MODULES = [
  'src/assistant/wizardSteps.ts',
  'src/lib/accountErrors.ts',
  'src/lib/albumCloud.ts',
  'src/lib/albumName.ts',
  'src/lib/albumSyncRecord.ts',
  'src/lib/albumThemeRules.ts',
  'src/lib/contact.ts',
  'src/lib/defaultBuilderPlatform.native.ts',
  'src/lib/draftAlbumRow.ts',
  'src/lib/heicRules.ts',
  'src/lib/heifExif.ts',
  'src/lib/inAppBrowser.ts',
  'src/lib/jpegZip.ts',
  'src/lib/limit.ts',
  'src/lib/localDraftRules.ts',
  'src/lib/megyMascot.ts',
  'src/lib/orderExpiry.ts',
  'src/lib/orderTracker.ts',
  'src/lib/passwordReset.ts',
  'src/lib/photoCheck.ts',
  'src/lib/photoKeeping.ts',
  'src/lib/photoPresence.ts',
  'src/lib/photoRelink.ts',
  'src/lib/pickedFiles.ts',
  'src/lib/placeProgress.ts',
  'src/lib/pricing.ts',
  'src/lib/rgbaPng.ts',
  'src/lib/settleGuard.ts',
  'src/lib/testingPhase.ts',
  'src/lib/themeQuotePool.ts',
  'src/pages/builder/PreviewSizeConstants.ts',
  'src/pages/builder/albumMinimum.ts',
  'src/pages/builder/binding.ts',
  'src/pages/builder/blankPages.ts',
  'src/pages/builder/bookFeel.ts',
  'src/pages/builder/canvasMeasurer.native.ts',
  'src/pages/builder/chooserFit.ts',
  'src/pages/builder/colorContrast.ts',
  'src/pages/builder/coverGeometry.ts',
  'src/pages/builder/coverPhoto.ts',
  'src/pages/builder/densities.ts',
  'src/pages/builder/faceCentre.ts',
  'src/pages/builder/fontCatalog.ts',
  'src/pages/builder/generateAlbum.ts',
  'src/pages/builder/gradient.ts',
  'src/pages/builder/lastPagePhoto.ts',
  'src/pages/builder/layouts.ts',
  'src/pages/builder/lookAlikes.ts',
  'src/pages/builder/lookRules.ts',
  'src/pages/builder/maskShapes.ts',
  'src/pages/builder/orderReadiness.ts',
  'src/pages/builder/pageColors.ts',
  'src/pages/builder/pageNormalize.ts',
  'src/pages/builder/pagePhotoKey.ts',
  'src/pages/builder/pageTemplates.ts',
  'src/pages/builder/pageTurn.ts',
  'src/pages/builder/pageTurnStyles.ts',
  'src/pages/builder/photoAnalyzer.ts',
  'src/pages/builder/previewPaging.ts',
  'src/pages/builder/printSheet.ts',
  'src/pages/builder/quoteBank.ts',
  'src/pages/builder/rectTemplates.ts',
  'src/pages/builder/retiredSizes.ts',
  'src/pages/builder/slotGeometry.ts',
  'src/pages/builder/slotPhotoFit.ts',
  'src/pages/builder/slotSwap.ts',
  'src/pages/builder/slotUtils.ts',
  'src/pages/builder/squareTemplates.ts',
  'src/pages/builder/stickers.ts',
  'src/pages/builder/studioPhoneGeom.ts',
  'src/pages/builder/templateKit.ts',
  'src/pages/builder/templateValidation.ts',
  'src/pages/builder/templates6x4.ts',
  'src/pages/builder/templates6x6.ts',
  'src/pages/builder/templates6x8.ts',
  'src/pages/builder/templates8x6.ts',
  'src/pages/builder/templates8x8.ts',
  'src/pages/builder/textColors.ts',
  'src/pages/builder/textFit.ts',
  'src/pages/builder/textPainter.ts',
  'src/pages/builder/textures.ts',
  'src/pages/builder/themeQuotes.ts',
  'src/pages/builder/tiledTemplates.ts',
  'src/pages/builder/trashSpot.ts',
  'src/pages/builder/types.ts',
  'src/pages/builder/useBuilderState.ts',
  'src/pages/builder/useEndOfAlbumPrompt.ts',
  'src/pages/builder/varietyTracker.ts',
  'src/pages/builder/wordArtRules.ts',
  'src/shared/platform.ts',
] as const;

/** npm packages a shared file may import. Each must run the same in a
 *  browser and in React Native.
 *  - react: React Native runs the same React. Used for a few hooks
 *    (settleGuard, useEndOfAlbumPrompt, useBuilderState) and the
 *    CSSProperties type. (react-dom is web-only and is never allowed.) */
export const SHARED_NPM_PACKAGES = ['react'] as const;

/** npm packages a shared file may import TYPES from (`import type`), and
 *  nothing else. A type import is erased when the code is built, so nothing
 *  of the package is loaded by the shared file itself.
 *  - @supabase/supabase-js: the album builder and lib/albumCloud are handed a
 *    Supabase client (the website's, or the app's own: the app depends on the
 *    same package) and name its type, SupabaseClient. They never make one:
 *    making a client needs each side's own settings (lib/supabase reads the
 *    website build's import.meta.env). */
export const SHARED_TYPE_ONLY_PACKAGES = ['@supabase/supabase-js'] as const;

export type SharedModule = (typeof SHARED_MODULES)[number];
