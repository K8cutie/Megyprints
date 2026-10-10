# Megyprints — Structural Audit (Baseline) — 2026-08-13

**Score: 38/100.** Real, measurable drift — concentrated in exactly the two places the architecture relies on hand-syncing (the three text renderers and the size-keyed surfaces), plus a very large dead-code mass. Nothing here is expensive to untangle; almost all of it is mechanical. This is the baseline to re-measure against after the burn-down.

Method: three read-only auditors (dead code & hygiene / duplication & drift / patterns & boundaries). Every claim was evidence-verified — file:line on all copies, and absence claims ("never imported") backed by the exact grep. No fixes were applied. This is a structural audit, not a security audit (Kraken covers that).

Rubric per dimension (0–20): 18–20 disciplined & guardrailed · 14–17 minor drift · 10–13 real drift, edits can miss twins · 5–9 systemic · <5 pervasive.

| Dimension | Score | One-line reason |
|---|---|---|
| Duplication & single-source | 7/20 | Renderer trio has 7 confirmed live divergences; stale hand-copies of canvas dims, fonts, sizes, MIN_PAGES |
| Dead code | 6/20 | ~23,600 tracked LOC dead or stale vs 41,891 live (36% overhead), incl. a full tracked `src - Copy/` |
| Pattern consistency | 8/20 | 7 error-handling styles (77 silent catches), 6 state styles, dispatch chokepoint violated by its own callers |
| Module boundaries | 10/20 | 10 lib→pages upward imports (domain model lives under pages/), assistant⇄builder package loop |
| Hygiene & guardrails | 7/20 | Divergent second prod deploy (GH Pages), tracked stale copies, root sprawl; but 9 spec files + pricing spec gate exist |
| **Total** | **38/100** | |

Live LOC: 41,891 (src 41,445 + api 446). Largest files: `useBuilderState.ts` 2,671 · `useCanvasEngine.ts` 2,052 · `pageTemplates.ts` 1,788.

---

## 1. Headline: the three-renderer surface has actually drifted — 7 live divergences

The rule "PageView, Fabric editor, and print pipeline must stay in sync" is held by hand, and the audit proves the hand slipped. Composition logic (background, slots, captions, free text) is three independent implementations (~940 / ~1,080 / ~1,090 lines) — with in-code comments admitting they "drift silently" ([BuilderPreview.tsx:108](../src/pages/builder/BuilderPreview.tsx), [useCanvasEngine.ts:1934](../src/pages/builder/useCanvasEngine.ts)). Shared primitives do exist (qrRect, wordArt, binding, frame registry, textures) — the drift is in the composition layer.

Confirmed current divergences (each verified on both/all sides). **These are customer-visible print defects, not theoretical risk:**

1. **[H] Slot photo pan prints at the wrong magnitude.** Offsets are stored in canvas px (useCanvasEngine.ts:547-551) and consumed as canvas px on screen (BuilderPreview.tsx:385-386) and in the editor (useCanvasEngine.ts:1233-1234), but print treats them as *percent of slot* (printPipeline.ts:615-616 `slotOffsetX * (sw/100)`). A panned photo prints displaced ~2.5–7× further than designed.
2. **[H] `getUISize` (printPipeline.ts:36-47) is a stale hand-copy of `getCanvasDimensions` (layouts.ts:281-292).** Every value differs (8x8 → 576 vs real 750), `'9x9'` is missing entirely, and its header falsely claims it matches the editor. Live consequence: printed texture tiles ~30% larger than the editor shows; worst on 9x9.
3. **[H] Texture density differs in all three renderers** — 80 CSS px unscaled in preview (BuilderPreview.tsx:92-94), 80px on a 750px backstore in the editor (useCanvasEngine.ts:1067-1079), 80×(W/stale-576) in print (printPipeline.ts:414-427). Same album, three material scales.
4. **[H] Caption (boxIndex) underline never prints** — no underline branch in renderTextElement (printPipeline.ts:737-784), while DOM (:525) and Fabric (:1881) render it. The fix already exists 50 lines away: print's own renderSlotText hand-draws underline (:826-840).
5. **[H] Free text: wraps on screen, prints as one unwrapped unclipped line** (printPipeline.ts:775-781); opacity honored on screen, ignored in print; underline shows only in the Fabric editor.
6. **[H] Gradients: three angle conventions** (CSS deg / Fabric vector / print center-line trig) — a stored 135° sweeps bottom-right on screen, bottom-left in print (BuilderPreview.tsx:51 vs useCanvasEngine.ts:1044-1047 vs printPipeline.ts:366-371). Print also flattens radial to linear. Legacy `{colors,direction}` gradients **crash** Fabric and print (tolerated only by DOM).
7. **[H] Caption alignment inversion on templates with `ts.align`** — print resolves template-first (printPipeline.ts:214,750, self-documented as "the inverse of the DOM preview"), DOM/Fabric resolve element-first. Live on 6×4 templates (templates6x4.ts:75,116,123): a left-aligned caption prints centered.

Also: [M] Fabric caption line-height 1.16 vs shared 1.25; [M] `pageFingerprint` (useCanvasEngine.ts:169-210) omits `slotScales`/`slotOffsetsX/Y`, so PropertiesPanel zoom/pan mutates state without repainting the canvas; [M] Fabric-only fake drop shadow (useCanvasEngine.ts:1293-1314) shows depth the product doesn't print; [L] empty-box invitation labels duplicated with different size thresholds (84 vs 120).

**Fix direction:** one shared render-model module (resolve alignment/wrap/underline/opacity/gradient/texture-scale ONCE into a normalized draw-spec; each renderer only rasterizes it), plus a parity spec that renders golden pages through all three and compares. Until then, at minimum: delete `getUISize`, fix the pan-unit and underline/wrap/opacity gaps, unify the gradient math.

## 2. Size-keyed surfaces: 19 found (memory said ~16), only 3 type-checked, and 9x9 was missed twice

Canonical list: `AlbumSizePreset` union + `ALBUM_SIZES` array (types.ts:103,652-661). 19 size-keyed surfaces exist; only 3 are `Record<AlbumSizePreset,…>` (tsc-enforced). **The 9x9 addition already missed 2 sites** — direct evidence the next size will miss some too:

- printPipeline.ts:36-47 `getUISize` — no '9x9' → falls to 576×576 (worst texture-scale error of any size).
- src/assistant/intentParser.ts:126-134 `SIZE_ALIASES` — no 9x9 aliases → Megy cannot parse a 9×9 request by chat.

Duplicated size data on top: CANVAS_DIMS + ALBUM_INCHES (templateKit.ts:47-79) restate ALBUM_SIZES values; display names exist ×4 (types.ts, pricing.ts:36, wizard.ts:14, MegyAssistant.tsx:268); DB has its own jsonb seed (0024:53-62).

**Fix direction:** convert every plain lookup to `Record<AlbumSizePreset,…>`, derive CANVAS_DIMS/ALBUM_INCHES/names from ALBUM_SIZES at module load, and add a spec that walks all 19 surfaces per size.

## 3. Dead mass: ~23,600 tracked LOC (36% of the repo's code) — mechanical to remove

- **[H] `src - Copy/` is tracked**: 88 files, 16,335 LOC, a stale full builder snapshot committed before .gitignore:18; it poisons greps and `npm run lint` lints it (eslint ignores only `dist`). Unignored on-disk siblings: `src - Copy (2)/`, `_backups/`.
- **[H] 52 of 53 `components/ui/` shadcn files dead** (5,942 LOC) — only `dialog.tsx` is imported (Templates.tsx:5). Verified by import grep.
- **[H] ~45 package.json deps with no live importer** — zod, date-fns, react-hook-form, 26 of 27 @radix-ui/*, recharts, sonner, etc.; devDeps electron + electron-builder with zero electron code. (Counter-check done: @tensorflow deps looked dead but are dynamically imported — kept.)
- **[H] 10 dead app files, 1,365 LOC** — BuilderTemplate.tsx (old theme picker), CoverWrapPreview.tsx, templateValidation.ts, WelcomeBackModal.tsx, useCloudPhotos.ts, AddOrnamentModal.tsx (clipart-era), useWizard.ts + WizardGuide.tsx (superseded wizard), BuilderUpload.tsx, ThemePreviewCard.tsx, assistant/index.ts.
- **[M] Old theme system is deprecated-but-load-bearing** — THEMES + helpers (types.ts:702-905, ~300 LOC + 12.8MB public/themes) still consumed by 10 live files. Cannot delete; needs a planned migration. Clipart residue is clean except vercel.json:22 still allowlists `api.iconify.design` (0 uses).
- [M] `qrMemory.ts` vs `qrMemories.ts` — near-identical names, both live, overlapping importers.
- [L] App.css (1 line, unimported), 7 unused type exports, `react-router` AND `react-router-dom` both installed (0 imports of the former).

## 4. Duplication top-5 by blast radius

1. **getUISize vs getCanvasDimensions** — already-diverged; see §1.
2. **Three-renderer text stack** — every text feature must be added 3×; 7 current misses prove the miss-rate.
3. **Size sprinkle** — 19 surfaces, 12 tsc-invisible; adding a size touches ~12 files + 1 DB row.
4. **QR resolver pair** — `videoEmbedInfo`/ALLOWED_HOSTS in src/lib/qrMemory.ts:20-70 vs api/m.mjs:16-119, hand-synced twin lists ("Keep the two lists in sync"). In sync today; no test bridges them.
5. **Pricing TS/SQL mirror** — scheduleFrom (pricing.ts:164-184) vs public_price_schedule (0024:90-133). Identical today; the spec gate only protects edits that go through the spec, and 0024/0025 history shows SQL gets edited live.

Also: MIN_PAGES ×3 (pricing.ts:32, densities.ts:60, 0024:44 — an owner DB change moves billing but not generation/spine); FONT_FAMILIES ×3 with a divergent third copy (MobileTextEditor.tsx:24 — different fallback chains stored into saved albums); safe-area rect kernel repeated ~10×; "latest album" query ×2 (orders.ts:46 vs printJobRebuild.ts:93 — their agreement is what keeps the PDF matching the order).

## 5. Patterns & boundaries (why edits land in different idioms)

- Error handling: **7 styles**; dominant is silent `catch {}` (77 occurrences / 31 files). `reportError` sink exists but only 5 files use it. Zero toasts (sonner installed, never called; 1 `alert()`).
- State: **6 styles**, including the documented ActionEngine "single chokepoint" (BuilderContext.tsx:8-16) violated by 60 raw `actions.set*` calls in the same files that dispatch.
- Data access: **4 styles**; split-brain example — contact_messages READ in lib (contactMessages.ts:23), WRITE inline in the page (Contact.tsx:37).
- localStorage: `megy-` and `megy_` key prefixes coexist; draft key `'megy-album-v5'` independently defined in 2 files.
- **[H] Boundary inversion: 10 lib files import from pages/builder** (pricing.ts:25, orders.ts:11, quotes.ts:11, printJobRebuild.ts:26…) because the domain model (`types.ts`) lives under pages/. lib/templateSettings.ts:14 write-throughs into a mutable singleton inside pages/pageTemplates.ts:1538.
- **[H] Package loop**: assistant → BuilderContext → actionEngine → useBuilderState types (compiles because the last hop is type-only).
- God files: useBuilderState.ts (2,671 LOC, ~8 concerns), MegyAssistant.tsx (1,349, chat UI + wizard + ML + designer), BuilderEdit.tsx (1,198), types.ts (1,051 — the "types" module 64 files import also carries catalog data, geometry rules, theming, and URL building).

## 6. Hygiene

- **[H] GitHub Pages workflow is a divergent second prod deploy** (.github/workflows/deploy.yml): builds with no VITE_ env → `supabaseConfigured=false` → the Pages copy silently runs "local-only mode" (supabase.ts:12-19), and has no api/ → /m/:code QR links and theme-quotes are dead there. Delete it.
- [M] Stale self-host docker stack (Dockerfile + docker-compose + backend/ Express + two *differing* nginx configs) — nothing in src/api ever calls it.
- [M] `Theme Background/` — 28 raw stock photos (3.6MB) tracked, zero references.
- [M] Root sprawl: 21 tracked .md (3,850 lines, mostly dated snapshot audits that misdescribe the current system) + 20 untracked personal files (resumes, portfolio HTML, photos, int.log, and a `nul` reserved-device-name file that breaks naive tooling).
- [M] fabric dual-sourced: runtime = vendored public/fabric.min.js via script tag; npm fabric@5.3.0 is types-only, yet vite optimizeDeps still lists it.
- [L] package.json is still `"name": "my-app", "version": "0.0.0"`.

## Live defects surfaced (worth fixing regardless of structure)

1. Print pan magnitude (§1.1) — affects every panned photo on every printed album.
2. Texture print scale + 9x9 (§1.2–3).
3. Caption underline / free-text wrap + opacity in print (§1.4–5).
4. Gradient direction flip in print; radial prints linear; legacy gradient crashes Fabric/print (§1.6).
5. Caption alignment inversion on 6×4 (§1.7).
6. Assistant can't parse "9x9" (§2).
7. PropertiesPanel zoom/pan doesn't repaint the canvas (pageFingerprint gap).
8. Pages deploy serves a silently-broken app variant (§6).

## De-drift plan (ordered)

| # | Action | Size | When |
|---|---|---|---|
| 1 | **Print-parity repair**: fix pan units, delete getUISize → getCanvasDimensions, underline/wrap/opacity in print, unify gradient math, alignment resolution order, pageFingerprint fields | M | Act now — customer-visible on paid prints |
| 2 | Add 9x9 to SIZE_ALIASES; convert the 12 tsc-invisible size surfaces to `Record<AlbumSizePreset,…>`; derive size tables/names from ALBUM_SIZES | S–M | Act now |
| 3 | Dead-mass purge: `git rm -r --cached "src - Copy"`, delete 52 ui/ files + ~45 deps + 10 dead app files + App.css; drop iconify from CSP | S–M | Act now — mechanical, huge grep-hygiene win |
| 4 | Delete GH Pages workflow (+ docker stack or quarantine under deploy/selfhost/) | S | Act now |
| 5 | Parity guardrails: golden-page spec through all three renderers; drift specs asserting QR-pair and pricing TS/SQL equality | M | With #1 — this is the ratchet that keeps the score from decaying |
| 6 | Hoist domain out of pages/: types/pageNormalize/themeQuotes → src/domain/, template registry (incl. inactive set) → lib; break assistant⇄builder loop | M–L | Schedule |
| 7 | One font registry; one safeRect/slotRect helper; merge qrMemory/qrMemories; fetchLatestAlbum helper; derive MIN_PAGES from fetched schedule | M | Schedule |
| 8 | Repo hygiene: root .md → docs/archive/, personal files out, rm `nul`, untrack Theme Background/, name the package megyprints | S | Whenever |
| 9 | Theme-system migration decision (deprecated-but-load-bearing; 12.8MB assets) | M | Decide, then schedule |

## Coverage & limits

Auditors read the full renderer trio, pricing/size/QR stacks, and enumerated all 194 src files' imports; usage counts are grep-based (±10%). Not examined: android/ internals, migration SQL bodies beyond pricing/sizes, template body data, spec adequacy, security surfaces (Kraken's job). One (UNVERIFIED): whether legacy `{colors,direction}` gradient drafts exist in the wild (the crash path is code-confirmed).

## Re-running this baseline

Same three-auditor sweep (dead code & hygiene / duplication & drift / patterns & boundaries), same rubric. Compare dimension scores; the de-drift plan above predicts: #1–5 alone should lift Duplication to ~14, Dead code to ~16, Hygiene to ~13 → ~60/100. Full plan → ~80.
