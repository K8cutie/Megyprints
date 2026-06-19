# Sprint: Smart Templates + Photo Analyzer
**Created:** 06122026_1238PM Philippine Time
**Status:** Active

---

## Vision
Replace all 22 broken page templates with ratio-locked templates matched to uploaded photo aspect ratios. No more heads cut off, no more weird cropping. Phone-first (4:3 heavy).

---

## Phase 1: Photo Analyzer

### photoAnalyzer.ts — New File
- Input: `UploadedPhoto[]` (with `width` and `height` from `naturalWidth`/`naturalHeight`)
- Output: `{ dominantRatio: string, groups: Record<RatioType, number[]> }`
- Ratios detected:
  - `3:2` landscape (DSLR) — 1.50
  - `2:3` portrait (DSLR rotated) — 0.67
  - `4:3` landscape (phone default) — 1.33 ← MOST COMMON
  - `3:4` portrait (phone rotated) — 0.75 ← MOST COMMON
  - `1:1` square (Instagram/crop) — 1.00
  - `16:9` panoramic (widescreen) — 1.78
  - `9:16` portrait panoramic (stories) — 0.56
- Tolerance: ±8% from exact ratio
- Returns dominant ratio + full group breakdown

---

## Phase 2: Template System Redesign

### Purge
- Delete ALL 22 existing templates
- Remove old `PAGE_TEMPLATES` constant

### New Structure
Templates organized by: **Album Size → Photo Count → Ratio → Layout**

### Template Count Per Album Size

| Album Size | 1-photo | 2-photo | 3-photo | 4-photo | 5-photo | Total |
|---|---|---|---|---|---|---|
| **6x4** | 3 | 3 | — | — | — | **6** |
| **6x6** | 3 | 3 | — | — | — | **6** |
| **8x8** | 2 | 3 | 3 | 2 | — | **10** |
| **11.5x8** | 2 | 2 | 3 | 3 | 2 | **12** |
| **8.5x11** | 2 | 2 | 3 | 3 | 2 | **12** |
| **TOTAL** | | | | | | **46 templates** |

### Slot Ratios Per Template
Every slot in a template uses the SAME standard ratio:
- 3:2 landscape (for DSLR landscape photos)
- 2:3 portrait (for DSLR portrait photos)
- 4:3 landscape (for phone landscape photos) ← MOST TEMPLATES
- 3:4 portrait (for phone portrait photos) ← MOST TEMPLATES
- 1:1 square (for square photos)
- 16:9 panoramic (for widescreen photos)

### 6x4 Templates (6 total)

**1-Photo (3):**
- T01: Full-page 4:3 landscape (phone-primary)
- T02: Full-page 3:2 landscape (DSLR-primary)
- T03: Full-page 3:4 portrait (phone portrait)

**2-Photo (3):**
- T04: 2× 4:3 landscape side-by-side
- T05: 2× 3:2 landscape side-by-side
- T06: 2× 3:4 portrait stacked vertically

### 6x6 Templates (6 total)

**1-Photo (3):**
- T01: Full-page 1:1 square
- T02: Full-page 4:3 landscape (centered)
- T03: Full-page 3:4 portrait (centered)

**2-Photo (3):**
- T04: 2× 1:1 square side-by-side
- T05: 2× 4:3 landscape stacked
- T06: 2× 3:4 portrait side-by-side

### 8x8 Templates (10 total)

**1-Photo (2):**
- T01: Full-page 1:1 square
- T02: Full-page 4:3 landscape (centered)

**2-Photo (3):**
- T03: 2× 1:1 square side-by-side
- T04: 2× 4:3 landscape stacked
- T05: 2× 3:4 portrait side-by-side

**3-Photo (3):**
- T06: 1× large 4:3 top + 2× 4:3 bottom (feature + pair)
- T07: 2× 4:3 side-by-side top + 1× 4:3 bottom
- T08: 1× large 3:4 left + 2× 3:4 stacked right

**4-Photo (2):**
- T09: 4× 1:1 square (2×2 grid)
- T10: 4× 4:3 landscape (2×2 grid)

### 11.5x8 Templates (12 total)

**1-Photo (2):**
- T01: Full-page 4:3 landscape
- T02: Full-page 3:2 landscape

**2-Photo (2):**
- T03: 2× 4:3 landscape side-by-side
- T04: 2× 3:2 landscape side-by-side

**3-Photo (3):**
- T05: 1× large 4:3 left + 2× 4:3 stacked right
- T06: 2× 4:3 side-by-side + 1× 4:3 below (wide)
- T07: 3× 4:3 landscape equal side-by-side

**4-Photo (3):**
- T08: 4× 4:3 landscape (2×2 grid)
- T09: 1× large 4:3 top-left + 3× 4:3 stacked right/bottom
- T10: 2× 4:3 top + 2× 4:3 bottom

**5-Photo (2):**
- T11: 3× 4:3 top + 2× 4:3 bottom
- T12: 2× 4:3 left + 3× 4:3 stacked right

### 8.5x11 Templates (12 total)

**1-Photo (2):**
- T01: Full-page 3:4 portrait
- T02: Full-page 4:3 landscape (centered)

**2-Photo (2):**
- T03: 2× 3:4 portrait stacked vertically
- T04: 2× 4:3 landscape stacked

**3-Photo (3):**
- T05: 1× large 3:4 top + 2× 3:4 side-by-side bottom
- T06: 2× 3:4 side-by-side top + 1× 3:4 bottom
- T07: 3× 3:4 portrait equal stacked

**4-Photo (3):**
- T08: 4× 3:4 portrait (2×2 grid)
- T09: 1× large 3:4 top-left + 3× 3:4 right/bottom
- T10: 2× 3:4 top + 2× 3:4 bottom

**5-Photo (2):**
- T11: 2× 3:4 top + 3× 3:4 bottom
- T12: 3× 3:4 left column + 2× 3:4 right column

---

## Phase 3: Smart Generation

### generateAlbum.ts — Rewrite
1. Call `analyzePhotos(uploadedPhotos)` → get dominant ratio + groups
2. Select template family for current `albumSize`
3. Filter templates to only those matching `photosPerPage` AND dominant ratio
4. For each page:
   - Pick a random template from filtered pool
   - Fill slots with photos from matching ratio group first
   - Fall back to other ratios if needed
5. Every photo goes in a slot that matches its shape

---

## Files Needed

| File | Action |
|------|--------|
| `pageTemplates.ts` | **PURGE** + rewrite with 46 new ratio-locked templates |
| `generateAlbum.ts` | **REWRITE** — use photo analyzer + smart placement |
| `photoAnalyzer.ts` | **NEW FILE** — aspect ratio detection + grouping |
| `types.ts` | May need updates for new template structure |

---

## Success Criteria

1. ✅ Upload phone photos (4:3) → album uses 4:3 templates, no cropping
2. ✅ Upload DSLR photos (3:2) → album uses 3:2 templates, no cropping
3. ✅ Upload mixed → analyzer picks dominant ratio, templates match
4. ✅ Every slot shape matches the photo it contains
5. ✅ No heads cut off, no weird squishing

---

## Sprint Rules
- Ask user for latest file iteration before every change
- Only reference the file the user just pasted
- Read every line of every file
- No assumptions from previous iterations
