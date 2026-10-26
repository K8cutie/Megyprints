/* ══════════════════════════════════════════════════════════════════════════
   PLACING AN ORDER, HOW FAR ALONG (the bar under Place order). Owner,
   2026-10-26: "Making your print file…" sat on screen for 2–4 minutes with
   nothing moving (the live tester walk, MP-2026-R9Q3SDP, 70 pages), so a
   tester would think it froze. The bar follows the real work: the print
   file's pages are most of it, so they get most of the bar, one step per page
   made. Sending the file can't be measured (the upload gives no progress), so
   that step shows a moving band instead of a made-up percentage.
   ══════════════════════════════════════════════════════════════════════════ */

/** Where each step starts, as a share of the whole bar (0–1). */
export const PLACE_AT = {
  start: 0.03,
  preparing: 0.05,
  cover: 0.08,
  videos: 0.15,
  pages: 0.25,
  pagesDone: 0.85,
  sending: 0.88,
  checking: 0.92,
  saving: 0.95,
  finishing: 0.98,
} as const;

export interface PlaceProgress {
  /** How far along, 0–1. Only ever moves forward. */
  at: number;
  /** Sending the print file: no measure, so the bar shows a moving band. */
  sending: boolean;
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** The bar after `done` of `total` pages are made. `smaller` is the second
 *  pass that makes a file too big for the upload smaller (generateAlbumPdf):
 *  it runs in the short stretch after the pages, never back down the bar. */
export function pagesAt(done: number, total: number, smaller = false): number {
  const share = total > 0 ? clamp01(done / total) : 0;
  return smaller
    ? PLACE_AT.pagesDone + share * (PLACE_AT.sending - PLACE_AT.pagesDone)
    : PLACE_AT.pages + share * (PLACE_AT.pagesDone - PLACE_AT.pages);
}

/** The bar while memory video `done` of `total` is on its way. */
export function videosAt(done: number, total: number): number {
  const share = total > 0 ? clamp01(done / total) : 0;
  return PLACE_AT.videos + share * (PLACE_AT.pages - PLACE_AT.videos);
}

/** What checkout says while the pages are made: the page being made now.
 *  Short enough for one line on the Place order button on a phone (a longer
 *  "Making your print file: page 23 of 70…" wrapped onto two). */
export function pagesLabel(done: number, total: number, smaller = false): string {
  if (total <= 0) return 'Making your print file…';
  if (smaller) return 'Making the file smaller…';
  return done >= total ? 'Putting your pages together…' : `Making page ${Math.min(done + 1, total)} of ${total}…`;
}

/** Never back down the bar: a later step that reports less keeps what was shown. */
export function forward(prev: PlaceProgress | null, at: number, sending = false): PlaceProgress {
  return { at: Math.max(prev?.at ?? 0, clamp01(at)), sending };
}
