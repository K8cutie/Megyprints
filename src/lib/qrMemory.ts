/* ── QR "living memory" — shared client helpers ────────────────────────────
   A QR slot's printed code always encodes a STABLE Megyprints URL
   (`${MEMORY_BASE}/m/${code}`), never the raw destination — so the destination
   can be re-pointed later (in qr_memories) without reprinting the album. */
import QRCode from 'qrcode';

/** Canonical origin that serves /m/:code (the Vercel serverless resolver).
 *  Frozen per-QR into QrFill.memoryUrl at add-time; overridable via env so a
 *  custom domain can be set without touching printed codes. */
export const MEMORY_BASE: string =
  (import.meta.env.VITE_MEMORY_BASE as string | undefined)?.replace(/\/+$/, '') ||
  'https://megyprints.vercel.app';

/** The stable, printable memory URL for a code. */
export const memoryUrl = (code: string): string => `${MEMORY_BASE}/m/${code}`;

/** For a YouTube/Vimeo destination, the player-embed URL (+ a portrait flag for
 *  Shorts) — used to PREVIEW the attached video inline in the builder. Mirrors
 *  the resolver's parser (api/m.mjs). null when not an embeddable video link. */
export function videoEmbedInfo(raw: string): { src: string; portrait: boolean } | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  const host = u.hostname.toLowerCase().replace(/^www\.|^m\./, '');
  const yt = (id: string, portrait: boolean) =>
    (/^[\w-]{6,15}$/.test(id) ? { src: `https://www.youtube-nocookie.com/embed/${id}`, portrait } : null);
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

// Unambiguous lowercase alphabet (a–z minus l/o) + digits 2–9 — matches the
// resolver's ^[a-z2-9]{4,32}$ guard and avoids visually confusable characters.
const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

/** Mint a random ~40-bit code (8 chars) using the crypto RNG. */
export function mintCode(len = 8): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** Contain-fit a square QR centered in a slot rect. Used by ALL THREE renderers
 *  (PageView, Fabric, print) so the QR can never desync between them. */
export function qrRect(sx: number, sy: number, sw: number, sh: number) {
  const side = Math.min(sw, sh);
  return { dx: sx + (sw - side) / 2, dy: sy + (sh - side) / 2, side };
}

/** Destination hosts we allow a memory to point at. This is UX-only guidance —
 *  the SERVER (api/m.mjs) enforces the authoritative allowlist; a client check
 *  can't stop a direct API write. Keep the two lists in sync. */
export const ALLOWED_HOSTS = [
  'youtube.com', 'youtu.be', 'youtube-nocookie.com', 'vimeo.com',
  'open.spotify.com', 'spotify.com', 'instagram.com', 'facebook.com',
  'tiktok.com', 'drive.google.com', 'photos.google.com', 'megyprints.app',
];

/** Validate + normalize a destination URL for a memory. Returns {url} or {error}. */
export function validateDestination(raw: string): { url: string } | { error: string } {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return { error: 'Enter a full link, e.g. https://youtu.be/…' }; }
  if (u.protocol !== 'https:') return { error: 'Link must start with https://' };
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const ok = ALLOWED_HOSTS.some((d) => host === d || host.endsWith('.' + d));
  if (!ok) return { error: 'Supported: YouTube, Vimeo, Spotify, Instagram, Facebook, TikTok, Google Drive/Photos.' };
  return { url: u.toString() };
}

/** Generate a print-crisp QR as a PNG data-URL encoding the memory URL.
 *  PNG (not SVG) so it rasterizes at canvas/print resolution; error level Q +
 *  margin ≥4 (quiet zone) + pure B/W = reliable scanning off glossy/matte. */
export function generateQrPngDataUrl(memUrl: string, targetPx = 900): Promise<string> {
  return QRCode.toDataURL(memUrl, {
    errorCorrectionLevel: 'Q',
    margin: 4,
    width: targetPx,
    color: { dark: '#000000', light: '#ffffff' },
  });
}
