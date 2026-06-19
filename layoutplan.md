# Megy Prints — Themed Album Layout System Plan

> **Document Type:** Architecture & Design Plan
> **Scope:** Modular scrapbook page layout system with themed backgrounds, pre-designed frame layouts, and photo ratio matching
> **Created:** 2026-06-05

---

## 1. Vision

Create a **themed photo album system** where users pick an occasion theme and album size, upload their photos, and the app automatically assembles beautiful, scrapbook-style pages. Each page is a modular composition of:

1. **Background** — themed imagery that sets the mood
2. **Frame(s)** — pre-designed photo containers that match photo ratios
3. **Caption Box** — optional text area (if layout includes it)
4. **Decorative Accents** — themed ornaments, florals, corner pieces

> **Core Principle:** The customer's photos are the stars. Backgrounds, frames, and ornaments support — they don't compete.

---

## 2. Album Sizes

| # | Album Size | Dimensions | Orientation | Max Photos/Page |
|---|-----------|-----------|-------------|-----------------|
| 1 | **Mini Landscape** | 6 × 4 in | 3:2 | 1 |
| 2 | **Square** | 6 × 6 in | 1:1 | 1–2 |
| 3 | **Large Square** | 8 × 8 in | 1:1 | 1–2 |
| 4 | **Landscape** | 11.5 × 8 in | ~1.44:1 | 2–3 |
| 5 | **Portrait** | 8 × 11.5 in | ~1:1.44 | 2–4 |

---

## 3. Safe Zones & Design Rules

### Binding Line
- The **binding line is always on the left edge** of every page
- No photo frame may start closer than **0.5"** from the left edge
- Critical content (faces, focal points) stays **0.75"** from the left edge

### Usable Area Calculation (per size)

| Album Size | Page Width | Usable Width (after binding) | Usable Height |
|-----------|-----------|------------------------------|---------------|
| 6 × 4 | 6" | 5.5" | 4" |
| 6 × 6 | 6" | 5.5" | 6" |
| 8 × 8 | 8" | 7.5" | 8" |
| 11.5 × 8 | 11.5" | 11" | 8" |
| 8 × 11.5 | 8" | 7.5" | 11.5" |

> Usable height also has 0.25" trim safe zone subtracted from top and bottom.

### Hard Constraints

| Rule | Value |
|------|-------|
| **Min frame width** | 2" |
| **Min gap between frames** | 0.25" |
| **Binding safe zone** | 0.5" (left edge) |
| **Trim safe zone** | 0.25" (top, right, bottom) |
| **Max decorative area** | 25% of page |
| **Frame border width** | 1/16–1/8" (0.0625–0.125") |
| **Mat/passe-partout width** | 1/8–1/4" (0.125–0.25") |
| **Caption banner height** | 3/8–1/2" (0.375–0.5") |

---

## 4. Photo Ratios (7 Total)

The app analyzes uploaded photos and classifies them into 7 standard ratios:

| # | Ratio | Orientation | Common Photo Sizes |
|---|-------|-------------|-------------------|
| 1 | **3:2** | Landscape | 4×6, 8×12 |
| 2 | **4:3** | Landscape | 3×4, 6×8, digital cameras |
| 3 | **16:9** | Landscape (Ultrawide) | Panoramic, phone landscape |
| 4 | **2:3** | Portrait | 4×6 portrait, 8×12 portrait |
| 5 | **3:4** | Portrait | 6×8 portrait |
| 6 | **9:16** | Portrait (Tall) | Phone portrait, stories |
| 7 | **1:1** | Square | Instagram, 5×5, 8×8 |

---

## 5. The 4-Layer Visual System

Every themed album page is composed of 4 layers, rendered back-to-front:

### Layer 1: Background
- Themed imagery from pre-collected royalty-free photo pools
- NO people in any background image
- Sourced from Unsplash, Pexels, Pixabay, StockCake (free for commercial use)
- Resolution: 1K sufficient (backgrounds don't need high pixel density)
- The app randomly selects a background from the chosen theme's pool

### Layer 2: Frame(s)
- Pre-designed frame layouts (positioned containers for photos)
- 7 layouts per album size (starting with 6×6, scaling up)
- Each layout has **ratio sub-variants** — one per photo ratio
- Frame styles per theme (gold ornate for wedding, soft lace for baptism, etc.)

### Layer 3: Caption Box
- Optional text area below or beside frames
- Only included in Frame+Caption layout variants
- Themed typography and styling

### Layer 4: Decorative Accents
- Corner florals, ornaments, ribbons, scattered elements
- Stay within 15% of page dimensions
- Never cross into 0.5" binding safe zone
- Themed to match the occasion

---

## 6. Background Image Pools (by Theme)

### Collected Themes (75+ images total, NO people)

| Theme | Images | Source Strategy |
|-------|--------|-----------------|
| **Wedding** | 10 | Rings, cakes, champagne flutes, floral arches, petals, table settings |
| **Baptism** | 10 | White doves, church interiors, golden crosses, baptism candles, water ripples, white lilies, christening gowns |
| **Family** | 10 | Cozy fireplaces, autumn leaves, warm homes with gardens, living rooms, autumn blankets |
| **Birthday** | 10 | Cakes with candles, colorful balloons, confetti, cupcakes, party banners |
| **Travel — Asian Beaches** | 5 | Tropical white sand, Maldives aerial, Thailand turquoise, Bali terraces & palm beach |
| **Travel — Asian Countries** | 5 | Mount Fuji with sakura, Japanese temples, Wat Arun Bangkok, Great Wall of China |
| **Travel — Generic** | 20+ | Airplane wings, open roads, vintage passports/maps, hot air balloons, Eiffel Tower, Santorini, cruise ships, desert dunes, lighthouses, camping under stars |
| **Bonus Asia** | 5 | Bali terraces wide, Fuji with pagoda, Kyoto cherry blossom night, railway sunset, camping stars |

---

## 7. Frame Layout Architecture

### Pre-Designed Layout Pool (NOT Random Generation)

Frame layouts are **pre-designed blueprints** — not randomly generated at runtime. This ensures every layout is aesthetically balanced and obeys all safe zone rules.

### Layout Catalog Structure

```
Album Size (5 total)
  └── Layout Type (Frame-Only OR Frame+Caption)
       └── Layout Variant (7 per size)
            └── Ratio Sub-Variant (7 per layout)
                 ├── 3:2 (landscape)
                 ├── 4:3 (landscape)
                 ├── 16:9 (landscape — ultrawide, special handling)
                 ├── 2:3 (portrait)
                 ├── 3:4 (portrait)
                 ├── 9:16 (portrait)
                 └── 1:1 (square)
```

### Layout Selection Logic

1. User picks **theme** + **album size**
2. App analyzes uploaded photos → determines their **ratios**
3. App **filters the layout pool** to only layouts that can accommodate those ratios
4. App **randomly selects** from the filtered pool
5. App places the **selected layout** onto a **random themed background**
6. Customer photos are **dropped into matching-ratio frames**
7. Page is rendered with background → frames → caption → ornaments

### 16:9 Special Handling
- Ultrawide photos get dedicated layouts (full-bleed panoramic frame, edge-to-edge)
- May be treated as "hero shot" layout — one big panoramic frame across the page
- Separate layout pool or marked as special-case within standard layouts

---

## 8. 6×6 Layout Pool (Complete — 7 Layouts)

### Usable Area: 5.25" (W) × 5.5" (H)

| # | Layout Name | Type | Frames | Best Ratios | Notes |
|---|-------------|------|--------|-------------|-------|
| 1 | **Hero Frame** | Frame-Only | 1 | All 7 | Single large frame centered, 4.5" × 3.0" |
| 2 | **Hero + Caption** | Frame+Caption | 1 | All 7 | Large frame + caption below, 4.0" × 3.0" |
| 3 | **Duo Side** | Frame-Only | 2 | 3:2, 4:3, 1:1 | Two frames side by side, 2.5" × 1.67" each |
| 4 | **Duo Stack** | Frame-Only | 2 | 1:1 | Two square frames stacked, 2.625" × 2.625" each |
| 5 | **Polaroid** | Frame+Caption | 1 | 1:1, 3:2, 4:3 | Square frame + Polaroid whitespace + caption |
| 6 | **Accent Offset** | Frame-Only | 1 | 3:2, 4:3, 16:9 | Frame offset right, left space for ornaments |
| 7 | **Mini Duo + Caption** | Frame+Caption | 2 | 4:3, 1:1, 3:2 | Two small frames + shared caption banner |

**78+ unique layout-ratio combinations** from these 7 layouts.

### Remaining Sizes to Design
- 6 × 4 (Mini Landscape)
- 8 × 8 (Large Square)
- 11.5 × 8 (Landscape)
- 8 × 11.5 (Portrait)

---

## 9. Frame Styles (Per Theme)

| Theme | Frame Style | Color Palette |
|-------|-------------|---------------|
| **Wedding** | Gold ornate, scalloped white lace, thin elegant lines | Blush, cream, soft gold, champagne |
| **Baptism** | Soft white rounded, gentle shadow, cross motifs | White, soft blue, gentle gold |
| **Family** | Warm wood, rustic, cozy textures | Amber, warm brown, autumn tones |
| **Birthday** | Colorful, playful, confetti edges | Bright pastels, festive multi-color |
| **Travel** | Vintage polaroid, passport stamp edges, map borders | Destination-inspired, muted warm tones |

---

## 10. User Flow (End-to-End)

```
1. User opens Megy Prints app
   └── Selects "Create New Album"

2. Choose Occasion
   ├── Wedding
   ├── Baptism / Christening
   ├── Birthday
   ├── Family
   └── Travel (with sub-options: Beaches, Asia, Generic)

3. Select Album Size
   ├── 6×4 (Mini Landscape)
   ├── 6×6 (Square)
   ├── 8×8 (Large Square)
   ├── 11.5×8 (Landscape)
   └── 8×11.5 (Portrait)

4. Upload Photos
   └── App analyzes each photo → assigns ratio (3:2, 4:3, 1:1, etc.)

5. App Auto-Assembles Pages
   ├── For each page:
   │   ├── Randomly picks background from theme pool
   │   ├── Filters layout pool to match photo ratios
   │   ├── Randomly selects layout from filtered pool
   │   ├── Places photos into correctly-ratio'd frames
   │   ├── Adds caption box (if layout includes it)
   │   └── Applies themed corner ornaments
   └── Ensures no two adjacent pages repeat the same layout

6. User Previews Album
   ├── Swipes through pages
   ├── Can swap layout per page (reroll from pool)
   ├── Can edit caption text
   └── Can reorder photos

7. Order & Print
   └── Physical album delivered
```

---

## 11. Technical Implementation Notes

### Asset Pipeline
1. **Backgrounds**: Pre-collected royalty-free images, organized by theme folder
2. **Frame Overlays**: CSS/SVG rendered (thin borders, mats, corner ornaments)
3. **Frame Layouts**: JSON config files defining position, size, and supported ratios per layout
4. **Ornaments**: CSS/SVG or small PNG sprites (corner florals, ribbons, etc.)

### Resolution Strategy

| Use Case | Resolution | Notes |
|----------|-----------|-------|
| Backgrounds | 1K | Sufficient for backgrounds; not the focal point |
| Decorative elements | 1K | Corner florals, ribbons — moderate detail |
| Album covers | 2K | More visible, needs print sharpness |
| Customer photos | Full resolution | Never compress; print at 300 DPI |

### Print Specs
- **DPI:** 300 minimum
- **Bleed:** 0.125" on all sides
- **Safe zone:** 0.25" inside trim
- **Color space:** CMYK-ready for offset/laser printing

---

## 12. Progress Tracking

| Task | Status |
|------|--------|
| Research photo-intensive events | Done |
| Define album sizes & constraints | Done |
| Create vision document | Done |
| Collect themed backgrounds (with people) | Done (75 images) |
| Collect themed backgrounds (NO people) | Done (75 images) |
| Design 6×6 frame layout pool (7 layouts) | Done |
| Design 6×4 frame layout pool | Pending |
| Design 8×8 frame layout pool | Pending |
| Design 11.5×8 frame layout pool | Pending |
| Design 8×11.5 frame layout pool | Pending |
| Define frame styles per theme | Pending |
| Build theme engine (background + frame + ornaments) | Pending |
| Integrate with existing Megy Prints app | Pending |

---

## 13. Key Decisions Log

| Decision | Rationale |
|----------|-----------|
| Pre-designed layouts (not random generation) | Ensures aesthetic quality and rule compliance |
| 7 photo ratios from existing app | Leverages existing photo analysis system |
| No people in backgrounds | Keeps customer photos as the undisputed focus |
| 0.5" binding safe zone (left edge) | Prevents photos from getting lost in the gutter |
| 2" minimum frame width | Every photo remains clearly visible and print-worthy |
| Max 25% decorative area | Photos always occupy the majority of visual space |
| 1K resolution for backgrounds | Cost-effective; backgrounds don't need high pixel density |
| Frame overlays rendered via CSS/SVG | Scalable, themeable, no extra image generation cost |

---

*Plan Version: 1.0*
*Last Updated: 2026-06-05*
*Next Step: Design remaining album size layout pools (6×4, 8×8, 11.5×8, 8×11.5)*
