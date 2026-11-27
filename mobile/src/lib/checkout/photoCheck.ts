/* Every photo an album's pages and cover use, checked BEFORE the order is
   saved (bug hunt B-D5, 2026-11-28, confirmed by Mother): a photo made 0 bytes
   on the phone was found only while the pages were drawn, after the order row
   existed ("Photo 63 on page 40 can't be opened on this phone", with no fix),
   leaving a stuck unpaid order that Finish sending could never finish (it
   draws the frozen album). The check reads each photo's header only
   (modules/photo-files inspect: no pixels), so it is quick.

   Only what is surely broken stops the order: a photo the phone can't open
   at all, or one with no header and no bytes (a 0-byte file). A photo whose
   size or header the phone just can't tell (0 = unknown) goes on, as before. */
import type { PhotoInspection } from '../../../modules/photo-files';

export interface UsedPhoto { page: string; index: number }

/** The first photo that surely can't be opened, else null. */
export function firstUnopenable(used: readonly UsedPhoto[], uris: readonly string[], looks: readonly Pick<PhotoInspection, 'uri' | 'readable' | 'size' | 'width' | 'height'>[]): UsedPhoto | null {
  const byUri = new Map(looks.map((l) => [l.uri, l]));
  for (const u of used) {
    const uri = uris[u.index];
    if (!uri) return u;
    const l = byUri.get(uri);
    if (!l) continue;
    if (!l.readable) return u;
    if (l.width <= 0 && l.height <= 0 && l.size <= 0) return u;
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
