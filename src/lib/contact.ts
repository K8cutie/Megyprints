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

/** A usable delivery address: 10–500 chars after normalization. Used as the
 *  length backstop on the COMPOSED address string (see composeAddress). */
export function isValidAddress(raw: string): boolean {
  const a = normalizeAddress(raw);
  return a.length >= 10 && a.length <= 500;
}

/* ── Structured PH delivery address ────────────────────────────────────────
   Captured via cascading PSGC pickers (region→province→city→barangay) + a
   free-text street line + ZIP, so every order has a real, routable location
   instead of a free-text blob a courier can't act on. */
export interface AddressValue {
  regionCode: string; regionName: string;
  provinceCode: string; provinceName: string;
  cityCode: string; cityName: string;
  barangayCode: string; barangayName: string;
  street: string; // house/unit no. + street
  zip: string;    // 4-digit PH ZIP
}

export const EMPTY_ADDRESS: AddressValue = {
  regionCode: '', regionName: '', provinceCode: '', provinceName: '',
  cityCode: '', cityName: '', barangayCode: '', barangayName: '', street: '', zip: '',
};

export const normalizeStreet = (raw: string): string => raw.replace(/\s+/g, ' ').trim();

export const isValidZip = (zip: string): boolean => /^\d{4}$/.test((zip || '').trim());

/** Per-field validation for the UI. Empty object = valid. */
export function validateAddress(a: AddressValue): Partial<Record<keyof AddressValue, string>> {
  const e: Partial<Record<keyof AddressValue, string>> = {};
  if (!a.regionCode) e.regionCode = 'Select a region.';
  if (!a.provinceCode) e.provinceCode = 'Select a province.';
  if (!a.cityCode) e.cityCode = 'Select a city / municipality.';
  if (!a.barangayCode) e.barangayCode = 'Select a barangay.';
  const st = normalizeStreet(a.street);
  if (st.length < 3) e.street = 'Enter house/unit no. and street.';
  else if (st.length > 120) e.street = 'Street is too long (max 120).';
  if (!isValidZip(a.zip)) e.zip = 'Enter a 4-digit ZIP code.';
  return e;
}

export const isValidStructuredAddress = (a: AddressValue): boolean =>
  Object.keys(validateAddress(a)).length === 0;

/** Canonical single-line address stored on the order (street → barangay → city
 *  → province → ZIP). Region is kept in structured storage but omitted here, per
 *  PH addressing convention. */
export function composeAddress(a: AddressValue): string {
  const parts = [
    normalizeStreet(a.street),
    a.barangayName ? `Brgy. ${a.barangayName}` : '',
    a.cityName,
    a.provinceName,
  ].filter(Boolean);
  const line = parts.join(', ');
  return a.zip ? `${line} ${a.zip.trim()}` : line;
}
