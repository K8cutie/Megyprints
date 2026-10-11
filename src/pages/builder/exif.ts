import exifr from 'exifr';
import { heifExifTiff } from '../../lib/heifExif';
import { needsHeicConversion } from '../../lib/heicPhoto';

/**
 * exif.ts — read a photo's capture time from its EXIF metadata.
 * Used to group photos into "moments" (same time = same page).
 */

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
