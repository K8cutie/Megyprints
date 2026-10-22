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
// on; it is only stored, and only within limits (red-team, 2026-10-22, two
// rounds):
//   1. POST only + the shared abuse guard (16 KB body cap, per-IP burst limit,
//      the origin list when ALLOWED_ORIGINS is set);
//   2. only a JSON report sent by a page of this site: a browser marks a
//      request another website makes it send (Sec-Fetch-Site), and the app
//      always sends JSON, so other sites can't use their visitors' browsers
//      to flood it;
//   3. anything that looks like a sign-in token or key is cut out before it is
//      stored: the sign-in return address carries the customer's tokens in
//      the link, and an error on that page would otherwise hand them to
//      whoever reads the Errors tab;
//   4. every field is cut by BYTES (a character can be 3 bytes), long context
//      values are shortened, not dropped;
//   5. log_client_error (service role only) keeps, per day, a few reports per
//      real open order outside the shared room, CLIENT_ERRORS_PER_IP_DAILY
//      from one address (hashed with a secret, never stored as is) and
//      CLIENT_ERRORS_DAILY from everyone; counts what it drops; and removes
//      reports older than 30 days.
// The answer is always 204: a caller learns nothing, and the app never waits.

import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { ipOf, rejectIfAbusive } from './_guard.mjs';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** An env cap: unset → the default; 0 turns reporting off (the same rule as
 *  photo-quotes' caps). */
const cap = (v, d) => (v == null || String(v).trim() === '' ? d : Math.trunc(Number(v)) || 0);
/** Reports kept per day for everyone together (reports about a real open order
 *  have their own room). */
export const DAILY_CAP = cap(process.env.CLIENT_ERRORS_DAILY, 300);
/** Reports kept per day from one address. A phone in an error loop sends at
 *  most 20 a page load (report.ts). */
export const PER_IP_DAILY = cap(process.env.CLIENT_ERRORS_PER_IP_DAILY, 30);
/** Reports kept per day about one real open order (the cover's 3 tries, a
 *  retry or two). */
export const PER_ORDER_DAILY = cap(process.env.CLIENT_ERRORS_PER_ORDER_DAILY, 20);

/** Names whose value is cut out wherever they appear: "name=…" in a link, or
 *  "name": "…" in JSON. */
const SECRET_KEYS = '(?:provider_refresh_token|(?:access|refresh|provider|id)_token|token_hash|token|apikey|api_key|code|password|secret)';
const KEY_VALUE = new RegExp(`(["']?)(${SECRET_KEYS})\\1(\\s*[:=]\\s*)(["']?)[^&#\\s"',}]+`, 'gi');

/** Cut tokens and keys out of a stored string: "key=…" and "key": "…" pairs,
 *  bearer tokens, and anything shaped like a JWT. */
export function scrub(s) {
  if (typeof s !== 'string') return s;
  return s
    .replace(KEY_VALUE, '$1$2$1$3$4[removed]')
    .replace(/\bBearer\s+[\w.~+/-]+=*/gi, 'Bearer [removed]')
    .replace(/eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]+/g, '[removed]');
}

/** At most `max` BYTES of UTF-8 (a cut in the middle of a character drops it). */
export function cutBytes(s, max) {
  const b = Buffer.from(s, 'utf8');
  return b.length <= max ? s : b.subarray(0, max).toString('utf8').replace(/�+$/, '');
}

/** Scrubbed and cut: first to a length that keeps the scrub fast, then to
 *  `max` bytes. Null when there's nothing. */
const field = (v, max) => (typeof v === 'string' && v.trim() ? cutBytes(scrub(v.slice(0, max * 2)), max) : null);

/** The context the database keeps (≤ 2 KB): its first 20 entries, each value
 *  a scrubbed string of at most 300 bytes, a number, a boolean or null. A long
 *  value (a component stack) is shortened, not the whole context dropped. */
export function readContext(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
  const out = {};
  for (const [k, v] of Object.entries(c).slice(0, 20)) {
    const key = cutBytes(String(k), 40);
    if (v == null || typeof v === 'number' || typeof v === 'boolean') out[key] = v ?? null;
    else {
      let s;
      try { s = typeof v === 'string' ? v : JSON.stringify(v); } catch { s = String(v); }
      out[key] = field(s, 300) ?? '';
    }
  }
  // Still too big (20 long values): keep the parts the console shows.
  if (Buffer.byteLength(JSON.stringify(out)) > 1800) {
    for (const k of Object.keys(out)) if (!['path', 'step', 'attempt', 'orderId', 'kind', 'pages', 'boundary'].includes(k)) delete out[k];
  }
  return out;
}

/** The report as stored: only a JSON object from the app, strings scrubbed and
 *  cut to size, nothing else from the body. Null when there's no message. */
export function readReport(body, userAgent) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const message = field(body.message, 1000);
  if (!message) return null;
  return {
    p_message: message,
    p_stack: field(body.stack, 2000),
    p_context: readContext(body.context),
    p_url: field(body.url, 500),
    p_user_agent: field(userAgent, 400),
  };
}

/** A request another website made the visitor's browser send. Browsers set
 *  Sec-Fetch-Site; the app's own reports are "same-origin". */
export function fromAnotherSite(req) {
  const site = req.headers['sec-fetch-site'];
  return typeof site === 'string' && site !== 'same-origin';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }
  if (rejectIfAbusive(req, res)) return;
  if (fromAnotherSite(req)) return res.status(204).end();

  const report = readReport(req.body, req.headers['user-agent']);
  if (!report || DAILY_CAP <= 0 || PER_IP_DAILY <= 0 || !SUPABASE_URL || !SERVICE_KEY) return res.status(204).end();

  // One line in the function log too (kept an hour on this plan).
  console.error('[client-error]', report.p_message, JSON.stringify(report.p_context ?? {}).slice(0, 300));
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await admin.rpc('log_client_error', {
      ...report,
      p_ip_hash: createHmac('sha256', SERVICE_KEY).update(ipOf(req)).digest('hex'),
      p_daily_cap: DAILY_CAP,
      p_ip_cap: PER_IP_DAILY,
      p_order_cap: PER_ORDER_DAILY,
    });
    if (error) console.error('[client-error] not stored:', error.message);
  } catch (e) {
    console.error('[client-error] not stored:', e instanceof Error ? e.message : e);
  }
  return res.status(204).end();
}
