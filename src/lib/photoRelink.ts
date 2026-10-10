/* ══════════════════════════════════════════════════════════════════════════
   photoRelink — the same photos, added again on another device, go BACK IN
   THEIR PLACE. The album's layout is in the cloud; its photos are on the
   device it was made on. Added again here (most likely the very same files,
   copied off the phone), each one fills its own missing photo — same frame,
   same crop, same caption — instead of being added as a new photo, which
   doubled the album to "90 photos ready … no repeats" (1-star testers,
   round 2). Pages point at photos by their place in the list, so a missing
   photo keeps its place and only its file comes back.
   ══════════════════════════════════════════════════════════════════════════ */

import type { UploadedPhoto } from '../pages/builder/types';
import { photoIsHere } from './photoPresence';

export interface PickedFile { name: string; size: number }

export interface RelinkPlan {
  /** File `file` fills missing photo `photo`. `sameCopy` = the same file
   *  (same name and size; or the album never recorded a size). Otherwise it is
   *  a different copy of it (same name, another size): it goes in with a note. */
  relink: { file: number; photo: number; sameCopy: boolean }[];
  /** New photos. */
  fresh: number[];
  /** Already in the album on this device (same name and size), or repeated in this pick. */
  duplicate: number[];
}

export function planRelink(files: PickedFile[], photos: Pick<UploadedPhoto, 'name' | 'size' | 'previewUrl'>[]): RelinkPlan {
  const key = (name: string, size: number) => `${name}__${size}`;
  const present = new Set(photos.filter(photoIsHere).map((p) => key(p.name, p.size)));
  const missingByName = new Map<string, number[]>();
  photos.forEach((p, i) => {
    if (photoIsHere(p)) return;
    missingByName.set(p.name, [...(missingByName.get(p.name) ?? []), i]);
  });
  const claimed = new Set<number>();
  const inBatch = new Set<string>();
  const plan: RelinkPlan = { relink: [], fresh: [], duplicate: [] };
  files.forEach((f, i) => {
    const k = key(f.name, f.size);
    if (present.has(k) || inBatch.has(k)) { plan.duplicate.push(i); return; }
    inBatch.add(k);
    const open = (missingByName.get(f.name) ?? []).filter((p) => !claimed.has(p));
    // The same file first; then one whose size the album never recorded;
    // then a different copy of the same name.
    const exact = open.find((p) => photos[p].size === f.size);
    const unknown = open.find((p) => !photos[p].size);
    const pick = exact ?? unknown ?? open[0];
    if (pick == null) { plan.fresh.push(i); return; }
    claimed.add(pick);
    plan.relink.push({ file: i, photo: pick, sameCopy: pick === exact || pick === unknown });
  });
  return plan;
}

/** A re-added copy compared with the photo it replaces, once measured:
 *  'mismatch' = a different shape (likely not the same picture); 'smaller' =
 *  fewer pixels (it may print softer); null = as good as the original. */
export function copyQuality(original: { width: number; height: number }, copy: { width: number; height: number }): 'mismatch' | 'smaller' | null {
  if (!(original.width > 0 && original.height > 0 && copy.width > 0 && copy.height > 0)) return null;
  const ratio = (a: { width: number; height: number }) => a.width / a.height;
  if (Math.abs(ratio(copy) - ratio(original)) / ratio(original) > 0.03) return 'mismatch';
  if (Math.max(copy.width, copy.height) < 0.9 * Math.max(original.width, original.height)) return 'smaller';
  return null;
}
