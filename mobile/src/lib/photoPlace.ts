/* ══════════════════════════════════════════════════════════════════════════
   WHERE A PHOTO WAS TAKEN (its EXIF GPS), as the album uses it.

   The album keeps photos taken close together, in time AND in place, on the
   same page (the website's shared generateAlbum: planScenes, 200 m). The
   website has always read the place (src/pages/builder/exif.ts); the app now
   reads it too (owner, 2026-11-26: "using Geo tracking and time taken").

   The place stays ON THE PHONE: it is kept in the album being made (the
   draft file) and handed to the album builder, and nothing that leaves the
   phone carries it (the cloud album row and the order list each photo's
   facts by name, and the place is not one of them; test/photoPlace.test.ts).

   Android hides photo places from apps unless the app holds "access media
   location" (ACCESS_MEDIA_LOCATION) and asks for the photo's original bytes
   (MediaStore.setRequireOriginal); the app's own module (modules/photo-files)
   does both. A photo with no place (location off when it was taken, saved
   from a chat, a screenshot) simply has none, and the album groups it by
   time only, as before.
   ══════════════════════════════════════════════════════════════════════════ */

export interface PhotoPlace {
  lat: number;
  lon: number;
}

/** A place, checked: real numbers, on the globe, and not "0, 0" (what a
 *  phone writes when it hides the place, and what a broken file reads as).
 *  Null when it is not a usable place. */
export function toPlace(lat: unknown, lon: unknown): PhotoPlace | null {
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  if (lat === 0 && lon === 0) return null;
  return { lat, lon };
}

/** A saved place (the draft file), checked the same way. */
export function readPlace(raw: unknown): PhotoPlace | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  return toPlace(r.lat, r.lon);
}
