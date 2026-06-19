# Morning Report — 2026-06-16 (overnight session)

Hi — here's exactly what I did while you slept, what I deliberately did **not** do, and how to undo any of it. Everything is backed up and the build is green.

---

## TL;DR

- ✅ **Build fixed** — was broken, now `npm run build` passes (exit 0).
- ✅ **Dead code removed** — 5 orphaned source files + 6 stray `*.ts.txt` backups, build still green.
- ⚠️ **2 duplicate `src - Copy/` trees could NOT be removed** — Windows/flashdrive "Permission denied" lock. Harmless to the app. Manual step below.
- ✅ **Permissions** — blanket "yes to all" set for this project (`.claude/settings.local.json`, gitignored). May need a Claude Code restart to go fully live.
- ⏸️ **#3 photo-persistence bug — diagnosed precisely, fix staged below, NOT applied.** It's data-loss logic that needs you watching a browser to verify. Ready when you are.
- 💾 **Everything reversible** — all originals are in `_backups/`.

---

## 1. Build fix (DONE, verified)

**Was:** `npm run build` failed —
`useBuilderState.ts(1432): error TS2353: 'wizardStep' does not exist in type 'BuilderActions'.`

**Fix:** The hook returns `wizardStep`/`setWizardStep` but the `BuilderActions` interface didn't declare them. Added both to the interface (`useBuilderState.ts`, right after `setPhase`), using the **exact union type** from the `useState` declaration — no `as any`, one file.

**Verified:** `npm run build` → exit 0, `✓ built in ~5s`.
**Backup:** `_backups/20260616-112929-build-fix/src/pages/builder/useBuilderState.ts`

---

## 2. Dead-code cleanup (DONE, verified)

Each file was confirmed to have **zero importers** (grep), then moved to backup, then the build was re-run green to prove it was truly unused.

**Removed (moved to `_backups/20260616-113215-cleanup-deadcode/`):**
- `src/components/MegyDesignAssistant.tsx` — the reverted 500-line rewrite
- `src/components/MegyCopilot.tsx` — second dead assistant
- `src/pages/builder/EditSidebar.tsx` — dead, duplicated UnifiedPanel
- `src/pages/builder/BuilderToolbar.tsx` — no importers
- `src/pages/builder/EditorPhase.tsx` — 0-byte empty file
- 6× `* - Copy.ts.txt` stray backups (in `src/lib/` and `src/pages/builder/`)

**Kept (verified LIVE — did NOT touch):**
- `PropertiesPanel.tsx` — it IS imported/rendered by `UnifiedPanel.tsx`. (It's "off-strategy" long-term per the north star, but removing it is a *refactor*, not dead-code cleanup — that waits for you.)

---

## 3. Could NOT remove: the duplicate `src - Copy/` trees ⚠️

`src - Copy/` and `src - Copy (2)/` resisted every move with **"Permission denied"** (a Windows/flashdrive file-handle lock — likely indexing or antivirus). They have normal `rw` permissions and are **git-tracked**, so they're fully recoverable. They do **not** affect the build or the app (separate folders, never imported).

**I chose not to brute-force it** (chmod/`rm -rf` on a locked flashdrive dir is how things break).

**To remove them yourself when ready** (any one of):
- Delete `src - Copy` and `src - Copy (2)` in **File Explorer**, or
- Close anything using the flashdrive, then in the project run: `git rm -r "src - Copy" "src - Copy (2)"`, or
- Just ask me to retry — the lock may have cleared.

---

## 4. Permissions (DONE)

Created `.claude/settings.local.json` (gitignored) granting blanket allow for `Bash, Edit, Write, Read, Glob, Grep` — no more per-call prompts for this project. **If prompts still appear, restart Claude Code once** (settings load at startup; there was no `.claude/` folder when this session began).

---

## 5. ⏸️ #3 — The photo-persistence bug (DIAGNOSED, fix STAGED, NOT applied)

This is your #1 user-facing bug ("photos destroyed on reload/navigation"). I read the real code and the root cause is now precise.

### Root cause (two cooperating destroyers)
1. **`getInitialState()` (`useBuilderState.ts:208`)** calls `isStalePhotoSession()`, which returns true when **every** photo has a dead `blob:` URL (`:167-171`). But blob URLs **never** survive a page reload — so this is true after *every* normal reload. When true, it wipes `localStorage` and starts empty.
2. **The rehydration effect (`:666-672`)** has an `allDead` branch that, on the same condition, calls `idbPhotos.clear()` — **actively deleting the photo bytes from IndexedDB** — and sets photos to `[]`.

So a normal reload is misclassified as a "stale session," and the recoverable IndexedDB bytes get purged *before* the rehydration code below (`:674-697`, which already restores photos correctly) ever runs.

### Why the fix is clean
There are **already** explicit signals for the two legitimate "don't restore" cases:
- `megy-fresh-start` (set by Home's "Create New Album") — checked at `:651-652`
- `skipCloudLoadRef` (set by `reset()`) — checked at `:654-655`

So the `isStalePhotoSession` / `allDead` heuristic is a **third, broken** mechanism that fires on ordinary reloads. The fix is essentially to **remove the two destructive branches and let the existing rehydration run**:

- In `getInitialState()`: drop the `isStalePhotoSession` wipe (`:204-212`) — keep the photo metadata so rehydration can restore it.
- In the rehydration effect: drop the `allDead → clear + setUploadedPhotos([])` early-return (`:662-672`) — the code right below it already rehydrates from IndexedDB.

### Why I did NOT apply it
A green build does **not** prove photos survive — only running the app does. This touches data-loss logic in the exact file that's burned past sessions. It needs **you watching a browser**. Backup is ready either way.

### Test plan (when you're awake, ~3 min)
1. `npm run dev` → upload a few photos → **reload the page** → photos should still be there (rehydrated from IndexedDB). *(Today: they vanish.)*
2. Click **"Create New Album"** → photos should **not** carry over. *(Must still work.)*
3. Trigger **reset** → photos cleared. *(Must still work.)*

If you say go, I'll apply the two-branch removal, build, and you run the 3 tests.

---

## 6. How to undo anything

All originals are under `_backups/<timestamp>-*/` (gitignored). To restore a file, copy it back over the working copy. The build fix and every deletion are individually reversible. `git status` also shows everything that changed.

---

## Suggested next steps (your call)
1. Glance at the app to confirm nothing visibly broke (build is green, but your eyes are the real check).
2. Greenlight **#3** so we kill the photo-loss bug together (with the test plan above).
3. Remove the locked `src - Copy/` trees (§3) when convenient.
4. Then: the print-geometry bug, empty-pool guard, and eventually the theme/richness layer (needs the asset decision from `MEGY_NORTH_STAR.md §9`).
