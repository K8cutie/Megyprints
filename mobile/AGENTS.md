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
- **Server values** come from `.env.local` (not in git; `.env.example` has the
  names). Never commit them, never put real account passwords anywhere.
- **Page renderer** (`src/render`, react-native-skia): album pages drawn the
  way the website's print renderer draws them. `test/goldenPages.test.ts`
  compares it pixel by pixel with the website's own pictures (made by
  `../tools/golden/renderWeb.mjs` in headless Chromium; run `npm ci` in
  `../tools/golden` once). Never loosen its bars to pass: the numbers and
  why are in `test/golden/compare.ts` and the plan's "Page renderer notes".
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
