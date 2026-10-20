import exifr from 'exifr';
import { heifExifTiff } from '../../lib/heifExif';
import { needsHeicConversion } from '../../lib/heicPhoto';

/**
 * exif.ts — read a photo's capture time from its EXIF metadata.
 * Used to group photos into "moments" (same time = same page).
 */

/** Where a photo's time came from: 'exif' = the camera's DateTimeOriginal
 *  (when it was SHOT); 'file' = the file's modified date (when it was SAVED:
 *  the only date a photo saved from Messenger, WhatsApp or Facebook has left,
 *  since those strip the metadata). The repeat check trusts only 'exif'. */
export type TimeSource = 'exif' | 'file';

export interface PhotoTime {
  capturedAt: number | null;
  /** Absent when capturedAt is null. */
  timeSource?: TimeSource;
}

/** A file date this close to now was stamped by the picker, not the camera:
 *  iOS hands the page a fresh copy of a Photos item, dated the moment it was
 *  picked, which says nothing about when the photo was shot. */
const JUST_PICKED_MS = 2 * 60_000;

/** The file's modified date, when it is a plausible PAST date: not 0 (some
 *  exports stamp the epoch), not in the future, not "just now". Else null. */
export function fileTime(file: { lastModified: number }, now: number = Date.now()): number | null {
  const t = file.lastModified;
  if (!Number.isFinite(t) || t <= 0 || t > now - JUST_PICKED_MS) return null;
  return t;
}

/** The time the album orders this photo by: EXIF first (readCaptureTime),
 *  else the file's date (fileTime), else none — and which one it was. */
export async function readPhotoTime(file: File, now: number = Date.now()): Promise<PhotoTime> {
  const exif = await readCaptureTime(file);
  if (exif !== null) return { capturedAt: exif, timeSource: 'exif' };
  const t = fileTime(file, now);
  return t === null ? { capturedAt: null } : { capturedAt: t, timeSource: 'file' };
}

async function timeIn(source: File | Uint8Array): Promise<number | null> {
  try {
    const data = await exifr.parse(source, ['DateTimeOriginal', 'CreateDate']);
    const when: Date | undefined = data?.DateTimeOriginal ?? data?.CreateDate;
    if (when instanceof Date && !Number.isNaN(when.getTime())) {
      return when.getTime();
    }
    return null;
  } catch {
    // Unsupported format / no EXIF — fall back to "no time" (handled upstream).
    return null;
  }
}

/** Reads EXIF DateTimeOriginal (the moment the shot was taken) from an image
 *  file. Returns a millisecond timestamp, or null if the file has no usable
 *  EXIF time (e.g. screenshots, or photos stripped of metadata by social apps).
 *  A HEIC whose EXIF exifr can't find (it ignores the item index's base
 *  offset) is read with lib/heifExif. Pass the ORIGINAL file, not the JPEG
 *  copy a HEIC becomes (heicPhoto): the copy has no EXIF. */
export async function readCaptureTime(file: File): Promise<number | null> {
  const t = await timeIn(file);
  if (t !== null) return t;
  if (!(await needsHeicConversion(file))) return null;
  try {
    const tiff = heifExifTiff(new Uint8Array(await file.arrayBuffer()));
    return tiff ? await timeIn(tiff) : null;
  } catch {
    return null;
  }
}
