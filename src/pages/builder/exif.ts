import exifr from 'exifr';

/**
 * exif.ts — read a photo's capture time from its EXIF metadata.
 * Used to group photos into "moments" (same time = same page).
 */

/** Reads EXIF DateTimeOriginal (the moment the shot was taken) from an image
 *  file. Returns a millisecond timestamp, or null if the file has no usable
 *  EXIF time (e.g. screenshots, or photos stripped of metadata by social apps). */
export async function readCaptureTime(file: File): Promise<number | null> {
  try {
    const data = await exifr.parse(file, ['DateTimeOriginal', 'CreateDate']);
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
