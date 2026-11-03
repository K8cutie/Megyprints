/* ══════════════════════════════════════════════════════════════════════════
   MY MEMORIES' RULES (Phase 6): the QR "living memories" printed in your
   albums, as the website's My Memories page reads and changes them.

   The website keeps these rules in files that also hold browser-only code
   (qrMemories.ts reads its own database client; qrMemory.ts holds the QR
   maker; memoryClips.ts the video upload), so the app keeps this copy and
   test/memories.test.ts holds it to the website: the database calls run
   beside the website's own functions on a stand-in database, the pure rules
   word for word against the website's source.
   ══════════════════════════════════════════════════════════════════════════ */

/** A memory row, as the list reads it (qrMemories.ts QrMemoryRow). */
export interface QrMemoryRow {
  code: string;
  destination: string;
  title: string | null;
  scan_count: number;
  created_at: string;
  updated_at: string;
  /** 'clip' = a video kept by Megy Prints; 'link' = a pasted link. */
  kind?: 'link' | 'clip';
  /** End of the paid hosting term (videos only); null = no end. */
  expires_at?: string | null;
}

/** A longer term bought with an order not confirmed yet (qrMemories.ts PendingTerm). */
export interface PendingTerm { years: number; orderNumber: string }

type DbError = { message: string; code?: string } | null;
interface MemoriesDb {
  from(table: string): any; // eslint-disable-line @typescript-eslint/no-explicit-any
  auth: { getUser(): Promise<{ data: { user: { id: string } | null } }> };
}

/** listMemories: the signed-in owner's memories, newest first. */
export async function listMyMemories(client: MemoriesDb): Promise<QrMemoryRow[]> {
  const { data, error } = await client
    .from('qr_memories')
    .select('code,destination,title,scan_count,created_at,updated_at,kind,expires_at')
    .order('created_at', { ascending: false }) as { data: QrMemoryRow[] | null; error: DbError };
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** updateMemoryDestination: point a memory somewhere else (the printed QR
 *  stays the same). No row for the code (it was added while signed out):
 *  it is created now. */
export async function relinkMemory(client: MemoriesDb, code: string, destination: string): Promise<boolean> {
  const { data, error } = await client
    .from('qr_memories')
    .update({ destination })
    .eq('code', code)
    .select('code') as { data: { code: string }[] | null; error: DbError };
  if (error) return false;
  if (data && data.length > 0) return true;
  const { data: who } = await client.auth.getUser();
  const uid = who.user?.id ?? null;
  if (!uid) return false;
  const { error: insErr } = await client.from('qr_memories').insert({ code, user_id: uid, destination }) as { error: DbError };
  return !insErr;
}

/** memoryCodesInSnapshot: the codes in an order's frozen album. */
export function memoryCodesInSnapshot(snapshot: unknown): string[] {
  const pages = (snapshot as { pages?: unknown[] } | null)?.pages;
  if (!Array.isArray(pages)) return [];
  const codes = new Set<string>();
  for (const p of pages as Record<string, unknown>[]) {
    for (const f of [...((p?.qrFills ?? p?.qr_fills ?? []) as unknown[]), ...((p?.textSlotQr ?? p?.text_slot_qr ?? []) as unknown[])]) {
      const code = (f as { code?: unknown } | null)?.code;
      if (typeof code === 'string' && /^[a-z2-9]{4,32}$/.test(code)) codes.add(code);
    }
  }
  return [...codes];
}

/** pendingTermsByCode: code → the term waiting on payment, from the
 *  customer's own unpaid orders. */
export async function pendingTermsByCode(client: MemoriesDb, userId: string): Promise<Record<string, PendingTerm>> {
  const { data, error } = await client
    .from('orders')
    .select('order_number, hosting_years, album_snapshot')
    .eq('user_id', userId)
    .eq('status', 'pending_payment')
    .not('hosting_years', 'is', null) as { data: { order_number: string; hosting_years: number | null; album_snapshot: unknown }[] | null; error: DbError };
  if (error || !data) return {};
  const out: Record<string, PendingTerm> = {};
  for (const o of data) {
    if (!o.hosting_years) continue;
    for (const code of memoryCodesInSnapshot(o.album_snapshot)) {
      if (!out[code] || out[code].years < o.hosting_years) out[code] = { years: o.hosting_years, orderNumber: o.order_number };
    }
  }
  return out;
}

/** pendingUntil: when the paid term will end, if later than what shows now. */
export function pendingUntil(row: Pick<QrMemoryRow, 'created_at' | 'expires_at' | 'kind'>, pending: PendingTerm | undefined): string | null {
  if (!pending || row.kind !== 'clip') return null;
  const start = new Date(row.created_at);
  if (Number.isNaN(start.getTime())) return null;
  const until = new Date(start.getTime());
  until.setUTCFullYear(until.getUTCFullYear() + pending.years);
  const now = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  return until.getTime() > now + 24 * 3600 * 1000 ? until.toISOString() : null;
}

/** qrMemory.ts MEMORY_BASE: where every printed QR points (/m/<code>). */
export const MEMORY_BASE = 'https://megyprints.vercel.app';
export const memoryUrl = (code: string): string => `${MEMORY_BASE}/m/${code}`;

/** qrMemory.ts ALLOWED_HOSTS: where a link memory may point. */
export const ALLOWED_HOSTS = [
  'youtube.com', 'youtu.be', 'youtube-nocookie.com', 'vimeo.com',
  'open.spotify.com', 'spotify.com', 'instagram.com', 'facebook.com',
  'tiktok.com', 'drive.google.com', 'photos.google.com', 'megyprints.app',
];

/** qrMemory.ts validateDestination: a link checked and tidied, or the words why not. */
export function validateDestination(raw: string): { url: string } | { error: string } {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return { error: 'Enter a full link, e.g. https://youtu.be/…' }; }
  if (u.protocol !== 'https:') return { error: 'Link must start with https://' };
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const ok = ALLOWED_HOSTS.some((d) => host === d || host.endsWith('.' + d));
  if (!ok) return { error: 'Supported: YouTube, Vimeo, Spotify, Instagram, Facebook, TikTok, Google Drive/Photos.' };
  return { url: u.toString() };
}

/** memoryClips.ts isHostedClipUrl: a video kept by Megy Prints (not a link). */
export function isHostedClip(url: string, supabaseUrl: string): boolean {
  if (!supabaseUrl) return false;
  try {
    const u = new URL(url);
    const b = new URL(supabaseUrl);
    return u.origin === b.origin && u.pathname.startsWith('/storage/v1/object/public/memory-clips/');
  } catch {
    return false;
  }
}

/** MyMemories.tsx fmtMonth: "October 2031". */
export function fmtMonth(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
}
