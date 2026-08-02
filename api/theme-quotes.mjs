// Serverless proxy: album theme text → short, ORIGINAL themed quote lines.
// Guarantees: the Anthropic key stays server-side, the response is always
// HTTP 200 with a `source` discriminator, and a missing key degrades instead
// of failing. Text-only — NO photos ever touch this endpoint (photos stay on
// the device by design).
//
// The client owns the FALLBACK (the 66 curated lines in builder/themeQuotes.ts),
// so an empty `quotes` array here is a valid, expected answer: the caller shows
// its curated set for the closest matching theme instead.

import { rejectIfAbusive } from './_guard.mjs';

const KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

/** Hard ceiling on a printed caption line. A caption band is ~14% of page
 *  height; past this a line either wraps to three rows or has to be shrunk to
 *  the point it stops reading as a design element. Enforced here AND on the
 *  client so a prompt regression can't reach the page. */
const MAX_QUOTE_CHARS = 46;
const MIN_QUOTE_CHARS = 6;
const MAX_QUOTES = 12;

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

function clean(arr) {
  const out = [];
  for (const raw of arr) {
    if (typeof raw !== 'string') continue;
    const line = raw.trim().replace(/\s+/g, ' ').replace(/^["'“”]+|["'“”]+$/g, '');
    if (line.length < MIN_QUOTE_CHARS || line.length > MAX_QUOTE_CHARS) continue;
    if (unsafe(line)) continue;
    if (out.some((x) => x.toLowerCase() === line.toLowerCase())) continue;
    out.push(line);
    if (out.length >= MAX_QUOTES) break;
  }
  return out;
}

async function haikuQuotes(theme) {
  const prompt =
    'You write short ORIGINAL caption lines for a printed photo album.\n' +
    'Given the album theme below, reply with ONLY a JSON array of 8 to 12 lines.\n' +
    'Rules:\n' +
    '- Each line is ORIGINAL writing by you. Never quote or paraphrase song lyrics, ' +
    'poems, scripture, films, or any famous quotation.\n' +
    '- No attributions, no author names, no quotation marks, no citations.\n' +
    '- At most ' + MAX_QUOTE_CHARS + ' characters per line. Short is better.\n' +
    '- Warm, timeless, and specific to the theme. No hashtags, no emoji.\n' +
    '- No names of real people or places unless the theme itself names them.\n' +
    'Example theme "Marriage" -> ["I am yours, and you are mine","Two hearts, one journey",' +
    '"The beginning of always","Every day, I choose you"]. No prose, JSON array only.\n\n' +
    'Theme: "' + String(theme).slice(0, 200) + '"';
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 500, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!resp.ok) throw new Error('anthropic ' + resp.status);
  const data = await resp.json();
  const text = (data.content || []).map((b) => b.text || '').join('');
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) throw new Error('no array');
  return clean(JSON.parse(m[0]));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  // Abuse guard: this endpoint spends money per call, so throttle before we do.
  if (rejectIfAbusive(req, res)) return;
  let theme = '';
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    theme = String(body.theme || '').trim().slice(0, 200);
  } catch { /* ignore */ }
  if (!theme) { res.status(200).json({ quotes: [], source: 'empty' }); return; }
  // No key configured → the client falls back to its curated corpus for $0.
  if (!KEY) { res.status(200).json({ quotes: [], source: 'fallback' }); return; }

  try {
    const quotes = await haikuQuotes(theme);
    res.status(200).json({ quotes, source: quotes.length ? 'haiku' : 'fallback' });
  } catch (e) {
    // Degrade to the client's curated corpus (unchanged), but don't swallow the
    // cause — an Anthropic outage / auth / rate-limit fault was otherwise silent.
    console.error(JSON.stringify({ fn: 'theme-quotes', event: 'anthropic_failure', msg: e instanceof Error ? e.message : String(e) }));
    res.status(200).json({ quotes: [], source: 'fallback-after-error' });
  }
}
