# v2 — Curation: which photo gets the spread, what the page is called

**Status:** design only. Nothing on `main` changes. Companion to `v2-fit-to-layout.md`
(that one decides *where* a photo goes; this one decides *which* photos matter).

## Principles, decided 2026-09-10

1. **Intelligence is part of the hassle removed, never sold back.** No pay-to-unlock.
   The only priced things are physical or durable (the print, hosting years, HD video),
   and the price appears once, at checkout.
2. **AI cost is measured per PAID album, not per generation.** The builder is free and
   most builders don't buy. Anything that costs money per run sits behind a commit
   signal, never on the first generation.
3. **Megy suggests, the customer overrides in one tap.** Never "Megy decides."

## Layer 0 — on-device, free, first generation (build this first)

Runs on the customer's phone. ₱0 for buyers and non-buyers alike. Uses
`@tensorflow-models/mobilenet` (already installed) plus arithmetic.

**Moment grouping.** Capture time (EXIF, already used) + visual similarity (MobileNet
embedding cosine distance). Photos within a short time window *and* similar embeddings
are one moment. This tightens the existing chronological grouping and stops a page from
straddling two events.

**Hero score, per photo.**
- sharpness — Laplacian variance on a 256-px downscale
- subject weight — face count and largest face size (from the fit-to-layout detector)
- exposure — penalise clipped highlights / crushed blacks
- distinctiveness — embedding distance from the photo's moment-neighbours (the
  establishing shot is usually the odd one out)

**Promotion rule.** The top-scoring photo of the top-scoring moment gets a full-spread
or hero layout, at most one per N pages (start N = 12). Everything else follows the
normal engine.

**Storage.** Scores and moment ids are computed at upload time in the background (the
transcode pattern), cached by photo id, never at generation time.

## Layer 1 — Haiku moment labels, only if Layer 0 is visibly weak

Not to be built until real orders exist and the heroes-kept rate says Layer 0 isn't
enough.

**Where it runs:** on the **Order** tap — after preview, before the payment form.
"Megy is finishing your album…" → spread + moment labels appear → payment. Someone who
has tapped Order has decided; this is the tightest conversion point in the app, so the
per-paid cost is divided by order→pay, not open→pay.

**What it sends:** the 24 highest Layer-0 scores as **256-px** thumbnails, the theme,
and the page order. Not all photos. Not 512 px.

**What comes back:** hero picks (indices) and ~10 short **moment labels** ("First
dance", "The blessing", "Lolo's speech"). The label *is* the caption for that moment's
pages. No per-box generated sentences — shorter, factual, and far less likely to be
wrong on a keepsake. Boxes with no label keep the theme quote.

**Cost:** ≈ ₱0.25 per pass (≈3k input tokens, ≈250 output, Haiku 4.5).

| order→pay conversion | per paid album |
|---|---|
| 5 in 10 | ₱0.49 |
| 2 in 10 | ₱1.23 |
| 1 in 10 | ₱2.46 |

Worst case ≈ the quotes. (The first design — 60 thumbnails at 512 px, a caption per
box, on the preview tap — was ₱1.90/pass and ₱19/paid at 1-in-10. Rejected.)

**Guardrails** (the quotes endpoint already has each of these):
- result stored on the album → reload / second tap is free
- cap: 3 passes per album per day; the existing per-IP guard in front
- every label through the same safety filter as quotes (no attributions, no quoted
  lines, length cap) — it lands on a printed page
- deterministic for reprints because it is stored, not re-run

## Non-goals

- No Haiku (or any paid call) at generation or on preview entry.
- No paid "Megy's Picks" add-on — rejected as an *uninstall-and-forget feature*.
- No per-photo generated captions; moment labels only.
- No vision model for cropping (see `v2-fit-to-layout.md`).

## Measure before Layer 1

- **Heroes-kept rate:** of the spreads Layer 0 promotes, how many does the customer
  keep unchanged through checkout? Above ~70% → Layer 1 isn't needed.
- **Caption-edit rate:** how often a dealt caption is edited. Tells you whether labels
  would be valued.
- **Order→pay conversion** from real orders → fills in the cost table above with a
  measured number instead of a guess.

## Open thresholds

- hero promotion cadence N (start 12 pages)
- moment window (start 20 min) and embedding distance cutoff
- Layer-1 thumbnail count (start 24) and size (start 256 px)
