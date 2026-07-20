import type { PageTemplate } from './types';

/** ══════════════════════════════════════════════════════════════════════════
 *  6×6″ SQUARE — page layouts
 *
 *  CLEARED and being re-authored from scratch. This file is the SINGLE source
 *  of truth for 6×6 interior layouts: '6x6' is listed in PER_SIZE_AUTHORED, so
 *  the legacy hand-made block, the generated gap-fillers and the tiled
 *  generator all emit nothing for this size. What is in this array is exactly
 *  what the builder can deal, cycle through, and print.
 *
 *  While the array is empty, 6×6 is not offered in the size picker (a size with
 *  no layouts cannot be chosen) — it reappears the moment the first layout below
 *  is authored. Covers are unaffected: they live in COVER_TEMPLATES.
 *
 *  ── House rules for a 6×6 layout ─────────────────────────────────────────
 *  • Ratio-true slots. Build frames with rsBox/rsBoxExact so a slot's PRINTED
 *    aspect equals its declared `targetRatio`. The dealer matches photos to
 *    that declared ratio, so a lying slot crops silently.
 *  • Orientation is strict, ratio is loose. Every slot in one template shares
 *    the template's `targetRatio`; the dealer will place a neighbouring ratio
 *    of the SAME orientation into it (≤16% crop budget), never across.
 *  • 2" print floor. 6×6's safe area is 5.52×5.52", so a frame narrower than
 *    ~0.36 of the page prints under 2" and reads as a thumbnail. Check with
 *    meetsPrintFloor(albumSize, w, h) before shipping a dense layout.
 *  • Distinct geometry. Templates are deduped by geometry signature, so a
 *    variant that differs only by name collapses into its twin and adds no
 *    variety.
 *  • Coordinates are fractions (0–1) of the SAFE AREA, not the trim page —
 *    except on fullBleed templates, where they are fractions of the whole page.
 *  ══════════════════════════════════════════════════════════════════════════ */

export const TEMPLATES_6X6: PageTemplate[] = [];
