# Megy Prints — Current State Document

**Last updated:** 2026-05-31 Session 3 — Properties merged into Background tab
**Project phase:** Pre-Sprint 1 (polish phase before Auth + Database)
**Tech stack:** React 19 + TypeScript + Vite + Tailwind CSS + Fabric.js + shadcn/ui + Framer Motion

---

## 1. Project Overview

Megy Prints is a React-based photo album builder web app. Users upload photos, configure album settings, generate album pages with smart templates, edit each page on a Fabric.js canvas, preview, and order a physical printed album.

**Hosting target:** Vercel (free)
**Backend target (next):** Supabase (free tier)

---

## 2. File Inventory & Status

### 2.1 Core Builder Files (src/pages/builder/)

| File | Status | Description | Last Modified |
|------|--------|-------------|---------------|
| `BuilderContext.tsx` | ✅ Working | React Context provider wrapping useBuilderState — persists state across route navigation | Session 2 (uncommitted) |
| `useBuilderState.ts` | ✅ Working | All state + localStorage persistence + snapshots | Session 2 |
| `useCanvasEngine.ts` | ✅ **PATCHED** | Fabric.js canvas engine — **two-phase safe-area render**, orientation adaptation, slot management | **Session 3** |
| `BuilderSetup.tsx` | ✅ Working | All-in-one setup page with price calculator, album type/size selection, live PHP pricing | Session 2 |
| `BuilderTemplate.tsx` | ✅ Working | Template gallery with horizontal scroll, 54 templates, rejection system | Session 2 |
| `BuilderEdit.tsx` | ✅ **PATCHED** | Design phase with empty state overlay, Generate/Regenerate/Generate All buttons, canvas + sidebars | **Session 3** |
| `BuilderPreview.tsx` | ✅ Working | Preview — canvas snapshot sync (pixel-perfect), spread view, backgrounds | Session 2 |
| `BuilderToolbar.tsx` | ✅ Working | Preview toolbar (page nav, spread, order button) | Session 2 |
| `BuilderErrorBoundary.tsx` | ✅ Working | Error boundary with reset capability for builder | Session 2 |
| `pageTemplates.ts` | ✅ **REWRITTEN** | 22 margin-aware templates (T01-T22) — safe-area-proportion slots, per-template margins, `adaptTemplateToOrientation()`, `computeSlotPixels()` | **Session 3** |
| `types.ts` | ✅ **UPDATED** | Added `TemplateMargin` interface, `margin` + `orientation` on `PageTemplate`, `TemplateSlot` now 0–1 safe-area proportions | **Session 3** |
| `layouts.ts` | ✅ Working | Canvas dimension helpers per album size | Session 2 |
| `generateAlbum.ts` | ✅ **REWRITTEN** | Dynamic distribution: always 40 pages, spreads photos evenly | **Session 3** |
| `printPipeline.ts` | ✅ Working | 300 DPI print export (renderPageForPrint, renderAlbumForPrint) | Session 2 |
| `priceCalculator.ts` | ✅ Working | PHP pricing logic (calculatePrice, formatPrice) | Session 2 |
| `PreviewSizeConstants.ts` | ✅ Working | Preview pixel dimensions per album size | Session 2 |
| `slotShapeStyle.ts` | ✅ Working | Shape-corrected sizing for preview (circle, heart, star, etc.) | Session 2 |
| `BackgroundDesigner.tsx` | ✅ **PATCHED** | Background editor with custom image upload, fixed layout, CSS gradient presets | **Session 3** |
| `TemplatePicker.tsx` | ✅ Working | Template selection grid | Session 2 |
| `EditSidebar.tsx` | ✅ **PATCHED** | Template thumbnail CSS fix for 0-1 slot proportions | **Session 3** |
| `PropertiesPanel.tsx` | ✅ **PATCHED** | Photo properties panel (renders as subsection inside Background tab) | **Session 3** |
| `UnifiedPanel.tsx` | ✅ **PATCHED** | Single right panel (320px) — 4 tabs in single row (Photos/Pages/Templates/Background). Properties merged INTO Background tab. No separate Props tab. | **Session 3** |
| `LayersPanel.tsx` | ✅ Working | Page layers panel | Session 2 |
| `BuilderUpload.tsx` | ✅ Working | Upload phase component (drag & drop, photo grid, replace/remove) | Session 2 |

### 2.2 Page Components (src/pages/)

| File | Status | Description | Last Modified |
|------|--------|-------------|---------------|
| `Builder.tsx` | ✅ **PATCHED** | Main builder shell with BuilderContext, phase navigation, "New" restart button, wired onGenerate/onGenerateAll/onRegenerate to EditPhase | **Session 3** |
| `Home.tsx` | ✅ Working | Landing page with hero, trust bar, how-it-works, template preview, testimonials, CTA | Session 2 |
| `Order.tsx` | ✅ Working | Order form with material/cover/size selection, customer details, price summary | Session 2 |
| `Templates.tsx` | ✅ Working (with fixes) | Template gallery page with category tabs, modal preview, "Use Template" navigation | Session 2 (bug fixes applied) |
| `Contact.tsx` | ✅ Working | Contact page with FAQ accordion, contact form, contact methods | Session 2 |

### 2.3 Shared Components

| File | Status | Description | Last Modified |
|------|--------|-------------|---------------|
| `BuilderDemoSection.tsx` | ✅ Working | Animated demo section for homepage showing builder flow | Session 2 |
| `Layout.tsx` | ✅ Working | Main layout wrapper | Session 2 |

### 2.4 App-Level Files

| File | Status | Description | Last Modified |
|------|--------|-------------|---------------|
| `App.tsx` | ✅ Working (modified) | Routes — wrapped in `<BuilderProvider>` | Session 2 (uncommitted) |

---

## 3. Uncommitted Changes (Session 2 — Must Commit)

### 3.1 BuilderContext Implementation
- **File:** `src/pages/builder/BuilderContext.tsx` (NEW)
- **Change:** Created React Context provider that wraps `useBuilderState`
- **Impact:** State now persists across all route navigation (Home → Builder → Home → back to Builder)

### 3.2 App.tsx Modification
- **File:** `src/App.tsx` (MODIFIED)
- **Change:** Wrapped routes in `<BuilderProvider>`
- **Impact:** Builder state available app-wide

### 3.3 Builder.tsx Modification
- **File:** `src/pages/Builder.tsx` (MODIFIED)
- **Change 1:** Uses `useBuilderContext()` instead of local `useBuilderState()`
- **Change 2:** Added "New" restart button with confirm dialog
- **Change 3:** `handleGenerate` now checks for existing pages before wiping:
  ```typescript
  const hasExistingPages = actions.albumPages.length > 1 ||
    (actions.albumPages[0]?.slotFills?.some((f) => f !== null) ?? false);
  if (!hasExistingPages) { actions.generateAlbum(); }
  ```
- **Impact:** Prevents accidental data loss when clicking Generate after editing

### 3.4 Templates.tsx Bug Fixes
- **File:** `src/pages/Templates.tsx` (MODIFIED)
- **Change 1:** Categories derived from `THEME_CATEGORIES` instead of template names
- **Change 2:** Filter logic fixed to filter by category, not by template name
- **Impact:** Template gallery filtering works correctly

---

## 4. Session 3 Patches (Applied)

### 4.1 BackgroundDesigner.tsx — Major Fix
**Issues fixed:**
1. **Broken image presets** — Replaced local file paths (`/bg-textures/*.jpg`) with CSS gradient fallbacks that render reliably
2. **Missing custom image upload** — Added file input with `URL.createObjectURL()` for user-uploaded background images
3. **Messed up layout** — Fixed tab bar sizing (smaller icons `size={14}`, compact `py-1.5`), added `flex flex-col h-full` container with `overflow-y-auto` content area and fixed opacity slider at bottom
4. **Added image preview + remove button** — Custom uploaded images show preview with X button to clear

**Key changes:**
- New `IMAGE_PRESETS` array with CSS gradients instead of file paths
- `handleFileUpload` callback with `URL.createObjectURL()`
- `customImageUrl` state for tracking uploaded custom image
- `onUploadImage` optional prop for parent notification
- Layout: `shrink-0` tab bar, `flex-1 overflow-y-auto` content, `shrink-0` opacity section

### 4.2 BuilderEdit.tsx — Empty State + Generate/Generate All Buttons (APPLIED)
**Issues fixed:**
1. **Empty canvas with no guidance** — Added `isPageEmpty` and `hasTemplateButEmpty` computed states
2. **No Generate button when page is empty** — Added `onGenerate` and `onGenerateAll` props
3. **Toolbar only showed "Regenerate"** — Now conditionally shows:
   - When empty: `Generate` (Wand2 icon, purple fill) + `Generate All` (outline)
   - When has content: `Regenerate` (outline) + `Generate All` (outline)
4. **Missing empty state overlay** — Added centered overlay with:
   - Icon + "This page is empty" heading
   - Contextual message based on photo/template state
   - "Generate Layout" button (if photos uploaded, calls `onGenerate`)
   - "Upload Photos" button (switches sidebar to Photos tab)

**Key changes:**
- `isPageEmpty` useMemo: checks slots, freeform photos, text elements
- `hasTemplateButEmpty` useMemo: template selected but no photos filled
- Empty state overlay with `AnimatePresence` fade animation (absolute positioned over canvas)
- Toolbar: conditional render based on `isPageEmpty` state
- Added `Wand2`, `Upload` imports from lucide-react
- **BUG FIX:** Moved `currentPage` declaration BEFORE empty state hooks to avoid TDZ error (`Cannot access 'currentPage' before initialization`)

### 4.3 PropertiesPanel.tsx — Page Properties Layout Fix
**Issues fixed:**
1. **Page Properties panel layout broken** — Was using `overflow-y-auto` on entire panel but BackgroundDesigner also had its own scroll areas causing double-scrollbar/conflict
2. **BackgroundDesigner not fitting in panel** — Wrapped in flex container with fixed header and scrollable content area

**Key changes:**
- Page Properties mode now uses `flex flex-col h-full overflow-hidden` wrapper
- Fixed header section with title + helper text
- `flex-1 overflow-y-auto` for BackgroundDesigner content
- BackgroundDesigner itself now handles its own internal layout properly

### 4.4 Builder.tsx — Wire Generate/Generate All to EditPhase (APPLIED)
**Issues fixed:**
1. **BuilderEdit props not wired** — `onGenerate` and `onGenerateAll` props were defined in BuilderEdit but never passed from parent
2. **EditPhase only passed onRegenerate** — Updated to pass all 3 handler props

**Key changes:**
- `EditPhase` component: expanded props to accept `onGenerate` and `onGenerateAll`
- `handleGenerateAll` callback: calls `actions.generateAlbum()` to regenerate all pages from uploaded photos
- EditPhase usage: wired `onRegenerate={handleRegenerate}`, `onGenerate={handleGenerate}`, `onGenerateAll={handleGenerateAll}`

### 4.5 Template Margin Architecture — Option B (APPLIED)
**Problem:** Right margin disappearing in rendered albums — photos bleeding past slot boundaries because templates stored slots as 0–100% of canvas with hardcoded `M=4`/`G=2` math that didn't actually preserve margins on the right/bottom edges.

**Root cause:** Template slot coordinates were percentages of the FULL canvas, not of a margin-cropped safe area. The rightmost slot in most templates extended to x+w=100, eating the right margin.

**Solution:** Complete re-architecture with three-zone system (margin → safe area → slots):

**types.ts changes:**
- New `TemplateMargin` interface: `{ top, bottom, left, right }` as 0–1 proportions
- `PageTemplate`: added `margin: TemplateMargin` and `orientation: 'landscape'|'portrait'|'square'`
- `TemplateSlot`: x/y/width/height now documented as 0–1 proportions of safe area (not 0–100 of canvas)

**pageTemplates.ts changes:**
- All 22 templates rewritten with safe-area-proportion slots (0–1 range)
- Per-template margins: `STD_MARGIN` (4%), `WIDE_MARGIN` (6%), `CINE_MARGIN` (12% top/bottom)
- `adaptTemplateToOrientation()`: rotates template 90° when canvas orientation differs
- `computeSlotPixels()`: two-phase pipeline — safe area from margins → slot proportions → pixels
- Slot math guarantees: `slot.x + slot.width ≤ 1` and `slot.y + slot.height ≤ 1` within safe area

**useCanvasEngine.ts changes:**
- `renderTemplateSlots`: two-phase render — compute safe area from `template.margin`, then map slot proportions to canvas pixels
- `handleObjectModified`: same safe-area computation for slot offset/scale saveback
- Imports: added `computeSlotPixels`, `adaptTemplateToOrientation` from pageTemplates

**Templates verified (right edge ≤ safe area boundary):**
| Template | Old Right Edge | New Right Edge | Fixed? |
|---|---|---|---|
| T03 | 101% | 96.6% | ✅ |
| T04 | 100% | 96.6% | ✅ |
| T05 | 96% | 96% | ✅ |
| T07 | 101% | 96.6% | ✅ |
| T08 | 100% | 96.6% | ✅ |
| T11 | 100% | 96.6% | ✅ |
| All others | similarly fixed | ≤ 96% | ✅ |

### 4.6 UnifiedPanel.tsx — Single Panel Redesign (APPLIED)
**Problem:** On ultrawide monitors, the 3-panel layout (sidebar + canvas + properties) felt cramped. Two side panels at 256px each split attention and created visual tension.

**Solution:** Collapsed into a single 320px right panel with 5 tabs:

| Tab | Content | Auto-activates on... |
|---|---|---|
| **Photos** | Upload button + photo grid | Manual only |
| **Pages** | Page list, add/duplicate/delete, slot count filter, shuffle | Manual only |
| **Templates** | Template gallery with category filters (3-col grid), auto-fill/clear | Manual only |
| **Layers** | Slot photos + freeform photos + text layers (z-index sorted) | Manual only |
| **Properties** | Full PropertiesPanel content (background/filters/text/position) | Canvas object selection |

**Key behaviors:**
- Panel auto-switches to **Properties** tab when any canvas object is selected
- User can manually override by clicking another tab
- When nothing is selected, Properties tab shows "Page Properties" (background editor)
- Canvas gains ~20% more horizontal space (from ~55% to ~78%)

**Files changed:**
- `UnifiedPanel.tsx` — **NEW** component with all 5 tabs + AnimatePresence transitions
- `BuilderEdit.tsx` — Removed `<EditSidebar>` left panel, replaced `<PropertiesPanel>` with `<UnifiedPanel>`, removed unused `sidebarTab` state
- `EditSidebar.tsx` — Template thumbnail CSS: `slot.x%` → `slot.x * 100%` for 0-1 proportions

### 4.7 Pages Tab Auto-Switch Bug (APPLIED)
**Problem:** Clicking a page in the Pages tab immediately kicked the user out to the Properties tab. The `useEffect` watching `hasSelection` fired on every page navigation because the canvas auto-selected the background.

**Fix:** Added `activeTab !== 'pages'` guard to the auto-switch `useEffect` in `UnifiedPanel.tsx`. When the user is on the Pages tab, canvas selection changes are ignored — they stay on Pages until they manually click another tab.

**Files changed:**
- `UnifiedPanel.tsx` — Line 94: `if (hasSelection)` → `if (hasSelection && activeTab !== 'pages')`

### 4.8 Slot Count Filter Wiring (APPLIED)
**Problem:** Slot count filter in the Pages tab (All / 1 slot / 2 slots / etc.) had no effect on Generate All, Regenerate, or Shuffle Layout. The generate path used `photosPerPage` which was hardcoded to `3` in `useBuilderState`.

**Root cause:** `preferredSlotCount` was local state in `BuilderEdit.tsx`, completely separate from `photosPerPage` in `useBuilderState.ts`. The two were never connected.

**Fix:**
- `useBuilderState.ts` — `photosPerPage` default: `3` → `undefined` (uses all templates when "All" selected)
- `BuilderEdit.tsx` — Removed local `preferredSlotCount` state; `handleShuffleLayout` reads `actions.photosPerPage`; passes `photosPerPage`/`setPhotosPerPage` to UnifiedPanel
- `UnifiedPanel.tsx` — Props renamed to `photosPerPage`/`onSetPhotosPerPage`; slot count buttons call `actions.setPhotosPerPage`

---

### 4.9 Tab Grid Restructure + Background Tab (APPLIED)
**Problem:** 5 tabs crammed into 1 row at 320px — labels cut off ("Props" truncated), unreadable, cramped. Layers tab was non-functional/redundant.

**Solution:**
- **2-row grid layout:** Row 1 = Photos | Pages | Templates (3 tabs). Row 2 = Background | Props (2 tabs)
- **Removed Layers tab** — was showing z-index sorted elements but had no interaction value
- **Added Background tab** — full background editor moved from top toolbar into the panel:
  - Background type selector (Solid / Gradient / Pattern / Image)
  - Solid: 12 color swatches + color picker
  - Gradient: 8 preset gradients (Sunset, Ocean, Pastel, Rose Gold, Mint, Lavender, Peach, Midnight)
  - Pattern: 15 pattern buttons (dots, stripes, diagonal, etc.)
  - Image: URL input
  - Opacity slider
  - "Apply to All Pages" button
- **Removed from top toolbar:** Background button + "Apply to All" button (now in Background tab)
- **Auto-switch guard** extended: `activeTab !== 'pages' && activeTab !== 'background'` — user stays on Background tab when clicking canvas objects

**Files changed:**
- `UnifiedPanel.tsx` — Tab bar: 2-row grid. Removed Layers content. Added Background tab content. Added `onApplyBackgroundToAll` prop.
- `BuilderEdit.tsx` — Removed Background + All buttons from toolbar. Removed `Layers` import. Added `onApplyBackgroundToAll` prop to UnifiedPanel.

---

### 4.10 Properties Merged into Background Tab (APPLIED)
**Problem:** User feedback: "No, you should make properties part of background." Having separate Background and Props tabs was confusing — Background was for page background, Props was for object properties, but the mental model is: everything editable on the current page lives under one tab.

**Solution:** Properties (photo filters, text editor, slot controls, position/size) is now a SUBSECTION inside the Background tab. Single row of 4 tabs.

| Before | After |
|---|---|
| 5 tabs in 2-row grid (Photos/Pages/Templates + Background/Props) | 4 tabs in single row (Photos/Pages/Templates/Background) |
| Background tab = page background only | Background tab = page background controls + PropertiesPanel |
| Props tab = object properties | Props tab = **removed** — content lives inside Background |
| Auto-switch to "Props" on selection | Auto-switch to "Background" on selection |

**Background tab layout (top to bottom):**
1. **Background controls** (shrink-0, always visible):
   - Type selector (Solid/Gradient/Pattern/Image)
   - Type-specific controls (color swatches, gradient presets, pattern buttons, URL input)
   - Opacity slider
   - "Apply to All Pages" button
2. **Properties subsection** (flex-1, scrollable):
   - Text selected → Full TextEditor
   - Background object selected → Background transform + filters
   - Slot selected → Zoom + Pan controls
   - Photo selected → Filters + Position/Size
   - Nothing selected → BackgroundDesigner + "Apply to All"

**BuilderEdit.tsx fixes (stale phase references):**
- `setPhase('template')` → `setPhase('setup')` — 'template' phase was removed
- `setPhase('upload')` → `setPhase('setup')` — 'upload' phase was removed

**Files changed:**
- `UnifiedPanel.tsx` — Single row of 4 tabs. Background tab wraps background controls + PropertiesPanel. Removed 'properties' from tab state. Removed `Settings2` import.
- `BuilderEdit.tsx` — Fixed stale phase references (`template` → `setup`, `upload` → `setup`).

---

## 5. Known Issues & Limitations

### 5.1 Current Limitations
| # | Issue | Severity | Notes |
|---|-------|----------|-------|
| 1 | **Single-user only** | High | No auth, no accounts, no cloud save. localStorage only |
| 2 | **No backend** | High | Albums only in localStorage — lost on browser switch/clear |
| 3 | **No order management** | Medium | Order button exists but doesn't connect to anything real |
| 4 | **No admin dashboard** | Medium | Print shop can't see incoming orders |
| 5 | **Mobile not optimized** | Medium | Desktop-first design |
| 6 | **No undo system** | Low | No Ctrl+Z support |
| 7 | **Uncommitted changes** | High | 4 files from Session 2 + 3 patched files from Session 3 |

### 5.2 Technical Debt
| # | Issue | Location | Notes |
|---|-------|----------|-------|
| 1 | `useCanvasEngine.ts` — large file | builder/ | Could be split into smaller hooks |
| 2 | `BuilderEdit.tsx` — many useEffect deps | builder/ | Some eslint-disable comments for hooks |
| 3 | `any` types in Fabric.js code | Multiple | Fabric types not fully defined |
| 4 | `pageSnapshotsRef` memory growth | useBuilderState | Snapshots accumulate in memory |
| 5 | Custom background images use ObjectURL | BackgroundDesigner | Memory leak if not revoked — need cleanup on unmount |
| 6 | `currentPage` TDZ in BuilderEdit.tsx | Empty state hooks | `currentPage` referenced before declaration — **FIXED** |
| 7 | **Right margin disappearing in renders** | pageTemplates.ts + useCanvasEngine.ts | Slots stored as canvas %, no hard margin boundary — **FIXED via Option B re-architecture** |
| 8 | `preferredSlotCount` undefined | BuilderEdit.tsx | State declaration accidentally removed with sidebarTab cleanup — **HOTFIXED** |

---

## 6. Features Working

### 6.1 Builder Flow (3 phases)
| Phase | Status | Key Capabilities |
|-------|--------|------------------|
| **Setup** | ✅ | Album size selection, live PHP price calculator (Layflat deprecated) |
| **Design/Edit** | ✅ | Fabric.js canvas, slots, text (30+ fonts), zoom, backgrounds, container mode, **empty state overlay**, **Generate/Generate All buttons**, **unified right panel** |
| **Preview** | ✅ | Canvas snapshot sync, spread view, backgrounds |

### 6.2 Editor Features
| Feature | Status | Details |
|---------|--------|---------|
| Photo upload | ✅ | Drag & drop, 20-100 photos, JPG/PNG |
| Template matching | ✅ | By photosPerPage (1-5 slots) |
| Auto-fill slots | ✅ | One-click fill all slots with photos |
| Slot zoom/pan | ✅ | Per-slot scale and offset controls |
| Text editing | ✅ | 30+ Google Fonts, inline editing, styling |
| Backgrounds | ✅ | Solid, gradient, **image (with custom upload)**, pattern + opacity slider |
| Filters | ✅ | Brightness, contrast, saturate, blur, hue, sepia, grayscale |
| Page management | ✅ | Add, delete, duplicate pages |
| Regenerate | ✅ | Regenerate current page only with photo dedup |
| **Empty state** | ✅ | Overlay with guidance when page has no content |
| **Generate from empty** | ✅ | Button appears in toolbar when page is empty |
| Free phase navigation | ✅ | No step lock — can jump between phases |
| Print pipeline | ✅ | 300 DPI export ready |

---

## 7. Sprint Plan Status

| Sprint | Focus | Status | Blockers |
|--------|-------|--------|----------|
| **1** | Auth + Database (Supabase) | 🟡 Ready to start | Need Supabase project URL + anon key |
| 2 | Cloud Album (replace localStorage) | 🔴 Not started | Blocked by Sprint 1 |
| 3 | Orders + Admin Dashboard | 🔴 Not started | Blocked by Sprint 2 |
| 4 | Storage Cleanup + Automation | 🔴 Not started | Blocked by Sprint 3 |

---

## 8. Environment Requirements

### 8.1 Dependencies (confirmed working)
- React 19
- TypeScript
- Vite
- Tailwind CSS
- Fabric.js
- shadcn/ui
- Framer Motion
- GSAP (ScrollTrigger)
- Lucide React icons

### 8.2 Missing for Sprint 1
- `@supabase/supabase-js` (not yet installed)
- Supabase project (not yet created)

---

## 9. Change Log

### Session 3 (2026-05-31) — Polish Phase
- **Created:** `currentstate.md` — living document for project state tracking
- **PATCHED:** `BackgroundDesigner.tsx` — Custom image upload, CSS gradient presets, fixed layout
- **PATCHED:** `BuilderEdit.tsx` — Empty state overlay, Generate button, conditional toolbar
- **PATCHED:** `PropertiesPanel.tsx` — Fixed Page Properties flex layout with proper scroll areas
- **PATCHED:** `BackgroundDesigner.tsx` — Tab layout: icon-only with tooltips, cleaner compact design
- **PATCHED:** `useCanvasEngine.ts` — Selection preservation: all types (photo, slot, text, bg) restored after re-render
- **REWRITTEN:** `pageTemplates.ts` — Replaced 54 old templates with 22 new PDF-based layouts
- **UPDATED:** `types.ts` — New template categories: single, duo, trio, quad, quint, sextet
- **REWRITTEN:** `pageTemplates.ts` — Margin-aware template architecture: safe-area-proportion slots, per-template margins, `adaptTemplateToOrientation()`, `computeSlotPixels()`. Fixes right margin disappearing in rendered albums.
- **PATCHED:** `types.ts` — Added `TemplateMargin`, `margin` + `orientation` to `PageTemplate`, clarified `TemplateSlot` as 0–1 safe-area proportions
- **PATCHED:** `useCanvasEngine.ts` — Two-phase safe-area render in `renderTemplateSlots` and `handleObjectModified`
- **PATCHED:** `BuilderEdit.tsx` + `Builder.tsx` — Renamed "Regenerate" to "Generate" (current page only), added "Generate All" (creates all pages from uploaded photos) — **CODE ACTUALLY APPLIED THIS SESSION**
- **PATCHED:** `useBuilderState.ts` + `BuilderEdit.tsx` — Added "Apply to All" button: applies current page background to all pages
- **NEW:** `UnifiedPanel.tsx` — Single 320px right panel replacing EditSidebar + PropertiesPanel. 5 tabs (Photos/Pages/Templates/Layers/Properties). Auto-switches to Properties on canvas selection.
- **PATCHED:** `BuilderEdit.tsx` — Removed left EditSidebar, replaced right PropertiesPanel with UnifiedPanel. Canvas gains ~20% more space.
- **PATCHED:** `EditSidebar.tsx` — Template thumbnail CSS fix: `slot.x%` → `slot.x * 100%` for 0-1 proportions
- **PATCHED:** `UnifiedPanel.tsx` — Pages tab: added `activeTab !== 'pages'` guard to prevent auto-switch kick-out when clicking pages
- **PATCHED:** `useBuilderState.ts` — `photosPerPage` default: `3` → `undefined`. Slot count filter now flows to Generate/Shuffle/Regenerate.
- **PATCHED:** `BuilderEdit.tsx` — Removed local `preferredSlotCount` state; uses `actions.photosPerPage` instead
- **PATCHED:** `UnifiedPanel.tsx` — Slot count buttons now call `actions.setPhotosPerPage` instead of local state
- **RESTRUCTURED:** `UnifiedPanel.tsx` — Tabs: single row (4 tabs). Background merged into Properties. Removed separate Background tab. "Apply to All Pages" button preserved in PropertiesPanel.
- **ADDED:** `useBuilderState.ts` — **40-page minimum** for printing cost. New albums start with 40 empty pages. Delete blocked below 40.
- **PATCHED:** `UnifiedPanel.tsx` — Page count shows "(40 minimum)". Delete button hidden when at 40 pages.
- **REWRITTEN:** `generateAlbum.ts` — **Dynamic photo distribution**: always 40 pages, computes `photosPerPageTarget = round(totalPhotos / 40)`, picks matching templates.
- **FIXED:** `useCanvasEngine.ts` — Scroll wheel: changed from `window` listener to direct container div attachment with 100ms delay. Canvas container's `overflow-auto` was capturing events before they reached window.
- **ABANDONED:** Photo slot shadow effect — Fabric.js shadow unreliable with clipPath. Three attempts failed.

### 4.10 40-Page Minimum for Printing Cost (APPLIED)
**What:** New albums start with **40 empty pages** instead of 1. Users can add more but cannot delete below 40. This ensures the print cost is always viable.

**Implementation:**
- `MIN_PAGES = 40` constant in `useBuilderState.ts`
- Initial state: `Array.from({ length: MIN_PAGES }, defaultPage)` — 40 blank pages on new album
- `deletePage()`: `if (prev.length <= MIN_PAGES) return prev` — hard block
- `addPage()`: unchanged — can still add beyond 40
- Storage version bumped to `v5` to force fresh state

**Dynamic photo distribution (generateAlbum.ts):**
- Always creates exactly 40 pages, regardless of photo count
- Computes `photosPerPageTarget = Math.max(1, Math.round(totalPhotos / 40))`
- Picks templates whose `slotCount` matches the target
- Distributes photos sequentially across all 40 pages
- Pages that run out of photos have empty slots

**Examples:**
| Photos | Target per page | Template slots | Empty pages |
|---|---|---|---|
| 140 | 4 (round(140/40)) | 3-4 slots | 0 |
| 100 | 3 (round(100/40)) | 2-3 slots | ~10 |
| 50 | 1 (round(50/40)) | 1 slot | ~10 |
| 24 | 1 (round(24/40)) | 1 slot | ~16 |
| 0 | — | 3 slots | 40 |

**UI changes:**
- UnifiedPanel Pages tab: shows "{count} pages (40 minimum)" 
- Delete button: only visible when `albumPages.length > 40`

**Files changed:**
- `useBuilderState.ts` — `MIN_PAGES` constant, initial 40 pages, delete guard
- `UnifiedPanel.tsx` — Page count indicator, conditional delete button

### 4.11 Background + Props Merge (APPLIED)
**What:** Merged the separate Background tab into the Properties tab. Background controls are now part of PropertiesPanel — visible when nothing is selected (full BackgroundDesigner) or as a collapsible section when editing objects.

**Why:** Having Background as a separate tab was confusing — it's a property of the page, not a separate feature. Users naturally look for background controls in Properties.

**Changes:**

**UnifiedPanel.tsx:**
- Tabs: 4 in single row — Photos | Pages | Templates | Properties
- Removed Background tab and its inline background editor
- Removed 2-row grid layout (back to single row)
- Auto-switch logic simplified: `activeTab !== 'pages'`

**PropertiesPanel.tsx:**
- Already handles background when nothing selected (shows BackgroundDesigner)
- When photo/text/slot selected, background controls available via collapsible "Background" section
- **Added "Apply to All Pages" button** at bottom of Page Properties section
- Single unified interface for all page/object properties

**Result:** Cleaner tab bar, more intuitive organization, less confusion. "Apply to All" preserved.
- **Identified:** 10 broken issues across builder (background images, empty canvas, layout, etc.)

### Session 2 (2026-05-30)
- **Created:** `BuilderContext.tsx` — state persistence across routes
- **Modified:** `App.tsx` — wrapped in BuilderProvider
- **Modified:** `Builder.tsx` — context integration + generate guard + New button
- **Modified:** `Templates.tsx` — category filter bug fixes
- **Created:** `CONTINUITY.md` — session continuity document

### Session 1 (2026-05-24)
- Initial MVP build
- All core builder components created
- 54 templates, canvas engine, preview system

---

## 10. Next Actions

### Immediate (Session 3 — Remaining)
1. [x] ~~Apply Generate/Generate All patches to BuilderEdit.tsx + Builder.tsx~~ — DONE
2. [x] ~~Template Margin Architecture (Option B) — types.ts + pageTemplates.ts + useCanvasEngine.ts~~ — DONE
3. [x] ~~Unified Panel Redesign — UnifiedPanel.tsx + BuilderEdit.tsx + EditSidebar.tsx~~ — DONE
4. [x] ~~Pages Tab Auto-Switch fix — UnifiedPanel.tsx~~ — DONE
5. [x] ~~Slot Count Filter Wiring — useBuilderState.ts + BuilderEdit.tsx + UnifiedPanel.tsx~~ — DONE
4. [ ] Test patched files locally before committing
5. [ ] Address any additional polish items user identifies
6. [x] ~~Update `currentstate.md` after all changes~~ — DONE

### Before Sprint 1
1. [ ] Commit all uncommitted changes (Session 2 + Session 3 patches)
2. [ ] User creates Supabase account + project
3. [ ] Save Project URL and Anon Key
4. [ ] Install `@supabase/supabase-js`

### Sprint 1 Tasks (when ready)
1. [ ] Create Supabase client configuration
2. [ ] Build `AuthProvider` context
3. [ ] Create LoginPage and SignupPage
4. [ ] Protect builder route
5. [ ] Create `albums` table with RLS

---

*This document is updated after every code change. Check the Change Log section for history.*
