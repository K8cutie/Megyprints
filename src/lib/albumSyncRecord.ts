/* ══════════════════════════════════════════════════════════════════════════
   albumSyncRecord — which cloud version of an album THIS device works from.

   The same album open on a phone and a laptop: the laptop changed page 4 and
   saved; the phone reloaded, opened its own older copy without a word, and
   saved it over the laptop's — the laptop's change was gone (1-star testers
   round 2, TD-3). Last save won.

   Now each device remembers, per album, the cloud version it last saved or
   opened (`base`, the row's updated_at — set by the database) and what the
   album held then (`key`). A save only lands on that same version
   (useAlbumSync.save), and on opening the album or coming back to the app the
   device asks the cloud first (decideSync):
     • the cloud moved on and nothing changed here → take the newer version;
     • both changed → ask which to keep, never pick silently.
   Photos are never part of this — only the light album row.
   ══════════════════════════════════════════════════════════════════════════ */

export const SYNC_STORAGE_KEY = 'megy-album-sync-v1';
/** Albums remembered per device; the oldest are forgotten first. */
const MAX_RECORDS = 30;

export interface SyncRecord {
  albumId: string;
  /** The cloud row's updated_at for the version this device last saved or
   *  opened, exactly as the database returned it. */
  base: string | null;
  /** albumContentKey of the album as it was at `base` on this device. */
  key: string;
  /** Key of a save sent but not (yet) acknowledged: when the app closes
   *  mid-save, the cloud may hold it — it is still this device's own work. */
  sentKey?: string;
  /** When this record was written (ms), for forgetting the oldest. */
  at?: number;
}

type RecordMap = Record<string, SyncRecord>;

function readAll(): RecordMap {
  try {
    const raw = localStorage.getItem(SYNC_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as RecordMap : {};
  } catch {
    return {};
  }
}

export function readSyncRecord(albumId: string | undefined): SyncRecord | null {
  if (!albumId) return null;
  const rec = readAll()[albumId];
  return rec && rec.albumId === albumId && typeof rec.key === 'string' ? rec : null;
}

export function writeSyncRecord(rec: SyncRecord): void {
  try {
    const all = readAll();
    all[rec.albumId] = { ...rec, at: Date.now() };
    const ids = Object.keys(all);
    if (ids.length > MAX_RECORDS) {
      ids.sort((a, b) => (all[a].at ?? 0) - (all[b].at ?? 0))
        .slice(0, ids.length - MAX_RECORDS)
        .forEach((id) => { delete all[id]; });
    }
    localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(all));
  } catch { /* storage full or blocked: saves still never overwrite blindly */ }
}

/* ── What the album holds ── */

/** The parts of an albums row (or a row about to be written) that ARE the
 *  album: not its thumbnail (cover_photo, a screenshot) or its timestamps. */
export function rowContent(row: Record<string, unknown>): Record<string, unknown> {
  return {
    title: row.title ?? null,
    album_size: row.album_size ?? null,
    pages: row.pages ?? [],
    photos: row.photos ?? [],
    cover_front: row.cover_front ?? null,
    occasion: row.occasion || null,
    photos_per_page: row.photos_per_page ?? null,
  };
}

/** JSON with object keys sorted (the database hands jsonb back in its own key
 *  order), and this-session-only blob: URLs reduced to "blob:" (a cover photo
 *  from this device's photo store gets a new one every visit). */
function stableJson(v: unknown): string {
  if (typeof v === 'string') return JSON.stringify(v.startsWith('blob:') ? 'blob:' : v);
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined || typeof x === 'function' ? 'null' : stableJson(x))).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort()
      .filter((k) => o[k] !== undefined && typeof o[k] !== 'function')
      .map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`).join(',')}}`;
  }
  if (typeof v === 'number' && !Number.isFinite(v)) return 'null';
  return v === undefined ? 'null' : JSON.stringify(v);
}

/** cyrb53 — a fast 53-bit string hash; plenty to tell two albums apart. */
function hash53(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** One short string for what an album row holds — equal for the same album
 *  however it travelled (sent, stored as jsonb, read back). */
export function albumContentKey(row: Record<string, unknown>): string {
  // Round-trip through JSON first: what is stored is what JSON keeps.
  const content = JSON.parse(JSON.stringify(rowContent(row)));
  return hash53(stableJson(content));
}

/* ── Which version wins ── */

export type SyncDecision =
  /** The cloud is the version this device has. */
  | 'in-sync'
  /** The cloud moved on, but to this device's own work (the same album, or a
   *  save that landed as the app closed): adopt its version, nothing to ask. */
  | 'ours'
  /** Changed on another device, nothing changed here since: open that one. */
  | 'take-cloud'
  /** Changed on another device AND here: ask which to keep. */
  | 'conflict'
  /** No record (a draft from before this) and this device changed the album
   *  after the cloud copy was saved: keep it, it saves over as it always did. */
  | 'keep-local';

export function decideSync(input: {
  rec: SyncRecord | null;
  cloudUpdatedAt: string;
  /** albumContentKey of the cloud row — only read when the version moved. */
  cloudKey: string;
  /** albumContentKey of the album on this device now. */
  localKey: string;
  /** When the album last changed on this device (ms; 0 unknown). */
  localEditedAt: number;
}): SyncDecision {
  const { rec, cloudUpdatedAt, cloudKey, localKey, localEditedAt } = input;
  if (rec?.base && rec.base === cloudUpdatedAt) return 'in-sync';
  if (cloudKey === localKey) return 'ours';
  if (rec?.sentKey && cloudKey === rec.sentKey) return 'ours';
  if (rec?.base) return localKey === rec.key ? 'take-cloud' : 'conflict';
  // No known version (a draft from before this, or a first save that never
  // got its reply): this device can't tell what it changed since. When the
  // cloud copy was saved after the last change here, ask; otherwise keep this.
  const cloudAt = Date.parse(cloudUpdatedAt) || 0;
  return cloudAt > localEditedAt ? 'conflict' : 'keep-local';
}

/* ── What the customer is told ── */

/** "at 2:41 PM" today, "on Oct 4, 2:41 PM" before. */
export function savedWhen(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return d.toDateString() === now.toDateString()
    ? `at ${time}`
    : `on ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

export function conflictMessage(updatedAt: string, now = new Date()): string {
  const when = savedWhen(updatedAt, now);
  return `This album was also changed on another device${when ? ` (saved ${when})` : ''}. Which version do you want to keep? The one you don't keep is replaced.`;
}
