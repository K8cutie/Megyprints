/* ══════════════════════════════════════════════════════════════════════════
   WHICH POST AN ORDER CAME FROM (0063)

   A link in a post can carry a short tag: megyprints…/?p=xmas-01. Opening it
   keeps the tag on this device, and an order placed in the next 30 days
   carries it in orders.source, so the owner can see which posts bring orders.

   It is a note for the owner, nothing more. It never changes a price, and a
   missing, old or malformed tag only means the order has no source. It counts
   the people who tapped a tagged link on this device; someone who saw the post
   and typed the address later is not counted.
   ══════════════════════════════════════════════════════════════════════════ */

/** The address-bar name a post's link uses: ?p=TAG. */
export const SOURCE_PARAM = 'p';
/** Where this device keeps the tag of the last tagged link it opened. */
export const SOURCE_KEY = 'megy-order-source';
/** How long a tag counts after the link was opened. */
export const SOURCE_WINDOW_DAYS = 30;
/** A tag: lower-case letters, digits and hyphens, 1 to 40 characters.
 *  Keep in step with orders_source() in migration 0063. */
export const SOURCE_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;

const DAY_MS = 86_400_000;

interface StoredSource { tag: string; at: number }

/** A tag as the database keeps it, or null when it isn't one. */
export function normalizeSource(raw: string | null | undefined): string | null {
  const tag = (raw ?? '').trim().toLowerCase();
  return SOURCE_PATTERN.test(tag) ? tag : null;
}

/** The ?p= tag in a URL: before the # or inside the #/route?query. */
export function sourceFromUrl(search: string, hash: string): string | null {
  const read = (q: string) => {
    try { return new URLSearchParams(q).get(SOURCE_PARAM); } catch { return null; }
  };
  const qAt = hash.indexOf('?');
  return normalizeSource(read(search) ?? (qAt >= 0 ? read(hash.slice(qAt)) : null));
}

/** Keep the tag of the link this visit came from, and tidy it out of the
 *  address bar (a link the visitor copies shouldn't carry the post's tag).
 *  The last tagged link opened wins. A visit without a tag changes nothing. */
export function captureOrderSource(now: number = Date.now()): string | null {
  if (typeof window === 'undefined') return null;
  const tag = sourceFromUrl(window.location.search, window.location.hash);
  if (!tag) return null;
  try { localStorage.setItem(SOURCE_KEY, JSON.stringify({ tag, at: now } satisfies StoredSource)); } catch { /* private window */ }
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete(SOURCE_PARAM);
    const qAt = url.hash.indexOf('?');
    if (qAt >= 0) {
      const params = new URLSearchParams(url.hash.slice(qAt));
      params.delete(SOURCE_PARAM);
      const rest = params.toString();
      url.hash = url.hash.slice(0, qAt) + (rest ? `?${rest}` : '');
    }
    window.history.replaceState(window.history.state, '', url.toString());
  } catch { /* leave the address bar as it is */ }
  return tag;
}

/** The kept tag while it still counts, else null (and forgotten). */
export function storedOrderSource(now: number = Date.now()): string | null {
  let s: StoredSource | null = null;
  try { s = JSON.parse(localStorage.getItem(SOURCE_KEY) ?? 'null') as StoredSource | null; } catch { s = null; }
  if (!s || typeof s.tag !== 'string' || !SOURCE_PATTERN.test(s.tag) || !Number.isFinite(s.at)) return null;
  if (now - s.at > SOURCE_WINDOW_DAYS * DAY_MS) {
    try { localStorage.removeItem(SOURCE_KEY); } catch { /* ignore */ }
    return null;
  }
  return s.tag;
}

/** The app can reach a database without orders.source (a deploy lands before
 *  db:push). PostgREST then refuses the WHOLE order over that one column:
 *  PGRST204 ("Could not find the 'source' column of 'orders' in the schema
 *  cache") or 42703. The order is then sent again without the tag. */
export function isMissingSourceColumn(err: { code?: string | null; message?: string | null } | null | undefined): boolean {
  return !!err
    && (err.code === 'PGRST204' || err.code === '42703')
    && /['"]source['"]/.test(err.message ?? '');
}
