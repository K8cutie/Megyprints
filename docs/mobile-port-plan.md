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
  to show it, the "converting" picture (website: the HEIC worker, EXIF).
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
`.native.ts` twin is listed, and checks the twin exports the same names. The
app's tsconfig needs `"moduleSuffixes": [".native", ""]`, and the app's own
import check must resolve `.native.ts` the same way.

Still not shared: `useBuilderState` imports 15 files that are not on the
list. Step 1 splits (pure part listed): `masks` (isMaskId), `looks`
(isLookId), `pageColors` (contrastRatio from coverLayout), `fonts`
(DEFAULT_TITLE_FONT), `wordArt` (TEXT_LINE_HEIGHT), the `WizardStep` type
from `assistant/wizard`. Device storage still read inside helpers (each
fails closed, without a crash, outside a browser, but forgets): `albumTheme`
and `quotes` (the occasion, the AI quote cache), `albumSyncRecord`
(readSyncRecord, drafts saved before DraftSync), `draftAlbum` and
`localDraft` (pure parts used; the files also read localStorage). Needs a
platform piece: `textFit` (caption measuring with a browser canvas). Phase 1
pieces: `supabase`, `authContext`, `useAlbumSync` (the app's own Supabase
client and sign-in, as a twin or passed in).

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
`watchFolders` points at the repo root). The website build never reads
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
