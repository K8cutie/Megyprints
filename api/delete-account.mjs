// Serverless account deletion — the one step the customer's own session cannot
// perform, plus the call that performs everything else.
//
// ── WHY THIS ENDPOINT EXISTS ────────────────────────────────────────────────
// Deleting the account has to take the customer's PHOTOS with it, and on our
// side those live in exactly one place: the print-ready PDF for each order, in
// the private `print-pdfs` bucket.
//
// Two doors are shut on removing that file, and both are shut on purpose:
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
//      exact thing 0008 exists to prevent.
//
// So the removal runs here, with the service-role key, scoped to nothing but
// print-pdfs objects belonging to an order owned by the CALLER — whose identity
// is established from their own JWT, never from the request body.
//
// ── WHAT THIS ENDPOINT DOES NOT DECIDE ─────────────────────────────────────
// It does not decide whether deletion is allowed. That stays in
// public.delete_own_account() (migration 0027), which this calls with the
// CUSTOMER's token, not the service key — so auth.uid() is the customer, RLS
// applies, and every guard in that function (money in flight, photos really
// gone) is enforced by the database exactly as if the app had called it
// directly. This endpoint is a courier for one storage operation, not a
// privileged bypass.

import { createClient } from '@supabase/supabase-js';
import { rejectIfAbusive } from './_guard.mjs';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const PDF_BUCKET = 'print-pdfs';

/** Statuses whose print file may be removed. An order that is paid and on the
 *  press keeps its PDF — delete_own_account() refuses those customers anyway,
 *  so this is the same rule stated twice, on purpose. */
const REMOVABLE = ['pending_payment', 'delivered', 'cancelled'];

function bearer(req) {
  const h = req.headers.authorization || req.headers.Authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(String(h).trim());
  return m ? m[1] : '';
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
    // ── 1. Remove the print PDFs (the only copy of their photos we hold) ──
    // Read the order ids as the CUSTOMER, so RLS — not this code — decides
    // which orders are theirs. The service key is then used for nothing but
    // removing those exact paths.
    if (!SERVICE_KEY) {
      // Fail loudly rather than deleting the account and leaving the photos.
      // delete_own_account() would refuse anyway; this is the clearer message.
      res.status(500).json({ error: 'Account deletion is misconfigured. Please contact the shop.' });
      return;
    }

    const { data: orders, error: ordersErr } = await asUser
      .from('orders')
      .select('id, status')
      .in('status', REMOVABLE);
    if (ordersErr) throw new Error(ordersErr.message);

    const paths = (orders ?? []).map((o) => `${o.id}.pdf`);
    if (paths.length) {
      const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error: rmErr } = await admin.storage.from(PDF_BUCKET).remove(paths);
      if (rmErr) throw new Error(rmErr.message);
    }

    // ── 2. Everything else, decided and executed by the database ──
    const { data, error } = await asUser.rpc('delete_own_account');
    if (error) {
      // These messages are written for a customer to read (they name the order
      // that is still in production), so pass them through unchanged.
      res.status(409).json({ error: error.message });
      return;
    }

    res.status(200).json(data ?? {});
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error && err.message
        ? err.message
        : 'Deletion failed. Please try again.',
    });
  }
}
