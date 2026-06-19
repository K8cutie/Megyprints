# Megy Annexation Report — Acquiring Rival Tech
**Date:** 2026-06-16 · **Mission:** Find features that rival files do *better/richer* than the reigning Megy (`src/assistant/MegyAssistant.tsx`), and annex the best into her arsenal.
**Method:** 4-way parallel feature sweep (reigning Megy baseline + home wizard + exiled copilots + editing panels).

> **Strategic filter (north star):** Megy is preference-driven, not a Canva editor. So we **acquire** richness that serves *guidance / preferences / generation / browsing*, and **skip** manual per-object editing (zoom/pan/nudge/z-order) — the ratio engine already makes most of it unnecessary.

---

## The reigning Megy's current arsenal (baseline)
Tab-driven 420px panel (Design/Layout/Photos/View) + 7-step wizard + keyword chat (24 intents). **One genuinely deep feature: the TextEditor.** Everything else is moderate-to-thin, and several things are **dead/unwired**:
- ❌ Background **opacity slider is fake** (`onChange={() => {}}`), textures are "coming soon", gradients are shallow 2-stop.
- ❌ **No photos-per-page UI at all** (the `set_photos_per_page` intent exists but nothing triggers it).
- ❌ Chat **can't set text content** (`add_text` only spawns default text).
- ❌ "Generate Page" === "Generate All" (both fire `generate_album`).
- ❌ Fake "Legacy sidebar" button (just an `alert()`); dead `pick_size` wizard step; no photo analysis; no proposal/preview.

---

## 🏆 Annexation targets (ranked, ON-STRATEGY)

### 1. Real photo analysis + size recommendation — **ACQUIRE (highest value)**
**Where:** home `components/MegyAssistant.tsx` + `photoAnalyzer.ts`.
Analyzes every photo's aspect ratio → dominant ratio → **recommends album size**, auto-selects it, shows a green **"Best fit"** badge, surfaces human copy ("I see mostly phone landscape (4:3)…"). The reigning Megy shows **none** of this. This is the literal core of "remove decision fatigue." Harvestable helpers already exist: `recommendSize()`, `ratioLabel()`, `getPreferredRatioForAlbum()`.

### 2. Density UX (photos-per-page) — **ACQUIRE**
**Where:** home wizard `DENSITY_BY_SIZE` (per-size valid counts + validation that resets when size shrinks) + exiled `MegyDesignAssistant` for the **best-labeled tiles** ("1 = Big & bold", "2 = Dynamic pair"… + a ✨ **"Surprise me!"** tile with the footnote *"mixes different layouts throughout your album"*). Megy currently has **zero** density UI. Graft the labeled tiles onto the per-size logic.

### 3. Proposal / preview card before generating — **ACQUIRE**
**Where:** home wizard `ProposalView`. An animated plan card: album type, dominant ratio, photos-per-page, **`~N pages` estimate**, background — then one "Make My Album!" button. Perfectly matches your "1-click after inputting preferences." Megy jumps straight to generate with no preview.

### 4. Conversational personality + animations — **ACQUIRE (this IS Megy)**
**Where:** home wizard. `TypeText` typewriter with staged reveals (buttons appear after she "finishes talking"), `AnalyzingView`/`GeneratingView` animated progress, the **MegyFace mascot**, persona copy ("Ooh, 12 gorgeous photos! I see some real gems 💎"). The reigning builder Megy is a dry tabbed panel with no character. For "Megy IS the interface," this is essential, not cosmetic.

### 5. Rich, *working* background picker — **ACQUIRE (union of the best parts)**
**Where:** standalone `BackgroundDesigner.tsx` is richest on rendering — **radial gradients, real image upload w/ preview, 5 texture presets (real CSS), real SVG pattern previews** (via `useId`), **working opacity**. `UnifiedPanel` inline has more named gradients (8) + 15 pattern names. Home wizard has 20 solid swatches. Megy's current bg is the *weakest* of all four (dead opacity, no textures). Annex the working richness.

### 6. Context-detection state machine for "what next" — **ACQUIRE (the pattern)**
**Where:** exiled `MegyCopilot.detectContext()` — maps selection/page state → a prioritized context → tailored suggestion chips ("Photo 3 selected 💕 — what should I do with it?"). This is how Megy can proactively *guide* instead of just hosting controls. Clean, decoupled, extensible.

### 7. Page navigator + snapshot thumbnails — **ACQUIRE**
**Where:** `UnifiedPanel` page list has **real per-page snapshot thumbnails** (`getPageSnapshot`); home wizard + `MegyCopilot` have a **dot-strip page indicator** (capped at 20 with "+N" overflow). Directly serves your "browse each page" review flow. Megy's current Layout tab has only prev/next + a number input.

### 8. Text / captions — **ACQUIRE-LITE**
**Where:** `PropertiesPanel.TextEditor` (30 fonts, 9 size presets, 15 color presets, rotation snaps, nudge pad). Captions are a *kept* feature, and Megy currently can't even set text content via chat. Acquire **content + basic style** (font, size, color) into Megy; **leave** the nudge-pad/rotation-snap micro-positioning (that's Canva-tier).

---

## 🚫 Do NOT annex (off-strategy — these are the MP-8 *removal* targets, not acquisitions)
- Manual **slot zoom (0.1–10×) / numeric pan** — the ratio engine makes cropping unnecessary.
- Per-object **position/size/rotation/nudge** editing.
- **Z-order / layers** manipulation (bring-to-front/send-to-back, the layer list).
- Freeform photo transforms.

These contradict "Megy is not a design tool." They live in `PropertiesPanel` + `useCanvasEngine` and are slated for *removal* (MP-8), not acquisition.

---

## Bonus: gaps these acquisitions also close
Annexing the above naturally fixes Megy's dead/unwired features: gives `set_photos_per_page` a real UI (#2), gives `add_text` real content (#8), replaces the fake opacity slider with a working one (#5), and replaces the "Generate Page = Generate All" confusion with a real proposal→generate flow (#3).

---

## Suggested annexation order
1. **Photo analysis + size recommendation** (#1) — biggest "smart Megy" leap, foundation for the proposal.
2. **Density tiles** (#2) + **Proposal card** (#3) — completes the preference→1-click flow.
3. **Personality/animations** (#4) — makes her feel like Megy.
4. **Rich background** (#5).
5. **Context "what next" engine** (#6) + **page navigator/thumbnails** (#7).
6. **Text-lite** (#8).

Each is an independent, build-verifiable graft. Most of the tech already exists in-repo (home wizard, exiled files in `_backups/`, editing panels) — this is **harvest + wire into Megy**, not invent from scratch.
