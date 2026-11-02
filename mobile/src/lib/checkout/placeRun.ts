/* ══════════════════════════════════════════════════════════════════════════
   PLACING THE ORDER, HOW FAR ALONG: the website's bar (shared
   src/lib/placeProgress.ts: PLACE_AT, pagesAt, pagesLabel, forward), step by
   step in the order the website's placeOrder runs, with its words.

   The print file's pages are most of the bar, one step per page made;
   sending the file can't be measured, so that step shows a moving band.

   Ordering your own album, the bar follows the real steps (sendFrame, from
   sendOrder.ts's steps). The test album still plays `placeFrames` back with
   short waits: how the bar moves for its page count, nothing made or sent.
   ══════════════════════════════════════════════════════════════════════════ */
import { forward, pagesAt, pagesLabel, PLACE_AT, videosAt, type PlaceProgress } from '@web/lib/placeProgress';
import type { SendStep } from './sendOrder';

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

/** A real step of sending the order (sendOrder.ts), as the bar and the words
 *  the website shows for it (placeOrder's advance and setPrepMsg). */
export function sendFrame(prev: PlaceProgress | null, s: SendStep): { progress: PlaceProgress; message: string } {
  switch (s.step) {
    case 'order': return { progress: forward(prev, PLACE_AT.start), message: 'Placing your order…' };
    case 'cover': return { progress: forward(prev, PLACE_AT.cover), message: 'Making your cover…' };
    case 'pages': return s.total > 0
      ? { progress: forward(prev, pagesAt(s.done, s.total, s.smaller)), message: pagesLabel(s.done, s.total, s.smaller) }
      : { progress: forward(prev, PLACE_AT.pages), message: 'Making your print file…' };
    case 'sending': return { progress: forward(prev, PLACE_AT.sending, true), message: 'Sending your print file…' };
    case 'memories': return { progress: forward(prev, PLACE_AT.saving), message: 'Saving your memories…' };
    case 'finishing': return { progress: forward(prev, PLACE_AT.finishing), message: 'Finishing your test order…' };
  }
}

/** The note under the bar, as on the website (PlaceOrderProgress). */
export const KEEP_OPEN_NOTE = 'Keep this screen open. This can take a few minutes.';

/** The bar's width, 0–100 (PlaceOrderProgress). */
export function barPercent(p: PlaceProgress): number {
  return Math.round(Math.min(1, Math.max(0, p.at)) * 100);
}
