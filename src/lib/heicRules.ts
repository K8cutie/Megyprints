/* ══════════════════════════════════════════════════════════════════════════
   heicRules — the pure part of iPhone photo (HEIC) handling: how one is
   known by its label, what its JPEG copy is called, the converting picture,
   the JPEG quality and how long "ready" shows. No browser in here, so the
   2.0 native app shares it (sharedModules.ts). The converting itself (a
   browser canvas, the libheif workers) stays in heicPhoto.ts, which
   re-exports all of this, so every existing import keeps working.
   ══════════════════════════════════════════════════════════════════════════ */

/** How long "Your photos are ready" stays up once a batch is done. */
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

/** By its label: the type the picker gave, or the file name. */
export function looksHeic(f: { type: string; name: string }): boolean {
  return HEIC_TYPE.test(f.type) || HEIC_NAME.test(f.name);
}

/** "IMG_4100.HEIC" → "IMG_4100.jpg". */
export function jpegName(name: string): string {
  return HEIC_NAME.test(name) ? name.replace(HEIC_NAME, '.jpg') : `${name}.jpg`;
}
