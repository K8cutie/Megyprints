/* ══════════════════════════════════════════════════════════════════════════
   The video packages chosen for each album (owner, 2026-10-26; 0056).

   Kept on THIS phone, by album id, not in the album row: the album's cloud
   save would need a new column and its fallbacks for a database that doesn't
   have it yet. The choice goes to the database with the order
   (orders.video_packages), and the database never charges less than the
   cheapest packages holding the videos actually in the album. So on another
   phone the pop-up simply asks again, and nobody is charged for a choice
   they can't see.
   ══════════════════════════════════════════════════════════════════════════ */

import { MAX_CHOSEN_PACKAGES } from './pricing';

const KEY = 'megy-video-packages-v1';

function readAll(): Record<string, number[]> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, number[]> : {};
  } catch {
    return {};
  }
}

/** The album's chosen package sizes (videos each), largest first; [] when none. */
export function readVideoPackages(albumId: string | null | undefined): number[] {
  if (!albumId) return [];
  const v = readAll()[albumId];
  if (!Array.isArray(v)) return [];
  return v.filter((n) => Number.isInteger(n) && n > 0).slice(0, MAX_CHOSEN_PACKAGES).sort((a, b) => b - a);
}

/** Saves the album's packages ([] forgets them). Never throws: a phone that
 *  can't store it gets the pop-up again, and the cheapest packages at checkout. */
export function writeVideoPackages(albumId: string | null | undefined, mix: readonly number[]): void {
  if (!albumId) return;
  try {
    const all = readAll();
    if (mix.length) all[albumId] = [...mix].sort((a, b) => b - a).slice(0, MAX_CHOSEN_PACKAGES);
    else delete all[albumId];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch { /* storage full or blocked: see above */ }
}
