# Megyprints — Themed Album System
**Last Updated:** 06132026_0445PM Philippine Time
**Status:** Smart Templates core shipped. Themed backgrounds + decorative frames + ornaments is the next phase.

---

## What is Megyprints?

Megyprints is a web-based photo album creation app. Users upload photos, and **Megy** (an AI assistant character) guides them through designing a beautiful printed album — from photo upload to physical product delivery.

### The "One Megy to Rule Them All" Philosophy
Megy isn't a chatbot bolted onto a builder. Megy IS the interface. She greets users on the home page, walks them through a wizard, assists during design, and celebrates when the album is ready. The goal: remove all decision fatigue from the user. Megy analyzes, recommends, and builds.

### Current Tech Stack
- React + TypeScript + Vite
- Tailwind CSS
- Framer Motion for animations
- IndexedDB for local photo storage (zero cloud storage I/O)
- Supabase for lightweight album metadata sync
- `useBuilderState` hook manages all state with localStorage persistence + cloud save

---

## What We Already Built (This Session)

### 1. Smart Templates System (46 templates)
- Every template slot is **ratio-locked** — all slots produce the same standard photo aspect ratio
- Templates organized by: Album Size (5 sizes) → Photo Count (1-5) → Target Ratio (7 ratios)
- Helper functions: `rs()` for slot proportion calculation, `adaptTemplateToOrientation()`, `computeSlotPixels()`

### 2. Photo Analyzer (`photoAnalyzer.ts`)
- Analyzes all uploaded photos, classifies into 7 standard ratios (4:3, 3:4, 3:2, 2:3, 1:1, 16:9, 9:16)
- Returns dominant ratio + group breakdown
- **Bug fixed:** Removed inverse check that misclassified portrait photos as landscape
- Added `getPreferredRatioForAlbum()` helper

### 3. Smart Generation (`generateAlbum.ts`)
- Calls `analyzePhotos()` to find dominant ratio
- Filters templates by album size + dominant ratio
- Fills slots with ratio-matched photos first, falls back to any remaining

### 4. Wizard Redesign (MegyAssistant v7)
- **New flow:** intro → upload → REAL analyzing → album-size → photos-per-page → background → proposal → generating → done
- Analyzing step is REAL — calls `analyzePhotos()`, shows detected ratio, auto-recommends album size
- Album-size-filtered photo density options
- Theme step removed — templates auto-matched by ratio + size
- Full background picker with opacity slider

### 5. IndexedDB Photo Leak Fix
- Fixed race condition where `getInitialState()` consumed fresh-start signal before cloud effect could see it
- Added stale session detection, rehydration guards, `reset()` now clears IndexedDB

---

## The Vision: Themed Scrapbook Albums

### The Problem We Discovered
The Smart Templates work — photos land in correctly-shaped containers, no more head-cutting-off. But after ~10 pages, the album looks repetitive. Only 4-8 templates match a given ratio + size combination, so the same layouts repeat across 40+ pages.

### The Solution: 4-Layer Visual System

Instead of "white page + photo rectangles," every page is a **richly decorated scrapbook composition**:

```
Layer 4: ORNAMENTS — stickers, text banners, scattered accents, ribbons, petals
Layer 3: FRAMES — gold ornate, lace doily, clean modern, rustic wood, vintage polaroid
Layer 2: PHOTOS — ratio-matched to their slots (4:3, 3:4, 1:1, etc.)
Layer 1: BACKGROUND — themed illustrated scene (floral arch, starry night, vintage map)
```

### Themes by Occasion

| Theme | Occasion | Background Vibe | Color Palette | Frame Style | Ornaments |
|-------|----------|----------------|---------------|-------------|-----------|
| **Wedding** | Ceremony, reception, bridal | Floral arch, draped fabric, soft bokeh | Blush, cream, gold, sage | Gold ornate, lace doily | Roses, eucalyptus, ribbons, rings, scattered petals |
| **Baptism** | Christening, dedication | Soft clouds, angelic light, water motifs | White, baby blue, soft pink, silver | Clean modern, white mat | Crosses, doves, baby's breath, candles |
| **Travel** | Vacations, adventures | Vintage maps, passport stamps, landscapes | Earth tones, teal, mustard | Rustic wood, vintage polaroid | Stamps, postcards, compasses, tickets, location pins |
| **Family** | Reunions, gatherings, holidays | Warm home scenes, fireplace, cozy textures | Warm amber, cream, forest green | Clean modern, thin white | Family silhouettes, hearts, home icons, warm florals |
| **Birthday** | Celebrations, milestones | Confetti, balloons, cake, party lights | Bright coral, gold, pastel mix | Playful colorful, rounded | Balloons, confetti, cake toppers, streamers, candles |

### How Variation Works Now

Before (current): `getTemplatesForRatio(albumSize, '1:1')` → 4 templates, boring repetition

After (vision):
- **Base patterns** (Feature+Accent, Cascade, Cluster, Hero+Supporting, Asymmetric Duo, Overlapping Trio) define photo size/placement
- **Frame styles** (6+ options) wrap each photo slot
- **Background scenes** (theme-specific illustrated backdrops) set the mood
- **Ornament sets** (corners, scattered, ribbons, text banners) fill negative space
- 10 patterns x 6 frames x 5 themes = **300+ unique page combinations**
- Same photos, completely different feel every page

### Backgrounds Are the Foundation

The user searched "background themes for weddings" and studied floral arches, draped fabric backdrops, minimalist ring compositions, pink curtain scenes. The background isn't a flat color — it's a **full illustrated scene** that establishes the theme's mood. Everything else (frames, ornaments, photos) layers on top.

---

## Files in the Project

| File | Purpose |
|------|---------|
| `src/pages/builder/photoAnalyzer.ts` | Photo aspect ratio detection |
| `src/pages/builder/pageTemplates.ts` | 46 ratio-locked templates + helpers |
| `src/pages/builder/generateAlbum.ts` | Smart album generation |
| `src/pages/builder/types.ts` | Type definitions (PhotoRatio, PageTemplate, etc.) |
| `src/pages/builder/useBuilderState.ts` | All builder state + persistence |
| `src/components/MegyAssistant.tsx` | Megy wizard + design copilot |
| `src/pages/Builder.tsx` | Builder page container |
| `src/pages/Home.tsx` | Home page with Megy welcome |

---

## What Needs to Be Built Next

1. **Theme system** — define background scenes, frame styles, ornament sets per theme
2. **Asset pipeline** — source/generate background images, frame overlays, ornament sprites
3. **Page renderer** — composite Layer 1-4 into final page canvas
4. **Frame renderer** — apply decorative frames around photo slots
5. **Ornament placer** — position ornaments based on template pattern + theme
6. **Variation logic** — rotate through patterns/frames/ornaments so no two adjacent pages look identical

---

## Rules for This Project
- Ask user for latest file iteration before every change
- Only reference the file the user just pasted
- Read every line of every file
- No assumptions from previous iterations
- The GitHub repo is the single source of truth
