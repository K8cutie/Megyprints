# v2 — Fit the image to the layout

**Status:** design only. Nothing on `main` changes. This branch exists to prove the idea on
real photo pools before any of it ships.

**Owner's framing (2026-09-10):** the layout library is the product. The image pool must
adapt to the layouts, not the other way round. When only square photos remain and only
rectangular layouts remain, the answer is to crop and pan the square photo into the
rectangular container well, not to invent a square layout.

## The problem, precisely

Generation filters the template library by photo ratio before it samples. That filter is
what kills variety late in an album: once the ratio-matched layouts are used, the tracker
has nothing left to draw from, and "random" stops being random. It is a sampling-without-
replacement limit, not a shuffle-quality limit, and it only bites on edge-case pools
(all-square, all-portrait). The current engine is fine for the common mixed pool — which
is why this is v2, not a fix.

The earlier attempt to solve it with face detection failed on **group photos with faces
spanning the frame**. Root cause, in `src/pages/builder/faceDetection.ts`: the code
computes the union box of all faces and then returns only its midpoint. Centering on the
midpoint guarantees nothing about inclusion — a group spanning 90% of the width cannot be
shown in a slot that reveals 60%, and no pan value fixes that. The function had no way to
say "does not fit", so it returned a confident bad crop.

## What stays

- Every template, the per-size libraries, the anti-repeat tracker, chronological order.
- The data model. A crop is already expressible: `slotOffsetsX`, `slotOffsetsY`,
  `slotScales` sit on every page, positionally parallel to the slots, and all three
  renderers (DOM, Fabric, print) draw from them. **No migration. Saved albums untouched.**
- `getTemplateById` and ratio matching — demoted from the rule to the fallback.

## What changes — four things

### 1. The ratio filter becomes a fit score

For a (photo, slot) pair, at the best pan and scale: what fraction of the photo's
**subject region** stays inside the visible window?

```
fit = survival(subjectBox, window)  ×  (1 − k · severity)
```

- `survival` = area of the subject box inside the window ÷ area of the subject box.
- `severity` = fraction of the photo cropped away (0 for a matching ratio; 0.44 for a
  square in 16:9). `k` small (≈0.15) so a gentle crop beats a harsh one when both are
  safe, without forbidding harsh ones.
- Templates are no longer excluded for a pool; they are scored against it.

### 2. The face point becomes a subject box

- Keep the union box `faceDetection.ts` already computes (lines ~77–80). Return it.
- Add **person boxes** (`@tensorflow-models/coco-ssd`, `lite_mobilenet_v2`, ~4 MB,
  runs on the TF.js already installed). A person box is head-to-feet, so feet count.
  A person at the edge of a class picture is a tall, easy detection even when the face
  is 30 px wide. Detect people first; refine headroom with faces second.
- Two-pass guard: if the first pass finds ≥3 faces, re-run at `inputSize: 512`. A
  missed edge face shrinks the box and produces a confident wrong crop — worse than today.
- No subject at all (landscape, food, objects): edge-energy heuristic or plain center.
  These crop fine anyway.
- Run at **upload time** in the background (the transcode pattern), downscaled to
  ~512 px long edge, cached by photo id. Never at generation time.

### 3. Greedy slot filling becomes assignment

A page has ≤6 slots. Enumerate every permutation of photos→slots (≤720), take the one
with the highest total fit. The wide group photo lands in the widest slot by itself,
with no special-case rule, because that is where it scores highest.

### 4. Photos that fit nowhere are deferred, not forced

If a photo's best fit on the page is below threshold (start at 0.92), it waits for the
next page whose template has a slot it fits — a hero, a wide band, a matching ratio.
This is the existing ratio matcher, now used only where it is genuinely needed.

## Measure before building

1. **Unlock rate.** Across the existing test pools, what fraction of square photos
   score ≥0.92 in a 3:2 slot? That number is the whole business case. If it is 70%,
   square albums gain access to ~70% of the library with zero authoring.
2. **Defect log.** Log every manual pan/zoom a customer makes after auto-placement
   (photo id, slot ratio, subject box, the auto crop, the human crop). Fifty of these
   show the systematic miss. This is DMAIC, not ML — no training at this volume.
3. **Group-photo set.** Twenty real class/reunion photos. The old code must fail on
   them; the new code must defer or place them in the widest slot. Regression fixture.

## Non-goals, decided

- **No layout generator** (recursive subdivision was proposed and rejected — it adapts
  the layout to the image, discarding the designed library).
- **No vision-LLM for cropping.** Haiku-with-thumbnails is ~₱2–3/album and belongs to a
  different feature (hero selection, moment grouping), not to this one.
- **No generative outpainting.** Never invent pixels around a family member on a
  20-year keepsake.
- **No ML from our own data.** Detection is pretrained on millions of images; taste
  would need thousands of labelled crops we will not have for years.

## Cost

Everything above runs on-device. ₱0 per album. One-time model download ~4 MB, cached
by the service worker.

## Open thresholds (tune from the measurement, not by guessing)

- fit threshold for "safe" (start 0.92)
- severity weight `k` (start 0.15)
- headroom padding above the topmost face (start 40% of face height)
- second-pass trigger (start ≥3 faces)
