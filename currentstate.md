# Megy Prints — Current State
**Last updated:** 2026-06-20 (theme-system + guided-wizard session) · **Build:** ✅ green (`npm run build` exit 0, ~7s)
**Next session mode:** open — candidates below (richer themes / fulfillment wire-up / queued QA backlog).

> This is the resume point. Read this + `MEGY_NORTH_STAR.md` + `SESSION RULES.md` first.
> Everything below is build-verified; items the **user** watched live in the browser are marked ✅ seen.

---

## Session 2026-06-20 — Theme system, guided wizard, SVG backgrounds ✅ seen

The big arc: themes became **"the whole look"** and got surfaced in the guided flow, plus a real vector-art background system.

### Themes = everything (background + frames + fonts + accent + title + corners)
- **Root bug fixed:** `apply_theme` wiped its own background via a stale closure — it called `applyBackgroundToAllPages()` with no arg (reading a stale `currentPage.background`). Now passes the themed bg explicitly (same guard `set_background` uses). Themes finally show their background. (`actionEngine.ts` `apply_theme`.)
- **Photo frames** use each theme's accent color (`getThemedPhotoBorder` → `accentColor`), baked onto pages, rendered in editor/preview/print.
- **Fonts + text color:** new text defaults to the theme's `fontFamily`/`textColor` (`addTextElement`).
- **Auto themed title:** generation places an editable title on page 1 in the theme font + accent (`getThemedTitle` + `THEME_TITLES`; injected in `generateAlbumAction`, tagged `theme-title-*`). Re-theming restyles it AND swaps the default text when not user-edited (`restyleThemedTitles(theme)` in `useBuilderState`, called from `apply_theme`).
- **11th theme added: `baptism`** (TemplateType + THEMES + exhaustive maps in `layouts.ts`/`Templates.tsx` + `MegyAssistant` theme list).
- **Corner overlays DISABLED** (`THEME_CORNER_SETS = {}` in `types.ts`): the `public/themes/<occasion>/pages/*.png` assets are scrapbook frame-templates with empty frames baked in — they scattered empty frames in every corner. Render pipeline (`AlbumPage.cornerBase`, editor/preview/print) is intact for future real flourish art.

### Themes surfaced in the wizard
- Wizard step 2 **"Pick a Background" → "Pick a Theme"**: centered stage now renders an 11-theme grid with SVG thumbnails; selecting dispatches `apply_theme` (`MegyAssistant.tsx`, `wizard.ts` `pick_background` message). The generic background designer remains in the side panel as an override.

### Vector SVG backgrounds — 33 total (11 themes × 3 selectable templates)
- All themes now use **palette-driven SVG backgrounds** in `public/themes/bg/<theme>(-2|-3).svg` (baptism uses `baptism-1/2/3`). Subtle, print-crisp, no empty frames. Replaced the busy `bg-*.jpg` scrapbook JPGs (now **deleted**).
- **3 templates per theme**, grounded in occasion symbolism + traditional colors (baptism researched: dove=Holy Spirit, scallop shell + 3 drops=Trinity, cross+candle=Christ the light, white/gold/pale-blue liturgical). New data: `ThemeConfig.backgroundVariants: string[]` + `getThemeBackgroundVariants()`.
- **"Background style" picker** (side-panel Themes section): 3 thumbnails for the current theme; clicking dispatches `set_background` (image, applyAll) — swaps only the background, keeps photos/frames/title. ✅ seen (Baptism dove→shell, Wedding, Travel mountains).

### Surprise Me + wizard UX fixes (QA-driven)
- **Surprise Me is layout-only** now (reshuffles templates + photos-per-page, keeps theme bg/frame/corners). Guards when no photos. All "random theme + background" copy reworded.
- **Wizard progress numbering** aligned to step titles (`getProgress()` now `Step N of 7`, welcome = "Let's begin"); review-screen contradiction ("6 of 8" vs "Step 5") gone.
- **detectStep** gates Review on a *filled* album (not raw `length >= 40`) so a reset/empty album no longer dumps the user on Review.
- Review button renamed "Next Page →" → "See Next Page" (disambiguates from wizard "Next →").
- Print frame stroke doubled (clip was halving it); `regeneratePage` now preserves theme frame/corners; baptism aliases added to `intentParser`.

### Verification harness note
- Drove the live app via the Claude_Preview MCP. Photo upload was injected by staging photos into `public/_uitest/` then `DataTransfer` onto the hidden file input (native picker can't be automated). `_uitest` cleaned up. Heavy HMR churn corrupts the dev module graph ("useBuilderContext must be used inside BuilderProvider") — fix is **restart the preview server**, not a code bug.

### Pending / queued (theme work)
- Eyeball the remaining new styles with the user (Kids rainbow, Vintage stamp, Graduation cap, etc.).
- Optional: real flourish corner art (re-enable `THEME_CORNER_SETS`), or "photos fill the ornate frames" feature.
- Backlog from QA: `MIN_PAGES=40` messaging ("Page 1 of 40" from few photos), native `confirm()` on "New" → styled modal, reset should rewind wizard to welcome, delete dead `WizardGuide.tsx` + `src - Copy*`.

---

## Environment
- node_modules installed; Node 24.x / npm 11. `npm run build` = `tsc -b && vite build`, passes green.
- Dev server: `npm run dev` → **http://localhost:3002/** (3000 and 3001 were busy this session). Builder at `/#/builder`.
- `/builder/*` is **NOT** behind an auth guard — Megy works fully **without login** (IndexedDB). Supabase = cloud save only.
- **Backup rule in force:** before editing/deleting any file, snapshot to `_backups/<ts>-<label>/`. `_backups/` is gitignored. (Individual-file deletes DO work now — see "jailed twin" below — even though the `src - Copy/` trees are still lock-stuck.)

---

## The big arc this session: "Megy is the sole orchestrator," made real end-to-end

### MP-T — Text routing through Megy ✅
- New intents `update_text` + `delete_text` (`types.ts`, `actionEngine.ts`, `intentParser.ts`).
- `add_text` now sets typed content (store `addTextElement` gained an optional `text?` param).
- Megy's panel text calls (add/update/delete) now go through `dispatch`, not raw `builder.setX`.

### MP-7 — Lock the chokepoint ✅
- **Deleted the private `engineRef` `ActionEngine`** inside `MegyAssistant`. There is now **one brain** — the context's `dispatch` → one shared `ActionEngine`.
- Chat handler, `surprise_me` (×3), `shuffleLayout` all route through `dispatch`.
- New `preview_album` intent; `setPhase('preview')` routed through Megy.
- Verified: **zero** direct album-mutation calls remain in `MegyAssistant.tsx`.

### MP-8 — Canvas demoted to a Megy-driven renderer ✅ (core) ✅ seen
- `useCanvasEngine.ts`: slot photos are **select-only** (no drag/resize/rotate); text and background are **render-only**. The manual "Canva" editing layer is gone behaviorally.
- `BuilderEdit.tsx`: removed the **"Container Mode"** toolbar button (+ its `BoxSelect` import) — the last hand-edit affordance.
- Kept: click empty slot → photo picker (fill), select filled slot → Delete (the delete-&-replace verb).
- ⚠️ The slot-fill (`fillSlot`) and Delete-to-clear (`clearSlot`) still call the store directly, not `dispatch` (no `fill_slot`/`clear_slot` intents yet). Functionally fine; not yet routed.

### Option A — One continuous Megy-led flow, Megy as the centerpiece ✅ seen
The center screen and the right panel used to be **two competing flows** ("Start Creating" fought the wizard). Now unified:
- **`builder.wizardStep`** (the previously-orphaned store slot) is the single source of truth for the journey. Phase (`setup`/`edit`/`preview`) is **derived** from it via `phaseForStep()` (`wizard.ts`).
- `pick_size` is back as the wizard's **first step**; `WIZARD_ORDER` exported.
- Two-way sync (engine ↔ store ↔ panel) + a forward-only reconcile effect (runs on mount + album-generated changes) → **the returning-user desync is fixed** (a finished album lands on "Review," not "Upload").
- **Megy's card is now the full-screen centered stage** during the guided pre-album steps (welcome, pick_size, pick_background, upload_photos, generate_album); once an album exists it falls back to **canvas + side panel**.
- **Home button** added to the centered stage (it covers the top bar, so this is the exit).
- Removed the **"Skip wizard (I know what I'm doing)"** welcome option AND the top-right **"Skip"** link — Megy is the reassuring authoritative guide. Only Home / ← Previous / Next → remain.
- **Authoritative styling:** action buttons are full-width, stacked, with a big bold primary CTA.

### Background — richer + correct ✅ seen (rich UI) / ⚠️ verify (generate-carry)
- The centered background step uses the full **`RichBackgroundDesigner`** (solid, gradient, **custom image upload**, patterns, opacity) — not 6 flat swatches.
- **Applies to ALL pages by default** (`set_background` with `applyAll: true`).
- **`generate_album` now carries `currentPage.background`** into every generated page → a custom background chosen before generating no longer gets wiped. *(Build-green; user hasn't re-confirmed the custom-image case end-to-end — verify.)*

### Size step — guidance by photos-per-page ✅ seen
- Size options now read like **"8×8" Square — 1-4 photos per page"** (instead of "most popular"/"cute"), so small albums don't get thumbnail-crammed.
- These ranges are **derived from `DENSITY_BY_SIZE`** (see below), so the size step and density step can never disagree.

### Single source of truth — `densities.ts` ✅
- New **`src/pages/builder/densities.ts`** owns `DENSITY_BY_SIZE`, `DENSITY_LABELS`, `densityRangeLabel()`.
- Both Megy assistants + the wizard import it. **Fixed a latent bug:** the home Megy's copy was missing the `9x9` key.
- User preference recorded: **one source of truth; remove duplicates that drift** (saved to agent memory).

### MP-6 (partial) — "Jailed the masked twin" ✅ seen
- The two-`MegyAssistant` naming collision is **resolved**: deleted the home-page duplicate `src/components/MegyAssistant.tsx`. Only **one** `MegyAssistant.tsx` remains (the builder one, `src/assistant/`).
- `Home.tsx` hero now renders a welcome + **"Start Creating"** CTA that routes into the builder (the real Megy). Bundle shrank ~50 KB (dead code gone).

---

## The second arc this session: generation intelligence + hardening

### Binding / gutter keep-out zone ✅ seen (editor & preview) / ✅ (print)
- New **`src/pages/builder/binding.ts`**: `BINDING_INCHES = 0.5`, `bindingMarginFraction()`, `bindingEdge()` (even page → reserve **right** edge, odd → **left**), `applyBindingMargin()`.
- True **mirrored inner keep-out** (not just a guide line) applied consistently across **editor canvas** (`useCanvasEngine.ts` `renderTemplateSlots` + dashed peach binding guide), **preview** (`BuilderPreview.tsx`), and **print** (`printPipeline.ts`).
- Fixed a print-geometry bug: binding was applied as a **percentage vs. a fraction** mismatch — corrected so the print keep-out matches the on-screen one.
- `renderScene`/`renderTemplateSlots` now take `albumSize` + `pageIndex` so the engine knows which edge to mirror.

### Preview rewritten to render LIVE ✅ seen
- The duplicate-spreads / wrong-page bug was **stale cached snapshots** (keyed by `page.id`, captured 200 ms late during navigation). **Fix:** `BuilderPreview.tsx` `PageView` now renders directly from **live page data** — no snapshot dependency.
- Removed the **white center strip** (pages render flush; only the dashed peach binding line remains) and the old 20 px gap/spine.
- `backgroundToCss` fixed: reads the real `bg.image` field (was `bg.customImage`/`bg.preset`), supports **radial gradients** + **opacity** → backgrounds no longer vanish in preview.

### Photo upload de-duplication ✅ seen
- Hard-refresh was **doubling** photos (196 → 392) because IndexedDB photos reloaded AND re-appended. `addPhotos` now dedups via an `uploadedPhotosRef` set so re-adds are no-ops.

### Supabase scalability — save strategy reworked ✅
- Photos stay **IndexedDB-only** (never uploaded). Cloud holds metadata only.
- **Local save:** instant → **30 s debounce**. **Cloud save:** **10 min interval + on tab-hide (`visibilitychange`/`pagehide`) + on unmount** (`cloudDirtyRef`, `persistRef`, `flushLocal`, `flushCloud` in `useBuilderState.ts`).
- **Cover-image bloat fixed:** the canvas snapshot is now a **small JPEG** (`toDataURL({format:'jpeg',quality:0.5,multiplier:0.35})`).
- **`loadAll` over-fetch fixed:** `useAlbumSync.ts` selects only `id, title, album_size, cover_photo, created_at, updated_at` (was `*`). `UserProjectsSection.tsx` dropped the "X pages" label that forced the over-fetch.
- Conclusion reached with user: **structurally scalable to ~10k concurrent**; if load grows, bump the Supabase compute tier (cheap relative to the conversion value).

### EXIF "moment" grouping — same-time photos share pages ✅
- New **`src/pages/builder/exif.ts`**: `readCaptureTime(file)` via `exifr.parse(['DateTimeOriginal','CreateDate'])`. `UploadedPhoto` gained `capturedAt?: number | null`; `addPhotos` records it.
- `generateAlbum.ts` `groupPhotosByMoment()` splits photos into chronological **moments** (`MOMENT_GAP_MS = 3 h`); no-EXIF photos form a trailing group in upload order.
- User nudge tip added (wizard): **upload directly from your phone** for richer EXIF / better sorting.

### Ratio-grouped generation + leftover handling ✅
- Within each moment, photos are sub-grouped **by aspect ratio**, filled into **ratio-matched** templates (no cropping). A tail leftover of a ratio (e.g. 1 of 1:1 + 1 of 3:2) drops to a **single-photo full-page template of that same ratio** — never cropped, never an empty slot. (`generateAlbum.ts` `pushPage` + `templatesForRatio`.)

### Template coverage — every size × ratio filled ✅
- `pageTemplates.ts`: renamed hand-authored set → `PAGE_TEMPLATES_BASE`; added a **`GAP_FILLERS` generator** that loops `SIZE_ORIENTATION × ALL_RATIOS`, skips already-covered combos, and emits **full-page + duo** templates (wide ratios stack; others side-by-side). `PAGE_TEMPLATES = [...BASE, ...GAP_FILLERS]`. **87 → 139 templates; every (size×ratio) now has at least full-page + duo** (verified all-green).

### Text = the one fully-customizable canvas element ✅
- Per the vision, **text is the only free element** (user may write an experience/memory). In `useCanvasEngine.ts` text is selectable/evented/editable; slot photos & background stay locked.
- Default text **`fontSize` is 32** (easier to see). `addTextElement` gained an optional `text?` param so typed content flows through.

### Page-number label in the design window ✅ seen
- `BuilderEdit.tsx`: a `Page X of N` label sits **above** the canvas (flex-col wrapper around the canvas `motion.div`).

### Side-panel trims ✅ seen
- Removed the **page-number/"X pages"**-style clutter and, most recently, the tall **"Page Elements"** section (per-slot/photo/text coordinate list) from `MegyAssistant.tsx` — panel is shorter. Removed now-dead `Layers` import + orphaned `selectedSlotIndex`.

### Auth + secrets hardening ✅ (code) / ⚠️ (ops items below)
- **Code:** `authContext.tsx` `getInitialSession` wrapped in try/catch; new **`ProtectedRoute.tsx`** (loader → redirect `/` if no user) guards `/profile` in `App.tsx`; signup password min **6 → 8**; `nginx.conf` security headers (X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, HSTS, CSP **report-only**).
- **Secrets relocated:** `JWT_SECRET` + `FRONTEND_URL` moved out of the frontend into **`backend/.env`** (gitignored); Postgres creds moved out of committed compose → `${POSTGRES_*}` substitution from a root `.env`. Committed templates: `.env.example`, `backend/.env.example`. `.gitignore` now ignores `.env`, `.env.local`, `.env.*.local`. Frontend container takes `VITE_*` as **build args** only (no runtime secrets).

---

## Fulfillment phase (2026-06-19): orders, payment model, print-ready PDF

Direction set with user: the operator (user's **brother**) wants **email-a-download-link delivery, NOT a dashboard**. Photos stay IndexedDB-local, so the album is **compiled to a single print-ready PDF** and that one artifact is transported. This decouples cheap delivery from a real accounting ledger.

### Print-ready PDF compiler ✅ (build) / ⚠️ verify in browser
- New **`src/pages/builder/generateAlbumPdf.ts`**: `generateAlbumPdf(pages, photos, albumSize)` runs the existing 300 DPI `renderAlbumForPrint` and stitches the page images into **ONE PDF** sized to the album's physical inches (one PDF page per album page). Plus `downloadAlbumPdf()`. Added **`jspdf`** dep.
- **"Print PDF" button** added next to "Order" in `BuilderPreview.tsx` (state `pdfBusy`) → one click downloads the finished PDF. **⚠️ User must click it + open the PDF to confirm rendering** — can't be verified headlessly.
- 🐞 **Fixed a real bug in `printPipeline.ts` `getPrintDimensions`:** it re-converted the already-300-DPI pixel `ALBUM_SIZES` as if they were millimetres → ~21,000 px canvases (full-album export would OOM the browser). Now returns the px values directly; also sanitizes `getPrintMultiplier`.

### Orders / accounting ledger ✅ (build) / ⚠️ migration NOT run
- New **`orders-setup.sql`** (run in Supabase *after* `supabase-setup.sql`): `orders` table with a **frozen `album_snapshot`** (later album edits don't change the print), auto order number `MP-YYYY-NNNN`, an `order_status` enum lifecycle, shipping fields, `status_history`, and **RLS** (customers see/create only their own; no customer update/delete — operator changes status via service_role). **⚠️ Ops: this migration is NOT yet run in Supabase.**
- New **`src/lib/orders.ts`** `createOrderFromLatestAlbum()`: snapshots the user's latest album + inserts the order under their session (RLS authorizes via `auth.uid() = user_id`).
- **`Order.tsx` "Submit Order" was a stub** (just showed a thank-you) — now it actually creates the order, shows the real order number, and guards "not signed in". Build-verified; not runtime-tested vs live Supabase.

### Payment model decided (not yet built)
- **Payment = the order is real.** Created at checkout as `pending_payment` (a quote, NOT a sale); paying flips it to `paid` + `paid_at` → that one event both **counts as a sale** (accounting) AND **triggers the email-link** to the operator.
- Start **manual: GCash / bank transfer + a "Mark as Paid" action** (zero fees, fits scale). PayMongo (PH-native, GCash + cards, webhook) is the later automated option — tracking is identical either way.
- Planned migration add-on: `paid_at`, `payment_method`, `payment_reference` (clean accounting columns).

### Operator backend — STARTED then DEPRIORITIZED
- `backend/supabaseAdmin.js` (service_role client) + `backend/middleware/requireStaff.js` (verify Supabase JWT + `STAFF_EMAILS` allowlist) exist. **`routes/admin.js` was NOT written and `server.js` NOT wired** — the dashboard path was set aside once the cheaper email-link model was chosen. Keep for a future real operator dashboard. ⚠️ service_role bypasses RLS → any admin route MUST stay behind `requireStaff`.

### Cost analysis (why the email-link model)
- An album ≈ **100 MB–1 GB** (photos dwarf the KB layout). **Egress (downloads) is the variable cost**, not storage. Keep it ~zero: transport only the **PDF** (not raw photos), to a **no-egress/free host** (Google Drive / WeTransfer / Cloudflare R2), **emailed as a link**, auto-expiring; and only at **order time**, never on autosave. Full-res-originals-forever = unbounded cost; avoid.

### RLS status (confirmed this session)
- **Customer isolation is correct and in code:** `user_profiles` + `albums` have RLS enabled with own-row policies (`supabase-setup.sql`); `orders` adds the same. Storage bucket policies are only **documented as comments** → ⚠️ verify they're actually applied in the dashboard. (Largely moot now since photos are IndexedDB-local, not in Storage.)

---

## What's PENDING (next session — micro-targeted)

### 🎯 Fulfillment — the live thread (next steps, in order)
1. **User clicks "Print PDF"** in the builder preview and opens the file — confirm pages render correctly (the one thing not headlessly verifiable).
2. **Run `orders-setup.sql`** in Supabase (the orders table doesn't exist there yet).
3. **Add payment fields** (`paid_at`, `payment_method`, `payment_reference`) + a **"Mark as Paid"** action (manual GCash to start).
4. **Wire the chain:** on `paid` → compile the album PDF → upload to a no-egress host → **email the brother the download link**. (This is the actual fulfillment wire-up.)

### ⚠️ Ops / dashboard actions (NOT code — user must do in Supabase/prod)
- **Run `orders-setup.sql`** in the Supabase SQL Editor (new this session — orders table not yet created in prod).
- **Verify RLS is enabled** on all tables in production.
- **Set the redirect-URL allowlist** in Supabase Auth.
- **Bump Supabase Auth password minimum to 8** (matches the frontend now).
- **Rotate `megypass`** (and any dev Postgres creds) for production.
- **Tune CSP** from `report-only` → enforce once violations are clean.
- **Rotate the `JWT_SECRET`** value for prod (the dev one lived in the frontend repo previously).

### Quick wins / open threads the user has queued
- **Density guardrail** — make the density step default to & cap at the chosen size's range (trivial now via `densities.ts`).
- **Background after photos** — move/allow background choice *after* upload/generate so it's WYSIWYG (the centered stage is opaque, so you can't preview a background pre-photos).
- **"New"/reset should rewind the wizard to Step 1** — `reset()` clears the album but not the `WizardEngine.completed` array, so after "New" the wizard may land mid-journey.

### Cleanup / tidy-up
- **MP-8 leftovers:** remove the now-inert manual-edit handler code in `useCanvasEngine.ts` (object:modified/moving/scaling, dblclick, text:changed, snap guides); the now-pointless **Grid/Snap** toolbar buttons; and the hidden **`UnifiedPanel`** (Ctrl+Shift+S) which still has off-strategy manual controls.
- **Route `fillSlot` + `clearSlot` through Megy** (`fill_slot`/`clear_slot` intents) so even the canvas's last two live actions go through `dispatch`.
- **Prune dead `handleMegyAction` cases** (`load-album`/`dismiss`) in `Home.tsx`.

### Bigger / needs user input
- **A6** — context "what next" engine + dot-strip page navigator (design-judgment; do WITH user).
- **Graceful auth** — detect Supabase-down and show "continue without signing in" instead of dead-ending on the 522 page.

### Infra note (not a code bug)
- Supabase project `lvbsrbmikunynphlbckt` went **unhealthy** (522 / "connection terminated") during auth this session — DB compute hung. User **restarted it → healthy**. Recurring risk per the audit: small-tier disk/I-O budget. Photos already live in IndexedDB; bumping the tier is the durable fix if it recurs.

---

## Key architecture notes for the next session
- **The chokepoint:** `BuilderContext.tsx` exposes `dispatch(intent)` → one shared `ActionEngine`. Every UI dispatches; nothing calls `builder.setX` directly (except the two canvas leftovers above). To find violations: grep direct `builder.setX`/`actions.setX` outside `actionEngine.ts` and `useBuilderState.ts`.
- **The brain:** `src/assistant/actionEngine.ts` (intent → mutation) + `wizard.ts` (flow + `phaseForStep()` + `WIZARD_ORDER`) + `intentParser.ts` (keyword chat). Adding an intent = update `types.ts` union + engine case + parser's two exhaustive Records.
- **Journey source of truth:** `builder.wizardStep` in the store; phase is derived from it. `MegyAssistant` syncs engine ↔ store both ways and reconciles forward-only on mount/album-change.
- **Centerpiece:** `MegyAssistant.tsx` early-returns a centered full-screen stage when `showWizard && step ∈ {welcome, pick_size, pick_background, upload_photos, generate_album}`; otherwise the side panel.
- **Density:** `src/pages/builder/densities.ts` is the single source for photos-per-page-by-size. Import it; don't re-declare.
- **Only ONE `MegyAssistant`** now: `src/assistant/MegyAssistant.tsx`. The home duplicate is deleted.
- **Generation pipeline:** `generateAlbum.ts` = moment-group (EXIF, `exif.ts`) → sub-group by ratio (`photoAnalyzer.ts`) → fill ratio-matched templates → leftover = single-photo full-page. Templates come from `pageTemplates.ts` (`PAGE_TEMPLATES_BASE` + generated `GAP_FILLERS`); query via `getTemplatesForRatio`/`getTemplatesForAlbum`.
- **Binding keep-out:** `src/pages/builder/binding.ts` is the single source. `applyBindingMargin(size, pageIndex, …)` mirrors per page parity. Used by editor canvas, preview, and print pipeline — change it in one place.
- **Secrets:** frontend = `VITE_*` build args only. Backend secrets live in `backend/.env`; Postgres creds + `VITE_*` come from root `.env` via compose `${}` substitution. Never print secret *values*.
- **Fulfillment / orders:** `orders-setup.sql` = the `orders` table + RLS (the accounting ledger; **not yet run in Supabase**). `src/lib/orders.ts` `createOrderFromLatestAlbum()` snapshots the latest album and inserts under RLS. `Order.tsx` submit creates it. Operator read-side (service_role) is half-scaffolded in `backend/` (`supabaseAdmin.js` + `requireStaff.js`) but **deprioritized** for the email-link model.
- **Print PDF:** `src/pages/builder/generateAlbumPdf.ts` (`generateAlbumPdf`/`downloadAlbumPdf`) stitches `renderAlbumForPrint` (printPipeline, 300 DPI PNG pages) into one PDF. NOTE: `ALBUM_SIZES.width/height` are **300-DPI pixels** (÷300 = physical inches); `getPrintDimensions` now returns them directly (was buggily treating them as mm).

## Document map (read as needed)
- `MEGY_NORTH_STAR.md` — vision (Megy = preference-driven; one Megy to rule them all; canvas editing is off-strategy).
- `SESSION RULES.md` — working contract (document-only when asked; one change + build; backup first; no `as any`; no big rewrites).
- `MEGY_ORCHESTRATOR_SPRINT.md` / `_PLAN.md` — orchestrator tickets (MP-1…MP-8, MP-T).
- `MEGY_ANNEXATION_REPORT.md` — feature-harvest analysis (A1…A7).
- `PRE_PRODUCTION_AUDIT_20260616.md` — security/integrity/cost (Supabase disk/I-O risk lives here).

## Backups created this session (under `_backups/`, newest-relevant)
**Arc 1 (orchestrator/wizard):** mpT-step1a/1b/step2 · mpT-MP7-chokepoint · MP7-preview-intent · MP8-step1-lock-canvas · MP8-step2-remove-container-btn · A1-sync-wizardstep-store · A2-A3-wizard-leads · centerpiece-step1/2/3 · centerpiece-home-button · bg-applyall-and-generate-carry · remove-skip-wizard · authoritative-welcome · size-photo-guidance · align-size-to-densitymap · density-single-source · jail-masked-twin.
**Arc 2 (generation/hardening):** binding-keepout · print-binding-fix · preview-live-render · preview-white-strip · bg-tocss-fix · photo-dedup · save-strategy-30s-10min · cover-jpeg · loadall-slim · exif-moment-grouping · ratio-leftover-gen · template-gap-fillers · text-free-element · default-text-32 · page-number-label · auth-hardening · protectedroute · secrets-jwt-backend · secrets-postgres-compose · 20260617-090759-remove-page-elements. Restore any file by copying it back.
