// ──────────────────────────────────────────────────────────────────────────
// Orders — customer-side order creation.
//
// When a logged-in user places an order, we take a FROZEN snapshot of the
// album they are ordering and insert it into the `orders` table. The insert runs
// under the customer's session, so RLS ("auth.uid() = user_id") authorizes it.
// The operator/fulfillment side reads these later via the backend (service_role).
// ──────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase';
import { uploadOnce } from './storageUpload';
import { generateAlbumPdf, generateCoverWrapPdf } from '../pages/builder/generateAlbumPdf';
import type { CoverPrintInput } from '../pages/builder/printPipeline';
import type { PrintJob } from './printQueue';
import { selectOrderAlbum } from './orderAlbum';
import { normalizeFullName, isValidFullName, normalizePHPhone, normalizeStreet, isValidStructuredAddress, composeAddress, type AddressValue } from './contact';

export interface ShippingDetails {
  name: string;
  phone: string;
  /** Structured PH address captured via the cascading PSGC picker. */
  address: AddressValue;
}

export interface OrderSpecs {
  material: string;
  cover: string;
  size: string;
}

export interface CreatedOrder {
  id: string;
  order_number: string;
  status: string;
  /** The album the order froze. The print PDF must be rebuilt from THIS row. */
  album_id: string;
}

/** The album columns an order freezes (cover_front only once 0036 is applied). */
type OrderAlbumRow = {
  id: string; title: string | null; album_type: string | null; album_size: string | null;
  selected_template: string | null; photos_per_page: number | null;
  pages: unknown; photos: unknown; cover_photo: string | null; cover_front?: unknown;
};

/**
 * Create an order for the given user by snapshotting the album being ordered
 * (see orderAlbum). Throws a friendly Error if there's no album to order, and
 * AlbumNotSavedError if the named album isn't in the account.
 */
export async function createOrderFromAlbum(opts: {
  userId: string;
  /** The album being ordered (print job / device draft). Only when no id is
   *  known does the order fall back to the most recently updated album. */
  albumId?: string;
  specs: OrderSpecs;
  shipping: ShippingDetails;
  amount: number;
  /** Chosen memory-hosting term (0030). Stored for the operator + stamped on
   *  the album's memory rows at checkout. */
  hostingYears?: number | null;
  /** HD (1080p) memory upgrade chosen for this album (0032). */
  hdMemories?: boolean;
}): Promise<CreatedOrder> {
  // 1. Load the album being ordered to freeze into the order. '*' rather than a
  //    column list so its front cover (cover_front, 0036) comes along when the
  //    database has it — naming that column fails the whole read on one that
  //    doesn't yet.
  const row = await selectOrderAlbum<OrderAlbumRow>(supabase, {
    userId: opts.userId,
    albumId: opts.albumId,
    columns: '*',
  });
  if (!row) {
    throw new Error('No saved album found to order. Build and save an album first, then place your order.');
  }
  // The frozen copy. The cover is in it so the order keeps the design the
  // customer approved even when the best-effort cover PDF upload fails.
  const album = {
    id: row.id, title: row.title, album_type: row.album_type, album_size: row.album_size,
    selected_template: row.selected_template, photos_per_page: row.photos_per_page,
    pages: row.pages, photos: row.photos, cover_photo: row.cover_photo,
    cover_front: row.cover_front ?? null,
  };

  const pageCount = Array.isArray(album.pages) ? album.pages.length : 0;

  // Normalize + validate shipping at the data boundary so EVERY caller (not just
  // the checkout form) stores canonical, DB-friendly values. The `orders` table
  // also enforces these via CHECK constraints (migrations 0009/0010) as a final
  // backstop against a bypassing client.
  const shipName = normalizeFullName(opts.shipping.name);
  const shipPhone = normalizePHPhone(opts.shipping.phone);
  const addr = opts.shipping.address;
  if (!isValidFullName(shipName) || !shipPhone || !isValidStructuredAddress(addr)) {
    throw new Error('Please provide a valid name, PH mobile number, and complete delivery address.');
  }
  // Canonical single-line address for the operator/courier + the structured PSGC
  // parts (queryable, routable). Names come straight from PSGC so they're clean.
  const shipAddress = composeAddress(addr);

  // 2. Insert the order as an UNPAID quote. order_number + status come from DB
  //    defaults. We deliberately do NOT send `amount` or `status` here: price is
  //    set server-side by the operator (service_role) at the "mark as paid" step,
  //    and the RLS insert policy now rejects any client-supplied price/status —
  //    so a customer can't place a $1 or pre-"paid" order. (opts.amount is kept
  //    for the UI's running total only; it is never trusted as the real price.)
  const { data, error } = await supabase
    .from('orders')
    .insert({
      user_id: opts.userId,
      album_id: album.id,
      album_snapshot: album, // frozen copy
      // Price-driving size comes from the FROZEN album, not the client spec, so a
      // tampered checkout can't under-declare a larger/costlier album than what
      // was actually built. (Migration 0019 re-derives this from album_snapshot
      // server-side too — this keeps the client-sent value consistent.)
      album_size: album.album_size ?? opts.specs.size,
      material: opts.specs.material,
      cover: opts.specs.cover,
      page_count: pageCount,
      ship_name: shipName,
      ship_phone: shipPhone,       // canonical E.164 (+639XXXXXXXXX)
      ship_address: shipAddress,   // composed single-line
      ship_region: addr.regionName,
      ship_province: addr.provinceName,
      ship_city: addr.cityName,
      ship_barangay: addr.barangayName,
      ship_street: normalizeStreet(addr.street),
      ship_zip: addr.zip.trim(),
      hosting_years: opts.hostingYears ?? null,
      hd_memories: !!opts.hdMemories,
      status_history: [{ status: 'pending_payment', at: new Date().toISOString() }],
    })
    .select('id, order_number, status')
    .single();

  if (error) throw new Error(`Could not place your order: ${error.message}`);

  // NOTE: the QR "living memory" reliability belt runs in Order.handlePay over
  // the LOCAL print job (getPendingPrintJob) — the exact pages that get printed —
  // rather than this frozen DB album, which can lag behind a QR added moments
  // before checkout (throttled cloud save). See ensureMemoriesForFills there.

  return { ...(data as Omit<CreatedOrder, 'album_id'>), album_id: album.id };
}

/**
 * Build the print-ready PDF for an order and upload it to the private
 * `print-pdfs` bucket (path "<order_id>.pdf"). MUST run on the customer's device
 * — the photos live only in their browser (the print job carries them). Only
 * operators can later download it, so the album can't be printed elsewhere.
 * Create-only (see storageUpload.ts): a retry that finds the file already there
 * counts as done. Throws on failure so the caller can surface it.
 */
export async function uploadOrderPrintPdf(orderId: string, job: PrintJob): Promise<void> {
  const blob = await generateAlbumPdf(job.pages, job.photos, job.albumSize);
  const error = await uploadOnce('print-pdfs', `${orderId}.pdf`, blob, { contentType: 'application/pdf' });
  if (error) throw new Error(`Print file upload failed: ${error.message}`);
}

/**
 * Build the front·spine·back cover wrap and upload it as its OWN object
 * ("<order_id>-cover.pdf") next to the interior PDF. Same device constraint,
 * operator-only read and create-only upload as uploadOrderPrintPdf. Requires
 * migration 0017 (the RLS name gate) to be applied, or the upload is rejected.
 * Throws on failure.
 */
export async function uploadOrderCoverPdf(orderId: string, input: CoverPrintInput): Promise<void> {
  const blob = await generateCoverWrapPdf(input);
  const error = await uploadOnce('print-pdfs', `${orderId}-cover.pdf`, blob, { contentType: 'application/pdf' });
  if (error) throw new Error(`Cover file upload failed: ${error.message}`);
}
