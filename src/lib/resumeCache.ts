/* ══════════════════════════════════════════════════════════════════════════
   resumeCache — the customer's latest albums, remembered on this device, so
   "Welcome back" can be the FIRST thing they see when they open the app
   (owner, 2026-10-11), not a box that pops up over Home once the albums
   have loaded from the account.

   Only names, dates and photo counts: no pictures (the album draft lives in
   this same storage and must keep its room). The account's list is fetched
   again on every visit and replaces this. Gone when the account signs out
   (authContext), so a shared device never shows one person's album names to
   the next.
   ══════════════════════════════════════════════════════════════════════════ */

import type { SavedAlbumSummary } from './resumeOffer';

export const RESUME_CACHE_KEY = 'megy-resume-albums';
/** A few more than the prompt lists, in case some turn out to be empty. */
const KEEP = 5;

interface ResumeCache {
  userId: string;
  albums: SavedAlbumSummary[];
}

/** The albums remembered for this account; null when none are remembered for it. */
export function readResumeCache(userId: string): SavedAlbumSummary[] | null {
  try {
    const raw = localStorage.getItem(RESUME_CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Partial<ResumeCache>;
    if (c.userId !== userId || !Array.isArray(c.albums)) return null;
    return c.albums
      .filter((a): a is SavedAlbumSummary => !!a && typeof a.id === 'string')
      .map((a) => ({
        id: a.id,
        ...(typeof a.title === 'string' ? { title: a.title } : {}),
        ...(typeof a.updatedAt === 'string' ? { updatedAt: a.updatedAt } : {}),
        ...(typeof a.photoCount === 'number' ? { photoCount: a.photoCount } : {}),
        ...(typeof a.sampleMadeAt === 'number' ? { sampleMadeAt: a.sampleMadeAt } : {}),
      }));
  } catch {
    return null;
  }
}

/** Remember the account's latest albums (newest first), without their pictures. */
export function writeResumeCache(userId: string, albums: SavedAlbumSummary[]): void {
  const time = (iso?: string) => (iso ? Date.parse(iso) || 0 : 0);
  const keep = [...albums]
    .sort((a, b) => time(b.updatedAt) - time(a.updatedAt))
    .slice(0, KEEP)
    // A sample album's day too (lib/samplePhotos): one number, not its photos.
    .map(({ id, title, updatedAt, photoCount, sampleMadeAt }) => ({ id, title, updatedAt, photoCount, ...(typeof sampleMadeAt === 'number' ? { sampleMadeAt } : {}) }));
  try {
    localStorage.setItem(RESUME_CACHE_KEY, JSON.stringify({ userId, albums: keep } satisfies ResumeCache));
  } catch { /* full or private mode: the prompt just waits for the account */ }
}

/** This device last heard the account has no albums at all (whose account is
 *  not known yet when this is read, before the session is checked). */
export function rememberedNoAlbums(): boolean {
  try {
    const raw = localStorage.getItem(RESUME_CACHE_KEY);
    if (!raw) return false;
    const c = JSON.parse(raw) as Partial<ResumeCache>;
    return Array.isArray(c.albums) && c.albums.length === 0;
  } catch {
    return false;
  }
}

/** Signing out forgets them. */
export function forgetResumeCache(): void {
  try { localStorage.removeItem(RESUME_CACHE_KEY); } catch { /* private mode */ }
}

/** Is a signed-in session kept on this device? (The sign-in library keeps it
 *  under "sb-…-auth-token".) Read before the session is checked, so the app
 *  knows to hold Home back for a moment instead of flashing it. */
export function hasStoredSession(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /^sb-.+-auth-token$/.test(k)) return true;
    }
  } catch { /* private mode */ }
  return false;
}
