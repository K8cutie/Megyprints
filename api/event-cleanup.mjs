// Nightly cleanup of Megyprints Events files (0044).
//
// ── WHY THIS ENDPOINT EXISTS ────────────────────────────────────────────────
// Guests' photos and videos live in Storage (event-originals, event-media, event-videos).
// The database decides which may go (event_media_files_to_purge):
//   • items a guest deleted;
//   • uploads that never finished (a day old);
//   • everything of a booking cancelled or declined 3+ days ago, or whose host
//     deleted their account 3+ days ago;
//   • everything event_keep_days() after the event.
// SQL can't remove Storage files (storage.protect_delete), so this does, with
// the service key, then records them (finish_event_media_purge), which only
// marks an item once its files are really gone.
//
// ── WHAT THIS ENDPOINT DOES NOT DECIDE ─────────────────────────────────────
// Nothing comes from the request but the cron secret: the database lists the
// files, read fresh, and the service key only removes those names. Same rule
// as api/expire-orders.mjs and api/delete-account.mjs.
//
// ── AUTH ───────────────────────────────────────────────────────────────────
// Vercel's cron sends `Authorization: Bearer <CRON_SECRET>`. Without a
// CRON_SECRET this refuses to run at all (fail closed).

import { createClient } from '@supabase/supabase-js';
import { secretMatches } from './expire-orders.mjs';
import { REMOVE_BATCH } from './delete-account.mjs';

/** The only buckets this ever removes from (0044). */
export const EVENT_BUCKETS = new Set(['event-originals', 'event-media', 'event-videos']);

/** Files listed per round; the rest wait for the next round or night. */
export const PURGE_PAGE = 500;
/** Stop starting new rounds after this long, well inside the function limit. */
export const TIME_BUDGET_MS = 40_000;

function bearer(req) {
  const h = req.headers?.authorization || req.headers?.Authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(String(h).trim());
  return m ? m[1] : '';
}

/** Group the database's (media_id, bucket, name) rows by bucket. */
export function byBucket(rows) {
  const out = new Map();
  for (const r of rows) {
    if (!r || typeof r.bucket !== 'string' || typeof r.name !== 'string' || !r.name) continue;
    if (!EVENT_BUCKETS.has(r.bucket)) continue; // only ever these three
    if (!out.has(r.bucket)) out.set(r.bucket, []);
    out.get(r.bucket).push(r.name);
  }
  return out;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') { res.status(405).json({ error: 'GET or POST only' }); return; }

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const CRON_SECRET = process.env.CRON_SECRET;
  if (!CRON_SECRET || CRON_SECRET.length < 16 || !SUPABASE_URL || !SERVICE_KEY) {
    console.error('[event-cleanup] not configured: CRON_SECRET (16+ chars), VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are all required');
    res.status(500).json({ error: 'Not configured.' });
    return;
  }
  if (!secretMatches(bearer(req), CRON_SECRET)) { res.status(401).json({ error: 'Unauthorized.' }); return; }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const started = Date.now();
  const summary = { removed: 0, recorded: 0, more: false };
  const seen = new Set();

  try {
    for (;;) {
      if (Date.now() - started > TIME_BUDGET_MS) { summary.more = true; break; }
      const { data, error } = await admin.rpc('event_media_files_to_purge', { p_limit: PURGE_PAGE });
      if (error || !Array.isArray(data)) throw new Error(`list: ${error?.message ?? 'no list'}`);
      // Items whose files didn't go last round aren't retried in the same run.
      const rows = data.filter((r) => !seen.has(r?.media_id));
      if (!rows.length) break;
      const ids = [...new Set(rows.map((r) => r.media_id).filter((id) => typeof id === 'string'))];
      ids.forEach((id) => seen.add(id));
      for (const [bucket, names] of byBucket(rows)) {
        for (let i = 0; i < names.length; i += REMOVE_BATCH) {
          const { error: rmErr } = await admin.storage.from(bucket).remove(names.slice(i, i + REMOVE_BATCH));
          if (rmErr) throw new Error(`${bucket}: ${rmErr.message}`);
          summary.removed += Math.min(REMOVE_BATCH, names.length - i);
        }
      }
      const { data: n, error: finErr } = await admin.rpc('finish_event_media_purge', { p_ids: ids });
      if (finErr) throw new Error(`record: ${finErr.message}`);
      summary.recorded += typeof n === 'number' ? n : 0;
    }
    // Then the old personal details (0044 event_retention_sweep): guests'
    // names once an event's files are gone, abandoned requests' contact.
    const { data: swept, error: swErr } = await admin.rpc('event_retention_sweep');
    if (swErr) throw new Error(`sweep: ${swErr.message}`);
    summary.swept = swept ?? null;
  } catch (err) {
    console.error('[event-cleanup] failed:', err instanceof Error ? err.message : err);
    res.status(500).json({ ...summary, error: 'Cleanup failed.' });
    return;
  }
  res.status(200).json(summary);
}
