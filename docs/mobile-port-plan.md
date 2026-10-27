# Megy Prints 2.0: the native Android app (plan)

Written 2026-10-28. Owner asked for a full native Android app. This is the plan
that was recommended, and the first step of it (Phase 0a) is in the same PR.

**Nothing in this plan changes the website, or the 1.x app on the Alpha test,
until Phase 7.** The Nov 9 re-apply goes ahead with 1.x as planned.

---

## 1. What 2.0 is

Today's app (1.x) is a frame around the website: it opens
megyprints.vercel.app inside the phone. That is why fixes reach everyone the
moment the website updates, and also why the app can only do what a web page
can do on a phone.

2.0 is a real Android app. Same name on Play, same listing, same package
(`com.megyprints.app`), same upload key. For a tester or customer it arrives
as a normal app update. Inside, the screens are drawn by the phone itself, not
by a web page.

What a customer should notice:

- **Photos:** the phone's own gallery grid with **Select all**, straight from
  the camera roll. No Files picker, no folder hunting.
- **Big rolls on cheap phones:** the app points at each photo where it already
  is on the phone instead of copying it, and draws one page at a time. A
  250-photo album on a 2–3 GB phone should feel the same as a 40-photo one.
- **Pages:** the preview, the page turn and the editor are drawn by one fast
  drawing engine (Skia, the same one Chrome and Android use), so they stay
  smooth.

What does **not** change: the album steps (Name → Size → Photos → Cover →
Make my album), the 40-photo minimum, layouts, prices, the print files the
shop gets, orders, payment, the admin pages. Those rules come from the same
code as the website (see section 2).

## 2. Why React Native and shared code, not Kotlin

There are two ways to build a native Android app:

| | Kotlin (Android's own language) | React Native (chosen) |
|---|---|---|
| Album rules (layouts, templates, prices, print-sheet cutting, 40 minimum…) | Written again in a second language | **Imported from the website's code. One copy.** |
| A fix to an album rule | Done twice, tested twice; the two copies drift | Done once; website and app both get it |
| Language | New (Kotlin) | Same as the website (TypeScript + React) |
| Fixes without a Play review | No | Yes, for the app's own code (signed updates, see risk 2) |
| iPhone later | Start over | Same code can be built for iPhone (needs a Mac + Apple account) |

**Measured on 2026-10-28:** of the 159 code files in `src/pages/builder` and
`src/lib` (about 33,500 lines), **70 files / about 13,000 lines** already run
anywhere: `generateAlbum` (the page plan), `pageTemplates`, all the
`templates6x4`…`templates8x8`, `layouts`, `slotPhotoFit` (how a photo sits in
its box), `printSheet` (where each page lands on the press sheet), `pricing`,
`quoteBank` (800 quotes), `photoCheck` (blur / repeats / closed eyes),
`albumMinimum`, `blankPages`, `orderReadiness`, `types` and more. The app
imports those files directly. A test (section 8) keeps them that way.

About 1,550 lines more only need the database connection (prices from the
store settings, my orders, payment, tester code…). They come along as soon as
the app has its own Supabase connection in Phase 1.

The rest is the part that really is different on a phone: drawing pages
(the website uses a browser canvas and the Fabric editor), storing photos
(the website uses the browser's IndexedDB), reading iPhone HEIC photos, and
making the PDF. The app gets its own version of those, built on the shared
rules.

**Tools:** React Native with **Expo** (development builds, built on this PC
with Gradle, the same way the 1.x app is built today; no paid Expo build
service), and **react-native-skia** for drawing pages.

## 3. What stays on the website

- The website itself, for everyone (iPhone, PC, anyone who doesn't install
  the app). It keeps every feature.
- Admin pages (orders, album stats, store settings, the press-sheet tool).
- Marketing pages (home, about, contact).
- `/m/…` QR memory pages: a printed QR code opens a web page, on any phone,
  with or without the app.
- The event guest flow (a guest scans the venue QR and adds photos in the
  browser, no install).

## 4. Phases

Each phase is its own PR (or a few), each ends with a check that proves it on
the emulator and, where it matters, a real phone. Sizes are rough, in Claude
working sessions.

| Phase | What you get | How we check it | Size |
|---|---|---|---|
| **0a** (this PR) | A list of the 70 shared files, and a test that fails if any of them picks up browser-only code | The test runs with every other test; it was shown to fail on a planted `window.` and a planted bad import, naming the file and line | done |
| **0b** | The album state (`useBuilderState`) gets its phone-or-browser pieces passed in, so the app can reuse it. **Held until after the Nov 9 re-apply**: it touches the live album builder | All 2,500+ website tests pass; owner walks the live builder on a phone; nothing looks or works different | 2–3 |
| **1** | App skeleton: sign in (email and Google), My albums | Same account on the website and the app shows the same albums; Google sign-in works on a real phone | 1–2 |
| **2** | Photos: gallery grid + Select all, photo check, HEIC photos, time order, the 40-photo minimum | 250 sample photos picked in one go on a low-memory emulator; same order and same photo-check warnings as the website for the same photos | 2 |
| **3** | Album steps (Name → Size → Photos → Cover), Make my album, preview with page turn | Same photos + same size give **the same pages** as the website (the page plan is shared code, so they must match exactly) | 2 |
| **4** | Editor: swap photos, move/zoom a photo in its box, change layout, words, colours, undo | An album edited in the app opens the same on the website, and back | 3–4 |
| **5** | Checkout and print files made on the phone | **Golden-page test:** every page of test albums, drawn by the app, compared pixel by pixel with the website's print files; then **one real printed test album** from the shop, checked by the owner | 3 + shop time |
| **6** | QR memories, Orders, Memories, Events, Share | A QR on a printed page opens its memory; app orders match the admin Orders page | 2 |
| **7** | Switch 1.x → 2.0 on Play | See section 6 | 1 + Google review |

### What 0b really involves (found by the Phase 0a check)

The first estimate said `useBuilderState` was tied to the browser only through
four pieces (photo store, face check, HEIC, Supabase). The check found more:
it imports **20 files that are not shared**, and uses `localStorage`,
`sessionStorage`, `window` and `document` 22 times itself. Most of those 20
are small: one function in the file needs the browser and the rest is pure
(for example `masks.ts` holds the box shapes, which are pure, and one function
that draws with a canvas). So 0b is two steps:

1. **Split** the pure part out of `masks`, `looks`, `pageColors`, `textFit`,
   `wordArt`, `exif`, `fonts`, `quotes`, `draftAlbum`, `localDraft`,
   `albumSyncRecord`, `albumTheme` into listed files. No behaviour change;
   each split adds files to the shared list and the check proves it.
2. **Pass in** the real platform pieces (photo store, face check, HEIC,
   photo-check runner, Supabase, sign-in, saved drafts) instead of importing
   them, so the website passes its versions and the app passes its own.

If 0b turns out bigger than it is worth, the fallback is that the app keeps
its own, smaller album state built on the shared rules. Phases 1–2 do not
need 0b, so that choice can wait.

## 5. Risks, each with its fix

| Risk | Fix |
|---|---|
| **A fourth page drawer.** Pages are already drawn three ways (preview, editor, print) and those three must agree. The app would add a fourth. | The app uses **one** Skia drawer for preview, editor and print, not three. Golden-page tests compare it with the website's print files on every change (Phase 5), so a difference shows up as a failing test, not a wrong print. |
| **Every app fix needs a Play review** (today, fixes reach phones through the website at once). | Signed over-the-air updates for the app's own code (Expo Updates, served from our own hosting, signed with our key so no one else can push code). Screen and rule fixes reach phones without a review; only changes to the native part go through Play. Within Google's rules: an update never changes what the app is for. |
| **Google may refuse the photo permission** (it limits full photo access to apps whose main job is photos). | Ask with an honest declaration (making photo albums is the app's main job). If refused: the Files picker the 1.x app uses today (no limit, opens in the Camera folder), or Android's own photo picker (about 100 per pick). Neither needs the permission. |
| **Low-memory phones** run out of memory with big rolls. | Photos are used where they are on the phone (no copies); the grid shows small thumbnails; only one page is drawn at full size at a time, for screen and for print. Tested on a 2–3 GB emulator in Phases 2 and 5. |
| **Switch-over loses albums or photos.** | Albums come from the account, as they do on a second device today. Photos are found again on the phone by file name and size (`photoRelink`, already shared). Photos not found use the existing "photos missing" bar, which asks for them again. |
| **Testers get a half-built 2.0.** The Internal testing track still has the old "Megy Testers" list ticked. | **Untick that list before the first 2.0 upload to Internal testing**, so only the owner gets it. Testers on Alpha stay on 1.x until 2.0 is finished. |
| **Website changes break the shared code** while the app catches up. | The Phase 0a test runs with every website test. A website change that adds browser code to a shared file fails the tests, with the file and line, before it can merge. |
| **2.0 work gets in the way of Nov 9.** | 2.0 is built in its own branches and folder. Nothing goes on Alpha until Phase 7. The small 1.x updates (1.3.0, 1.4.0, 1.5.0…) carry on as planned. |

## 6. How it fits the Alpha test and the Nov 9 re-apply

- Google turned down production on 2026-10-26 because testers were not
  engaged and feedback was not acted on through app updates. **2.0 is not
  needed to pass that.** The answer is the 1.x updates every few days and the
  tester feedback log.
- **Until Nov 9:** Phase 0a only (this PR: a document and a test, no change
  to the website). 1.x updates continue on Alpha. The re-apply uses 1.x.
- **After Nov 9:** Phases 0b → 6. 2.0 is tested on the emulator and on the
  owner's phone through the **Internal testing** track (with the old tester
  list unticked). Alpha testers keep 1.x.
- **Phase 7, the switch:** same package `com.megyprints.app`, same upload
  key, version codes from **100** (1.x uses small numbers: 1.3.0 is code 4;
  the jump leaves room for more 1.x fixes and makes 2.0 easy to spot). Order:
  1. Internal testing (owner only) → full walk on a real phone.
  2. Alpha (the testers) → release notes say what changed, truthfully;
     feedback goes in `docs/tester-feedback-log.md` as always.
  3. Production as a **staged rollout** (a small share of phones first, then
     more), so a problem reaches few people and can be stopped.
  A phone with 1.x updates to 2.0 in place: still signed in, albums there.

## 7. Cost

- **Tools:** React Native, Expo (development builds made on this PC),
  react-native-skia, Gradle and the Android SDK are free and open source.
  No paid Expo build service.
- **Per customer: no new server cost.** Photos stay on the phone and print
  files are made on the phone, exactly like today. Same Supabase and Vercel.
- **Over-the-air updates** are the one new download: about 3–8 MB per
  update per phone. For **1,000 phones** and 4 updates a month that is about
  12–32 GB a month of transfer, inside what the Vercel plan includes (100 GB a
  month on Hobby, 1 TB on Pro). **What breaks first:** daily updates to
  several thousand phones would pass the Hobby amount. Fix: send app updates
  at most weekly unless a fix is urgent, or host the files in Supabase
  Storage.
- **Google Play:** already paid (one-time fee). No new fees.

## 8. How to work on it (for future sessions)

**Worktrees.** The main checkout (`C:\megy-prints-flashdrive\V1\Megyprints-Clean`)
is shared with other live sessions: never switch branches, commit or stash
there. Each job makes its own worktree:

```bash
git -C "C:/megy-prints-flashdrive/V1/Megyprints-Clean" fetch origin
git -C "C:/megy-prints-flashdrive/V1/Megyprints-Clean" worktree add -b feat/port-<phase> "C:/megy-prints-flashdrive/V1/Megyprints-Clean/.claude/worktrees/port-<phase>" origin/main
```

then `npm ci` in the new worktree.

**Where the app lives.** In this repo, in its own folder (`mobile/`, made in
Phase 1), so it can import the shared files from `src/` directly (Metro's
`watchFolders` points at `src/`; see Phase 1 notes). The website build never reads
`mobile/`; the website tests (`vitest.config.ts`, `src/**/*.spec.ts`) never
run the app's tests.

**Shared code rule.** The app imports **only** files listed in
`src/shared/sharedModules.ts`. To use another file: add it to the list (in
order) and run `npx vitest run src/shared`. If it fails, split the file: the
pure part goes on the list, the browser part stays with the website.
`src/shared/sharedModules.spec.ts` is the check; don't weaken it to make a
file pass. The allowed npm packages are in `SHARED_NPM_PACKAGES` (today only
`react`).

**One PR per phase** (or per part of a phase). Title says what the customer
sees, in plain words. Gate before every commit: `npx tsc -b` and
`npx vitest run` pass. Never push to main, never merge: the owner says
"merge".

**Emulator rules.** Other jobs may be using an emulator.
- `C:\Android\sdk\platform-tools\adb.exe devices` first.
- Start your own: `C:\Android\sdk\emulator\emulator.exe -avd pwa_test -read-only -port <your port> -gpu auto -no-snapshot-save`
  (never `-gpu swiftshader_indirect`: it crashes once pages draw).
- `-s emulator-<your port>` on every adb command. Never stop an emulator you
  didn't start; stop yours at the end (`adb -s emulator-<port> emu kill`).
- Screenshot before every tap (content moves). A real tap is needed to open
  a picker.
- Test photos: the sample photos only. Never personal or family photos.

**Golden-page tests (from Phase 3).** A script draws test albums (sample
photos, fixed seed with `seedMathRandom()`) through the website's print
pipeline and saves each page as a PNG: the golden pages. The app draws the
same albums with its Skia drawer, and a test compares them pixel by pixel
with a small tolerance. A change to either drawer re-makes the golden pages in
the same PR, with before/after images in the PR (evidence images go on the
`pr-evidence` branch, linked by commit-pinned raw URLs).

**Signing.** Same upload key as 1.x. Never copy or print the signing files:
hard-link them into the worktree for a release build, delete the links after,
and check the originals are untouched (see `docs/play-store-runbook.md`).

**Release notes and the feedback log must be true.** "Tester" means a report
from a real tester; things built for testers are "For testers"; the owner's
own finds are "Owner test".

---

## Phase 1 notes (2026-10-28)

### What Phase 1 built

The app skeleton in `mobile/` (branch `feat/port-phase-1`):

- **Expo SDK 58, React Native 0.88, React 19.3, Hermes, the new
  architecture, Expo Router 58**, TypeScript 6. Android package
  `com.megyprints.app.dev`, app name "Megy Prints 2.0 (dev)", version 2.0.0
  (code 100), so a dev build never replaces the real app on a phone.
- **Screens** (`mobile/src/app/`): start screen; **Sign in** (email and
  password, the same Megy Prints account as the website, Show/Hide on the
  password, the website's own words for a wrong password from the shared
  `accountErrors.ts`); **My albums** (this account's albums: name, size, pages,
  when it last changed; read the same way as the website's `useAccountAlbums`,
  with the same "couldn't load / Try again" and retry every 20 seconds);
  **Shared code check** (see below).
- **Sign-in is kept on the phone** (Supabase session in AsyncStorage), so the
  app opens signed in next time.
- **Shared code, one copy.** The app imports the website's files straight from
  `src/` as `@web/<path>`. `mobile/sharedCode.js` (used by `metro.config.js`)
  lets in only files listed in `src/shared/sharedModules.ts` and stops the
  build naming any other file. `mobile/test/sharedImports.test.ts` checks the
  same without a build, all the way down the import chain, and was shown to
  catch planted bad imports. Today the app's bundle takes 22 website files
  (album minimum, pricing, all page templates, the album maker, quote bank,
  photo check, retired sizes, account error words…).
- **Shared code check screen** runs the real website code on the phone and
  compares 13 answers with the answers the same code gives on a computer
  (`mobile/src/lib/sharedCheckExpected.ts`, kept true by a jest test): the
  40-photo minimum and its words, sizes, sheet count, the price math on
  made-up rates, the page-layout count (622; per size), the quote bank (818),
  and a seeded album made from 60 pretend photos (40 pages, 19 full-page
  photos, album code `0510106c`). "Same as on a computer" proves Hermes and
  Node agree. A second box loads today's prices from the live server
  (`public_price_schedule`) and prices an 8×8 with the shared `priceOf`.
- **Server values.** The app reads the same two public values the website
  ships (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) as
  `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` from
  `mobile/.env.local` (not in git; `mobile/.env.example` has the names). The
  website keeps them out of git too (Vercel settings).

### What was seen on the emulator (2026-10-28)

On the `pwa_test` emulator (Android, x86_64), both APKs, next to the 1.x app
(`com.megyprints.app` stayed installed: the dev app does not replace it):

- Debug APK + Metro, and the release APK with Metro stopped: the Shared code
  check says **"JavaScript engine: Hermes"** and **"Same as on a computer:
  all 13 answers match"** (album made in 40 ms debug, 24 ms release).
- "Load today's prices" reached the live server: 8×8, 40 pages: softcover
  ₱1288, hardbound ₱1788.
- Sign in: empty boxes say "Type your email."; a made-up address
  (no such account) got the live server's answer in the website's words,
  "Wrong email or password. Check the email for a typo."; the message goes
  away as soon as a box is edited; Show/Hide works. Opening My albums while
  signed out goes to Sign in.
- **Not seen:** My albums with real albums, and opening the app signed in.
  That needs a real account's password, which agents must not use; the list
  and its query are covered by jest tests only. Owner check: sign in on the
  dev app with your own account and compare My albums with the website.

### How to run it

1. `cd mobile`, `npm ci`, and make `mobile/.env.local` (see `.env.example`).
2. **Build the APK:** `mobile\scripts\build-android.ps1` (PowerShell). It
   copies the app and `src/` to `C:\megy2` and builds there (see "Long paths"
   below), then copies the APK to `mobile\dist\android\`:
   - `megyprints-2.0-dev-debug.apk`: takes its code from Metro. Start Metro
     with `npx expo start` (port 8081) in `mobile/`. The emulator reaches it
     by itself (10.0.2.2:8081); a phone on USB needs
     `adb reverse tcp:8081 tcp:8081`.
   - `-Variant release` gives `megyprints-2.0-dev-release.apk`: the code is
     inside, no Metro needed (signed with the public debug key: for testing
     only, never for Play).
3. Install: `adb -s <device> install -r mobile\dist\android\megyprints-2.0-dev-debug.apk`.
4. Checks: `npm run check` in `mobile/` (TypeScript + jest), and from the repo
   root `npx tsc -b && npx vitest run` (the website's checks do not read
   `mobile/`: `tsconfig.app.json` takes `src/` only, vitest takes
   `src/**/*.spec.ts` only, ESLint, Vercel and Docker ignore `mobile/`).

### Long paths and disk space on this PC

- **Gradle cannot build from a worktree folder.** React Native's C++ parts are
  built with CMake and ninja, and ninja cannot make a folder whose path is
  longer than about 250 characters. The build makes paths that hold the
  project folder twice, which from `.claude\worktrees\<name>\mobile` is about
  265 characters ("ninja: error: mkdir(CMakeFiles/rnscreens.dir/C_/megy-...)").
  A `subst` drive or a junction does not help: Node turns them back into the
  long path and Gradle stops with "different roots". `build-android.ps1`
  builds in the short folder `C:\megy2` instead.
- **Even `C:\megy2` needs CMake to shorten names.** React Native's generated
  C++ files ("codegen") sit deep in `node_modules`, and their object paths
  pass 250 characters from any folder. CMake shortens them (a short hash for
  the front of the path) under `CMAKE_OBJECT_PATH_MAX`, but Expo sets that to
  1024 for every module ("never shorten"). `mobile/plugins/withShortCmakeObjectPaths.js`
  sets Expo's own property `expo.android.cmakeObjectPathMax=240` in
  `gradle.properties` at prebuild. The other fix would be a newer CMake whose
  ninja handles long paths (`android.cmakeVersion`), which needs an SDK
  download.
- **Three native libraries are switched off** in
  `mobile/react-native.config.js`: Reanimated, Worklets and Gesture Handler.
  npm installs them because Expo Router lists them, but the app's code does
  not use them (Metro's bundle has none of their code), and their C++ builds
  are the largest. `test/nativeLibraries.test.ts` fails if app code imports
  one of them while it is off. The editor (Phase 4) will probably want
  Gesture Handler and Reanimated back: delete their lines, then prebuild and
  Gradle again.
- **The disk was full.** On 2026-10-28 drive C: had about 3 GB free (of 930 GB),
  and during the first full build it reached 0 bytes (this build and other
  work together). The build folder was deleted at once. Later that day other
  space was freed (about 51 GB free). `build-android.ps1` now refuses to
  start with less than 2.5 GB free and stops Gradle if free space drops
  under 1 GB. A finished build folder (`C:\megy2`, debug + release, two ABIs)
  takes a few GB; delete `C:\megy2\mobile\android` and
  `C:\megy2\mobile\node_modules` to give it back. **Owner:** the many old
  worktrees under `.claude\worktrees\` (each with its own `node_modules`) and
  `C:\Users\Archie\.gradle\caches` (4.6 GB) are where space can come back from.

### Google sign-in: owner steps (not in Phase 1)

Phase 1 signs in with email and password only. People who made their account
with Google cannot sign in to the dev app yet (the sign-in screen says so).
Native Google sign-in needs these steps first, all in the owner's accounts:

1. **Google Cloud Console** (the project that holds the website's Google
   sign-in "Web application" OAuth client, the one Supabase uses) → APIs &
   Services → Credentials → Create credentials → OAuth client ID →
   **Android**:
   - for dev builds: package `com.megyprints.app.dev`, SHA-1
     `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25` (the
     React Native debug key that dev builds are signed with; public, so this
     client is for testing only);
   - for Phase 7: package `com.megyprints.app` with the SHA-1 of the
     **upload key** and of the **Play app signing key** (Play Console → Test
     and release → App integrity → App signing). Phones that install from
     Play get the Play-signed copy, so its SHA-1 must be there.
2. **Supabase dashboard** → Authentication → Sign In / Providers → Google:
   add the Android client ID(s) to the **Client IDs** box, next to the web
   client ID already there (comma-separated). Keep the web client ID: the app
   asks Google for an ID token made out to the web client. Leave "Skip nonce
   checks" off (the app sends a nonce).
3. **In the app (Phase 1b, our work):** Android's **Credential Manager**
   (Google's current sign-in sheet; the old Google Sign-In SDK is deprecated)
   through a small free module (an open-source Credential Manager wrapper, or
   about 100 lines of our own Expo module in Kotlin), with
   `GetSignInWithGoogleOption` / `GetGoogleIdOption` and
   `serverClientId` = the **web** client ID, and a nonce: send Google the
   SHA-256 of a random nonce and Supabase the raw nonce. Then
   `supabase.auth.signInWithIdToken({ provider: 'google', token: idToken, nonce })`.
   No browser and no supabase.co page: the Google sheet should show the app
   name from the Google OAuth consent screen.

### Left for later (found in Phase 1)

- **My albums reads every page of every album** to count the pages (the
  website's list leaves `pages` out to stay light). Fine for test accounts;
  for big accounts add a `page_count` column (a generated column,
  `jsonb_array_length(pages)`, in a migration) and read that instead.
- **Debug builds use the public React Native debug key.** Before Phase 7,
  make our own dev key, or keep dev builds off real accounts' Google sign-in.
- Phones: the default ABIs are `arm64-v8a` (phones) and `x86_64` (emulator);
  old 32-bit phones need `armeabi-v7a` added (`-Abis`).

## Phase 2 notes (2026-10-28): pick photos

### What Phase 2 built

Branch `feat/port-phase-2` (on top of Phase 1). Start screen → **Make an
album** → **Your photos** → **Pick photos**.

- **Pick photos** (`mobile/src/app/pick-photos.tsx`): the phone's photos in a
  grid, newest first, one block per day ("Today", "Yesterday", "Monday,
  October 26"), each day with its own **Select** / **Unselect**, a big
  **Select all 2,503 photos** / **Unselect all**, tap a photo to pick it, the
  running count ("12 photos selected", and "Albums need at least 40 photos.
  Pick 14 more."), and ONE filled button, **Add 12 photos**. With nothing
  picked there is no button, only "Tap the photos you want, or Select all."
  Photos already in the album say **In album**; tapping one says "That photo
  is already in your album."
  - Speed: the grid is one FlashList whose items are whole rows (a day
    heading, or 4 photos), so only the rows on screen exist. Photos come from
    Android's photo index without opening any file (`Query.exeForMetadata`):
    a first page of 120, then pages of 1,000. **Select all** is a flag ("all,
    except these"), so it is instant at any size and covers photos still
    loading: **Add** after Select all waits for the last page and adds those
    photos too (`photoSelection.photosToAdd`). Thumbnails are `expo-image`
    (Glide makes the small version from the photo where it is).
  - **In album** is matched by Android's photo number, never by the whole
    address: Android 10 gives the grid `.../external_primary/images/media/<n>`
    ids (`photoDraft.idsInAlbum`).
- **Photo access, in plain words.** Before Android's own question the app
  says "Megy Prints needs to see your photos so you can pick them for your
  album." with **Allow access to photos** (filled) and **Choose from Files
  instead**. After a "Don't allow": **Choose from Files** (filled) and **Ask
  for photo access again**. Refused for good: **Choose from Files** and
  **Open Settings**, with the steps.
  - **Android 14+ "Select photos" (limited access):** the grid shows only the
    chosen photos under a box: "Megy Prints can see only the photos you
    chose.", **Choose more photos** (opens Android's chooser again; choices
    add up), and how to allow all in Settings (**Open Settings**).
  - Only photos are asked for: `READ_MEDIA_IMAGES` (+
    `READ_MEDIA_VISUAL_USER_SELECTED`, and `READ_EXTERNAL_STORAGE` up to
    Android 12). No videos, music, photo locations or write access:
    `app.json` blocks them, and `test/photoSetup.test.ts` checks it.
- **Choose from Files** (`mobile/src/lib/filePhotos.ts`): Android's document
  picker, many at once, images only. Needs no permission.
- **Photos are kept where they are, never copied.** A grid photo is kept as
  its MediaStore address (`content://media/external/images/media/<n>`). A
  Files photo is kept as the address Files gave; Files' addresses can be
  read only while the app is open, so the app's own small native module
  (`mobile/modules/photo-files`, Kotlin, built by Expo autolinking) **keeps
  access** to each one (Android "persistable" access) and gives it back when
  the photo leaves the album. Android keeps at most 512 such addresses per
  app and drops the oldest past that, so a very large Files-only album could
  lose its oldest photos' access (Phase 3+: the "photos missing" bar and
  `photoRelink` find them again).
  - The same photo picked from the grid and from Files is **one** photo: the
    grid's address, Files' Images address and Files' Downloads address
    (`msf:<n>`) all carry Android's number for it (`photoKey` → `media:<n>`).
    A photo found by browsing the phone's storage in Files has no number and
    is keyed by its own address, so picking the same photo that way AND from
    the grid still adds it twice (not fixed).
  - Files picks that do not go in (could not be opened, already in the album)
    give their kept access back at once, and a photo taken out gives it back
    after Undo only if no photo in the album still uses that address.
- **Size and time taken**, for each picked photo: width and height as shown
  (turned photos swapped) and when it was taken (see "Time taken" below).
- **HEIC** (iPhone photos): kept by address like any photo; Android shows them
  itself (Android 9+). No conversion in the app.
- **The album draft** (`mobile/src/lib/photoDraft.ts`, `draftStore.tsx`,
  `draftFile.ts`): the picked photos, oldest first, saved on the phone after
  every change, so closing the app keeps them. About 220 bytes a photo, in
  **one file in the app's own folder** (`album-draft-v1.json`, through
  `expo-file-system`), not AsyncStorage: Android's AsyncStorage saves a value
  over 2 MB but can't read it back (CursorWindow), which is about 9,500
  photos, and Select all has no cap. A save writes a second file and moves it
  over the first, so the saved album is always a whole one. A saved album that
  can't be read is moved aside (`album-draft-v1.unreadable.json`), never
  written over, and Your photos says "The photos you picked before could not
  be opened. Please pick your photos again." `test/draftStore.test.ts` saves
  and opens 12,000 photos. (The first Phase 2 test build kept the album in
  AsyncStorage key `megy-2.0-album-draft-v1`; it is read once if there is no
  file yet, and never written again.)
- **Your photos** (`mobile/src/app/photos.tsx`): "Your photos: N", the photos
  in album order, × to take one out (with **Undo** for 10 seconds), "Take out
  all photos" (asks first). **The 40-photo minimum is the website's own rule
  and words** (shared `albumMinimum.ts`): 0 photos → **Pick photos**; under 40
  → **Add 26 more photos** (the website's `addMoreLabel`) and no way on; 40 or
  more → **Next** (filled) and **Add more photos**. Next leads to a page that
  says the album steps come in the next test version (Phase 3).
- **Shared website code used:** `albumMinimum.ts` (+ `densities.ts`) for the
  minimum and its words, `pickedFiles.ts` for what counts as a photo and the
  "left out" words.

**Libraries** (installed with `npx expo install`, SDK 58 versions):
`expo-media-library` 58.0.12 (the new `Query` API), `expo-image` 58.0.17,
`expo-document-picker` 58.0.4, `@shopify/flash-list` 2.3.2 (no native code).
`@react-native-async-storage/async-storage` 2.2.0 was already there.
`expo-file-system` 58.0.12 (for the album file) was already in the APK as a
part of `expo`; it is now listed in `package.json` so the app can import it
(no native change). The native module needs `androidx.exifinterface` 1.4.1, the version
`expo-media-library` already uses.

### Time taken: what the app reads, and where EXIF would be better

- **Grid photos:** Android's index (`DATE_TAKEN`), which Android fills from
  the photo's EXIF DateTimeOriginal. Android leaves it **empty** when the EXIF
  has no time zone (`OffsetTimeOriginal`) and the file's date is more than a
  day away from the EXIF time: typically old photos copied onto a new phone.
  For those, when they are added, the app reads the EXIF itself
  (`Asset.getExif`, `gallery.ts`), so they still go in the right place in the
  album. Seen on the emulator: ten 2019 photos with no time zone, copied
  "today", went to the front of the album, in 2019 order.
- **EXIF would be better in the grid itself:** the grid groups by the index
  only, so those copied photos show under the day they were copied, not the
  day they were taken (reading every photo's EXIF while scrolling would be
  too slow). They sort right once added.
- **Files photos:** the native module reads EXIF DateTimeOriginal (or
  DateTimeDigitized, as the website's EXIF reader does) and its time zone.
- **No EXIF time at all** (screenshots, many saved chat photos): the file's
  last-changed time. The website keeps such photos in a trailing group
  instead; PR #158 (open) moves the website to this same fallback. Until
  then, the same undated photos can sit in a different place on the website
  and in the app.

### Google Play: READ_MEDIA_IMAGES needs a declaration

Google Play limits `READ_MEDIA_IMAGES` to apps whose core use needs broad
photo access, and asks for a **Photo and video permissions declaration** in
Play Console (App content) when an app asks for it. Making a photo album from
many of your photos is this app's core use, so the declaration should say
that (picking 40 to hundreds of photos at once, grouped by day, Select all).
**If Google refuses, the Files path is the fallback**: it needs no permission
and already works (`filePhotos.ts`); the grid would then be switched off (one
`app.json` change: block `READ_MEDIA_IMAGES` and
`READ_MEDIA_VISUAL_USER_SELECTED`) and **Choose from Files** becomes the way
in. Android's own photo picker is a second fallback, but it picks at most
about 100 photos a time.

### What was seen on the emulator (2026-10-28)

`pwa_test` (Android 14, 2 GB RAM, x86_64), port 5630, debug build + Metro and
the release build. Test photos: 2,400 made-up pictures (gradients, shapes, a
number and a date; EXIF time + time zone like a phone camera) spread over six
months, 10 old photos (2019, no time zone, file dated today), 10 PNG
screenshots, 3 turned photos (EXIF orientation 6) and the website's 3 HEIC
test files; with what was on the emulator already, 2,517 photos.

- Make an album → Your photos: 0, **Pick photos** → the plain-words screen →
  Android's question with "Select photos and videos / Allow all / Don't
  allow".
- **Don't allow** → "Photo access was not allowed", **Choose from Files** →
  picked 8 in Files (long-press, then taps) → Your photos: 8, in time order
  (the 2019 photos first, by their EXIF, then the HEIC files by their EXIF
  dates, then today's). After closing and reopening the app the 8 were still
  there and still showed; `dumpsys activity permissions` listed all 8 Files
  addresses as persisted.
- **Ask for photo access again → Select photos** (picked 5) → the grid showed
  the 5 under the limited-access box; **Choose more photos** opened Android's
  chooser, 3 more → 8 shown (choices add up). Day **Select** picked all 8,
  **Add 8 photos** → Your photos: 16, the gallery's 2019 photos in among the
  Files ones by EXIF time. The same photo picked both ways was in twice
  before `photoKey` was made one-per-photo; after the fix: 15.
- **Allow all** (granted with `adb shell pm grant … READ_MEDIA_IMAGES`, the
  same as Allow all in Settings): "2,120 photos on this phone (still opening
  more)" while loading, then "2,517 photos on this phone", photos already in
  the album marked "In album". **Select all 2,503 photos** → "2,503 photos
  selected / Enough photos for an album." → **Add 2,503 photos** (spinner on
  the button) → Your photos: 2,517 → **Next** → the Phase 3 page.
- Take out (×) and **Undo** worked (the first try at 5 seconds ran out before
  the tap; Undo now stays 10 seconds).
- **Release build, fresh start** (`pm clear`): Make an album → Pick photos →
  Allow access → Allow all: 2,120 photos showing 1.6 s after the tap, all
  2,517 by 2.3 s. Today's **Select** (43), one tapped off → **Add 42
  photos** → Your photos: 42, the 2019 photos first by their EXIF, then the
  HEIC files, then today's → **Next**. "Take out all" asks first.
- **Smoothness, 2,517 photos, release build, 20 fast flings**
  (`dumpsys gfxinfo`): janky frames 2.8% (8.9% on a first run right after
  loading), frame time 50th / 90th / 99th percentile 25 / 34 / 46 ms. The
  same 20 flings in Android's own Files app, on the same photos and the same
  emulator: 7.8% janky, 32 / 48 / 69 ms. So the grid is at least as smooth as
  the system's own picker here. The emulator draws through the PC's graphics,
  so these numbers are for comparing, not phone numbers. During a very fast
  fling the rows and ticks draw at once and thumbnails show grey for a moment,
  filling in within about a second after the list stops (each thumbnail is
  made from the full photo; a real phone decodes JPEGs much faster).
- Memory after scrolling the whole grid: 227 MB (PSS) on the 2 GB emulator.

### Left for later (found in Phase 2)

- **Megy's photo check** (blur, repeats, closed eyes) and the website's
  "left out" photos are not in the app yet. The draft already has `leftOut`
  and the minimum counts only photos going in, as on the website.
- **Same order as the website for the same photos** is not proven yet; the
  page plan in Phase 3 will compare them (and the undated-photo difference
  above).
- Grid grouping by EXIF for photos without an index time (see above).
- A real phone (not just the emulator) and a phone with 10,000+ photos.

---

## Appendix: what the Phase 0a check left out, and why (2026-10-28)

Every non-test `.ts` file in `src/pages/builder` and `src/lib` was checked.
89 were left out. This list is a snapshot; the code moves on.

**Store things in the browser** (localStorage, sessionStorage, IndexedDB).
The app gets its own storage (Phase 0b/1):
`accountDeletion`, `albumSession`, `albumSyncRecord`, `checkoutSession`,
`draftAccountSave`, `draftAlbum`, `eventAlbum`, `localDraft`, `memoryRemoval`,
`printJobRebuild`, `printQueue`, `quotes`, `resumeCache`, `sidebarTabStore`,
`useIndexedDBPhotos`.

**Draw with a browser canvas.** Replaced by the Skia drawer (Phases 3–5);
several hold pure rules that 0b can split out:
`canvasTextPainter`, `coverLayout`, `eventImage`, `fabric-types`, `heicPhoto`,
`looks`, `masks`, `ornaments`, `photoCheckRunner`, `photoQuotes`, `printBleed`,
`printPipeline`, `textFit`, `useCanvasEngine`, `wordArt`.

**Use a web-only package:** `fabric-loader` (Fabric), `faceDetection`
(face-api), `generateAlbumPdf` (jsPDF), `printSheetPdf` (pdf-lib),
`pressSheetJpeg` (pdf.js), `heicWorker` (libheif), `themeDetector`
(TensorFlow), `videoTranscode` (mp4-muxer), `supabase`, `orderAlbum` and
`nativeAuth` (the web Supabase client).

**Read values only the website build has** (`import.meta`, `__MEGY_BUILD__`):
`appVersion`, `memoryClips`, `psgc`, `qrMemory`, `report`, `samplePhotos`,
`sentry`.

**Use the browser window or page** (`window.`, `document.`, `navigator.`):
`albumTheme`, `authNotice`, `eventCamera`, `fonts`, `keepScreenOn`,
`pageScroll`, `pressSheetFiles`, `recoveryState`, `storeSettings`, `theme`,
`useAccountAlbums`, `useModalDialog`, `useBuilderState`.

**Import one of the files above** (they come along once that file is split or
replaced):
- Database only, through `supabase` (about 1,550 lines; Phase 1):
  `adminAlbumStats`, `adminBookings`, `adminOrders`, `clientErrors`,
  `contactMessages`, `eventBookings`, `myOrders`, `payment`, `qrMemories`,
  `roles`, `storageUpload`, `templateSettings`, `testerCode`.
- `eventHost` (supabase, eventCamera), `orderCover` (supabase, report,
  useIndexedDBPhotos), `orders` (supabase, generateAlbumPdf, printPipeline,
  printQueue, orderAlbum), `passwordRecovery` (supabase, nativeAuth,
  recoveryState), `useAlbumSync` (supabase, albumTheme), `useCloudPhotos`
  (useIndexedDBPhotos).
- Small, cheap wins for 0b: `pageColors` (one colour-contrast function from
  coverLayout), `slotShapeStyle` (masks), `resumeOffer` (a type from
  localDraft), `albumSizeOptions` (storeSettings), `exif` (heicPhoto, and the
  exifr package, which would need adding to the allowed packages).
- The 1.x frame, gone in 2.0: `nativeShell` (Capacitor), and through it
  `useSampleAlbumNotes` and `useTesterStamp`.
- Website styling only: `utils` (Tailwind class names, clsx).
