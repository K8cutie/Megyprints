# Megyprints — context for anyone building "masks" (read before touching the builder)

Written 2026-09-13 by the session that shipped Studio stage 1 (PR #19). The owner asked for
photo **masks** in another session; this is what that work must fit into so it does not
undo what is live.

## The product shape the owner decided (2026-09-13)

**One album, two modes, per page.** NOT two branches at the front door.

- **Simple** = what customers have today. Megy lays out the pages; the customer can change
  layout, zoom inside a frame, pick quotes, add video boxes, backgrounds, frames. Nothing can
  print wrong.
- **Studio** = the same page with the training wheels off. Drag/resize frames, later
  decorations and text anywhere. Behind a flag (`?studio=1`, `src/lib/studioFlag.ts`), OFF for
  customers. Switch lives in the desktop toolbar (`BuilderEdit.tsx`). Phone Studio is stage 2
  (tool tray under the page, tap-pill on the object, pinch, nudge arrows).
- **Guardrails from the print shop, in BOTH modes, enforced by code at the state setter:**
  a frame stays inside the safe area (page margin + the 0.5" binding keep-out → never in the
  spine, never past the trim), never under the 2" floor (`MIN_FRAME_INCHES`), never rotated,
  and a photo stretched under 150 dpi warns "prints a little soft".
  See `src/pages/builder/slotGeometry.ts` (`clampSlotBox`, `GUARD_MESSAGES`).
- A page the customer touched in Studio is marked `page.studio = true`; Regenerate refuses it,
  Surprise Me / Generate keep it and deal the album around it; "Megy, fix this page" resets.

## The one rule that matters most: THREE RENDERERS MUST STAY IN SYNC

Every page is drawn by three separate renderers and the printed PDF must equal what the
customer saw:

1. `src/pages/builder/BuilderPreview.tsx` — DOM (phone review, preview spread, cover).
2. `src/pages/builder/useCanvasEngine.ts` — Fabric canvas (desktop editor).
3. `src/pages/builder/printPipeline.ts` — canvas → JPEG → PDF (`generateAlbumPdf.ts`).

Anything a mask changes about how a photo is drawn (clip shape, feathered edge, fade) must be
implemented in ALL THREE from ONE shared resolver, the way these already are:

- slot geometry: `resolveSlotBox` (`slotGeometry.ts`) — used by all three, pinned by
  `printParity.spec.ts` (a tripwire that reads the three files).
- slot shape today: `slot.shape` ∈ rectangle | rounded | circle | oval | heart, drawn by
  `slotShapeStyle` (DOM), Fabric clip objects (canvas), and `renderSlotPhoto` (print).
- frames: `FRAME_STYLES` registry, one source for the three.
- gradients / caption alignment / free-text width: shared resolvers (see printParity.spec).

If masks land in only one renderer, the customer sees a circle and gets a rectangle in print.
The owner OWNS the press (BridgeMedia): a misprint is his paper and his ink.

## Where masks should live

- A mask is a per-slot property (like `slot.shape`), stored on the page the same way
  `slotGeometries` / `slotScales` are (positional arrays parallel to `template.slots`), and
  normalised in `pageNormalize.ts`.
- Put the mask definitions (shape path, feather radius, fade direction) in ONE module, e.g.
  `src/pages/builder/masks.ts`, exporting a resolver each renderer calls. The print renderer
  draws with Canvas 2D: a shape mask = `ctx.clip()`; a feather/fade = a radial/linear alpha
  gradient composited with `destination-in`. The DOM twin uses `clip-path` /
  `mask-image`; Fabric uses `clipPath` + a gradient-alpha overlay.
- Extend `printParity.spec.ts` with a tripwire that all three renderers import the mask module.
- Keep the set SMALL and elegant (owner's direction: he retired clipart; backgrounds are
  textures-only; the look is terracotta on paper, "elegant like photobookworldwide.com"):
  soft feathered fade, circle, arch, rounded, clean Polaroid. No torn paper / grunge.
- A mask never changes the frame's box, so the guardrails above still hold unchanged.
- Offer it in Simple as a "Shape" option on the photo's chooser (`SlotChooser.tsx`), and in
  Studio the full set. Don't add a fourth editing surface.

## Repo rules (enforced)

- `main` is protected: PR only, required `verify` CI, branch must be up to date
  (`gh pr update-branch`), never push main. Tags `v1.0.0` / `v1.1.0` are rollback points.
- The honest lint gate is `npx eslint src` (277 pre-existing errors on main — do not add).
- `npm run test` (vitest, node env; 273 tests on main). `npx tsc --noEmit -p .` must be clean.
- Prove it on the built bundle (`npm run build`, serve `dist`, Playwright) before calling it
  done — the owner's standard is "walk the app", not green tests. Recipes live in the Studio
  session's scratchpad; the memory notes under
  `C:\Users\Archie\.claude\projects\C--megy-prints-flashdrive-V1-Megyprints-Clean\memory\`
  hold the full history (`MEMORY.md` is the index; read `megyprints-studio-mode.md`,
  `megyprints-text-rendering.md`, `megyprints-template-system.md`).
- Work in `C:\megy-prints-flashdrive\V1\Megyprints-Clean` on a feature branch off `main`
  (currently at PR #19's merge). Do not edit inside `.claude/worktrees/*` (stale).

## What is live right now (2026-09-13), all on main / megyprints.vercel.app

Fill planner (PR #14), "Making your album" screen (#15), video-memory labels + ≥7 video-ready
pages (#16), "Add a VIDEO to this QR" box (#17), open-book preview (#18), Studio stage 1
flagged off (#19).
