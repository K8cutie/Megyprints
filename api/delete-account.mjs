// Serverless account deletion — the storage steps the customer's own session
// cannot perform, plus the call that performs everything else.
//
// ── WHY THIS ENDPOINT EXISTS ────────────────────────────────────────────────
// Deleting the account has to take the customer's PHOTOS and VIDEOS with it.
// On our side those live in three buckets:
//
//   • `print-pdfs` (private) — the print-ready PDFs for each order: the pages
//     at `<order id>.pdf` and the cover wrap at `<order id>-cover.pdf` (0017).
//   • `memory-clips` (PUBLIC, 0030) — the videos behind their QR codes, at
//     `<code>.<ext>`. Anyone holding the link can play these, so leaving them
//     behind would make "we deleted your account" untrue for exactly the data
//     that is most exposed.
//   • `payment-proofs` (private, 0033) — the receipt screenshot they attached
//     at `<order id>.<jpg|png|webp|pdf>`, and for an event booking (0043) at
//     `booking-<id>-<deposit|balance>.<ext>`. A bank receipt shows their name,
//     and the record we keep is meant to have none.
//
// Two doors are shut on removing those files from SQL or from the customer's
// own session, and both are shut on purpose:
//
//   1. SQL cannot do it. `storage.protect_delete` rejects a direct DELETE on
//      storage.objects — and rightly so: it would drop the bookkeeping row and
//      strand the actual file, leaving the customer's photos on disk after we
//      told them they were gone.
//   2. The customer's own session cannot do it through the Storage API. The API
//      LOOKS THE OBJECT UP before deleting it, and 0008 deliberately gives
//      customers no SELECT on print-pdfs so a paid album can't be downloaded and
//      taken to another printer. Verified against a live local stack: with a
//      matching DELETE policy in place, a customer's delete still returns 403 —
//      it never reaches the delete check. Adding the SELECT policy needed to get
//      past it would hand every customer their print-ready PDF, which is the
//      exact thing 0008 exists to prevent. (0030 gave memory-clips no SELECT
//      policy either, so the same lookup failure applies there.)
//
// So the removal runs here, with the service-role key, scoped to:
//   • print-pdfs and payment-proofs objects named for an order whose user_id
//     is the CALLER, and
//   • memory-clips objects the CALLER uploaded (owner_id), as listed by
//     public.my_memory_clip_names() (0035).
// Both lists are read with the caller's own token, so their identity comes from
// their JWT. The request body is never read.
//
// "Owned by the caller" is an explicit user_id filter, not just RLS. RLS on
// orders lets the shop's own accounts (0005/0006) read EVERY order, so an
// unfiltered read under an owner's email listed every customer's order, and the
// service key then removed every customer's print file.
//
// ── WHAT THIS ENDPOINT DOES NOT DECIDE ─────────────────────────────────────
// It does not decide whether deletion is allowed. That stays in
// public.delete_own_account() (0027, extended by 0035), which this calls with
// the CUSTOMER's token, not the service key — so auth.uid() is the customer,
// RLS applies, and every guard in that function (money in flight, photos and
// videos really gone) is enforced by the database exactly as if the app had
// called it directly. This endpoint is a courier for storage operations, not a
// privileged bypass.
//
// It does ASK first, though (step 1): a customer the function would refuse must
// not lose a single file on the way to that refusal. Without the check, an
// album on the press would keep its account but lose its videos, and it would
// print with QR codes pointing at nothing.

import { createClient } from '@supabase/supabase-js';
import { rejectIfAbusive } from './_guard.mjs';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const PDF_BUCKET = 'print-pdfs';
const CLIP_BUCKET = 'memory-clips';
const PROOF_BUCKET = 'payment-proofs';

/** Every name an order's files can have, exactly as 0017 and 0033 allow them. */
export const pdfNames = (orderId) => [`${orderId}.pdf`, `${orderId}-cover.pdf`];
export const proofNames = (orderId) => ['jpg', 'png', 'webp', 'pdf'].map((ext) => `${orderId}.${ext}`);
/** Every receipt name an event booking can have: 0043's booking_proof_names(). */
export const bookingProofNames = (bookingId) =>
  ['balance', 'deposit'].flatMap((kind) => ['jpg', 'pdf', 'png', 'webp'].map((ext) => `booking-${bookingId}-${kind}.${ext}`));

/** Bookings whose receipts may go. A booking with a confirmed deposit or
 *  balance that isn't finished (booked, paid) blocks the whole deletion in the
 *  database, the same rule as a paid order on the press. */
const BOOKING_REMOVABLE = ['requested', 'quoted', 'completed', 'declined', 'cancelled'];

/** PostgREST's "no such table" (event_bookings before 0043 is applied: the
 *  endpoint deploys before the migration, and deleting an account must keep
 *  working in between). */
const isMissingTable = (error) => error?.code === 'PGRST205' || error?.code === '42P01';

/** Storage's remove() takes a list of names per request (up to 1000). Batches
 *  stay well under that; 0030 caps an account at 200 clips. */
export const REMOVE_BATCH = 100;

/** Statuses whose print file may be removed. An order that is paid and on the
 *  press keeps its PDF — delete_own_account() refuses those customers anyway,
 *  so this is the same rule stated twice, on purpose. */
const REMOVABLE = ['pending_payment', 'delivered', 'cancelled'];

function bearer(req) {
  const h = req.headers.authorization || req.headers.Authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(String(h).trim());
  return m ? m[1] : '';
}

/** The refusal delete_own_account() gives, word for word, so the customer reads
 *  the same sentence whichever check stops them. Orders are checked first
 *  there, so they're named first here; a booking (0043) has its own sentence. */
export function blockedMessage(blocking) {
  const orders = blocking.filter((o) => o.kind !== 'booking');
  if (orders.length) {
    const numbers = orders.map((o) => o.order_number).join(', ');
    return `Order ${numbers} is paid and not yet delivered, so the account cannot be deleted yet. Contact the shop to cancel or complete it first.`;
  }
  const list = (status) => blocking.filter((o) => status.includes(o.status ?? 'booked')).map((o) => o.order_number).join(', ');
  if (list(['booked', 'paid'])) {
    return `Event booking ${list(['booked', 'paid'])} is paid and not finished yet, so the account cannot be deleted yet. Contact the shop to cancel or complete it first.`;
  }
  // A deposit sent, not confirmed yet (0043 a3).
  if (list(['quoted'])) {
    return `The deposit you sent for booking ${list(['quoted'])} is waiting for us to confirm it, so the account cannot be deleted yet. Message us and we'll confirm it or send it back first.`;
  }
  // A closed booking whose money isn't settled yet (0043 a4).
  return `We still have to settle the money for booking ${list(['cancelled', 'declined'])} with you, so the account cannot be deleted yet. Message us and we'll settle it first.`;
}

async function removeAll(admin, bucket, names) {
  for (let i = 0; i < names.length; i += REMOVE_BATCH) {
    const { error } = await admin.storage.from(bucket).remove(names.slice(i, i + REMOVE_BATCH));
    if (error) throw new Error(error.message);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  if (rejectIfAbusive(req, res)) return;

  if (!SUPABASE_URL || !SUPABASE_ANON) {
    res.status(500).json({ error: 'Account deletion is unavailable right now.' });
    return;
  }

  const token = bearer(req);
  if (!token) { res.status(401).json({ error: 'You are not signed in.' }); return; }

  // The caller's own client: every DB call below runs AS them, so auth.uid(),
  // RLS and the RPC's guards all behave exactly as they do from the app.
  const asUser = createClient(SUPABASE_URL, SUPABASE_ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await asUser.auth.getUser(token);
  const uid = userData?.user?.id;
  if (userErr || !uid) { res.status(401).json({ error: 'You are not signed in.' }); return; }

  try {
    if (!SERVICE_KEY) {
      // Fail loudly rather than deleting the account and leaving the files.
      // delete_own_account() would refuse anyway; this is the clearer message.
      res.status(500).json({ error: 'Account deletion is misconfigured. Please contact the shop.' });
      return;
    }

    // ── 1. Would the database refuse? Then touch nothing. ──
    const { data: pre, error: preErr } = await asUser.rpc('account_deletion_preflight');
    if (preErr) throw new Error(preErr.message);
    const blocking = Array.isArray(pre?.blocking) ? pre.blocking : [];
    if (blocking.length) {
      res.status(409).json({ error: blockedMessage(blocking) });
      return;
    }

    // ── 2. What to remove, read as the CUSTOMER ──
    // Both lists are read BEFORE anything is removed, so a failure here (say,
    // 0035 not applied yet) deletes nothing at all. The orders are the ones
    // whose user_id is the caller: RLS alone would hand an owner's account
    // every customer's order. my_memory_clip_names() keys off auth.uid(). The
    // service key is then used for nothing but removing these exact names.
    const { data: orders, error: ordersErr } = await asUser
      .from('orders')
      .select('id, status')
      .eq('user_id', uid)
      .in('status', REMOVABLE);
    if (ordersErr) throw new Error(ordersErr.message);
    const orderIds = (orders ?? []).map((o) => o.id);
    const pdfPaths = orderIds.flatMap(pdfNames);
    const proofPaths = orderIds.flatMap(proofNames);

    // The caller's event bookings (0043), same rule: their own user_id, not RLS
    // (the owner's account can read every booking).
    const { data: bookings, error: bookingsErr } = await asUser
      .from('event_bookings')
      .select('id, status')
      .eq('user_id', uid)
      .in('status', BOOKING_REMOVABLE);
    if (bookingsErr && !isMissingTable(bookingsErr)) throw new Error(bookingsErr.message);
    const bookingProofPaths = (bookingsErr ? [] : bookings ?? []).flatMap((b) => bookingProofNames(b.id));

    const { data: clipList, error: clipsErr } = await asUser.rpc('my_memory_clip_names');
    if (clipsErr || !Array.isArray(clipList)) {
      throw new Error('Could not look up your memory videos, so nothing was deleted. Please try again.');
    }
    const clipNames = clipList.filter((n) => typeof n === 'string' && n.length > 0);

    // ── 3. Remove the PDFs (their photos), the clips (their videos) and the
    //       receipts (their name). A name with no file behind it is skipped
    //       by Storage, so trying all four receipt types costs nothing. ──
    if (pdfPaths.length || clipNames.length || bookingProofPaths.length) {
      const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      await removeAll(admin, PDF_BUCKET, pdfPaths);
      await removeAll(admin, PROOF_BUCKET, proofPaths);
      await removeAll(admin, PROOF_BUCKET, bookingProofPaths);
      await removeAll(admin, CLIP_BUCKET, clipNames);
    }

    // ── 4. Everything else, decided and executed by the database ──
    // If any PDF, receipt or clip is somehow still there, this refuses and
    // nothing is deleted (guards (b), (b2) and (b3)).
    const { data, error } = await asUser.rpc('delete_own_account');
    if (error) {
      // These messages are written for a customer to read (they name the order
      // that is still in production), so pass them through unchanged.
      res.status(409).json({ error: error.message });
      return;
    }

    res.status(200).json({ ...(data ?? {}), deleted_videos: clipNames.length });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error && err.message
        ? err.message
        : 'Deletion failed. Please try again.',
    });
  }
}
