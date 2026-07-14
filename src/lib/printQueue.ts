// ──────────────────────────────────────────────────────────────────────────
// Print queue — a tiny in-memory hand-off for the order/print flow.
//
// The actual photo IMAGES live only in the browser's IndexedDB (the album
// snapshot stored in Supabase is metadata-only). So the print-ready PDF must be
// built browser-side from the data that's already loaded in the Preview.
//
// When the user clicks ORDER ALBUM in the Preview, we stash the exact
// pages/photos/size the Preview is rendering here, so the /order page can build
// the real print PDF without re-loading anything. Module-level (not React
// state) so it survives the SPA navigation to /order.
// ──────────────────────────────────────────────────────────────────────────

import type { AlbumPage, UploadedPhoto, AlbumSizePreset, CoverDesign } from '../pages/builder/types';

export interface PrintJob {
  pages: AlbumPage[];
  photos: UploadedPhoto[];
  albumSize: AlbumSizePreset;
  /** LEGACY designed front·spine·back cover artwork (old drafts). Optional for
   *  back-compat; the wrap falls back to this when cover PAGES are absent.
   *  The cover MATERIAL (soft/hard) is chosen at checkout, not stored here. */
  coverDesign?: CoverDesign;
  /** Cover-as-pages: the front & back cover PAGES. When present, the checkout
   *  cover wrap composites these actual page renders + a derived spine. */
  coverFront?: AlbumPage;
  coverBack?: AlbumPage;
}

let pending: PrintJob | null = null;

export function setPendingPrintJob(job: PrintJob): void {
  pending = job;
}

export function getPendingPrintJob(): PrintJob | null {
  return pending;
}
