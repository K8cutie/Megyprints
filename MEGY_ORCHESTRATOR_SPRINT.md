# Sprint: Make Megy the One (Orchestrator Refactor)
**Created:** 2026-06-16 · **Status:** Ready to start · **Owner:** Claude (build) + Archie (browser verification)
**Design doc:** `MEGY_ORCHESTRATOR_PLAN.md` · **North star:** `MEGY_NORTH_STAR.md`

---

## Sprint Goal
Make `assistant/MegyAssistant` the **sole orchestrator** — the only path that mutates builder state is an intent dispatched to Megy's `ActionEngine`. Every rival control surface is rerouted through Megy or deleted. The app behaves identically to today, but Megy is the lone hand on the controls.

## Definition of Done (sprint-level)
- [ ] No component calls `builder.setX()` except `ActionEngine` (verified by grep).
- [ ] Zero `as any` casts remain in the assistant/builder control path.
- [ ] The "auto-sync on Start Creating" glue is gone (no longer needed).
- [ ] `PropertiesPanel`, `UnifiedPanel` duplicates removed; the two-`MegyAssistant` name collision resolved.
- [ ] `npm run build` green after **every** ticket.
- [ ] Full wizard run (size → bg → photos → generate → review → text → finalize) works end-to-end, driven only by Megy — **verified live in the browser by Archie**.

## Working agreement (per SESSION RULES + backup rule)
1. Back up touched files to `_backups/<ts>-orch-MP-N/` before editing.
2. One ticket at a time → `npm run build` → **Archie click-tests** → only then the next.
3. No `as any`. No 500-line rewrites. Restore backup + go smaller if a ticket misbehaves.
4. A green build is necessary but NOT sufficient — every ticket needs Archie's browser verification because behavior changes.

---

## Sprint Board

| # | Ticket | Effort | Depends on | Status |
|---|---|---|---|---|
| MP-1 | Album size → single Megy-owned path | S | — | ✅ DONE (build green) |
| MP-2 | Background → single Megy-owned path | M | MP-1 | ✅ DONE (build green) |
| MP-3 | Generate / shuffle / regen / autofill / clear → Megy | M | MP-1 | ✅ DONE (build green) |
| MP-4 | Photos (add/remove/replace) + density → Megy | M | MP-1 | ✅ DONE (build green) |
| MP-5 | Templates + pages → Megy | M | MP-1 | ✅ DONE (build green) |
| MP-T | **Text (add/update/delete)** — surfaced mid-campaign; text is a kept feature (captions) but writes bypass Megy; needs `update_text`/`delete_text` intents | M | — | ☐ Todo |
| MP-6 | Delete/demote emptied rivals (PropertiesPanel, UnifiedPanel, BackgroundDesigner, BuilderSetup) + reduce home `components/MegyAssistant` (parallel `useState`) to a launcher + rename collision | L | MP-2…MP-5 | ☐ Todo |
| MP-7 | Lock the chokepoint (ActionEngine = only mutator) + Megy's own `doX` buttons through dispatch | M | MP-6 | ☐ Todo |
| MP-8 | **Canvas engine (`useCanvasEngine.ts`, 20 mutations — MISSED in v1):** per north star, demote canvas to a renderer. REMOVE off-strategy manual editing (drag/resize/rotate `setSlotScale`/`setSlotOffset`/`updateSlotGeometry`/`updatePhotoTransform`, inline `updateTextElement`); KEEP + route through Megy only slot-fill and delete-from-slot (the delete-&-replace flow). Selection setters (`setSelectedX`) are UI state — low priority. | L | MP-4, MP-5 | ☐ Todo |

> **Threat-board correction (2026-06-16):** the full mutator sweep found 5 files, not 4. `useCanvasEngine.ts` (20 mutations) was missed in the first pass → now MP-8. Note: `UnifiedPanel`/`PropertiesPanel`/`BackgroundDesigner` do NOT mutate the store directly — they go through `BuilderEdit`'s callbacks, so rerouting `BuilderEdit` (MP-2…MP-5) covers them. The home `components/MegyAssistant` holds its own parallel `useState` (not store calls) → handled in MP-6.

*Effort: S ≈ one short session, M ≈ a focused session, L ≈ may span sessions. Tickets are sequential by dependency; MP-2..MP-5 are independent of each other once MP-1 lands.*

---

## Tickets

### MP-1 — Album size: one owner
**Goal:** Megy's `change_size` intent is the sole owner of album size. The center `BuilderSetup` picker and the home wizard emit to Megy instead of calling `setAlbumSize` themselves. Remove the size-sync glue and the `as any`.
**Touches:** `Builder.tsx:23`, `BuilderSetup.tsx`, `assistant/MegyAssistant.tsx:209`, `wizard.ts:61-64`, `components/MegyAssistant.tsx`.
**Acceptance:**
- Set size in Megy → center cards reflect it.
- Set size in center cards → Megy reflects it (single source, no desync).
- "Start Creating" still advances to edit.
- `as any` on line 209 removed; build green.

### MP-2 — Background: one owner
**Goal:** All background changes route through `set_background`. `BackgroundDesigner` + UnifiedPanel bg controls emit intents; picker folded into Megy.
**Touches:** `BuilderEdit.tsx:423,607`, `BackgroundDesigner.tsx`, `UnifiedPanel.tsx`, `assistant/MegyAssistant.tsx:221-222,299`.
**Acceptance:** background change from any control behaves identically; "apply to all pages" applies once; build green.

### MP-3 — Generation verbs: one owner
**Goal:** `generate / shuffle / regenerate / autoFill / clear` all go through `ActionEngine`. Remove duplicate triggers; Megy panel buttons dispatch intents.
**Touches:** `Builder.tsx:91-99`, `BuilderEdit.tsx:479-480`, `UnifiedPanel.tsx`, `assistant/MegyAssistant.tsx:283-287,590`.
**Acceptance:** each verb fires once and correctly from Megy; no duplicate buttons trigger double-runs; build green.

### MP-4 — Photos + density: one owner
**Goal:** add/remove/replace photos and `photosPerPage` owned by Megy. Hidden global file input becomes Megy's upload trigger.
**Touches:** `Builder.tsx:227`, `BuilderEdit.tsx:570,585`, `UnifiedPanel.tsx`, `assistant/MegyAssistant.tsx:313`.
**Acceptance:** upload + replace + density single-source; the north-star "delete & replace photo (ratio-aware)" flow routes through Megy; build green.

### MP-5 — Templates + pages: one owner
**Goal:** template choice + add/delete/duplicate page via Megy intents.
**Touches:** `BuilderEdit.tsx:576-581`, `UnifiedPanel.tsx`, `assistant/actionEngine.ts` (page intents already exist).
**Acceptance:** template change + page management work from Megy only; build green.

### MP-6 — Remove/demote emptied rivals
**Goal:** delete now-redundant surfaces. `PropertiesPanel` deleted (off-strategy, north-star §7). `UnifiedPanel` deleted or reduced to nothing. `BackgroundDesigner` folded in. `BuilderSetup` becomes a thin view or absorbed into the wizard. Home `components/MegyAssistant` reduced to a launcher.
**Touches:** the above files + `BuilderEdit.tsx` render tree, `Builder.tsx`.
**Acceptance:** removed files have zero importers (grep); build green after each removal; app still renders + behaves (Archie verifies).

### MP-7 — Lock the chokepoint + resolve naming
**Goal:** `ActionEngine.execute` is the only caller of `builder.setX` (Megy's own buttons included). Rename one of the two `MegyAssistant` components to end the collision. Document the invariant.
**Acceptance:** grep proves no `builder.setX` outside `ActionEngine`; full wizard end-to-end works (Archie verifies); build green.

---

## Out of scope (this sprint)
- Order pipeline, payments, photo-upload-to-cloud, print delivery (see `PRE_PRODUCTION_AUDIT_20260616.md`).
- Theme/richness asset layer (`MEGY_NORTH_STAR.md §6, §9`).
- The photo-persistence #3 fix (separate, staged in `MORNING_REPORT_20260616.md`) — *recommended to land BEFORE MP-4 so photo work is on solid ground.*

## Suggested order of attack
**#3 persistence fix (pre-req)** → MP-1 → MP-2 / MP-3 (independent) → MP-4 → MP-5 → MP-6 → MP-7.
