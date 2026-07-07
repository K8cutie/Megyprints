// Serverless proxy: album theme text → clip-art SEARCH KEYWORDS.
// Holds the Anthropic key server-side (never in the browser). If Haiku is
// configured it turns a messy natural-language theme ("our Palawan beach
// birthday trip") into clean single-word search terms; if not, it falls back to
// a dumb-but-useful word split so the feature still works for $0. Text-only —
// NO photos ever touch this endpoint (photos stay on the device by design).

const KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

const STOP = new Set([
  'the', 'a', 'an', 'our', 'my', 'your', 'their', 'his', 'her', 'of', 'in', 'on', 'at', 'for',
  'and', 'or', 'to', 'with', 'is', 'was', 'this', 'that', 'these', 'those', 'we', 'i', 'me',
  'album', 'photo', 'photos', 'picture', 'pictures', 'memory', 'memories', 'trip', 'day', 'days',
  'first', 'th', 'st', 'nd', 'rd', 'year', 'years', 'time', 'special', 'theme',
]);

/** Cheap fallback: content words from the theme text, deduped, capped. */
function splitKeywords(theme) {
  const words = String(theme).toLowerCase().match(/[a-z]+/g) || [];
  const out = [];
  for (const w of words) {
    if (w.length < 3 || STOP.has(w) || out.includes(w)) continue;
    out.push(w);
    if (out.length >= 10) break;
  }
  return out;
}

async function haikuKeywords(theme) {
  const prompt =
    'You pick decorative clip-art / vector-icon SEARCH KEYWORDS for a photo album.\n' +
    'Given the album theme below, reply with ONLY a JSON array of 6 to 12 short, ' +
    'lowercase, SINGLE common English words (occasionally a simple two-word term) ' +
    'that an icon library would match — concrete objects/symbols, not adjectives or ' +
    'proper nouns. Example theme "our Palawan beach birthday" -> ["beach","palm tree",' +
    '"seashell","sun","balloon","cake","gift","boat"]. No prose, JSON array only.\n\n' +
    'Theme: "' + String(theme).slice(0, 200) + '"';
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 200, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!resp.ok) throw new Error('anthropic ' + resp.status);
  const data = await resp.json();
  const text = (data.content || []).map((b) => b.text || '').join('');
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) throw new Error('no array');
  const arr = JSON.parse(m[0]);
  return arr
    .filter((x) => typeof x === 'string')
    .map((x) => x.toLowerCase().trim())
    .filter((x) => x && x.length <= 20)
    .slice(0, 12);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  let theme = '';
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    theme = String(body.theme || '').trim();
  } catch { /* ignore */ }
  if (!theme) { res.status(200).json({ keywords: [], source: 'empty' }); return; }

  const fallback = splitKeywords(theme);
  if (!KEY) { res.status(200).json({ keywords: fallback, source: 'fallback' }); return; }

  try {
    const kws = await haikuKeywords(theme);
    // Merge AI keywords with the fallback (dedup) so we never return fewer.
    const merged = [...new Set([...kws, ...fallback])].slice(0, 12);
    res.status(200).json({ keywords: merged.length ? merged : fallback, source: 'haiku' });
  } catch {
    res.status(200).json({ keywords: fallback, source: 'fallback-after-error' });
  }
}
