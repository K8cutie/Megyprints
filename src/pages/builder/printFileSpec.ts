/* ══════════════════════════════════════════════════════════════════════════
   PRINT FILE SPEC: the numbers the checkout's two print files are made with
   ("<order>.pdf", one page per album page, and "<order>-cover.pdf", the flat
   cover), in a file with no browser code, so the 2.0 app makes its files from
   the very same numbers (src/shared/sharedModules.ts). printPipeline.ts and
   generateAlbumPdf.ts read them from here (and re-export the budget).
   ══════════════════════════════════════════════════════════════════════════ */

/** The most a print file may weigh: Supabase Storage takes 50 MB a file on
 *  this plan (0015_print_pdfs_size_limit), less room for the upload itself. */
export const PRINT_FILE_BUDGET_BYTES = 45 * 1024 * 1024;

/** An interior page's picture, its bleed included, is shrunk to this many
 *  pixels on its longest side (~218 DPI on an 8×8) so a ~50-page album stays
 *  under the budget. Its words go on top at full 300 DPI (wordPatches). */
export const PRINT_PAGE_MAX_SIDE = 1800;

/** JPEG quality of an interior page's picture (canvas toBlob, 0 to 1). */
export const PRINT_PAGE_JPEG_QUALITY = 0.82;

/** The flat cover is ONE page, drawn at full 300 DPI: only a wrap longer than
 *  this (pixels) is shrunk, a defensive canvas cap (a normal wrap is ~5–7k px). */
export const MAX_COVER_SIDE = 8000;

/** JPEG quality of the flat cover's picture (canvas toBlob, 0 to 1). */
export const COVER_JPEG_QUALITY = 0.9;
