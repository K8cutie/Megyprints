/* ── Contact-field normalization + validation ──────────────────────────────
   Keep shipping details database-friendly: trimmed, whitespace-collapsed, and
   phone numbers canonicalized to E.164 (+639XXXXXXXXX) so every stored order
   has a consistent, searchable shape regardless of how the customer typed it. */

/** Trim + collapse internal whitespace. "  Juan   Dela  Cruz " → "Juan Dela Cruz". */
export function normalizeFullName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/** A real name: 2–80 chars and contains at least one letter (any script). */
export function isValidFullName(raw: string): boolean {
  const n = normalizeFullName(raw);
  return n.length >= 2 && n.length <= 80 && /\p{L}/u.test(n);
}

/**
 * Canonicalize a Philippine MOBILE number to E.164 (+639XXXXXXXXX).
 * Accepts the ways people actually type it — 0917…, +63 917…, 63917…,
 * 9171234567 — with spaces, dashes, or parentheses. Returns null when the
 * input can't be a valid PH mobile (so callers can reject it).
 */
export function normalizePHPhone(raw: string): string | null {
  let d = raw.replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (d.startsWith('63')) d = d.slice(2);        // country code
  else if (d.startsWith('0')) d = d.slice(1);    // national trunk 0
  // PH mobile subscriber number is 10 digits starting with 9.
  if (!/^9\d{9}$/.test(d)) return null;
  return '+63' + d;
}

/** Pretty display of a canonical number: +639171234567 → "+63 917 123 4567". */
export function formatPHPhoneDisplay(e164: string): string {
  const m = /^\+63(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `+63 ${m[1]} ${m[2]} ${m[3]}` : e164;
}

/** Trim each line, collapse runs of spaces, and cap blank runs to one. */
export function normalizeAddress(raw: string): string {
  return raw
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** A usable delivery address: 10–500 chars after normalization. */
export function isValidAddress(raw: string): boolean {
  const a = normalizeAddress(raw);
  return a.length >= 10 && a.length <= 500;
}
