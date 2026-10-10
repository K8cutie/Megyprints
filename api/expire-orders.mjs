// Nightly cleanup of orders that were never paid (0042).
//
// ── WHY THIS ENDPOINT EXISTS ────────────────────────────────────────────────
// Place order uploads the print PDF, the cover PDF and the memory videos before
// the payment QR shows, because the photos live only on the customer's phone
// and a paid order must never be missing its print file. Without this, an order
// nobody paid for kept those files forever, and nothing stopped it piling up.
//
// Vercel's cron calls this once a day (vercel.json, 03:00 Manila). It:
//   1. cancels every order still unpaid after unpaid_order_days() where the
//      customer never tapped "I've sent ₱X" (expire_unpaid_orders). An order
//      whose customer says they paid is never cancelled here;
//   2. for each order cancelled cancelled_files_keep_days() ago that still
//      holds files (orders_due_for_file_purge): claims it first
//      (claim_order_file_purge — from then on it can't be reopened or marked
//      paid), removes <id>.pdf and <id>-cover.pdf, then the memory videos the
//      database says may go (order_clip_files_to_purge), then records it
//      (finish_order_file_purge);
//   3. removes videos uploaded early (when /order opened) for a checkout that
//      never finished (orphan_clip_files).
//
// Receipts (payment-proofs) are kept on purpose: they're the evidence if a
// customer says they paid. Nothing on the customer's phone is touched, so a
// customer who comes back can order the same album again.
//
// ── WHAT THIS ENDPOINT DOES NOT DECIDE ─────────────────────────────────────
// Which orders expire and which files may go are decided in SQL, read fresh
// right before each removal. Nothing comes from the request: it has no body,
// and the only input is the cron secret. Same rule as api/delete-account.mjs:
// the service key is used for nothing but removing names the database listed.
//
// ── AUTH ───────────────────────────────────────────────────────────────────
// Vercel sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set on
// the project. With no CRON_SECRET configured this refuses to run at all
// (fail closed): an open URL that cancels orders is not acceptable.

import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import { pdfNames, REMOVE_BATCH } from './delete-account.mjs';

const PDF_BUCKET = 'print-pdfs';
const CLIP_BUCKET = 'memory-clips';

/** Orders handled per run. The rest wait for tomorrow night. */
export const PURGE_BATCH = 50;
/** Unfinished-checkout videos removed per run. */
export const ORPHAN_BATCH = 200;
/** Stop starting new orders after this long, well inside the function limit. */
export const TIME_BUDGET_MS = 40_000;

function bearer(req) {
  const h = req.headers?.authorization || req.headers?.Authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(String(h).trim());
  return m ? m[1] : '';
}

/** Constant-time compare, so the secret can't be guessed a byte at a time. */
export function secretMatches(given, expected) {
  if (typeof given !== 'string' || typeof expected !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function removeAll(admin, bucket, names) {
  for (let i = 0; i < names.length; i += REMOVE_BATCH) {
    const { error } = await admin.storage.from(bucket).remove(names.slice(i, i + REMOVE_BATCH));
    if (error) throw new Error(`${bucket}: ${error.message}`);
  }
}

/** Remove one cancelled order's files, then record it. Throws on any failure,
 *  and then the order is NOT recorded, so tomorrow's run tries it again. */
async function purgeOrder(admin, orderId) {
  // Claim first: an order the owner reopened since the list was read is
  // skipped, and once claimed it can't be reopened under us.
  const { data: claimed, error: claimErr } = await admin.rpc('claim_order_file_purge', { p_order_id: orderId });
  if (claimErr) throw new Error(`claim: ${claimErr.message}`);
  if (claimed !== true) return { skipped: true, videos: 0 };

  await removeAll(admin, PDF_BUCKET, pdfNames(orderId));

  const { data: clips, error: clipsErr } = await admin.rpc('order_clip_files_to_purge', { p_order_id: orderId });
  if (clipsErr || !Array.isArray(clips)) throw new Error(`video list: ${clipsErr?.message ?? 'no list'}`);
  const names = clips.map((c) => c?.object_name).filter((n) => typeof n === 'string' && n.length > 0);
  const codes = [...new Set(clips.map((c) => c?.code).filter((c) => typeof c === 'string' && c.length > 0))];
  if (names.length) await removeAll(admin, CLIP_BUCKET, names);

  const { error: finishErr } = await admin.rpc('finish_order_file_purge', { p_order_id: orderId, p_codes: codes });
  if (finishErr) throw new Error(`record: ${finishErr.message}`);
  return { skipped: false, videos: names.length };
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') { res.status(405).json({ error: 'GET or POST only' }); return; }

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const CRON_SECRET = process.env.CRON_SECRET;
  if (!CRON_SECRET || CRON_SECRET.length < 16 || !SUPABASE_URL || !SERVICE_KEY) {
    console.error('[expire-orders] not configured: CRON_SECRET (16+ chars), VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are all required');
    res.status(500).json({ error: 'Not configured.' });
    return;
  }
  if (!secretMatches(bearer(req), CRON_SECRET)) { res.status(401).json({ error: 'Unauthorized.' }); return; }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const started = Date.now();

  // ── 1. Cancel what was never paid ──
  const { data: expired, error: expireErr } = await admin.rpc('expire_unpaid_orders');
  if (expireErr) {
    console.error('[expire-orders] expire_unpaid_orders failed:', expireErr.message);
    res.status(500).json({ error: 'Expiry failed.' });
    return;
  }
  const expiredNumbers = (Array.isArray(expired) ? expired : []).map((o) => o?.order_number).filter(Boolean);

  // ── 2. Remove the files of cancelled orders that are due ──
  // Batch after batch until the time budget runs out, so a busy day can't
  // build a backlog. An order that fails is tried once per run (it stays due
  // and is retried tomorrow), never again in the same run.
  let purged = 0;
  let skipped = 0;
  let videos = 0;
  let more = false;
  const errors = [];
  const tried = new Set();
  for (let batch = 0; ; batch += 1) {
    if (Date.now() - started > TIME_BUDGET_MS) { more = true; break; }
    const { data: due, error: dueErr } = await admin.rpc('orders_due_for_file_purge', { p_limit: PURGE_BATCH });
    if (dueErr || !Array.isArray(due)) {
      console.error('[expire-orders] orders_due_for_file_purge failed:', dueErr?.message);
      if (batch === 0) {
        res.status(500).json({ error: 'Cleanup list failed.', expired: expiredNumbers });
        return;
      }
      errors.push({ order_id: null, error: `cleanup list: ${dueErr?.message ?? 'no list'}` });
      break;
    }
    const fresh = due.map((row) => row?.order_id).filter((id) => typeof id === 'string' && id && !tried.has(id));
    if (!fresh.length) break;
    for (const orderId of fresh) {
      if (Date.now() - started > TIME_BUDGET_MS) { more = true; break; }
      tried.add(orderId);
      try {
        const r = await purgeOrder(admin, orderId);
        if (r.skipped) skipped += 1; else purged += 1;
        videos += r.videos;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error(`[expire-orders] order ${orderId}: ${message}`);
        errors.push({ order_id: orderId, error: message });
      }
    }
    if (more || due.length < PURGE_BATCH) break;
  }

  // ── 3. Videos from checkouts that never finished ──
  let orphans = 0;
  const removed = new Set();
  for (;;) {
    if (Date.now() - started > TIME_BUDGET_MS) { more = true; break; }
    const { data: stray, error: strayErr } = await admin.rpc('orphan_clip_files', { p_limit: ORPHAN_BATCH });
    if (strayErr || !Array.isArray(stray)) {
      const message = `orphan list: ${strayErr?.message ?? 'no list'}`;
      console.error(`[expire-orders] ${message}`);
      errors.push({ order_id: null, error: message });
      break;
    }
    // A name already removed this run coming back means the removal didn't
    // take: stop rather than loop on it.
    const names = stray.map((c) => c?.object_name).filter((n) => typeof n === 'string' && n.length > 0 && !removed.has(n));
    if (!names.length) break;
    for (const n of names) removed.add(n);
    try {
      await removeAll(admin, CLIP_BUCKET, names);
      orphans += names.length;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[expire-orders] orphans: ${message}`);
      errors.push({ order_id: null, error: message });
      break;
    }
    if (stray.length < ORPHAN_BATCH) break;
  }

  const summary = { expired: expiredNumbers, purged, skipped, videos, orphans, errors, more };
  console.log('[expire-orders]', JSON.stringify(summary));
  res.status(errors.length ? 500 : 200).json(summary);
}
