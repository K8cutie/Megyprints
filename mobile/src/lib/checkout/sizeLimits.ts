/* The upload size limit, said in plain words (bug hunt B-D7, 2026-11-28).
   Live's Supabase plan refuses any file over 50 MB. A big album's pages file
   (191 pages: 77.7 MB) was made and sent with no check, and the refusal was
   read as a lost connection: three tries, then "check your internet". The
   print files shrink the pages until they fit (print/printFiles.ts); if they
   still can't, or storage refuses a file for its size, these are the words. */

export const PAGES_TOO_BIG = "Your album's pages are too big to send in one file, so this order can't be sent. Cancel it in Your orders, take out a few pages, then order again, or message us and we'll help.";

/** The pages file is still over the upload budget after every smaller try. */
export class PagesTooBigError extends Error {
  constructor(public readonly bytes: number) { super(PAGES_TOO_BIG); this.name = 'PagesTooBigError'; }
}

/** Storage refusing a file for its size: no try after it can pass, and it is not the internet. */
export function isTooLargeUpload(message: string): boolean {
  return /exceeded the maximum allowed size|payload too large|entity too large|\b413\b/i.test(message);
}

/* Bug hunt B-D6 (2026-11-28): with ~16 MB free, Place order made the order
   row, then couldn't make the cover, and said "close your other apps": a half
   order and the wrong reason. Making the print files needs room (the pages
   file up to 45 MB, the cover, pictures on the way, a video's smaller copy),
   so the space is checked BEFORE the order is saved. 150 MB: the biggest pages
   file (45 MB), the cover, the pictures on the way and a video's copy, with room. */
export const MIN_FREE_BYTES = 150 * 1024 * 1024;
export const PHONE_ALMOST_FULL = "Your phone is almost full. Free up some space (about 150 MB: delete a few videos or apps you don't use), then tap Place order again.";
/** The words when the phone has too little room, else null (unknown room: go on). */
export function lowSpaceWords(freeBytes: number | null | undefined): string | null {
  return typeof freeBytes === 'number' && Number.isFinite(freeBytes) && freeBytes >= 0 && freeBytes < MIN_FREE_BYTES ? PHONE_ALMOST_FULL : null;
}
