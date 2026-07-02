// Public QR "living memory" resolver — Vercel serverless function.
// A scanned /m/:code lands here (via the vercel.json rewrite). Resolves the code
// to its destination through the anon-only resolve_memory RPC (no table read, no
// service-role key), enforces a server-side host allowlist as the SOLE authority
// (the client allowlist is UX-only), and serves a branded memory page. Trusted
// hosts get a brief branded page then auto-forward; anything else gets a
// manual-click interstitial — never an auto-redirect off the allowlist.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY;

// Canonical embed hosts only. Deliberately NO shorteners/redirectors (goo.gl,
// fb.watch, etc.) — those would defeat the allowlist.
const ALLOWED = new Set([
  'youtube.com', 'youtu.be', 'youtube-nocookie.com', 'vimeo.com',
  'open.spotify.com', 'spotify.com', 'instagram.com', 'facebook.com',
  'tiktok.com', 'drive.google.com', 'photos.google.com', 'megyprints.app',
]);

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const allowed = (h) => ALLOWED.has(h) || [...ALLOWED].some((d) => h === d || h.endsWith('.' + d));

const SHELL = (inner) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Megy Prints — Memory</title>
<style>
  :root{color-scheme:light}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    background:#FFFBF7;color:#2D2D2D;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:24px}
  .card{max-width:420px;width:100%;background:#fff;border:1px solid rgba(244,194,161,.35);
    border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,.08);padding:28px;text-align:center}
  .brand{font-size:20px;font-weight:700;letter-spacing:.2px}
  .brand span{color:#E8A598}
  .dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#F4C2A1;margin-left:2px;vertical-align:middle}
  h1{font-size:18px;margin:18px 0 6px}
  p{color:#6B6B6B;font-size:14px;line-height:1.5;margin:6px 0}
  .host{font-weight:600;color:#8B6F47;word-break:break-all}
  a.btn{display:inline-block;margin-top:16px;background:#F4C2A1;color:#fff;text-decoration:none;
    font-weight:600;font-size:15px;padding:12px 22px;border-radius:12px}
  .foot{margin-top:22px;font-size:12px;color:#B4A79F}
  .spin{margin-top:14px;font-size:13px;color:#9B8E88}
</style></head><body><div class="card">
<div class="brand">Megy<span>Prints</span><span class="dot"></span></div>
${inner}
<div class="foot">✨ An enhanced memory, made with Megyprints</div>
</div></body></html>`;

const notFound = () => SHELL(`<h1>Memory not found</h1>
<p>This QR isn't linked to anything yet, or the link was removed.</p>`);

const unavailable = () => SHELL(`<h1>Temporarily unavailable</h1>
<p>We couldn't open this memory right now. Please try again in a moment.</p>`);

const memoryPage = (href, host, title, trusted) => {
  const heading = title ? esc(title) : 'Your memory';
  if (trusted) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<meta http-equiv="refresh" content="1;url=${esc(href)}"><title>Megy Prints — Memory</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#FFFBF7;color:#2D2D2D;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:24px}
.card{max-width:420px;width:100%;background:#fff;border:1px solid rgba(244,194,161,.35);border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,.08);padding:28px;text-align:center}
.brand{font-size:20px;font-weight:700}.brand span{color:#E8A598}h1{font-size:18px;margin:18px 0 6px}p{color:#6B6B6B;font-size:14px;line-height:1.5}
a.btn{display:inline-block;margin-top:16px;background:#F4C2A1;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:12px}.foot{margin-top:22px;font-size:12px;color:#B4A79F}</style></head>
<body><div class="card"><div class="brand">Megy<span>Prints</span></div>
<h1>${heading}</h1><p>Opening on <span style="font-weight:600;color:#8B6F47">${esc(host)}</span>…</p>
<a class="btn" href="${esc(href)}" rel="noopener noreferrer">Tap if it doesn't open</a>
<div class="foot">✨ An enhanced memory, made with Megyprints</div></div></body></html>`;
  }
  // Untrusted host — NEVER auto-redirect. Manual click only.
  return SHELL(`<h1>${heading}</h1>
<p>This memory links to <span class="host">${esc(host)}</span>.</p>
<a class="btn" href="${esc(href)}" rel="noopener noreferrer nofollow">Open link</a>
<p class="spin">Opens an external site — tap only if you trust it.</p>`);
};

const send = (res, status, html) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:");
  res.end(html);
};

export default async function handler(req, res) {
  const code = String((req.query && req.query.code) || '').slice(0, 32);
  if (!/^[a-z2-9]{4,32}$/.test(code)) return send(res, 400, notFound());
  if (!SUPABASE_URL || !SUPABASE_ANON) return send(res, 500, unavailable());

  let row;
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON);
    const { data, error } = await sb.rpc('resolve_memory', { p_code: code });
    if (error) return send(res, 502, unavailable());
    row = data && data[0];
  } catch {
    return send(res, 502, unavailable());
  }
  if (!row) return send(res, 404, notFound());

  let u;
  try { u = new URL(row.destination); } catch { return send(res, 200, memoryPage('', 'an unknown site', row.title, false)); }
  const trusted = u.protocol === 'https:' && allowed(u.hostname.toLowerCase().replace(/^www\./, ''));
  return send(res, 200, memoryPage(u.href, u.hostname, row.title, trusted));
}
