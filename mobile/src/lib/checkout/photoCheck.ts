/* Every photo an album's pages and cover use, checked BEFORE the order is
   saved (bug hunt B-D5, 2026-11-28, confirmed by Mother): a photo made 0 bytes
   on the phone was found only while the pages were drawn, after the order row
   existed ("Photo 63 on page 40 can't be opened on this phone", with no fix),
   leaving a stuck unpaid order that Finish sending could never finish (it
   draws the frozen album). The check reads each photo's header only
   (modules/photo-files inspect: no pixels), so it is quick.

   What stops the order: a photo the phone can't open at all, or one whose
   header the phone can't read (no width or height). The second covers a
   0-byte file, a broken file, and a file that only looks like a photo, even
   when the phone's photo list still shows its old size (Mother, 2026-11-28:
   the first check trusted that size and let these through). The print files
   open photos with the same Android decoders, so a photo whose header can't
   be read can't be printed either. HEIC is read on Android 9 and newer.
   The file's size is not used: the phone's list can be out of date. */
import type { PhotoInspection } from '../../../modules/photo-files';

export interface UsedPhoto { page: string; index: number }

/** The first photo that surely can't be opened, else null. */
export function firstUnopenable(used: readonly UsedPhoto[], uris: readonly string[], looks: readonly Pick<PhotoInspection, 'uri' | 'readable' | 'width' | 'height'>[]): UsedPhoto | null {
  const byUri = new Map(looks.map((l) => [l.uri, l]));
  for (const u of used) {
    const uri = uris[u.index];
    if (!uri) return u;
    const l = byUri.get(uri);
    if (!l) continue;
    if (!l.readable) return u;
    if (l.width <= 0 || l.height <= 0) return u;
  }
  return null;
}

/** Said before any order is saved: which photo, where, and what to do. */
export function photoGoneWords(u: UsedPhoto): string {
  const where = u.page === 'the cover' ? 'the cover' : u.page.replace(/^page /, 'page ');
  return `Photo ${u.index + 1} on ${where} can't be opened on this phone: it may have been deleted or moved. Open ${where}, put that photo in again or pick another one, then tap Place order again.`;
}

/** The same, for an order already saved (Finish sending draws the album as it was ordered). */
export function photoGoneSavedWords(u: UsedPhoto): string {
  const where = u.page === 'the cover' ? 'the cover' : u.page;
  return `Photo ${u.index + 1} on ${where} can't be opened on this phone, so this order can't be finished here. Cancel it in Your orders and order the album again, or message us and we'll help.`;
}

export class PhotoGoneError extends Error {
  constructor(readonly photo: UsedPhoto, saved: boolean) {
    super(saved ? photoGoneSavedWords(photo) : photoGoneWords(photo));
    this.name = 'PhotoGoneError';
  }
}
