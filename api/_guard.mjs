// Shared abuse guard for the paid Anthropic proxies (theme-quotes; theme-keywords
// was deleted along with the sunset clipart picker, its only caller).
//
// These endpoints are PUBLIC and UNAUTHENTICATED by design — the album builder
// has no login — yet every reaching call spends money on a Haiku request. That
// is exactly the shape an abuser scripts: hammer the URL from a loop and run up
// the bill, or POST a giant body to waste tokens. This module is the first line
// of defence. It is deliberately dependency-free and cheap so it can sit in
// front of every request:
//
//   1. body-size cap  — a theme is a short string; reject anything oversized
//                        BEFORE it becomes Haiku input tokens.
//   2. per-IP rate     — a burst guard. It is NOT a hard ceiling, by two limits
//      limit             the Kraken audit proved: the counter is in-memory (per
//                        warm serverless instance, so N instances = N x the cap),
//                        and per-IP throttling only bites callers who cannot
//                        change their IP. We now key off the platform-set client
//                        IP (x-real-ip) instead of the spoofable x-forwarded-for,
//                        which stops trivial per-request IP rotation — but a
//                        botnet / proxy pool still gets one bucket each. For a
//                        real global ceiling, put a platform WAF / rate rule (or
//                        a durable per-IP store like Upstash) in front. This
//                        layer's job is to make casual scripted abuse annoying.
//   3. origin allow-   — opt-in. When ALLOWED_ORIGINS is set, requests whose
//      list              Origin/Referer is not on it are refused, which blocks
//                        casual off-site scraping of the endpoint. OFF by
//                        default so it can never silently break the live app.
//
// The guard NEVER throws and NEVER blocks a legitimate customer at these limits
// (a normal album makes one call per theme, cached client-side after that).

/** Reject a body larger than this many bytes. A theme is capped at 200 chars
 *  downstream; 2 KB leaves generous headroom for JSON overhead while still
 *  refusing a payload crafted to balloon token spend. */
const MAX_BODY_BYTES = 2048;

/** Rolling window for the per-IP counter. */
const WINDOW_MS = 60_000;

/** Max requests per IP per window. A customer makes ~1 paid call per theme
 *  (the client caches per theme), so 20/min is orders of magnitude above real
 *  use and only bites a scripted loop. */
const MAX_PER_WINDOW = 20;

/** Stop the counter Map from growing without bound on a long-lived instance. */
const MAX_TRACKED_IPS = 10_000;

/** ip -> { count, resetAt }. Module scope, so it persists across invocations on
 *  a warm instance and resets on a cold start — see the note above. */
const hits = new Map();

function ipOf(req) {
  // Prefer the platform-set single-value headers, which the client cannot
  // append to. `x-forwarded-for` is only a last resort: a caller can send their
  // OWN x-forwarded-for, so its left-most entry is client-controlled and lets an
  // abuser rotate a fresh "IP" per request to defeat a per-IP counter. On Vercel
  // `x-real-ip` is the true client IP set by the edge.
  const real = req.headers['x-real-ip'] || req.headers['x-vercel-forwarded-for'];
  if (real) return String(Array.isArray(real) ? real[0] : real).split(',')[0].trim();
  const xff = req.headers['x-forwarded-for'];
  return (Array.isArray(xff) ? xff[0] : xff || '').split(',')[0].trim() || 'unknown';
}

/** Comma-separated origins that may call this endpoint, e.g.
 *  "https://megyprints.vercel.app,https://www.megyprints.com". When unset the
 *  origin check is skipped entirely (rate + body guards still apply). */
function allowedOrigins() {
  return (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Inspect a request. Returns null when it may proceed, or
 *  { status, error, retryAfter? } describing how to reject it. Pure w.r.t. the
 *  response — the caller sends the status so this stays easy to reason about. */
export function guard(req) {
  // 1. body size — check the declared length first (cheap), then the actual body.
  // On Vercel a JSON request arrives ALREADY PARSED as an object, so a raw-string
  // check alone never fires; measure the serialized object too so the cap is real
  // even when Content-Length is absent or understated.
  const declared = Number(req.headers['content-length'] || 0);
  if (declared > MAX_BODY_BYTES) return { status: 413, error: 'request body too large' };
  if (typeof req.body === 'string') {
    if (req.body.length > MAX_BODY_BYTES) return { status: 413, error: 'request body too large' };
  } else if (req.body && typeof req.body === 'object') {
    let n = 0;
    try { n = JSON.stringify(req.body).length; } catch { n = MAX_BODY_BYTES + 1; }
    if (n > MAX_BODY_BYTES) return { status: 413, error: 'request body too large' };
  }

  // 2. origin allow-list (opt-in via ALLOWED_ORIGINS).
  const allow = allowedOrigins();
  if (allow.length) {
    const origin = req.headers.origin || '';
    const referer = req.headers.referer || '';
    const ok =
      (origin && allow.includes(origin)) ||
      (!origin && referer && allow.some((a) => referer.startsWith(a)));
    if (!ok) return { status: 403, error: 'origin not allowed' };
  }

  // 3. per-IP rate limit (fixed window).
  const now = Date.now();
  const ip = ipOf(req);
  const rec = hits.get(ip);
  if (!rec || now >= rec.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  } else if (rec.count >= MAX_PER_WINDOW) {
    return { status: 429, error: 'too many requests', retryAfter: Math.ceil((rec.resetAt - now) / 1000) };
  } else {
    rec.count += 1;
  }

  // Opportunistic sweep so the Map can't grow unbounded on a warm instance.
  if (hits.size > MAX_TRACKED_IPS) {
    for (const [k, v] of hits) if (now >= v.resetAt) hits.delete(k);
  }

  return null;
}

/** Apply the guard and, if it rejects, send the response. Returns true when the
 *  request was rejected (caller should stop), false when it may proceed. */
export function rejectIfAbusive(req, res) {
  const g = guard(req);
  if (!g) return false;
  if (g.retryAfter) res.setHeader('Retry-After', String(g.retryAfter));
  res.status(g.status).json({ error: g.error });
  return true;
}
