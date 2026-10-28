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

### 0b so far (2026-10-28, branch `feat/port-phase-0b`)

Step 2 is done for the device pieces. `useBuilderState` no longer touches the
browser itself: it reads one `BuilderPlatform` (`src/shared/platform.ts`, on
the shared list) from `BuilderPlatformContext`:

- `deviceStore` / `sessionStore`: the saved draft and the "start a new album"
  signal (website: localStorage / sessionStorage).
- `usePhotoStore()`: photos kept on the device, read back with a URL or URI
  (website: IndexedDB).
- `photos`: HEIC check and conversion, size, when the photo was taken, a URL
  to show it, the "converting" picture (website: the HEIC worker, EXIF), and
  which saved URLs must be found again in the photo store when an album
  opens (`urlNeedsReload`; website: a blob: URL; app: anything that is not
  the store's own lasting copy, since a picker's URI can stop working once
  the app is closed).
- `faces`: face finding for crops and the QR corner (website: face-api).
- `photoCheck`: blur, repeats, closed eyes (website: photoCheckRunner).
- `lifecycle`: the app going to the background and coming back (website:
  tab visibility).

The website passes nothing and gets `lib/browserPlatform.ts`, which calls
exactly what the builder called before (no change on the website). The
default comes from `lib/defaultBuilderPlatform.ts`; the app's bundler picks
its twin `defaultBuilderPlatform.native.ts` ("none"), so the app never loads
face-api, IndexedDB or the HEIC worker and must wrap the builder in the
Provider with its own pieces. The shared-code check accepts an import whose
`.native.ts` (or `.native.tsx`) twin is listed, and checks the twin exports
the same names. It also runs its browser check (not its import check) on
`useBuilderState` already, and bans `Blob`, `File`, `FileList` and
`URL.createObjectURL` / `URL.revokeObjectURL`, so none of the calls 0b took
out can come back. The album's occasion goes through `deviceStore` too
(`readAlbumThemeFrom` / `writeAlbumThemeTo`), so a save to the account never
sends an empty occasion over the saved one.

Notes for Phase 1:
- The app's tsconfig needs `"moduleSuffixes": [".native", ""]`, and the
  app's own import check must resolve `.native.ts` the same way.
- **One copy of React.** The builder gets its device pieces through a React
  context made in a shared file (`src/shared/platform.ts`). Metro's default
  lookup searches `node_modules` upward from the importing file, so a file
  under `src/` would get the website's `react` (repo root) while the app's
  screens get `mobile/node_modules/react`: two copies, so the app's
  Provider and the builder's `useContext` never meet, and hooks fail with
  "Invalid hook call". Fix in `mobile/metro.config.js`:
  `resolver.disableHierarchicalLookup = true` with
  `resolver.nodeModulesPaths = [<mobile>/node_modules]` (or
  `extraNodeModules` for `react` and `react-native`). Phase 1 check: the
  `react` that `src/shared/platform.ts` gets is the same file the app uses.
- **Open PR #158** (photos with no capture time) changes the same lines:
  it reads `readPhotoTime(file)` → `{ capturedAt, timeSource }` with the
  file's date as a fallback. Whichever merges second widens
  `PhotoIntake.captureTime` to return that shape (website: `readPhotoTime`;
  app: the gallery's date).

Still not shared at the end of 0b: `useBuilderState` imported 15 files that
were not on the list. Phase 3a (below) shared all of them.

### Phase 3a (2026-10-29, branch `feat/port-phase-3a-shared-builder`, stacked on 0b)

`useBuilderState` is on the shared list: the app runs the website's own album
builder. No change on the website (all website tests pass, the build has the
same chunks, ESLint finds nothing new). Like 0b, it touches code the website
runs, so it is **held until after the Nov 9 re-apply**.

The pure parts were split out of their files, which re-export them (no
website import changed): `masks` → `maskShapes` and `wordArt` →
`wordArtRules` (byte-identical to the same split in PR #216, so the two meet
without a conflict), `looks` → `lookRules`, `fonts` → `fontCatalog`,
`coverLayout` → `colorContrast` (contrastRatio, so `pageColors` is shared),
`assistant/wizard` → `wizardSteps` (the `WizardStep` type), `albumTheme` →
`albumThemeRules`, `quotes` → `themeQuotePool`, `localDraft` →
`localDraftRules`, `draftAlbum` → `draftAlbumRow`, `useAlbumSync` →
`albumCloud`. `textFit`, `pageColors` and `albumSyncRecord` are shared as they
are.

Device storage goes through the store it is handed, same keys and values:
the quote cache (`createThemeQuotes({ store, endpoint })`; website:
localStorage and `/api/theme-quotes`, app: its deviceStore and `null`, so no
relative-address call), the old per-device sync record
(`readSyncRecord(albumId, store)`), the occasion (`writeAlbumThemeTo(store, v,
announce)`).

New platform pieces (`src/shared/platform.ts`), website values in
`lib/browserPlatform.ts`, each calling exactly what the builder called before:
- `textMeasurer()`: words measured in a CSS font (website: the canvas
  `textFit` used; app: Skia's fonts). `textFit`'s default measurer comes from
  `canvasMeasurer`, whose app twin `canvasMeasurer.native.ts` is none.
- `quotes`: the occasion's caption lines (website: `lib/quotes`; app:
  `createThemeQuotes` on its deviceStore).
- `occasionChanged(occasion)`: tell the screens showing the occasion
  (website: the `megy-album-theme` window event).
- `cloud`: `signedInUserId()` (who the saved sign-in says is signed in),
  `albumVersion(id)` (one album's `updated_at` only: `'offline'`, `null` for
  no such album, or `{ updatedAt }`), `useUser()` (who is signed in) and
  `useAlbumSync()` (the album rows). The builder is never handed the Supabase
  client, so it can't read or write a table on its own. Both reads are in
  `lib/albumCloud` (`signedInUserIdWith(client)`, `albumVersionWith(client,
  id)`), and every albums write still goes through ONE function,
  `saveAlbumRowWith` there (on its version, never an upsert). The website
  binds all of them to `lib/supabase`; the app binds them to its own client
  (`useAlbumSyncWith(its client)` and the two reads).

The shared-code check allows a type-only import of `@supabase/supabase-js`
(`SHARED_TYPE_ONLY_PACKAGES`: erased at build, the app has the same package
and hands in its own client). The app's tsconfig now has `moduleSuffixes
[".native", ""]` and maps `@supabase/supabase-js` to its own copy; its import
walk takes `.native` twins the way Metro does. `mobile/test/sharedBuilder.test.ts`
mounts the website's builder under the app's React and the React Native test
preset with an app-style device (file:// photos, memory store, a made-up
client): 40 photos go in, the album is made with every photo placed, and the
draft is kept in the device store.

Not proven yet: the builder on Hermes on a phone (the test runs under Node);
the quote pool's `\p{L}` pattern and the "saved at 2:41 PM" wording
(`toLocaleTimeString`) on Hermes.

**Review fixes (2026-10-29).**
- The album content key (`albumSyncRecord`) now reduces every URL only this
  device can open (`blob:`, `file://`, `content://`) to the one `"blob:"`.
  A cover's own photo is kept in the cover page as such a URL
  (`background.image`; the photo itself is known by `localPhotoId`), so the
  app's photo store handing back a different URI on a later open no longer
  looks like a change, and the same album keys the same on the website and
  the app. The website's keys are unchanged (pinned in
  `albumSyncRecord.spec.ts`), so records already saved still match.
- `cloud.client` is gone (see the `cloud` bullet above).
- The pieces the builder calls on their own (every `photos.*` function,
  `textMeasurer`, `occasionChanged`, `quotes.ensureThemeQuotes`) are typed
  `this: void`: an object-literal method that uses `this` is a type error.
  A class method is not caught: write them as arrow functions or closures.
- `browserPlatform.spec.ts` checks the website's `textMeasurer()` is the
  canvas measure `textFit` used (it was the one new piece no test covered),
  and the two account reads.
- `test-renderer` (used by `mobile/test/sharedBuilder.test.ts`) is in
  `mobile/package.json`, at the 1.3.0 jest-expo pins.

**For Phase 3b: the app's deviceStore must be saved when `setItem`
returns.** The builder saves the album in progress when the app goes to the
background (`lifecycle.onLeave` → `saveDraftNow`) and counts it safe once
`setItem` returns, as localStorage guarantees. Android may close the app
right after, so: expo-file-system's `writeSync` to a second file then
`moveSync` over the first (`draftFile.ts`'s pattern made synchronous; SDK 58
has `writeSync`, `moveSync` and `textSync`), or MMKV (not a dependency yet).
Never an in-memory copy written later, never AsyncStorage (Android reads a
value only up to about 2 MB, and the `megy-album-v5` draft can be bigger).

**Open PRs that meet this branch** (checked with `git merge-tree` against
every open PR on 2026-10-29). Whichever lands second follows the recipe.
- **#158** (photos with no capture time, `claude/infallible-wu-5a5d9e`):
  new conflicts in `draftAlbum.ts` and `useAlbumSync.ts`, because 3a moved
  the code #158 edits. Move its `timeSource` edits to where that code is now:
  `AlbumData` (the photo fields), `serializeAlbum` and `deserializeAlbum` in
  `albumCloud.ts`; `StoredDraft` and `albumDataFromDraft` in
  `draftAlbumRow.ts`. Keep 3a's thin `useAlbumSync.ts` and `draftAlbum.ts`
  (if the merge keeps #158's lines there instead, they are dead code and
  `timeSource` is lost from the cloud save and the draft row). In
  `useBuilderState.ts`, do not import `readPhotoTime` from `./exif` (a
  browser file; the shared-code check fails): widen
  `platform.photos.captureTime` to return `{ capturedAt, timeSource }`, have
  `lib/browserPlatform` call `readPhotoTime`, and give the app's twin and the
  test devices (`builderPlatform.spec.ts`, `mobile/test/sharedBuilder.test.ts`)
  `timeSource: 'file'` or `'exif'` as they really know it.
- **#154** (date stamp, `claude/date-stamp-button`): `useBuilderState.ts`
  conflicts as it already did with 0b. #154 adds an import of
  `assistant/dateStamp`, which is not on the shared list and imports the
  unlisted `wordArt`. Point `dateStamp.ts` at `pages/builder/wordArtRules`,
  add `src/assistant/dateStamp.ts` to `SHARED_MODULES` and run
  `npx vitest run src/shared` (it must use no browser API).
- **#208** (sample album each day): merges with no conflict; its new imports
  stay in the unshared `localDraft.ts`.
- **#216 / #219** (page drawer): the `masks`/`wordArt` splits are
  byte-identical. Only `sharedModules.ts` (keep both sides' lines, in sort
  order) and this file conflict.
- **#165** (photo shape) touches `useBuilderState.ts` and merges cleanly; its
  new import (`pageTemplates`) is already shared. The other open PRs don't
  touch shared files in a way the check would refuse.

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

## Phase 3 notes (2026-10-29): make the album, see it as a book

Branch `feat/port-phase-3`, stacked on `feat/port-phase-3a-shared-builder`
(#220, held) and `feat/port-renderer-on-phone` (#219, stacked on #216, held), with
`origin/main` merged. The first commit changed no website file; the review fixes
(below) moved four website rules into shared files with no change to what the
website does, so the branch holds website changes of its own too, and with those of
#213, #220 and #216 it is a DRAFT under the same HOLD (nothing that changes code the
website runs is merged before the Nov 9 re-apply).

### What was built (all in `mobile/` and `tools/`)

- **The website's own album builder runs the app's album.** One `useBuilderState`
  for the whole app (`src/builder/BuilderProvider.tsx`), on the app's platform
  (`src/builder/appPlatform.ts`). The screens call the steps in
  `src/builder/albumFlow.ts`, which are calls on the builder (setAlbumTitle,
  setAlbumSize, addPhotos, setCoverToPhoto, setBoxText, generateAlbum): nothing in
  the app lays out a page.
- **The platform pieces** (shared/platform.ts):
  - `deviceStore`: one file per name in the app's documents, written to a second
    file and moved over the first with expo-file-system's synchronous calls
    (`writeSync`, `moveSync`, `textSync`), so a value is saved, whole, before
    `setItem` returns. Reads are kept in memory after the first.
    `sessionStore`: memory (this visit only).
  - `photos` / photo store (`src/builder/appPhotos.ts`): the Phase 2 photos by
    their content:// address, never copied. The store keeps a small index
    (address, name, bytes, size, colour space) in the device store. Reading a photo
    back asks the phone whether it is still there (`inspectPhotos`, the file's
    header only, one native call for all photos asked at once), so a photo deleted
    while the app was closed shows as missing when the album opens
    (`urlNeedsReload` is always true: every address is checked on open). HEIC goes
    in by its address (Android decodes it): nothing is converted. The file size the
    gallery index does not give is read from the phone before the photos go in, so
    two different photos with one name (chat apps) are never taken for one photo
    picked twice (the builder knows a photo by name AND size).
  - Colour: every photo's colour space is written down as it comes in
    (`needsSrgb`), for the print step. Pages on screen are drawn from small
    upright sRGB copies (`drawableCopy`, Android's ImageDecoder: EXIF rotation,
    HEIC, `setTargetColorSpace(SRGB)`, at most 1280 px) in the app's cache, made
    again when the phone clears it.
  - `faces`: none (no on-device face library in the app yet): photos are centred,
    as on the website when it finds no face. `photoCheck`: not available.
  - `textMeasurer`: the page renderer's Skia fonts (`src/builder/textMeasurer.ts`),
    once loaded (expo-asset); null before, so nothing is said about a caption's fit.
  - `lifecycle`: AppState (the photo index is written when the app leaves, with
    the album). `quotes`: the website's quote pool on the device store, curated
    lines only (no AI call). `cloud`: the app's own Supabase client and sign-in,
    through the website's one albums write (`albumCloud` useAlbumSyncWith).
- **Screens**, the website's order and words: Name and occasion (AlbumThemeStep's
  words, unskippable, the "Next" says what is missing instead of being greyed) →
  Size (the website's sizes with layouts, less the owner's switched-off ones read
  with the app's client, fail open; BuilderSetup's lines) → Photos (Phase 2, its
  way on is now the website's "Next: pick your cover →") → Cover (CoverEditor's
  words: the album's photos, a tap puts one on the cover, the title, "Too long for
  the front cover" with "Make it fit (size N)") → "Make my album →" → "Making your
  album" (GeneratingOverlay's words) → Preview.
- **Preview**: the closed book's front cover first, then one page at a time, or
  "See it as an open book" (page 1 on the right across from the inside of the front
  cover, then 2 | 3…), turned with the buttons or a swipe, with the website's page
  turn (pageTurn.ts planTurn, drawn with React Native's Animated: the leaf hinged
  at the spine, front then back). Where a turn goes and the counter/caption are
  the website's shared previewPaging.ts. The pages a turn would show are drawn
  ahead of time, and a turn waits (at most 1.5 s) for its leaf's pages. At the end:
  "Done" (ordering is not in the app yet, and the screen says so).
- **Every page and the cover are drawn by the page renderer** (`src/render`, PR
  #216/#219) from the builder's own page data, at screen size, saved as JPEGs in
  the cache under a name made from everything on the page. The renderer gained the
  **cover**: `planPage({ coverMode })` plans the front cover the way print does
  (`printPipeline renderPageLayers(coverFront, …, true)`): no binding keep-out, the
  photo cover-fitted at its focal point and zoom (`bgCoverFit`), a boxed title moved
  by its offset, the cover's float shadow (`wordArtShadow` onCover); and photo
  backgrounds (an album photo named by `photoId`).
- **Saved**: on the phone (the builder's draft in the device store, the Phase 2
  draft file, the photo index); in the account when signed in (the Preview saves it
  with the builder's `manualSave`, and the builder's own autosave runs as on the
  website).

### Proven

- **Album parity** (`mobile/test/albumParity.test.ts`, website half
  `tools/parity/webAlbums.spec.ts`, run again on every test run): three customers
  (40 photos 8x8 Wedding; 57 photos 6x8 Vacation, 4 without a time; 120 photos 8x6
  "Lola's 80th"), made by the website's builder on its own device pieces (vitest +
  jsdom; only IndexedDB, the EXIF reader, face-api and the account made up, as the
  website's specs do) and by the app's path (the app's platform and steps, photos
  from the Phase 2 draft). **40/40, 41/41 and 63/63 pages identical in every field**
  (template, every photo in every frame and caption box, captions, frames, pans,
  background), the same cover photo and title, the same occasion. A control: the
  same photos with another seed differ on most pages, so "the same" is not vacuous.
- **Caption fit** (`mobile/test/textMeasurer.test.ts`, website half
  `tools/golden/fitWeb.mjs`: the website's textFit in headless Chromium with the same
  font files): 252 captions (the golden pages' and 216 made to need shrinking, every
  bundled font and style, sizes 18 to 48; two cover titles). **251 of 252 give the
  same box, fit, "fits at" size and room**; 1 differs by one size step ("happy day"
  in DM Sans bold 42 px measures 0.005 px inside the box in Skia, over it in
  Chromium on Windows: the website says size 41, the app 42). 4,255 words and lines
  measured: worst 0.145 px from Chromium.
- **Account** (`mobile/test/accountSave.test.ts`, a made-up Supabase with an albums
  table in memory): signed out, nothing is written; signed in, the website's albums
  row (title, size, occasion, pages, cover, photos as facts only: no content://
  address in it); a second device signed in to the same account opens it by id
  (the builder's loadAlbum) with the same pages, the same photo facts, every photo
  missing there, the same cover and occasion; a later change saves onto the same row
  on its version. The phone's restart: the same album opens again from the files,
  and a photo deleted while closed shows as missing.
- The cover plan (`mobile/test/coverPlan.test.ts`): the title sits in the box the
  website's textFit measures the cover title in (coverMode, every size), moved by its
  offset; the photo is cover-fitted with `bgCoverFit`; a picture that is not an album
  photo is listed, never faked; without coverMode the same page plans differently.
- The words (`mobile/test/albumWords.test.ts`): every phrase the app reuses is still
  in the website's file for the same step.

### Review fixes (2026-10-29)

A review of the first commit walked the app and found that going BACK from the
Preview could break a made album. Fixed, each with a jest test on the real shared
builder and the app's platform (`mobile/test/madeAlbumChanges.test.ts`,
`previewWords.test.ts`, `builderPieces.test.ts`, `albumWords.test.ts`):

- **Taking a photo out after the album is made moved every later photo.** Pages
  point at photos by their place in the builder's list (slotFills), and the app
  called `removePhoto`, which only shortens the list (no website screen calls it).
  39 of 41 pages showed other photos, and the saved album then read as broken and
  was deleted on the next start. Now, once any page or the cover holds a photo, a
  photo taken out is LEFT OUT (`leaveOutPhotos`, the website's way: every place
  stays), and put back it comes back (`keepPhotos`). Test: every frame shows the
  same photo, and the album opens again after a restart.
- **The Photos step of a made album is the website's**: "Keep my pages →" (back to
  the book) or "Make the album again" (asked first, `RemakeAlbumAsk`'s words and
  `remakeLosesMessage`), with a line that photos taken out or added change the pages
  only when the album is made again. Photos added after making used to wait
  silently forever.
- **A size tap on a made album** used to set the size alone (the old layout squashed
  onto the new shape: the website's 1-star bug of 2026-10-04). Now it is the
  website's change_size: asked first with `rebuildQuestion`'s words, then
  `generateAlbum({ size })` lays every page out again. The late "owner switched this
  size off" answer no longer changes a made album's size by itself.
- **A photo missing on this phone, picked again, goes back in its own place**
  (photoRelink): the app used to compare the draft's size (none for gallery photos)
  with the builder's real bytes, take the photo out and add the copy at the end. The
  photo store no longer keeps a photo the phone says it can't open (`readable:
  false`); such a pick is counted and named.
- **The Photos step counts what went in**: the same photo picked twice goes in once
  and a photo the phone can't open doesn't go in, so with 40 picked and one repeat
  the cover step used to send the customer back to a Photos step that still said 40.
  Now the step says why ("1 photo is already in your album…") and shows "Add 1 more
  photo".
- **The Preview** saves to the account once per album made (and once after signing
  in), not every time it opens (re-saving an unchanged album moved its "last
  changed" time and could make a website tab ask "edited on another device?" for
  nothing); it writes the album on the phone at once (`saveDraftNow`) before saying
  "Saved on this phone"; it shows the website's questions when the album was changed
  on another device or deleted there (`AlbumConflictBar`'s words); it names photos
  this phone no longer has and offers "Add the photos" (`photoPresence
  missingPhotos`); and it says one plain line instead of font names or raw errors.
- **"Start a new album"** said the album was "put away"; signed out it is deleted.
  Now the website's words (`StartNewAlbumPrompt`): "Starting a new one deletes this
  album from this phone. Sign in first to keep it." Signed out, the kept access to
  photos picked from Files is given back too.
- **Back button**: "Done" goes back to the start screen with nothing under it
  (Android back then leaves the app instead of opening the cover step); back does
  nothing while the album is being made; going to the Preview from a step returns to
  the Preview already open instead of stacking a second one.
- **The cover title's "too long" check** is shown only when the title's font is in
  the app: the website's default, Cinzel, is not, and measuring in the phone's serif
  was a guess. The caption-fit parity (251 of 252) covers the three bundled fonts
  only.
- **Shared, not copied** (website files, no change to what the website does):
  `albumIsBuilt`, `coverStepNext` and the step words moved from `wizard.ts` into the
  shared `assistant/wizardSteps.ts` (wizard.ts re-exports them);
  `pages/builder/sizeOffer.ts` is the pure half of `albumSizeOptions.ts` (the sizes
  a customer may pick, given the owner's switched-off list); `assistant/rebuildQuestion.ts`
  and `assistant/types.ts` are on the shared list. `useBuilderState` reads the saved
  draft once for its owner check instead of on every render.
- Smaller: pictures drawn ahead are no longer "prefetched" into expo-image (Android's
  Glide can't load file://, it only logged 129 errors); a page drawn before is shown
  from its file after a restart (what it found is kept beside it), old page pictures
  are pruned, the cover picture waits for a pause in typing, and the decoded photos
  (now at most 6, about 5 MB each) are let go when the book or cover is left and when
  the app goes to the background. The words under the Photos grid now say photos
  with no date go near the end of the album (a 4th parity scenario has 5 such photos
  in the middle of the roll: the same 40 pages on both sides, all 5 on the album's
  last fifth).
- **Not changed:** every app start still asks the phone about every photo once
  (`urlNeedsReload` is always true): a 250-photo album is one native call, but each
  photo's header is opened.

### Seen on the emulator (2026-10-29)

My own `pwa_test` emulator (Android 14, x86_64, port 5574), the release APK
built in my own short folder `C:\m3p`, no `.env.local` (so the app reached no
server: signed out). 44 test photos made from the website's
`public/sample-photos` with EXIF times added, one stored on its side with EXIF
Orientation 6, and the golden Display P3 photo.

- Start → Make an album → Name: "Next" tapped first says "Name your album and
  choose an occasion to continue." and marks both; then "Our Boracay Trip" +
  Vacation → "Our Boracay Trip · Vacation. Tap Next." → Size (8x8 picked, the
  five sizes with their photos-per-page and lines) → Photos (44 picked from the
  grid; "Next: pick your cover →") → Cover: the front cover drawn by the renderer
  with the title and its float shadow, then with the tapped photo cover-fitted;
  "Not drawn in the app yet: font "Cinzel"…" shown → "Make my album →" →
  Preview on the front cover (the making screen took under a second and was not
  caught in a screenshot) → page 1 (a right page: binding keep-out on its left)
  → "See it as an open book": inside of the front cover | page 1 → … → pages
  38-39 → page 40 | inside of the back cover, with "Done" and "Ordering from the
  app comes in a later version."
- The photo stored on its side shows upright (page 40). The Display P3 photo's
  red patch reads (239, 0, 21) on the screen: the website's sRGB (240, 0, 21),
  not the raw (220, 40, 40).
- The app killed (`am force-stop`) and opened again: "Continue my album" opens
  the same album on the page it was on.
- **Found and fixed on the emulator:** the first build's page turn ended almost at
  once: a page finishing drawing re-rendered the screen, which stopped the
  animation, and its stop ended the turn. Now only the animation's own end ends
  it, and the pages a turn shows are drawn first. A screen recording shows the
  leaf lifting at the spine and landing over about 0.8 s (37 frames).
- No JavaScript error in the log; 133 MB PSS after paging through the album (44 photos;
  see below for 250).

### Seen on the emulator after the review fixes (2026-10-29)

My own `pwa_test` emulator (Android 14, port 5564, read-only, its old photos hidden),
the release APK built in my own short folder `C:\m3p` (x86_64 only), with the
project's public Supabase URL and anon key in `mobile/.env.local` (signed out: no
account used). 250 made-up photos (Python PIL: shapes, colours and a big number, no
people; 3000x4000, every 12th one 4000x3000; EXIF DateTimeOriginal over 2026-10-20..22)
pushed to `DCIM/Camera` and media-scanned.

- Name → Size (8x8) → Photos: 6 picked first, the step says "add 34 more" with
  "Add 34 more photos" as the only button (no way on); then "Select all 250 photos" →
  250 → "Next: pick your cover →" → Cover (photo 3, title edited to "Family Trip 2026
  in Bohol", drawn on the cover as typed) → "Make my album →" ("Making your album /
  Looking at your photos…" caught fading out) → the Preview on the front cover →
  page 1 alone, then "See it as an open book" with page 1 on the right of "Inside of
  the front cover" → 12 page turns (a frame mid-turn caught) → pages 100-101 of 106
  show photos 236-241, taken on the last day.
- **Memory** (`dumpsys meminfo`, TOTAL PSS): 229.6 MB after "Make my album" (250
  photos, 106 pages), 253.0 MB after 24 pages, 263.3 MB after 100 pages; on the second
  build 230.9 MB after making and 266.2 MB after 20 single-page turns. No FATAL, no
  OutOfMemory, no JavaScript error and no Glide error in logcat for either walk (the
  only app lines at error level are Android's own keyboard-animation timeouts).
- Force-stop and open again: "Continue my album" opens the same album (106 pages,
  the same pages). Right after turning pages it opened on the cover: the page the
  book was on is saved with the builder's quiet timer (up to about 15-30 s), the album
  itself when the Preview opens. 20 s after the last turn it opened on that page (21).
- **A photo deleted from the phone while the app was closed** (photo 6, on page 1):
  page 1 shows an empty page and the Preview says "1 photo on page 1 isn't on this
  phone any more…" with "Add the photos". The photo put back on the phone (a new
  address) and picked again: "Keep my pages →", and page 1 shows it again in its own
  place, 106 pages as before.
- "Start a new album", signed out: "Starting a new one deletes this album from this
  phone. Sign in first to keep it."
- **Airplane mode on** (`cmd connectivity airplane-mode enable`, ping unreachable):
  a new album (84 photos of one day, "Select" on the day) named, sized (all five sizes
  offered: the owner's list could not be read, so none is hidden), covered and made:
  42 pages.
- **Back through the steps**, on that album: Preview → Cover ("Continue to my pages
  →") → Photos (the made album's step: "Keep my pages →", "Add more photos", "Make the
  album again"). Photo 167, the first in the list, taken out, then "Keep my pages →":
  pages 1, 2 and 3 still show photos 174, 186 and 198, as before (before the fix every
  page moved by one photo). Back to Size: 8×6 tapped → "Make it 8×6" Landscape?" with
  the website's words → "Lay it out again" → "Album size changed to 8×6. Every page is
  laid out again for the new shape." Back to Name: the name and occasion are kept.
  Forward again to the Preview: the 8x6 album, 40 pages (photo 167 left out).
- At the end of the album, "Done" goes to the start screen, and Android back there
  leaves the app (it used to open "Your cover").
- **Found and fixed on the emulator:** after adding 244 photos to 6 already on the
  Photos step, the grid stayed blank until scrolled (FlashList kept the 6 in view while
  the 244 older photos were put before them). Its keep-in-view is off now; on the
  second build the grid shows photos 1-12 at once. The step's words for 40+ photos are
  now the website's ("You have 250 photos ready. Add more, or go on to pick your
  cover."), not "enough for a 40-page album".

### Not done, not proven

- The size question uses the website's words, which mention "Studio pages" (a website
  editor the app does not have yet).
- After "Continue my album" the Preview is the only screen in the stack: there is no
  way back to the Photos or Size step of a made album except "Add the photos" when a
  photo is missing (editing is Phase 4).
- **No local Supabase ran.** Docker Desktop was running on this PC but its engine
  did not answer (`docker version` hung for over 6 minutes); it was not restarted
  (shared with other sessions). So the signed-in save and the website opening it are
  proven with unit tests on the real `serializeAlbum` / `saveAlbumRowWith` /
  `deserializeAlbum` / `loadAlbum` against a made-up Supabase, not against a real
  database or the real website.
- **The cover's picture is not held to the website's by a golden page**: the
  website's golden hook (`renderPageCanvasForPrint`) has no cover switch; adding one
  is a one-line website change (it would inherit the HOLD). The cover title's default
  font, **Cinzel**, is not in the app (drawn in the phone's serif; the preview says
  so). Spine and back are not drawn.
- Not drawn yet (listed under the book when a page has one): textures, stickers,
  QR codes, graphics/ornaments, corner art, soft and textured edges, colour looks,
  71 of the website's 74 fonts (Georgia, the default caption font, included).
- No face finding and no photo check in the app; no AI quote lines (curated only).
- Not on a real phone; one emulator (Android 14, x86_64). No editing, no ordering.

---

## Page renderer notes (2026-10-28, Phase 5 groundwork)

The riskiest part of 2.0 was done early: the app draws an album page itself
(`mobile/src/render`, react-native-skia), and a test holds it, pixel by
pixel, to the picture the website's print renderer makes of the same page.
A review of the first version found that the words half of that test could
not tell whether the words were drawn at all; this section describes the
check as it is after the fixes.

### What draws a page

- `pagePlan.ts`: what goes where, from the page data, without drawing. It
  follows `printPipeline.ts drawPrintPage` step by step, and every number
  comes from shared website code: print size (`printSize.ts`), the template
  adapted to the page, margins with the spine keep-out (`binding.ts`), a
  moved frame (`slotGeometry.ts`), masks (`maskShapes.ts`), the caption
  margin and alignment (`wordArtRules.ts`), washes (`gradient.ts`), the
  frame numbers (`printFrameSpec.ts`). Anything the app can't draw yet, or
  can't draw the website's way (a font style with no file), is listed in
  `plan.notDrawn`, never passed off as the real thing.
- `drawPage.ts`: the drawing, with the canvas rules where Skia's defaults
  differ (bilinear, no mipmaps; a photo's edges smoothed only when the
  drawing is turned off the page's axes, as Chromium does; smoothed clips;
  miter limit 10; shadows as blur sigma = shadowBlur / 2; the border stroke
  follows the clip path like `ctx.stroke()`). A print page is drawn on a CPU
  surface (`Skia.Surface.Make`) on the phone too: the same kind of drawing
  the check proves, and no GPU texture limit. Bleed: `bleedGeometry.ts
  mirrorOps`, the same mirrored strips as the website.
- **Shared, not copied:** the frame numbers (mat pads, shadows, rounded
  corner, inset lines, the border's 2x stroke) live in
  `src/pages/builder/printFrameSpec.ts`, and the heart outline in
  `maskShapes.ts heartCurves`. `printPipeline.ts` and the app both draw from
  them (a website refactor with no change to what prints: the golden check
  re-made the website pictures from the changed `printPipeline.ts` and every
  frame page still matches).
- `pageText.ts`: words with Skia Paragraph (HarfBuzz shaping), the website's
  own wrap (`wrapTextLines`) with a Skia measurer, and Chromium's placement:
  - **word by word**: Chromium's canvas (default `fontKerning: auto`) shapes
    each word and space on its own, so kerning across a space is never
    applied. Playfair Display has such pairs: "Our first beach day" at 80 px
    is 687.92 px in Chromium, 684.88 shaped whole, 687.92 word by word;
  - **'middle' from the font file** (`fontMetrics.ts`): OS/2 typo ascender /
    descender scaled to the font size, rounded to 1/64 px, as Blink does;
  - **glyph row**: Skia Paragraph draws glyphs `round(ascent)` px below the
    top it is painted at (not the baseline `getLineMetrics` reports).
    Calibrated against Skia's `drawText`: 112 of 112 font/size cases;
  - **shadow offset in page pixels**: a canvas shadow's offset and blur
    ignore the transform, so a turned or stretched title drops its shadow
    straight down. The first version turned the offset with the title (a
    title turned 12 degrees and stretched 1.3 times: its shadow's ink 11.7%
    off the website's; now 2.07%).
- `fontTable.ts`: 3 of the 74 fonts for now, **10 files**: Playfair Display
  and DM Sans each regular, bold, italic and bold italic (the faces the
  website loads, `src/index.css`), Dancing Script regular and bold (Google
  has no italic: a page in Dancing Script italic is listed in `notDrawn`).
  The first version had no DM Sans italics and no Playfair bold italic, so
  Skia faked them (22 to 58 px wider or narrower on one long line). A font
  the app does not have falls back down the page's own family list, generic
  last (`Georgia, "Times New Roman", serif` → the phone's serif), as Chrome
  on Android does, never to Skia's single default family.

### The golden check

- `tools/golden/goldenPages.ts`: **45 pages**. 10 from the website's
  generator, seeded (mulberry32, seed 0x5eed) on all five sizes (4 on 8x8,
  3 on 6x4, one each on 6x6, 8x6 and 6x8); 35 by hand: zoom and pan, a pan
  held at the photo's edge; every mask shape print draws (circle, heart,
  star, hexagon, arch, scallop, ticket, wavy, pinking, stamp, leaf,
  octagon, diamond, cloud, halftone, and oval and rounded, which print as
  rectangles today); page colours, linear and radial washes, faded
  backgrounds (opacity below 100); every frame style (matte, polaroid,
  shadow box, thin, double, rounded; matte, double and shadow box on round
  slots too), solid, dashed and dotted borders; the template's turned slot
  (t8x8-07, 15 degrees); a moved and resized frame; a photo in a caption
  box; captions left, right, wrapping, underlined, with a shadow, in every
  style of the three fonts; a quote in a photo frame; free titles (outlined;
  turned 12 degrees and stretched 1.3 times with a shadow; the same shadow
  alone, white words on white paper; see-through and turned); and a photo
  saved with a **Display P3 colour profile**. Photos are synthetic
  (`syntheticPhotos.ts`), never real ones.
- `tools/golden/renderWeb.mjs`: the website's `renderPageCanvasForPrint`
  (the picture each print-file page is shrunk from: 300 DPI, bleed, words
  in) in headless Chromium 1228 (playwright-core 1.61.1, GPU off), with the
  app's font files loaded into it. A page with words is drawn twice, with
  and without them (print's own `words: false`), and every line of words
  print draws is written down (`webEntry.ts`: each `fillText`, with its
  transform, font, colour, see-through, outline and shadow). Nothing in the
  tool uses the app's page code. Writes `tools/golden/web/` (not in git).
- `mobile/test/goldenPages.test.ts`: the app's renderer, headless in Node
  (react-native-skia's CanvasKit build: `LoadSkiaWeb` + `JsiSkApi`), every
  page compared. It re-runs renderWeb.mjs itself, before the tests are
  listed, when the website's print code (printPipeline.ts and everything it
  imports), the golden pages, the tool or the fonts changed
  (`tools/golden/sources.cjs`).
- **The bars** (`mobile/test/golden/compare.ts`), each set by measuring:
  just above the worst real page, with every kind of mistake scoring well
  over it. "Ink" is what the words paint: with-words minus without-words,
  exact on both sides.

  | Bar | Worst real page | Bar | Smallest mistake it must catch |
  |---|---|---|---|
  | Pixels differing outside the words' ink (pixelmatch 0.05, edges counted), share of the pixels counted | 0.061% | 0.15% | 0.465% (a double frame's inset line missing) |
  | Any 64 px tile: pixels off by more than 32 levels | 0.00% | 1% | 6.64% (the same) |
  | Each text's ink per colour channel, app vs website | 4.69% | 6% | 11.7% (the old turned-shadow bug) |
  | Each text's 8 px blocks, mean colour | 26.5 levels | 40 | 54 to 210 (shadow, outline, underline, letters missing) |
  | Where each text's ink sits | 0.36 px | 0.5 px | 1.21 px (a caption 1 px lower) |
  | Each line: same text, same spot, as wide, same colour / outline / shadow as print drew it | exact, ≤ 0.01 px, ≤ 1 px | | |

  Only each text's ink, widened by 2 px, is left out of the pixel bars, and
  only inside that text's box (and its mirror in the bleed); the paper or
  photo under a title is held to the page bar. The first version left whole
  boxes out (14 to 44% of a page) and only reported their pixels.
- **Mistake tests** (the second describe): each puts one small error in, in
  the page plan or in the drawing code itself, and the pixel and ink bars
  alone must catch it: a photo 1/4 px off (3 pages), a frame 1 px wider, a
  double frame's inset line missing, a dashed border drawn solid, a caption
  1 px lower, no words at all (4 pages), a title at opacity 0, the
  underline, outline or shadow missing, a quote in #FF0000 instead of
  #B85C38, a caption in black instead of #2D2D2D, the turned-shadow bug put
  back, and the italic font files taken away. All 19 fail as they must;
  their scores go to `tools/golden/out/mistakes.json`.
- First run: `cd tools/golden && npm ci`, then `cd mobile && npm test`
  (about 8 minutes: 45 pages and 19 mistakes, text pages drawn twice; a
  page takes 0.2 to 0.9 s to draw).

### Results (2026-10-28)

All 45 pages pass. Outside the words: 0.000 to 0.061% of pixels differ, and
no tile has a pixel off by more than 32 levels. What is left on photo pages
is the one blended pixel at each sharp stripe edge of a downscaled photo, up
to 15 of 255 levels apart (Chromium's Skia and CanvasKit round bilinear
weights differently); on the Display P3 photo, colour conversion rounding up
to 31 levels on a few pixels (0.033% of the page). Text: every line is the
line print drew, at print's spot to 1/100 px; each text's ink within 4.69%
of the website's, blocks within 26.5 levels, positions within 0.36 px. The
remaining ink difference is letter edges: Chromium on Windows draws letters
with DirectWrite (grid-fitted), Skia with FreeType. The smallest captions
come closest to the 6% ink bar (64-caption-yellow, 4.69%): a new golden page
with very small words is the likeliest to need the bar re-measured, never
loosened to pass.

### Not drawn yet (listed in `plan.notDrawn`)

Texture backgrounds, photo/picture backgrounds, QR codes (slot and caption
box), graphics/ornaments (slot, caption box, free-placed), stickers, theme
corner art, soft-edge and textured-edge masks, colour looks, the cover
(front, spine, back), every font but the three above, and Dancing Script
italic.

### Found on the way (website, not changed here)

- **Oval and Rounded masks print as plain rectangles.** The preview
  (`slotShapeStyle.ts`) and the editor draw them, but `printPipeline.ts
  applySlotClip` has no case for 'oval' or 'rounded'. The app copies print
  (golden page `masks-oval-rounded`); fixing print is a website change.
- **A path-shape mask (hexagon, scallop…) gets no border line in print**:
  `ctx.clip(new Path2D(...))` leaves no current path for `ctx.stroke()`.
  Masked slots have border width 0 anyway, so nothing prints wrong today.
- **Georgia** (the default text font) is a Microsoft font; Android phones
  don't have it, so a print file made on an Android phone already uses the
  phone's serif. For the app: bundle Gelasio (same letter widths, OFL).
- The website's real fonts come from Google Fonts as variable woff2 files;
  the check uses the static TTF files on both sides. Same designs; widths
  could differ slightly between the two file kinds.

### Not proven, and what must happen before Phase 5

- **On a phone.** Done on the emulator: see "Page renderer on the phone"
  below. All 45 pages pass the same bars when the phone's own Skia draws
  them. Still not seen: a real phone (ARM64).
- **Photo colours on the phone.** Measured on the emulator (below): the
  phone draws a Display P3 photo's raw numbers and the page fails; after
  Android's `ImageDecoder` turns the photo into sRGB (`srgbCopy` in
  `modules/photo-files`) it passes. Before Phase 5, every photo must go
  through that step before it is drawn on a print page.
- **Against Android Chrome.** The website pictures are Chromium on Windows.
  Customers' print files are mostly made in Chrome on Android (FreeType
  letters), which may sit even closer to the app's text.

## Page renderer on the phone (2026-10-28, the gate before print files in the app)

The Node check above runs Skia's CanvasKit build. This run draws the same 45
golden pages with **the phone's own Skia** (react-native-skia 2.14 native,
Skia m154, Hermes, release build) on the `pwa_test` emulator (Android 14,
x86_64), and holds the pictures to the website's with the same bars and the
same pixelmatch code. **All 45 pages pass.**

### What was built (all in `mobile/`, no website change)

- **Debug screen "Golden pages"** (`src/app/golden-pages.tsx`, logic in
  `src/dev/goldenRun.ts`): draws every golden page with
  `PageDrawer.renderPrintPage` (CPU surface, `Skia.Surface.Make`, print size
  with bleed), with and without its words, and writes the PNGs and
  `report.json` (the lines each text breaks into and how wide the phone's
  Skia measures them, each text's box, what the plan could not draw, timings)
  to the app's files folder. Reached from **Shared code check → Open golden
  pages**, or `megyprints-dev://golden-pages?run=1`.
- **Only in a test build made for it:** `build-android.ps1 -GoldenPages`
  runs `scripts/golden-phone-assets.cjs` (the golden pages, the test photo
  files and the font files, exact bytes as base64, about 4 MB, in
  `golden-phone/bundle.json`, not in git; it stops if the website pictures
  are out of date) and sets `MEGY_GOLDEN_PAGES=1`, so Metro resolves
  `megy-golden-pages` to that file (`goldenPages.js`). Every other build gets
  `src/dev/noGoldenPages.json` (`null`): no test pages, no link
  (`test/goldenBuild.test.ts`).
- `scripts/golden-phone-run.cjs --device <serial>`: installs the APK, opens
  the screen with `run=1`, waits, pulls the folder into
  `tools/golden/phone/` (`adb root` on an emulator without Google Play;
  `run-as` for a debug build).
- `npm run golden:phone` (`test/goldenPhone.check.ts`, not part of
  `npm run check`): checks the phone drew from the same website pictures and
  today's renderer code (a fingerprint of `src/render`, `goldenRun.ts` and the
  shared files they import), then runs `comparePage` / `pageFailures` /
  `lineFailures` on every page and writes `tools/golden/phone-out/`
  (`table.md`, `report.json`, pixelmatch diffs, website | phone | diff
  pictures).
- `src/render/pageWords.ts`: the lines and boxes a plan draws (`appWords`),
  moved out of the test so the phone works them out with its own Skia.
- The Node check has a new test: the phone's run code, given CanvasKit,
  draws pixel for pixel what the check draws (so a phone difference is the
  phone's Skia, nothing else).

### Results (emulator, release APK)

| | Node (CanvasKit) | Phone (native Skia) | Bar |
|---|---|---|---|
| Pixels differing outside the words, worst page | 0.061% | 0.063% (frame-thin-dotted) | 0.15% |
| Worst 64 px tile | 0.00% | 0.00% | 1% |
| Each text's ink, worst | 4.69% | 3.24% (free-title-outline) | 6% |
| 8 px blocks, worst | 26.5 | 24.8 (64-script-caption) | 40 |
| Where text sits, worst | 0.36 px | 0.35 px (quote-in-photo-frame) | 0.5 px |
| Lines as print drew them | all | all 21 lines, 12 text pages | exact |

- The phone's pictures are not the Node pictures: none of the 45 is pixel
  for pixel the same. On photo pages the two Skias differ by 1 to 3 levels
  (bilinear rounding; on the faded pages half the pixels are 1 level apart),
  on text pages letter edges differ by up to 37 levels (FreeType builds).
  Both sit within the bars, the phone's letters a little closer to the
  website's than CanvasKit's.
- Drawing a page took 13 to 93 ms on the emulator; the whole run (46
  pictures, 12 drawn twice, PNG encoding and writing) 13.3 s. Two runs gave
  byte-identical PNGs. Highest memory seen during a run: 211 MB (PSS,
  sampled about once a second).
- **Found and fixed:** every page with words stopped on the phone with
  "TypeError: undefined is not a function": `pageText.ts` called
  `ParagraphBuilder.dispose()`, which CanvasKit has and the native build does
  not (react-native-skia 2.14 installs `dispose` on most native objects, not
  on the paragraph builder). It now calls it only where it exists. Nothing
  else differed.

### The Display P3 photo

- Android reads the test photo (`photo-8.png`, a PNG with a P3 profile) as
  **"Display P3"**. The phone's Skia draws it with its raw numbers (the
  surface has no colour space): the page **fails**, 3.67% of pixels off,
  tiles 100% off, up to 64 levels. The red patch prints (220, 40, 40) where
  the website prints (240, 0, 21); the green (40, 170, 70) for (0, 173, 53).
- The same page with the photo first turned into sRGB by Android's
  `ImageDecoder` (`setTargetColorSpace(SRGB)`, then PNG) passes: 0.026% of
  pixels off, worst channel 19 levels, and the patches come out (240, 0, 21)
  and (0, 173, 53), the website's numbers. That step is
  `srgbCopy(source, target)` in `modules/photo-files` (Android 9+; older
  phones get `supported: false`).
- **What the photo intake needs (before Phase 5):** every photo drawn on a
  print page goes through `srgbCopy` (or the same decode in memory) first.
  To keep "photos are never copied into the app", do it at print time, one
  photo at a time, into the cache, and delete the copy after the page is
  drawn; a photo that is already sRGB (`converted: false`) can be drawn
  straight from the phone. The check (`npm run golden:phone`) fails if the
  as-is P3 page ever stops failing or the converted one stops passing.

### Not proven yet

- A real phone (ARM64), and other Android versions than 14.
- Fonts came into the test build as base64 bytes; the app's own way of
  loading the font files for print (Phase 5) is not built yet.
- No golden photo has an EXIF rotation, and none is a JPEG or HEIC: the
  phone's decode of those is not compared yet.
- A low-memory phone (the emulator has 2 GB).

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
