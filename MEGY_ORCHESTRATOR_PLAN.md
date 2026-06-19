# Megy Orchestrator Refactor — Blueprint (Plan A)
**Date:** 2026-06-16 · **Goal:** Make `assistant/MegyAssistant` the lone brain — the only chef. Every state change flows through Megy; rival control surfaces are deleted or demoted to dumb views.
**Status:** PLAN ONLY — no code changed. Execution is incremental, slice-by-slice, each build-verified AND user-verified in the browser.

---

## The principle (one sentence)
**Exactly one path may mutate builder state: an intent dispatched to Megy's `ActionEngine`.** Every UI (Megy's own buttons, any retained panel, the canvas) becomes a *dumb emitter* that sends an intent to Megy — never a thing that calls `builder.setX()` behind Megy's back.

---

## What Megy ALREADY owns (the good news)
Megy's brain is real and fairly complete:
- **`assistant/actionEngine.ts`** — intent → action router. Already handles: `generate_album`, `shuffle_layout`, `regenerate_page`, `auto_fill`, `clear_slots`, `add_page`, `delete_page`, `go_to_page`/`next`/`prev`, `change_size`, `apply_theme`, `set_background`, `add_text`, `surprise_me`, `status`, `undo`, `redo`, `reset`, `help`.
- **`assistant/wizard.ts`** — the 8-step flow (`welcome → pick_size → pick_background → upload_photos → generate_album → review_pages → add_text → finalize`) with per-step copy.
- **`assistant/MegyAssistant.tsx`** — the panel UI you see on the right.

The full state API it drives is `BuilderActions` (`useBuilderState.ts:226-335`) — ~40 actions. That's the surface every rival also reaches into.

---

## Megy vs. all others — the control-surface comparison

| Surface | File | What it controls | Overlaps Megy? | Verdict |
|---|---|---|---|---|
| **Megy (brain)** | `assistant/actionEngine.ts` + `wizard.ts` | *Everything* via intents | — (canonical) | **THE ONE** |
| Megy panel (direct calls) | `assistant/MegyAssistant.tsx:209-313, 590` | size, bg, generate, shuffle, regen, autofill, clear, add/del page, theme, photos | calls `builder.setX` **directly, bypassing its own ActionEngine** + `as any` (L209) | **Unify → route through ActionEngine** |
| Center setup picker | `BuilderSetup.tsx` (wired via `Builder.tsx:23 onSizeChange`) | album **size**, "Start Creating" (`setPhase`) | duplicates `change_size` + `pick_size` wizard step | **Demote to dumb view / fold into Megy** |
| Left sidebar | `UnifiedPanel.tsx` (rendered by `BuilderEdit.tsx`, hidden by default) | photos, pages, templates, slot-count, background | duplicates generate/autofill/clear/template/bg/photosPerPage | **Delete or reroute through Megy** |
| Background panel | `BackgroundDesigner.tsx` (`BuilderEdit.tsx:423`) | page **background** | duplicates `set_background` | **Fold into Megy** |
| Properties panel | `PropertiesPanel.tsx` (inside UnifiedPanel) | per-object transform/text/filters | off-strategy ("the Canva handles") | **Delete (per north star §7)** |
| Home wizard | `components/MegyAssistant.tsx` | its **own** `albumSize` state, density, bg | a *second component also named MegyAssistant*; duplicates setup | **Reduce to a launcher; rename to kill collision** |
| Edit/canvas wiring | `BuilderEdit.tsx:423-607`, `Builder.tsx:91-227` | hub that wires all the above to `actions.*` | the plumbing that enables the duplication | **Rewire to dispatch intents** |
| Coupling glue | `wizard.ts:61-64`, `assistant/MegyAssistant.tsx:131` | "auto-sync when Start Creating clicked" | exists *only because* of the duplication | **Deletes itself once one owner remains** |

---

## Target architecture

```
            ┌──────── UI emitters (dumb) ────────┐
            │ Megy panel · wizard · (canvas) ·    │
            │ any retained picker                 │
            └───────────────┬─────────────────────┘
                            │  intent (e.g. {type:'change_size', size:'8x8'})
                            ▼
              ┌──────────────────────────────┐
              │  ActionEngine.execute(intent)│   ← the ONLY mutator
              └───────────────┬──────────────┘
                              │ builder.setX()  (now "internal")
                              ▼
                 useBuilderState  (the store)
```

No component calls `builder.setX()` except `ActionEngine`. The wizard becomes Megy's *view* of progress, not a second state owner.

---

## The ordered refactor sequence (slices)

Each slice: **back up → change → `npm run build` → YOU click-test in the browser → next.** Sequenced safest/most-proven first. Behavior changes, so a green build is necessary but **not sufficient** — your eyes confirm each.

### Slice 1 — Album Size *(start here; smallest, already proven redundant)*
- **Collapse:** the 3 size pickers → Megy's `change_size` intent is the sole owner. `BuilderSetup`'s size cards emit a `change_size` intent (or render the wizard's `pick_size`) instead of `Builder.tsx:23 onSizeChange={actions.setAlbumSize}`. Delete the `as any` (`assistant/MegyAssistant.tsx:209`) and the "auto-sync on Start Creating" glue.
- **Files:** `Builder.tsx`, `BuilderSetup.tsx`, `assistant/MegyAssistant.tsx`, `wizard.ts`, (home) `components/MegyAssistant.tsx`.
- **Verify:** set size in Megy → center reflects it; set size in center → Megy reflects it; no desync; "Start Creating" still advances.

### Slice 2 — Background
- **Collapse:** `set_background` intent owns all background changes. `BackgroundDesigner` + UnifiedPanel bg controls emit intents; fold the picker into Megy's panel.
- **Files:** `BuilderEdit.tsx:423,607`, `BackgroundDesigner.tsx`, `UnifiedPanel.tsx`, `assistant/MegyAssistant.tsx:221-222,299`.
- **Verify:** background changes from any control behave identically; "apply to all pages" works once.

### Slice 3 — Generate / Shuffle / Regenerate / Auto-fill / Clear
- **Collapse:** all generation verbs go through `ActionEngine`. Remove duplicate buttons in `Builder.tsx:91-99`, `BuilderEdit.tsx:479-480`, UnifiedPanel; Megy panel buttons (`:283-287,590`) dispatch intents.
- **Verify:** generate/shuffle/regen/autofill/clear each work once, from Megy.

### Slice 4 — Photos + density (photosPerPage)
- **Collapse:** add/remove/replace photos and "photos per page" owned by Megy. The hidden global file input (`Builder.tsx:227`) becomes Megy's upload trigger; UnifiedPanel photo/density controls (`BuilderEdit.tsx:570,585`) reroute.
- **Verify:** upload, replace, and density all single-source; the "delete & replace photo" flow (north-star §5) routes through Megy.

### Slice 5 — Templates + pages
- **Collapse:** template choice + add/delete/duplicate page via Megy (`apply_theme`/template intents + page intents). Remove UnifiedPanel/BuilderEdit duplicates (`:576-581`).
- **Verify:** template change + page management work from Megy only.

### Slice 6 — Demote / delete the emptied rivals
- `PropertiesPanel.tsx` → **delete** (off-strategy per north star §7).
- `UnifiedPanel.tsx` → **delete or reduce to nothing** (its controls now live in Megy).
- `BackgroundDesigner.tsx` → folded into Megy (or kept as a dumb sub-view).
- `BuilderSetup.tsx` → thin view, or its role absorbed by Megy's wizard.
- `components/MegyAssistant.tsx` (home) → reduce to a launcher that hands an *initial preference* to the builder; **rename** to end the two-components-named-MegyAssistant collision.

### Slice 7 — Lock the chokepoint
- Make `ActionEngine.execute` the *only* caller of `builder.setX` (Megy's own panel buttons included). Document the invariant. Optionally enforce via lint/types.
- **Verify:** full wizard run end-to-end (size → bg → photos → generate → review → text → finalize) works, all from Megy.

---

## Guardrails (non-negotiable, from your rules + the backup rule)
1. **Back up before each slice** to `_backups/<timestamp>-orchestrator-sliceN/`.
2. **One slice at a time → `npm run build` green → YOU verify in the browser → only then the next.**
3. **No `as any`** (we're *removing* one in Slice 1; we don't add any).
4. **No 500-line rewrite.** Each slice is a contained reroute, not a big-bang.
5. **If a slice misbehaves, restore the backup and try smaller.**

---

## Why this works where Kimi's rewrites didn't
Kimi rewrote Megy in one 500-line swing and produced 30 build errors. This plan does the opposite: **Megy already works** — we just *redirect the rivals into it, one action-domain at a time*, proving each with a build + your eyes before moving on. The fragile "sync" glue disappears naturally as each duplicate owner is removed. Net effect: the same Megy you see today, but it becomes the *only* hand on the controls — your "lone chef."
