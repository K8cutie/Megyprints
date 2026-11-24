/* ══════════════════════════════════════════════════════════════════════════
   THE PRINT PAGES, MADE WHILE THE CUSTOMER FILLS IN CHECKOUT.

   Owner's test on a 5-year-old phone, 2026-11-23 (order MP-2026-9XS7BVA, a
   Mini with videos): Place order took about 3 minutes, and making the 16
   print pages alone took about 78 seconds of it (the database's times: the
   last video in at 21:20:58, the pages file at 21:22:16). Owner: "Yes, build
   it" (start making the pages when checkout opens).

   So the pages file is made as soon as checkout opens, one page at a time,
   while the customer types their name and address. Place order then takes
   the pages already made and only finishes the rest (takeEarlyPages).

   Never in the customer's way: between pages the work waits while the
   keyboard is up (`quiet`), so typing stays smooth on a slow phone; a page
   already started finishes first (one page, a few seconds at most). Once
   Place order takes it, it runs flat out, as before.

   Never a different print file: the pages are made by the same code
   (print/printFiles.ts checkoutFiles → makePages), for the same album and
   the same binding margin (the cover type), named by `earlyPagesKey`. A
   changed album or cover type is another key: the old work stops. Anything
   that goes wrong here is dropped silently; Place order then makes the
   pages itself and says what is wrong, as before.
   ══════════════════════════════════════════════════════════════════════════ */
import type { AlbumPage } from '@web/pages/builder/types';
import { bindingInchesFor } from '@web/pages/builder/binding';

type OnPage = (done: number, total: number, smaller: boolean) => void;
/** Makes the pages file: `between` runs after every page. */
export type MakePages = (onPage: OnPage, between: () => Promise<void>) => Promise<Uint8Array>;

/** The work stopped because the customer left checkout or the album changed. */
export class EarlyPagesStopped extends Error {
  constructor() { super('early pages stopped'); this.name = 'EarlyPagesStopped'; }
}

interface Job {
  key: string;
  promise: Promise<Uint8Array>;
  /** The last page reported (done, total, smaller), to replay to a late listener. */
  last: [number, number, boolean] | null;
  listeners: Set<OnPage>;
  /** Place order took it: no more waiting for the keyboard. */
  rushed: boolean;
  stopped: boolean;
  failed: boolean;
}

let job: Job | null = null;

/** A short name for a string (FNV-1a, 32 bit, as hex). */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** What the pages file depends on: the album's pages, size and photos, and
 *  the binding margin its cover type gives (bindingInchesFor). Not the paper
 *  or the cover's own design: the cover file is made at Place order. */
export function earlyPagesKey(
  album: { albumSize: string; pages: readonly AlbumPage[]; photoUris: readonly string[]; photoIds?: readonly string[] },
  cover: string,
): string {
  const s = JSON.stringify([album.albumSize, album.pages, album.photoUris, album.photoIds ?? [], bindingInchesFor(cover)]);
  return `${hash(s)}-${s.length}`;
}

export interface StartOptions {
  /** True when the customer is not typing (the keyboard is down). */
  quiet: () => boolean;
  /** Waits a little (a timer); tests pass their own. */
  wait?: (ms: number) => Promise<void>;
}

const QUIET_CHECK_MS = 300;
const realWait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Starts making the pages for `key`, unless that work is already going or
 *  done. Other work (another album, another cover type) is stopped. */
export function startEarlyPages(key: string, make: MakePages, opts: StartOptions): void {
  if (job && job.key === key && !job.stopped && !job.failed) return;
  stopEarlyPages();
  const wait = opts.wait ?? realWait;
  const j: Job = { key, promise: Promise.resolve(new Uint8Array()), last: null, listeners: new Set(), rushed: false, stopped: false, failed: false };
  const between = async () => {
    while (!j.rushed && !j.stopped && !opts.quiet()) await wait(QUIET_CHECK_MS);
    if (j.stopped && !j.rushed) throw new EarlyPagesStopped();
  };
  const onPage: OnPage = (done, total, smaller) => {
    j.last = [done, total, smaller];
    j.listeners.forEach((l) => l(done, total, smaller));
  };
  j.promise = (async () => {
    await between(); // not while the customer is typing, from the very first page
    return make(onPage, between);
  })();
  j.promise.catch(() => { j.failed = true; if (job === j && !j.rushed) job = null; });
  job = j;
}

/** The customer left checkout (or the album changed): the work stops at the
 *  next page, and what was made is let go. Work Place order took goes on. */
export function stopEarlyPages(): void {
  if (!job) return;
  if (!job.rushed) job.stopped = true;
  job = null;
}

/** Place order: the pages made (or being made) for `key`, or null when there
 *  are none for this album. The work no longer waits for the keyboard;
 *  `onPage` hears every page from now on (and the last one at once). */
export function takeEarlyPages(key: string): { wait: (onPage: OnPage) => Promise<Uint8Array> } | null {
  const j = job;
  if (!j || j.key !== key || j.stopped || j.failed) return null;
  j.rushed = true;
  job = null; // used once: a second order makes its own
  return {
    wait: (onPage) => {
      if (j.last) onPage(...j.last);
      j.listeners.add(onPage);
      return j.promise.finally(() => { j.listeners.delete(onPage); });
    },
  };
}

/** Tests only: what is going on now. */
export function earlyPagesNow(): { key: string; rushed: boolean; stopped: boolean } | null {
  return job ? { key: job.key, rushed: job.rushed, stopped: job.stopped } : null;
}
