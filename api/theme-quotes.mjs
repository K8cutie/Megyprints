// Serverless proxy: album theme text → short, ORIGINAL themed quote lines.
// Guarantees: the Anthropic key stays server-side, the response is always
// HTTP 200 with a `source` discriminator, and a missing key degrades instead
// of failing. Text-only — NO photos ever touch this endpoint (photos stay on
// the device by design).
//
// The client owns the FALLBACK (the curated lines in builder/themeQuotes.ts),
// so an empty `quotes` array here is a valid, expected answer: the caller shows
// its curated set for the closest matching theme instead.
//
// Request body: { theme, count?, avoid? }
//   count — how many lines this call should return (default 25, max 60/call).
//   avoid — lines the caller already holds for this theme. They are sent back
//           to the model as "do not reuse" AND filtered here, so a TOP-UP call
//           yields fresh lines instead of the same 25 again. The client sizes
//           its pool to the ALBUM (one line per caption box, never repeated),
//           so an 80-page album asks for ~80 lines across 2 calls rather than
//           running dry halfway through — that was a live bug on 2026-09-09.

import { rejectIfAbusive } from './_guard.mjs';

const KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

/** Hard ceiling on a printed caption line. A caption band is ~14% of page
 *  height; past this a line either wraps to three rows or has to be shrunk to
 *  the point it stops reading as a design element. Enforced here AND on the
 *  client so a prompt regression can't reach the page. */
export const MAX_QUOTE_CHARS = 46;
const MIN_QUOTE_CHARS = 6;
/** Default lines per call (the owner's original 25-line pool size, 2026-08-12)
 *  and the per-call ceiling. One call cannot cover a big album by itself —
 *  the client tops up in batches, each carrying the lines it already has in
 *  `avoid` — so the ceiling bounds one call's token spend, not the album. */
export const DEFAULT_COUNT = 25;
export const MAX_COUNT = 60;
/** Cap on the avoid list we forward to the model (≈ 200 × 46 chars ≈ 2.5k
 *  input tokens — a fraction of a cent). The client sends its newest lines. */
export const MAX_AVOID = 200;

/** Lines we refuse to print. The curated corpus is deliberately brand-safe and
 *  non-copyrighted; a generative source must not undo that on a product the
 *  customer pays to have printed and cannot recall. Rejects attributions
 *  ("— Anyone"), scripture-style citations (John 3:16), and quoted excerpts. */
function unsafe(line) {
  return (
    // A trailing attribution: "... — Paul", "... - Maya Angelou". Anchored to the
    // end so an ordinary mid-line dash ("us - together always") is not caught.
    /\s[—–-]\s*[A-Z][\w.'-]*(\s+[A-Z][\w.'-]*)*\s*$/.test(line) ||
    /\b\d?\s?[A-Z][a-z]+\s+\d+:\d+/.test(line) ||       // "John 3:16", "1 Cor 13:4"
    /["“”].*["“”]/.test(line) ||                        // a quoted excerpt
    /\b(lyrics?|song|copyright|verse|chapter)\b/i.test(line)
  );
}

const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Filter model output down to printable, unique, not-already-held lines.
 *  Exported for the spec; pure. */
export function clean(arr, { count = DEFAULT_COUNT, avoid = [] } = {}) {
  const seen = new Set(avoid.map(norm));
  const out = [];
  for (const raw of arr) {
    if (typeof raw !== 'string') continue;
    const line = raw.trim().replace(/\s+/g, ' ').replace(/^["'“”]+|["'“”]+$/g, '');
    if (line.length < MIN_QUOTE_CHARS || line.length > MAX_QUOTE_CHARS) continue;
    if (unsafe(line)) continue;
    const k = norm(line);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(line);
    if (out.length >= count) break;
  }
  return out;
}

async function haikuQuotes(theme, count, avoid) {
  // Ask for a few more than needed so the safety/length filters and the avoid
  // list still leave a full batch.
  const ask = Math.min(count + 5, MAX_COUNT + 10);
  const prompt =
    'You write short ORIGINAL caption lines for a printed photo album.\n' +
    'Given the album theme below, reply with ONLY a JSON array of ' + ask + ' lines.\n' +
    'Rules:\n' +
    '- Each line is ORIGINAL writing by you. Never quote or paraphrase song lyrics, ' +
    'poems, scripture, films, or any famous quotation.\n' +
    '- No attributions, no author names, no quotation marks, no citations.\n' +
    '- At most ' + MAX_QUOTE_CHARS + ' characters per line. Short is better.\n' +
    '- Warm, timeless, and specific to the theme. No hashtags, no emoji.\n' +
    '- No names of real people or places unless the theme itself names them.\n' +
    '- Every line must differ clearly from every other line in wording and idea.\n' +
    (avoid.length
      ? '- The album ALREADY uses these lines. Do NOT repeat or lightly reword any of them:\n' +
        JSON.stringify(avoid) + '\n'
      : '') +
    'Example theme "Marriage" -> ["I am yours, and you are mine","Two hearts, one journey",' +
    '"The beginning of always","Every day, I choose you"]. No prose, JSON array only.\n\n' +
    'Theme: "' + String(theme).slice(0, 200) + '"';
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      // ~20 output tokens per line plus JSON overhead; sized to the ask so a
      // 60-line batch is never truncated mid-array (which would parse as
      // "no array" and fall back to curated).
      max_tokens: 300 + ask * 25,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!resp.ok) throw new Error('anthropic ' + resp.status);
  const data = await resp.json();
  const text = (data.content || []).map((b) => b.text || '').join('');
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) throw new Error('no array');
  return clean(JSON.parse(m[0]), { count, avoid });
}

/** Parse + clamp the request body. Exported for the spec; pure. */
export function parseBody(body) {
  let b = {};
  try { b = typeof body === 'string' ? JSON.parse(body || '{}') : (body || {}); } catch { b = {}; }
  const theme = String(b.theme || '').trim().slice(0, 200);
  const n = Number(b.count);
  const count = Number.isFinite(n) ? Math.min(MAX_COUNT, Math.max(1, Math.floor(n))) : DEFAULT_COUNT;
  const avoid = Array.isArray(b.avoid)
    ? b.avoid
        .filter((s) => typeof s === 'string')
        .map((s) => s.trim().slice(0, MAX_QUOTE_CHARS + 4))
        .filter(Boolean)
        .slice(-MAX_AVOID)
    : [];
  return { theme, count, avoid };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  // Abuse guard: this endpoint spends money per call, so throttle before we do.
  if (rejectIfAbusive(req, res)) return;
  const { theme, count, avoid } = parseBody(req.body);
  if (!theme) { res.status(200).json({ quotes: [], source: 'empty' }); return; }
  // No key configured → the client falls back to its curated corpus for $0.
  if (!KEY) { res.status(200).json({ quotes: [], source: 'fallback' }); return; }

  try {
    const quotes = await haikuQuotes(theme, count, avoid);
    res.status(200).json({ quotes, source: quotes.length ? 'haiku' : 'fallback' });
  } catch (e) {
    // Degrade to the client's curated corpus (unchanged), but don't swallow the
    // cause — an Anthropic outage / auth / rate-limit fault was otherwise silent.
    console.error(JSON.stringify({ fn: 'theme-quotes', event: 'anthropic_failure', msg: e instanceof Error ? e.message : String(e) }));
    res.status(200).json({ quotes: [], source: 'fallback-after-error' });
  }
}
