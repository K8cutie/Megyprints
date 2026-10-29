/* ══════════════════════════════════════════════════════════════════════════
   WHEN A PHOTO WAS TAKEN.

   The album puts photos in the order they were taken, like the website
   (generateAlbum's time order reads EXIF DateTimeOriginal). On the phone:
     • Gallery photos: Android's photo index (MediaStore DATE_TAKEN), which
       Android itself fills from the photo's EXIF DateTimeOriginal. It is
       EMPTY when the EXIF has no time zone ("OffsetTimeOriginal") and the
       file's date is more than a day away from the EXIF time: typically old
       photos copied onto a new phone. For those, the app reads the EXIF
       itself (gallery.ts → readTakenTime), so they still sort right.
     • Photos from Files: the app reads the EXIF itself (modules/photo-files).
     • No EXIF time at all (screenshots, many saved chat photos): the file's
       last-changed time. The website keeps such photos in a trailing group
       instead; PR #158 (open) moves the website to this same fallback.
   ══════════════════════════════════════════════════════════════════════════ */

const EXIF_DATE = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/;
const OFFSET = /^([+-])(\d{2}):?(\d{2})$/;

/** Earliest and latest times we believe a camera wrote. */
const MIN_YEAR = 1970;
const MAX_YEAR = 2100;

/**
 * EXIF "2026:10:26 14:03:12" → milliseconds. With an offset ("+08:00",
 * EXIF OffsetTimeOriginal) the time is exact; without one it is read as the
 * phone's local time, which is what the website's EXIF reader (exifr) does.
 * Blank, zeroed ("0000:00:00 00:00:00") or impossible dates give null.
 */
export function parseExifDateTime(value: string | null | undefined, offset?: string | null): number | null {
  if (!value) return null;
  const m = EXIF_DATE.exec(value.trim());
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  if (y < MIN_YEAR || y > MAX_YEAR || h > 23 || mi > 59 || s > 59) return null;
  // Date would roll "February 31" over into March: refuse it instead.
  const day = new Date(Date.UTC(y, mo - 1, d));
  if (day.getUTCFullYear() !== y || day.getUTCMonth() !== mo - 1 || day.getUTCDate() !== d) return null;
  const off = offset ? OFFSET.exec(offset.trim()) : null;
  if (off) {
    const sign = off[1] === '-' ? -1 : 1;
    const minutes = sign * (Number(off[2]) * 60 + Number(off[3]));
    return Date.UTC(y, mo - 1, d, h, mi, s) - minutes * 60_000;
  }
  return new Date(y, mo - 1, d, h, mi, s).getTime();
}

/** The time a photo is sorted by: when it was taken, else when the file last
 *  changed, else null (it goes after every dated photo). */
export function orderTime(p: { capturedAt: number | null; modifiedAt: number | null }): number | null {
  return p.capturedAt ?? p.modifiedAt ?? null;
}
