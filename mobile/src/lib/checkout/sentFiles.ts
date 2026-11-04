/* The order files this phone has sent (sendOrder `sent`), kept on the phone
   for a few hours, so a checkout opened again on the same order knows them.

   A file is written down once it is in the bucket (sent, or already there).
   Kept for one visit only, the cover was sent again after the app was
   closed on a stopped order: its duplicate answer came at once, before its
   bytes were read, and the pages file after it on the same connection
   waited about 40 s for a 502 before its retry went through (beta round 3).
   A file's name carries its order's id, so one order's files never stand
   for another's. Forgotten after KEEP_SENT_MS: a file long gone from the
   bucket is sent again rather than taken as sent. */
import type { KeyValueStore } from '@web/shared/platform';

export const SENT_FILES_KEY = 'megy-2.0-order-files-sent';
export const KEEP_SENT_MS = 6 * 60 * 60 * 1000;
/** The newest this many are kept. */
const KEEP = 40;

export interface SentFiles {
  has(path: string): boolean;
  add(path: string): void;
}

type Sent = [path: string, at: number];

function read(store: KeyValueStore): Sent[] {
  try {
    const v: unknown = JSON.parse(store.getItem(SENT_FILES_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((e): e is Sent => Array.isArray(e) && typeof e[0] === 'string' && typeof e[1] === 'number') : [];
  } catch {
    return [];
  }
}

/** The files sent from this phone; `store` null: this checkout visit's only. */
export function sentFiles(store: KeyValueStore | null, now: () => number = Date.now): SentFiles {
  const visit = new Set<string>();
  const fresh = (e: Sent) => now() - e[1] < KEEP_SENT_MS;
  return {
    has: (path) => visit.has(path) || (!!store && read(store).some((e) => e[0] === path && fresh(e))),
    add: (path) => {
      visit.add(path);
      if (!store) return;
      const kept = read(store).filter((e) => e[0] !== path && fresh(e));
      try { store.setItem(SENT_FILES_KEY, JSON.stringify([...kept, [path, now()]].slice(-KEEP))); } catch { /* full: this visit still knows it */ }
    },
  };
}
