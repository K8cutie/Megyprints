// ──────────────────────────────────────────────────────────────────────────
// Orders — customer-side order creation.
//
// When a logged-in user places an order, we take a FROZEN snapshot of their
// latest saved album and insert it into the `orders` table. The insert runs
// under the customer's session, so RLS ("auth.uid() = user_id") authorizes it.
// The operator/fulfillment side reads these later via the backend (service_role).
// ──────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase';
import { generateAlbumPdf, generateCoverWrapPdf } from '../pages/builder/generateAlbumPdf';
import type { CoverPrintInput } from '../pages/builder/printPipeline';
import type { PrintJob } from './printQueue';
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
}

/**
 * Create an order for the given user by snapshotting their most recently
 * updated album. Throws a friendly Error if there's no album to order.
 */
export async function createOrderFromLatestAlbum(opts: {
  userId: string;
  specs: OrderSpecs;
  shipping: ShippingDetails;
  amount: number;
}): Promise<CreatedOrder> {
  // 1. Load the latest album to freeze into the order.
  const { data: albums, error: albErr } = await supabase
    .from('albums')
    .select('id, title, album_type, album_size, selected_template, photos_per_page, pages, photos, cover_photo')
    .eq('user_id', opts.userId)
    .order('updated_at', { ascending: false })
    .limit(1);

  if (albErr) throw new Error(`Could not load your album: ${albErr.message}`);
  const album = albums?.[0];
  if (!album) {
    throw new Error('No saved album found to order. Build and save an album first, then place your order.');
  }

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
      album_size: opts.specs.size,
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
      status_history: [{ status: 'pending_payment', at: new Date().toISOString() }],
    })
    .select('id, order_number, status')
    .single();

  if (error) throw new Error(`Could not place your order: ${error.message}`);

  // NOTE: the QR "living memory" reliability belt runs in Order.handlePay over
  // the LOCAL print job (getPendingPrintJob) — the exact pages that get printed —
  // rather than this frozen DB album, which can lag behind a QR added moments
  // before checkout (throttled cloud save). See ensureMemoriesForFills there.

  return data as CreatedOrder;
}

/**
 * Build the print-ready PDF for an order and upload it to the private
 * `print-pdfs` bucket (path "<order_id>.pdf"). MUST run on the customer's device
 * — the photos live only in their browser (the print job carries them). Only
 * operators can later download it, so the album can't be printed elsewhere.
 * Throws on failure so the caller can surface it.
 */
export async function uploadOrderPrintPdf(orderId: string, job: PrintJob): Promise<void> {
  const blob = await generateAlbumPdf(job.pages, job.photos, job.albumSize);
  const { error } = await supabase.storage
    .from('print-pdfs')
    .upload(`${orderId}.pdf`, blob, { contentType: 'application/pdf', upsert: true });
  if (error) throw new Error(`Print file upload failed: ${error.message}`);
}

/**
 * Build the front·spine·back cover wrap and upload it as its OWN object
 * ("<order_id>-cover.pdf") next to the interior PDF. Same device constraint +
 * operator-only read as uploadOrderPrintPdf. Requires migration 0017 (the RLS
 * name gate) to be applied, or the upload is rejected. Throws on failure.
 */
export async function uploadOrderCoverPdf(orderId: string, input: CoverPrintInput): Promise<void> {
  const blob = await generateCoverWrapPdf(input);
  const { error } = await supabase.storage
    .from('print-pdfs')
    .upload(`${orderId}-cover.pdf`, blob, { contentType: 'application/pdf', upsert: true });
  if (error) throw new Error(`Cover file upload failed: ${error.message}`);
}
