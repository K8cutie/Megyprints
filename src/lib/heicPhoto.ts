/* ══════════════════════════════════════════════════════════════════════════
   heicPhoto — iPhone photos (.heic / .heif) in the album.

   Owner (2026-10-11): "we need heic format to be recognized by the album".
   An iPhone saves its photos as HEIC. Chrome (Android, Windows) can't open
   one, so a HEIC went into the album with no picture, no size and no date
   (it couldn't be laid out, checked or printed), or, with no type from the
   picker, was left out as "not a photo". Each HEIC is now turned into a JPEG
   as it comes in, and the rest of the album never sees a HEIC:
     • Safari (iPhone, Mac) opens HEIC itself: drawn and saved as a JPEG;
     • anywhere else, heic-to (libheif, LGPL-3.0, loaded only when a HEIC
       arrives, ~3 MB) decodes it.
   The capture date is read from the original (lib/heifExif, exif.ts), since
   the JPEG copy carries none.
   ══════════════════════════════════════════════════════════════════════════ */

/** How long "Your iPhone photos are ready" stays up once a batch is done. */
export const HEIC_READY_SHOWN_MS = 2000;

/** JPEG quality for the converted copy: the print reads this file. */
export const HEIC_JPEG_QUALITY = 0.92;

/** What a HEIC shows while it is being turned into a JPEG (a browser that
 *  can't open HEIC would show a broken picture): a soft square with a
 *  turning ring. Replaced by the real photo as soon as it is ready. */
export const HEIC_CONVERTING_PREVIEW = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#F3E9DC"/>'
  + '<circle cx="50" cy="50" r="12" fill="none" stroke="#B85C38" stroke-width="4" stroke-linecap="round" stroke-dasharray="50 26">'
  + '<animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="1s" repeatCount="indefinite"/></circle></svg>',
)}`;

const HEIC_TYPE = /^image\/(heic|heif)(-sequence)?$/i;
const HEIC_NAME = /\.(heic|heif)$/i;
/** ISO-BMFF major brands of HEIC/HEIF stills (not AVIF: Chrome opens those). */
const HEIF_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'hevm', 'hevs', 'mif1', 'msf1']);

/** By its label: the type the picker gave, or the file name. */
export function looksHeic(f: { type: string; name: string }): boolean {
  return HEIC_TYPE.test(f.type) || HEIC_NAME.test(f.name);
}

/** By its bytes: an ISO-BMFF "ftyp" box with a HEIF brand. */
export async function isHeifBytes(blob: Blob): Promise<boolean> {
  try {
    const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    if (head.length < 12) return false;
    const s = (a: number) => String.fromCharCode(head[a], head[a + 1], head[a + 2], head[a + 3]);
    return s(4) === 'ftyp' && HEIF_BRANDS.has(s(8));
  } catch {
    return false;
  }
}

/** Does this photo need turning into a JPEG? Its label says so, or it has
 *  no usable label and its bytes do. */
export async function needsHeicConversion(file: File): Promise<boolean> {
  if (looksHeic(file)) return true;
  if (file.type && file.type !== 'application/octet-stream') return false;
  return isHeifBytes(file);
}

/** "IMG_4100.HEIC" → "IMG_4100.jpg". */
export function jpegName(name: string): string {
  return HEIC_NAME.test(name) ? name.replace(HEIC_NAME, '.jpg') : `${name}.jpg`;
}

/** Safari's own decoder: fast, and right on an iPhone. Null where it can't. */
async function nativeToJpeg(file: Blob): Promise<Blob | null> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
  let bmp: ImageBitmap | null = null;
  try {
    bmp = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0);
    const out = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', HEIC_JPEG_QUALITY));
    canvas.width = 0; // free the pixels now
    return out;
  } catch {
    return null;
  } finally {
    bmp?.close?.();
  }
}

/** libheif, for every browser that can't open HEIC (Chrome). The CSP build:
 *  no eval, a blob worker (allowed by vercel.json's worker-src). */
async function libheifToJpeg(file: Blob): Promise<Blob> {
  const { heicTo } = await import('heic-to/csp');
  return heicTo({ blob: file, type: 'image/jpeg', quality: HEIC_JPEG_QUALITY });
}

/** Overridable for tests (jsdom has no decoder). */
export const heicConverters = { native: nativeToJpeg, libheif: libheifToJpeg };

/** The HEIC as a JPEG File (same name, .jpg). Throws if it can't be read. */
export async function heicToJpeg(file: File): Promise<File> {
  const jpeg = (await heicConverters.native(file)) ?? (await heicConverters.libheif(file));
  if (!jpeg || jpeg.size === 0) throw new Error(`Couldn't open ${file.name}`);
  return new File([jpeg], jpegName(file.name), { type: 'image/jpeg', lastModified: file.lastModified });
}

/** The file the album keeps: a JPEG copy of a HEIC, any other photo as it is. */
export async function toAlbumPhoto(file: File): Promise<File> {
  return (await needsHeicConversion(file)) ? heicToJpeg(file) : file;
}
