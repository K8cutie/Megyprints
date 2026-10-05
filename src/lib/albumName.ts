/* ══════════════════════════════════════════════════════════════════════════
   ALBUM NAME — what the customer calls the album ("Maria's Debut"). Asked on
   the wizard's first step, next to the occasion, and just as unskippable. It
   is the album's saved name: the title in Your Projects and in the "resume
   where you left off?" prompt. Before names existed every album was saved as
   "My Album", so a customer with a few albums could not tell them apart.

   Lives in the album itself (builder state → draft → albums.title), not in a
   device-wide key, because every album has its own.
   ══════════════════════════════════════════════════════════════════════════ */

export const MIN_ALBUM_NAME_LENGTH = 2;
export const MAX_ALBUM_NAME_LENGTH = 60;

/** What an album with no name is saved as (and every album was, before names). */
export const UNNAMED_ALBUM = 'My Album';

/** Trim, collapse whitespace, cap the length. Never throws. */
export function cleanAlbumName(v: string | null | undefined): string {
  return (v || '').replace(/\s+/g, ' ').trim().slice(0, MAX_ALBUM_NAME_LENGTH);
}

/** The gate the first step's Next button and the wizard engine share. */
export function isAlbumNameReady(v: string | null | undefined): boolean {
  return cleanAlbumName(v).length >= MIN_ALBUM_NAME_LENGTH;
}

/** A title the album got without the customer naming it ("My Album", the
 *  older "Untitled Album", nothing) — not worth showing as its name. */
export function isDefaultAlbumName(v: string | null | undefined): boolean {
  const n = cleanAlbumName(v);
  return n === '' || n === UNNAMED_ALBUM || n === 'Untitled Album';
}

/** The name to save: the customer's, or the old default for an unnamed draft. */
export function albumNameToSave(v: string | null | undefined): string {
  return cleanAlbumName(v) || UNNAMED_ALBUM;
}
