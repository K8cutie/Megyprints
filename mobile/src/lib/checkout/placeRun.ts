/* ══════════════════════════════════════════════════════════════════════════
   PLACING THE ORDER, HOW FAR ALONG: the website's bar (shared
   src/lib/placeProgress.ts: PLACE_AT, pagesAt, pagesLabel, forward), step by
   step in the order the website's placeOrder runs, with its words.

   The print file's pages are most of the bar, one step per page made;
   sending the file can't be measured, so that step shows a moving band.

   THIS BUILD makes no files and sends nothing (the page drawer is still in a
   held PR, and the write path is off), so `placeFrames` is played back with
   short waits: the screen shows how the bar will move for this album's page
   count. Each frame says what the real step will be.
   ══════════════════════════════════════════════════════════════════════════ */
import { forward, pagesAt, pagesLabel, PLACE_AT, videosAt, type PlaceProgress } from '@web/lib/placeProgress';

export interface PlaceFrame {
  progress: PlaceProgress;
  /** What the screen says (the website puts it on the Place order button). */
  message: string;
  /** How long this frame stays on screen in the play-back, ms. */
  holdMs: number;
}

export interface PlaceShape {
  pages: number;
  /** Memory videos to send. */
  clips: number;
  /** QR memories on the album (rows to make sure of). */
  memories: number;
  tester: boolean;
}

export const STAGE_MS = 450;
export const PAGE_MS = 70;

/** Every step of Place order for an album of this shape. */
export function placeFrames(s: PlaceShape): PlaceFrame[] {
  const out: PlaceFrame[] = [];
  let p: PlaceProgress | null = null;
  const step = (at: number, message: string, holdMs = STAGE_MS, sending = false) => {
    p = forward(p, at, sending);
    out.push({ progress: p, message, holdMs });
  };
  step(PLACE_AT.start, 'Placing your order…');
  if (s.clips > 0) step(PLACE_AT.start, 'Checking your memory videos…');
  step(PLACE_AT.preparing, 'Preparing your album for printing…');
  step(PLACE_AT.cover, 'Making your cover…', STAGE_MS * 2);
  if (s.clips > 0) {
    step(PLACE_AT.videos, 'Uploading your memory videos…');
    for (let d = 0; d < s.clips; d++) {
      step(videosAt(d, s.clips), `Preparing memory video ${d + 1} of ${s.clips}…`);
      step(videosAt(d, s.clips), `Uploading memory video ${d + 1} of ${s.clips}…`);
    }
    step(videosAt(s.clips, s.clips), 'Uploading your memory videos…');
  }
  step(PLACE_AT.pages, 'Making your print file…');
  for (let done = 0; done <= s.pages; done++) step(pagesAt(done, s.pages), pagesLabel(done, s.pages), PAGE_MS);
  step(PLACE_AT.sending, 'Sending your print file…', STAGE_MS * 3, true);
  step(PLACE_AT.checking, s.clips > 0 ? 'Checking your memory videos…' : 'Sending your print file…');
  if (s.memories > 0) step(PLACE_AT.saving, 'Saving your memories…');
  if (s.tester) step(PLACE_AT.finishing, 'Finishing your test order…');
  return out;
}

/** The note under the bar, as on the website (PlaceOrderProgress). */
export const KEEP_OPEN_NOTE = 'Keep this screen open. This can take a few minutes.';

/** The bar's width, 0–100 (PlaceOrderProgress). */
export function barPercent(p: PlaceProgress): number {
  return Math.round(Math.min(1, Math.max(0, p.at)) * 100);
}
