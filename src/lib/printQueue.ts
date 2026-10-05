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
  /** The album being ordered — its row id in the cloud (useBuilderState's
   *  albumIdRef). Checkout freezes THIS row, not the latest saved album: a
   *  customer with several albums would otherwise pay for the wrong one. */
  albumId?: string;
  /** LEGACY designed front·spine·back cover artwork (old drafts). Optional for
   *  back-compat; the wrap falls back to this when cover PAGES are absent.
   *  The cover MATERIAL (soft/hard) is chosen at checkout, not stored here. */
  coverDesign?: CoverDesign;
  /** Cover-as-pages: the FRONT cover PAGE. When present, the checkout cover
   *  wrap composites this actual page render + a derived spine + the reserved
   *  Megy Prints back panel (the back is not customer artwork). */
  coverFront?: AlbumPage;
}

let pending: PrintJob | null = null;

export function setPendingPrintJob(job: PrintJob): void {
  pending = job;
}

export function getPendingPrintJob(): PrintJob | null {
  return pending;
}

/** Signing out drops the album handed to checkout (and the note about it):
 *  the next account in this tab must not check out the last one's album. */
export function clearPendingPrintJob(): void {
  pending = null;
  try { sessionStorage.removeItem(HANDOFF_KEY); } catch { /* private mode */ }
}

// ── The hand-off note ──
// Whether the album went to checkout SAVED to the customer's account. The
// builder saves it on the way (Builder.handleOrder) — but only a signed-in
// customer can be saved, and a guest signs in at checkout, where the builder
// isn't running to save anything. Then the account holds no copy of the album,
// or an older one, and the order would freeze that instead of what is on screen.
//
// Kept in sessionStorage, not with the job above: the Google sign-in round-trip
// at checkout reloads the page, which wipes the job but not this (same tab).

const HANDOFF_KEY = 'megy-order-handoff';

export interface OrderHandoff {
  albumId: string;
  /** The cloud row holds the album exactly as it left the builder. */
  saved: boolean;
}

export function noteOrderHandoff(handoff: OrderHandoff): void {
  try { sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(handoff)); } catch { /* private mode */ }
}

export function readOrderHandoff(): OrderHandoff | null {
  try {
    const raw = sessionStorage.getItem(HANDOFF_KEY);
    if (!raw) return null;
    const h = JSON.parse(raw) as Partial<OrderHandoff>;
    return typeof h?.albumId === 'string' ? { albumId: h.albumId, saved: h.saved === true } : null;
  } catch {
    return null;
  }
}
