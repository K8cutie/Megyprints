// Where the app's error reports land (src/lib/report.ts → POST here).
//
// MP-2026-KGCFSQN (2026-10-22): the checkout's cover step failed on the
// customer's phone and the order went on without a cover. The app did report
// the error, but the live site had no VITE_ERROR_ENDPOINT and no Sentry DSN, so
// it went to the phone's console and nobody saw it. Reports now come here and
// go into public.client_errors (0050), which only the owner can read (the
// console's Errors tab).
//
// PUBLIC and unauthenticated on purpose: errors happen before sign-in too, and
// sendBeacon can't send a token. So nothing in a report is trusted or acted
// on; it is only stored, and only within limits (red-team, 2026-10-22):
//   1. POST only + the shared abuse guard (16 KB body cap, per-IP burst limit,
//      the origin list when ALLOWED_ORIGINS is set);
//   2. anything that looks like a sign-in token or key is cut out before it is
//      stored: the sign-in return address carries the customer's tokens in
//      the link, and an error on that page would otherwise hand them to
//      whoever reads the Errors tab;
//   3. log_client_error (service role only) cuts every field to size, keeps at
//      most CLIENT_ERRORS_PER_IP_DAILY a day from one address (hashed with a
//      secret, never stored as is) and CLIENT_ERRORS_DAILY from everyone, so
//      a flood can't fill the free-plan database or crowd out real reports,
//      and drops reports older than 30 days.
// The answer is always 204: a caller learns nothing, and the app never waits.

import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { ipOf, rejectIfAbusive } from './_guard.mjs';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** An env cap: unset → the default; 0 turns it off (the same rule as
 *  photo-quotes' caps). */
const cap = (v, d) => (v == null || String(v).trim() === '' ? d : Math.trunc(Number(v)) || 0);
/** Reports kept per day for everyone together. */
export const DAILY_CAP = cap(process.env.CLIENT_ERRORS_DAILY, 300);
/** Reports kept per day from one address. A phone in an error loop sends at
 *  most 20 a page load (report.ts). */
export const PER_IP_DAILY = cap(process.env.CLIENT_ERRORS_PER_IP_DAILY, 30);

/** Cut tokens and keys out of a stored string: "access_token=…" style pairs
 *  (links, error messages) and anything shaped like a JWT. */
export function scrub(s) {
  if (typeof s !== 'string') return s;
  return s
    .replace(/((?:access|refresh|provider|id)_token|provider_refresh_token|token|apikey|api_key|code|password|secret)=[^&#\s"']+/gi, '$1=[removed]')
    .replace(/eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]+/g, '[removed]');
}

const str = (v, max) => (typeof v === 'string' && v.trim() ? scrub(v).slice(0, max) : null);

/** The report as stored: strings scrubbed and cut to size, context only when
 *  it's a plain object (its strings scrubbed too), nothing else from the body.
 *  Null when there's no message. */
export function readReport(body, userAgent) {
  let b = body;
  if (typeof b === 'string') {
    try { b = JSON.parse(b); } catch { return null; }
  }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return null;
  const message = str(b.message, 1000);
  if (!message) return null;
  let context = null;
  if (b.context && typeof b.context === 'object' && !Array.isArray(b.context)) {
    try { context = JSON.parse(scrub(JSON.stringify(b.context))); } catch { context = null; }
  }
  return {
    p_message: message,
    p_stack: str(b.stack, 2000),
    p_context: context,
    p_url: str(b.url, 500),
    p_user_agent: str(userAgent, 400),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }
  if (rejectIfAbusive(req, res)) return;

  const report = readReport(req.body, req.headers['user-agent']);
  if (!report || DAILY_CAP <= 0 || !SUPABASE_URL || !SERVICE_KEY) return res.status(204).end();

  // One line in the function log too (kept an hour on this plan).
  console.error('[client-error]', report.p_message, JSON.stringify(report.p_context ?? {}).slice(0, 300));
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await admin.rpc('log_client_error', {
      ...report,
      p_ip_hash: createHmac('sha256', SERVICE_KEY).update(ipOf(req)).digest('hex'),
      p_daily_cap: DAILY_CAP,
      p_ip_cap: PER_IP_DAILY,
    });
    if (error) console.error('[client-error] not stored:', error.message);
  } catch (e) {
    console.error('[client-error] not stored:', e instanceof Error ? e.message : e);
  }
  return res.status(204).end();
}
