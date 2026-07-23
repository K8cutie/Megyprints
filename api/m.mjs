// Public QR "living memory" resolver — Vercel serverless function.
// A scanned /m/:code lands here (via the vercel.json rewrite). Resolves the code
// to its destination through the anon-only resolve_memory RPC (no table read, no
// service-role key), enforces a server-side host allowlist as the SOLE authority
// (the client allowlist is UX-only), and serves a branded memory page. Trusted
// hosts get a brief branded page then auto-forward; anything else gets a
// manual-click interstitial — never an auto-redirect off the allowlist.
import { createClient } from '@supabase/supabase-js';
import { guard } from './_guard.mjs';

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

const send = (res, status, html, frameSrc) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  // frameSrc is added ONLY for the video-embed page (a scoped allowlist of the
  // player hosts), so nothing else can ever be iframed into the resolver.
  res.setHeader('Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; "
    + (frameSrc ? `frame-src ${frameSrc}; ` : '')
    + "frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  res.end(html);
};

// Recognize a YouTube/Vimeo destination and return its player-embed src (+ a
// portrait flag for Shorts). Returns null for anything not safely embeddable.
const FRAME_SRC = 'https://www.youtube-nocookie.com https://player.vimeo.com';
function videoEmbed(u) {
  const host = u.hostname.toLowerCase().replace(/^www\.|^m\./, '');
  const yt = (id, portrait) => (/^[\w-]{6,15}$/.test(id)
    ? { src: `https://www.youtube-nocookie.com/embed/${id}`, portrait } : null);
  if (host === 'youtu.be') return yt(u.pathname.slice(1).split('/')[0], false);
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const m = u.pathname.match(/^\/(embed|shorts|v)\/([\w-]{6,15})/);
    if (m) return yt(m[2], m[1] === 'shorts');
    return yt(u.searchParams.get('v') || '', false);
  }
  if (host === 'vimeo.com') {
    const id = (u.pathname.match(/\/(\d{6,})/) || [])[1];
    if (id) return { src: `https://player.vimeo.com/video/${id}`, portrait: false };
  }
  if (host === 'player.vimeo.com') {
    const id = (u.pathname.match(/\/video\/(\d{6,})/) || [])[1];
    if (id) return { src: `https://player.vimeo.com/video/${id}`, portrait: false };
  }
  return null;
}

// The premium path: the video plays INSIDE a branded Megyprints page (no dump to
// the YouTube app). Portrait ratio for Shorts. A fallback link covers videos
// whose owner disabled embedding.
const embedPage = (emb, watchHref, title) => {
  const heading = title ? esc(title) : 'Your memory';
  const ratio = emb.portrait ? '160%' : '56.25%';
  const maxW = emb.portrait ? 340 : 760;
  // Autoplay MUTED — mobile browsers block autoplay WITH sound, so the video
  // starts on its own silent and the viewer taps the player to unmute. YouTube
  // uses mute=1, Vimeo uses muted=1.
  const isYT = emb.src.includes('youtube');
  const params = isYT
    ? 'rel=0&playsinline=1&modestbranding=1&autoplay=1&mute=1'
    : 'autoplay=1&muted=1&playsinline=1';
  const src = esc(`${emb.src}?${params}`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Megy Prints — Memory</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;background:#1b1613;color:#FFFBF7;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;gap:14px}
  .brand{font-size:19px;font-weight:700}.brand span{color:#F4C2A1}
  .brand .dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#F4C2A1;margin-left:2px;vertical-align:middle}
  .ttl{font-size:15px;color:#E7D8CC;text-align:center;max-width:${maxW}px;line-height:1.4}
  .player{width:100%;max-width:${maxW}px;position:relative;padding-top:${ratio};
    border-radius:16px;overflow:hidden;background:#000;box-shadow:0 24px 60px rgba(0,0,0,.55)}
  .player iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
  .hint{font-size:13px;color:#E0CDBE;opacity:.9;display:flex;align-items:center;gap:6px}
  a.alt{color:#F4C2A1;font-size:12.5px;text-decoration:none;opacity:.85}
  .foot{font-size:12px;color:#8a7d74;margin-top:2px}
</style></head><body>
  <div class="brand">Megy<span>Prints</span><span class="dot"></span></div>
  <div class="ttl">${heading}</div>
  <div class="player"><iframe src="${src}" title="Memory video"
    allow="autoplay; accelerometer; encrypted-media; fullscreen; picture-in-picture" allowfullscreen loading="eager"></iframe></div>
  <div class="hint">🔇 Playing on mute — tap the video for sound</div>
  <a class="alt" href="${esc(watchHref)}" rel="noopener noreferrer">Trouble playing? Open the original ↗</a>
  <div class="foot">✨ An enhanced memory, made with Megyprints</div>
</body></html>`;
};

export default async function handler(req, res) {
  // Per-IP rate limit: resolve_memory bumps scan_count and is a code-enumeration
  // oracle, so cap scripted hammering here (the sole legit auto-forward path).
  // A human scanning printed QRs is nowhere near the limit; distinct scanners
  // are distinct IPs. On throttle, show the branded "unavailable" page.
  const g = guard(req);
  if (g) {
    if (g.retryAfter) res.setHeader('Retry-After', String(g.retryAfter));
    return send(res, g.status === 429 ? 429 : g.status, unavailable());
  }
  const code = String((req.query && req.query.code) || '').slice(0, 32);
  if (!/^[a-z2-9]{4,32}$/.test(code)) return send(res, 400, notFound());
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    // Log code only — NEVER the destination URL (a printed QR points at a private
    // family memory). A scanned QR landing on the branded unavailable page is
    // otherwise invisible; this is the only signal an env/DB fault ever happened.
    console.error(JSON.stringify({ fn: 'm', event: 'missing_env', code }));
    return send(res, 500, unavailable());
  }

  let row;
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON);
    const { data, error } = await sb.rpc('resolve_memory', { p_code: code });
    if (error) {
      console.error(JSON.stringify({ fn: 'm', event: 'resolve_memory_error', code, msg: error.message }));
      return send(res, 502, unavailable());
    }
    row = data && data[0];
  } catch (e) {
    console.error(JSON.stringify({ fn: 'm', event: 'resolve_exception', code, msg: e instanceof Error ? e.message : String(e) }));
    return send(res, 502, unavailable());
  }
  if (!row) return send(res, 404, notFound());

  let u;
  try { u = new URL(row.destination); } catch { return send(res, 200, memoryPage('', 'an unknown site', row.title, false)); }
  const trusted = u.protocol === 'https:' && allowed(u.hostname.toLowerCase().replace(/^www\./, ''));
  // Video platforms (YouTube/Vimeo) PLAY on the branded page; other trusted
  // hosts (Spotify, Drive, socials) still forward; untrusted → manual click.
  if (trusted) {
    const emb = videoEmbed(u);
    if (emb) return send(res, 200, embedPage(emb, u.href, row.title), FRAME_SRC);
  }
  return send(res, 200, memoryPage(u.href, u.hostname, row.title, trusted));
}
