# Megy Prints — Current State Document

**Last updated:** 2026-06-01 Session 4 — Spread view fixed, dynamic pages, randomized templates, slot filter deps
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
| `BuilderContext.tsx` | ✅ Working | React Context provider wrapping useBuilderState — persists state across route navigation | Session 2 |
| `useBuilderState.ts` | ✅ **SESSION 4** | Slot filter dependency fix (`photosPerPage` added to `regeneratePage` deps), `reset` rename, all TS fixes, CanvasPhoto required fields | **Session 4** |
| `useCanvasEngine.ts` | ✅ Working | Fabric.js canvas engine — two-phase safe-area render, orientation adaptation, slot management | Session 3 |
| `BuilderSetup.tsx` | ✅ Working | All-in-one setup page with price calculator, album type/size selection, live PHP pricing | Session 2 |
| `BuilderTemplate.tsx` | ✅ Working | Template gallery with horizontal scroll, 54 templates, rejection system | Session 2 |
| `BuilderEdit.tsx` | ✅ **SESSION 4** | Removed toolbar Preview button, empty state, Generate/Regenerate/Generate All | **Session 4** |
| `BuilderPreview.tsx` | ✅ **REWRITTEN (S4)** | Complete rewrite — spread-only view, shared `PageView` component, page number labels, large side arrows | **Session 4** |
| `BuilderToolbar.tsx` | ✅ Working | Preview toolbar (page nav, spread, order button) | Session 2 |
| `BuilderErrorBoundary.tsx` | ✅ Working | Error boundary with reset capability for builder | Session 2 |
| `pageTemplates.ts` | ✅ Working | 22 margin-aware templates (T01-T22) — safe-area-proportion slots, per-template margins | Session 3 |
| `types.ts` | ✅ Working | Added `TemplateMargin`, `SlotGeometryOverride`, `AlbumPage.layout/size` | Session 3 + 4 |
| `layouts.ts` | ✅ Working | Canvas dimension helpers per album size | Session 2 |
| `generateAlbum.ts` | ✅ **SESSION 4** | Dynamic page count (40 min, expands to fit all photos), **randomized template selection** across all slot counts | **Session 4** |
| `printPipeline.ts` | ✅ Working | 300 DPI print export (renderPageForPrint, renderAlbumForPrint) | Session 2 |
| `priceCalculator.ts` | ✅ Working | PHP pricing logic (calculatePrice, formatPrice) | Session 2 |
| `PreviewSizeConstants.ts` | ✅ Working | Preview pixel dimensions per album size | Session 2 |
| `slotShapeStyle.ts` | ✅ Working | Shape-corrected sizing for preview (circle, heart, star, etc.) | Session 2 |
| `BackgroundDesigner.tsx` | ✅ Working | Background editor with custom image upload, fixed layout, CSS gradient presets | Session 3 |
| `TemplatePicker.tsx` | ✅ Working | Template selection grid | Session 2 |
| `EditSidebar.tsx` | ✅ Working | Template thumbnail CSS fix for 0-1 slot proportions | Session 3 |
| `PropertiesPanel.tsx` | ✅ Working | Photo properties panel (renders as subsection inside Background tab) | Session 3 |
| `UnifiedPanel.tsx` | ✅ Working | Single right panel (320px) — 4 tabs in single row. Properties merged INTO Background tab. | Session 3 |
| `LayersPanel.tsx` | ✅ Working | Page layers panel | Session 2 |
| `BuilderUpload.tsx` | ✅ Working | Upload phase component (drag & drop, photo grid, replace/remove) | Session 2 |

### 2.2 Page Components (src/pages/)

| File | Status | Description | Last Modified |
|------|--------|-------------|---------------|
| `Builder.tsx` | ✅ **SESSION 4** | Breadcrumb Preview clickable, `handleGenerate` uses `regeneratePage()` | **Session 4** |
| `Home.tsx` | ✅ Working | Landing page with hero, trust bar, how-it-works, template preview, testimonials, CTA | Session 2 |
| `Order.tsx` | ✅ Working | Order form with material/cover/size selection, customer details, price summary | Session 2 |
| `Templates.tsx` | ✅ Working | Template gallery page with category tabs, modal preview, "Use Template" navigation | Session 2 |
| `Contact.tsx` | ✅ Working | Contact page with FAQ accordion, contact form, contact methods | Session 2 |

### 2.3 Shared Components

| File | Status | Description | Last Modified |
|------|--------|-------------|---------------|
| `BuilderDemoSection.tsx` | ✅ Working | Animated demo section for homepage showing builder flow | Session 2 |
| `Layout.tsx` | ✅ Working | Main layout wrapper | Session 2 |

### 2.4 App-Level Files

| File | Status | Description | Last Modified |
|------|--------|-------------|---------------|
| `App.tsx` | ✅ Working | Routes — wrapped in `<BuilderProvider>` | Session 2 |

---

## 3. Session 4 Changes (All Applied)

### 3.1 Dynamic Page Count + Randomized Templates
**Files:** `generateAlbum.ts`, `useBuilderState.ts`

**Before:** Always exactly 40 pages. Templates filtered to match `photosPerPageTarget` slot count exactly (no visual variety).

**After:** 40 pages minimum, dynamically expands to fit all photos. Templates randomly selected from ALL templates (mixed slot counts).

```typescript
// Page count: max(40, ceil(totalPhotos / targetPerPage))
const photosPerPageTarget = Math.max(1, Math.round(totalPhotos / 40));
const pagesNeeded = Math.max(40, Math.ceil(totalPhotos / photosPerPageTarget));

// Template: random from ALL templates (not filtered by slot count)
const template = PAGE_TEMPLATES[Math.floor(Math.random() * PAGE_TEMPLATES.length)];
```

**Examples:**
| Photos | Target/Page | Pages Created | Template Mix |
|--------|-------------|---------------|--------------|
| 80 | 2 | 40 | Random 1-5 slot templates |
| 120 | 3 | 40 | Random 1-5 slot templates |
| 250 | 6 | 42 | Random 1-6 slot templates |

### 3.2 TypeScript Build Fixes
**Files:** `generateAlbum.ts`, `useBuilderState.ts`

| Error | Fix |
|-------|-----|
| Missing `layout`/`size` on `AlbumPage` | Added to `createEmptyPage()` |
| `AlbumType` not exported from types.ts | Defined locally as `'standard'` |
| `PAGE_TEMPLATES` not imported | Added import |
| CanvasPhoto missing required fields | Added `filters`, `offsetX/Y`, `borderWidth/Color/Radius`, `shadowBlur/Color/OffsetX/Y` |
| `updateSlotGeometry` type mismatch | Changed from `Record<string, number>` to `SlotGeometryOverride` |
| `reset` vs `resetAll` naming | Renamed to `reset` everywhere |
| `textElements` zIndex not in type | Removed zIndex from TextElement creation |

### 3.3 Preview Button Fix
**Files:** `Builder.tsx`, `BuilderEdit.tsx`

- Removed the orange "Preview" button from `BuilderEdit.tsx` toolbar (upper right)
- Made the "Preview" breadcrumb (upper left) clickable from the Design phase
- `Builder.tsx`: `if (i <= phaseIndex || (phase.id === 'preview' && phaseIndex >= 1))`

### 3.4 Generate Button Fix
**File:** `Builder.tsx`

**Before:** `handleGenerate` checked `hasExistingPages` and skipped generation entirely when pages existed — button did nothing.

**After:** `handleGenerate` calls `actions.regeneratePage()` directly — fills current empty page with a random template + photos.

### 3.5 Slot Count Filter on Regenerate/Shuffle
**File:** `useBuilderState.ts`

Both `regeneratePage()` and `shuffleLayout()` now filter templates by `photosPerPage` when set:
```typescript
let pool = PAGE_TEMPLATES.filter((t) => t.id !== page.templateId);
if (photosPerPage !== undefined) {
  pool = pool.filter((t) => t.slotCount === photosPerPage);
}
```

**Critical fix:** `photosPerPage` was missing from `regeneratePage`'s dependency array — the callback captured a stale value. Added to deps so the filter works correctly when changed.

### 3.6 Spread View — Complete Rewrite
**File:** `BuilderPreview.tsx` (complete rewrite)

**Problem:** Spread view showed wrong pages, wrong photos, identical left/right pages, photos not refreshing on navigation.

**Root causes and fixes:**

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| Left page bleeding into right | Snapshot/img had `w-full h-full` across both pages | Wrapped left page in `singleW` container with `overflow-hidden` |
| Photos wrong size | `SpreadPage` used `slot.x / 100` but slots are 0-1 proportions | Changed to `slot.x * singleW` |
| Pages not refreshing | `SpreadPage` had no `key` prop | Added `key={page.id}` to force re-render |
| Wrong page pairs | Showed `currentIndex` + `currentIndex+1` | Changed to pairs: `floor(index/2)*2` + `+1` |
| Right page ≠ Design view | `SpreadPage` was bare-bones DOM, missing safe-area/margins/transforms | Created shared `PageView` component used by both pages |
| Different rendering code paths | Left used snapshot→DOM, right used separate `SpreadPage` | Both use same `PageView` (snapshot → identical DOM fallback) |

**New layout:**
```
     [◀]    Page 25        Page 26    [▶]
            ┌─────────┐  ┌─────────┐
            │         │  │         │
            │ content │  │ content │
            │         │  │         │
            └─────────┘  └─────────┘
```

### 3.7 Spread-Only View + Side Arrows
**File:** `BuilderPreview.tsx`

- Removed single page view — spread is now the only mode
- Removed "Single/Spread" toggle button
- Large prev/next arrow buttons (40px, `#E8A598` color) positioned on left/right of pages
- Navigation jumps by 2 pages at a time (one full spread)
- Toolbar simplified: shows spread range ("25-26 / 40") + Order button

### 3.8 Page Number Labels
**File:** `BuilderPreview.tsx`

Added page number indicators above each page (outside the page container, not on the page itself):
```
         Page 25              Page 26
        ┌─────────┐  ┌─────────┐
        │         │  │         │
```

---

## 4. Known Issues & Limitations

### 4.1 Current Limitations
| # | Issue | Severity | Notes |
|---|-------|----------|-------|
| 1 | **Single-user only** | High | No auth, no accounts, no cloud save. localStorage only |
| 2 | **No backend** | High | Albums only in localStorage — lost on browser switch/clear |
| 3 | **No order management** | Medium | Order button exists but doesn't connect to anything real |
| 4 | **No admin dashboard** | Medium | Print shop can't see incoming orders |
| 5 | **Mobile not optimized** | Medium | Desktop-first design |
| 6 | **No undo system** | Low | No Ctrl+Z support |

### 4.2 Technical Debt
| # | Issue | Location | Notes |
|---|-------|----------|-------|
| 1 | `useCanvasEngine.ts` — large file | builder/ | Could be split into smaller hooks |
| 2 | `any` types in Fabric.js code | Multiple | Fabric types not fully defined |
| 3 | `pageSnapshotsRef` memory growth | useBuilderState | Snapshots accumulate in memory |
| 4 | Custom background images use ObjectURL | BackgroundDesigner | Memory leak if not revoked |

---

## 5. Features Working

### 5.1 Builder Flow (3 phases)
| Phase | Status | Key Capabilities |
|-------|--------|------------------|
| **Setup** | ✅ | Album size selection, live PHP price calculator |
| **Design/Edit** | ✅ | Fabric.js canvas, slots, text (30+ fonts), zoom, backgrounds, container mode, empty state overlay, Generate/Regenerate/Generate All, unified right panel, slot count filter |
| **Preview** | ✅ | **Spread-only view**, canvas snapshot sync, page number labels, large side arrows |

### 5.2 Editor Features
| Feature | Status | Details |
|---------|--------|---------|
| Photo upload | ✅ | Drag & drop, 20-100 photos, JPG/PNG |
| Template matching | ✅ | Randomized across all slot counts for variety |
| Slot count filter | ✅ | All / 1-5 slots — respected by Regenerate and Shuffle |
| Auto-fill slots | ✅ | One-click fill all slots with photos |
| Slot zoom/pan | ✅ | Per-slot scale and offset controls |
| Text editing | ✅ | 30+ Google Fonts, inline editing, styling |
| Backgrounds | ✅ | Solid, gradient, image (with custom upload), pattern + opacity |
| Filters | ✅ | Brightness, contrast, saturate, blur, hue, sepia, grayscale |
| Page management | ✅ | Add, delete (blocked at 40 min), duplicate |
| Regenerate | ✅ | Regenerates current page respecting slot count filter |
| Generate from empty | ✅ | Button appears in toolbar when page is empty |
| Generate All | ✅ | Creates pages dynamically (40 min, expands to fit photos) |
| Spread preview | ✅ | Pages shown as pairs (0-1, 2-3, 4-5), with side navigation |
| Print pipeline | ✅ | 300 DPI export ready |

---

## 6. Sprint Plan Status

| Sprint | Focus | Status | Blockers |
|--------|-------|--------|----------|
| **1** | Auth + Database (Supabase) | 🟡 Ready to start | Need Supabase project URL + anon key |
| 2 | Cloud Album (replace localStorage) | 🔴 Not started | Blocked by Sprint 1 |
| 3 | Orders + Admin Dashboard | 🔴 Not started | Blocked by Sprint 2 |
| 4 | Storage Cleanup + Automation | 🔴 Not started | Blocked by Sprint 3 |

---

## 7. Change Log

### Session 4 (2026-06-01) — Dynamic Pages, Spread View, Slot Filter
- **REWRITTEN:** `generateAlbum.ts` — Dynamic page count (40 minimum, expands to fit all photos). Randomized template selection across all slot counts for visual variety.
- **FIXED:** `useBuilderState.ts` — All TypeScript errors (AlbumType, PAGE_TEMPLATES import, layout/size, CanvasPhoto fields, SlotGeometryOverride, reset naming). Added `photosPerPage` to `regeneratePage` dependency array (critical fix for slot filter).
- **FIXED:** `Builder.tsx` — Breadcrumb Preview clickable from Design phase. `handleGenerate` uses `regeneratePage()` instead of skipping.
- **FIXED:** `BuilderEdit.tsx` — Removed toolbar Preview button.
- **REWRITTEN:** `BuilderPreview.tsx` — Complete rewrite. Spread-only view. Shared `PageView` component (snapshot → identical DOM fallback). Proper page pairs (0-1, 2-3, 4-5). `key={page.id}` for proper re-rendering. Page number labels above pages. Large side arrows (40px) for navigation. Removed single view + toggle.

### Session 3 (2026-05-31) — Polish Phase
- Template Margin Architecture (Option B) — safe-area-proportion slots, per-template margins
- Unified Panel Redesign — single 320px right panel, 4 tabs
- Empty state overlay + Generate/Generate All buttons
- BackgroundDesigner custom image upload + CSS gradient presets
- Properties merged into Background tab
- 40-page minimum for printing cost
- Slot count filter wiring

### Session 2 (2026-05-30)
- BuilderContext — state persistence across routes
- App.tsx wrapped in BuilderProvider
- Builder.tsx context integration + generate guard

### Session 1 (2026-05-24)
- Initial MVP build

---

*This document is updated after every code change. Check the Change Log section for history.*
