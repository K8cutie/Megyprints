// The filter every AI-written caption line passes before it can be printed.
// Moved here from api/theme-quotes.mjs when that endpoint was deleted
// (2026-10-27): it needed no sign-in, had no daily cap, and the app had
// stopped calling it (DEAL_BANK_QUOTES off since 2026-10-21). photo-quotes is
// the one caller now. The "_" name keeps Vercel from deploying this file as a
// function of its own.

/** Hard ceiling on a printed caption line. A caption band is ~14% of page
 *  height; past this a line either wraps to three rows or has to be shrunk to
 *  the point it stops reading as a design element. Enforced here AND on the
 *  client so a prompt regression can't reach the page. */
export const MAX_QUOTE_CHARS = 46;
const MIN_QUOTE_CHARS = 6;
const DEFAULT_COUNT = 25;

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
 *  `max` is the longest line kept: the caption cap by default; photo-quotes
 *  passes the room of the box it writes for. Pure. */
export function clean(arr, { count = DEFAULT_COUNT, avoid = [], max = MAX_QUOTE_CHARS } = {}) {
  const seen = new Set(avoid.map(norm));
  const out = [];
  for (const raw of arr) {
    if (typeof raw !== 'string') continue;
    const line = raw.trim().replace(/\s+/g, ' ').replace(/^["'“”]+|["'“”]+$/g, '');
    if (line.length < MIN_QUOTE_CHARS || line.length > max) continue;
    if (unsafe(line)) continue;
    const k = norm(line);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(line);
    if (out.length >= count) break;
  }
  return out;
}
