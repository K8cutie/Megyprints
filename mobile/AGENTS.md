This is Megy Prints 2.0: the native Android app (Expo + React Native). The plan
is `../docs/mobile-port-plan.md`; read it, and its "Phase 1 notes", first.

## Megy rules for this folder

- **Shared album code.** The app imports the website's album rules straight
  from `../src` as `@web/<path under src>` (for example
  `@web/pages/builder/albumMinimum`), and only files listed in
  `../src/shared/sharedModules.ts`. Metro refuses anything else
  (`sharedCode.js`), and `test/sharedImports.test.ts` fails on it. To use
  another website file, add it to that list and run `npx vitest run src/shared`
  from the repo root; if it fails there, split the browser part out of it.
  Never copy album rules into the app.
- **Dev builds are `com.megyprints.app.dev`** ("Megy Prints 2.0 (dev)"), so they
  never replace the real app on a phone. The real package `com.megyprints.app`
  is only for Phase 7.
- **No paid services.** No EAS Build or EAS Update: builds are made on this PC
  with Gradle, JDK 21, through `scripts\build-android.ps1` (PowerShell). It
  copies the app and `../src` to the short folder `C:\megy2` and runs
  `npx expo prebuild --platform android` and `gradlew assembleDebug` there,
  because from a worktree folder the C++ build paths are too long for ninja
  (see the Phase 1 notes). It checks free disk space first and stops Gradle
  if the disk gets nearly full. `android/` and `ios/` are generated and not in
  git: configure them through `app.json`, `react-native.config.js` and config
  plugins.
- **Native libraries switched off** in `react-native.config.js` (Reanimated,
  Worklets, Gesture Handler) are not in the APK. Importing one crashes the
  app on the phone; `test/nativeLibraries.test.ts` fails first. Delete the
  line there to turn one back on.
- **The app's own native code** lives in `modules/`: `modules/photo-files`
  keeps access to photos picked with "Choose from Files" and reads their size
  and EXIF time, and its `srgbCopy` turns a Display P3 / Adobe RGB photo into
  sRGB for a print page; `modules/photo-pixels` makes the photo check's small
  copy the way the website's browser does and runs Google ML Kit's face finder
  on a copy up to twice that size (`src/lib/phonePhotoCheck.ts`; compared with
  the website by `../tools/photo-check`). ML Kit sends Google anonymous usage
  numbers (never the photos) and adds about 13 MB to the app: see
  `src/lib/faceModel.ts` before shipping it. Expo autolinking builds every
  folder there; after changing its Kotlin, run prebuild and Gradle again.
  Jest has no native modules: its JS side (`index.ts`) works without the
  native half.
- **Photos are never copied into the app.** The album keeps each photo's
  content:// address on the phone (see the Phase 2 notes in the plan). Pages
  on screen are drawn from small upright sRGB copies in the app's cache
  (`modules/photo-files` drawableCopy), which the phone may clear: they are
  made again from the photo's address.
- **Server values** come from `.env.local` (not in git; `.env.example` has the
  names). Never commit them, never put real account passwords anywhere.
- **Page renderer** (`src/render`, react-native-skia): album pages drawn the
  way the website's print renderer draws them. `test/goldenPages.test.ts`
  compares it pixel by pixel with the website's own pictures (made by
  `../tools/golden/renderWeb.mjs` in headless Chromium; run `npm ci` in
  `../tools/golden` once). Never loosen its bars to pass: the numbers and
  why are in `test/golden/compare.ts` and the plan's "Page renderer notes".
  **On a phone:** `scripts\build-android.ps1 -Variant release -GoldenPages`
  (a test build with the golden pages; never for customers), then
  `node scripts/golden-phone-run.cjs --device <serial>` and
  `npm run golden:phone` (same bars; the plan's "Page renderer on the
  phone"). Run it again after changing `src/render`: CanvasKit in Node is
  not the phone's Skia (the native paragraph builder has no `dispose()`,
  for one).
- **The album builder** (`src/builder`, Phase 3): the website's own
  `useBuilderState` (shared code) runs the album, once for the whole app
  (`BuilderProvider.tsx`), on the app's platform (`appPlatform.ts`: a
  file-per-name store saved before `setItem` returns, photos by their
  address on the phone, the Skia caption measurer, the app's Supabase).
  Screens call the steps in `albumFlow.ts`, never the album rules
  themselves. `test/albumParity.test.ts` runs the website's builder
  (`../tools/parity`, vitest + jsdom) and the app's on the same photos and
  requires the same album; `test/textMeasurer.test.ts` holds the caption fit
  to the website's in Chromium (`../tools/golden/fitWeb.mjs`).
- **Gate before a commit:** `npm run check` here (TypeScript + jest), and from
  the repo root `npx tsc -b && npx vitest run` when `../src` changed.
- Words a customer sees: plain English, say what you get, one filled
  terracotta (#B85C38) button for the way forward, never a greyed dead button.

## Expo has changed: do not trust your training data

Expo ships breaking changes every SDK release (this app is on SDK 58). Before
writing code that touches an Expo or React Native API, read the installed
version's types in `node_modules`, or the versioned docs at
`https://docs.expo.dev/versions/v58.0.0/` (index: https://docs.expo.dev/llms.txt).

```bash
npx expo install <package>  # ALWAYS instead of npm install: SDK-matched versions
npx expo start              # Metro, for a debug build on a phone or emulator
npm run check               # tsc --noEmit + jest
npx expo-doctor             # diagnose dependency and config issues
```

- Routes live in `src/app/` (Expo Router: every file is a screen,
  `_layout.tsx` is the navigator). Other code goes in `src/lib`,
  `src/components`.
- Import `Link`, `Redirect`, `router`, `useLocalSearchParams` from `expo-router`.
- After adding a library with native code, run prebuild and Gradle again.
