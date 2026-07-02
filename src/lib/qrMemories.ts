/* ── QR living-memory — cloud persistence (owner-scoped) ───────────────────
   The stable code → destination mapping lives in qr_memories so a printed QR
   can be re-pointed without reprinting. All writes are RLS owner-scoped; the
   local qrFill remains the render source, so these calls are best-effort. */
import { supabase } from './supabase';
import type { QrFill } from '../pages/builder/types';

export interface QrMemoryRow {
  code: string;
  destination: string;
  title: string | null;
  scan_count: number;
  created_at: string;
  updated_at: string;
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Insert a new memory row. Returns:
 *  'ok' (saved) · 'conflict' (code taken — caller should re-mint) ·
 *  'skip' (not signed in — the row is created later at checkout) · 'error'. */
export async function tryCreateMemory(fill: QrFill): Promise<'ok' | 'conflict' | 'skip' | 'error'> {
  const uid = await currentUserId();
  if (!uid) return 'skip';
  const { error } = await supabase
    .from('qr_memories')
    .insert({ code: fill.code, user_id: uid, destination: fill.destination });
  if (!error) return 'ok';
  if ((error as { code?: string }).code === '23505') return 'conflict'; // unique_violation
  console.error('QR memory create failed:', error.message);
  return 'error';
}

/** Re-point an existing memory (relink). Owner-only via RLS. Best-effort.
 *  If no row matches (the QR was added while signed out, so it was never
 *  inserted), fall back to an INSERT so the relink lands immediately instead of
 *  silently no-op'ing until the checkout belt. */
export async function updateMemoryDestination(code: string, destination: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('qr_memories')
    .update({ destination })
    .eq('code', code)
    .select('code');
  if (error) { console.error('QR relink failed:', error.message); return false; }
  if (data && data.length > 0) return true;
  // No matching row → create it now (owner-scoped).
  const uid = await currentUserId();
  if (!uid) return false;
  const { error: insErr } = await supabase
    .from('qr_memories')
    .insert({ code, user_id: uid, destination });
  if (insErr) { console.error('QR relink-insert failed:', insErr.message); return false; }
  return true;
}

/** List the signed-in owner's memories (for the management screen). */
export async function listMemories(): Promise<QrMemoryRow[]> {
  const { data, error } = await supabase
    .from('qr_memories')
    .select('code,destination,title,scan_count,created_at,updated_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function removeMemory(code: string): Promise<boolean> {
  const { error } = await supabase.from('qr_memories').delete().eq('code', code);
  if (error) { console.error('QR delete failed:', error.message); return false; }
  return true;
}

/** Reliability belt: ensure every QR in an album has a resolvable row (called at
 *  checkout, where the user is signed in). INSERT-only (ignoreDuplicates) so it
 *  never clobbers a later relink. Best-effort. */
export async function ensureMemoriesForFills(fills: (QrFill | null)[]): Promise<void> {
  const uid = await currentUserId();
  if (!uid) return;
  const rows = fills
    .filter((f): f is QrFill => !!f)
    .map((f) => ({ code: f.code, user_id: uid, destination: f.destination }));
  if (!rows.length) return;
  const { error } = await supabase.from('qr_memories').upsert(rows, { onConflict: 'code', ignoreDuplicates: true });
  if (error) console.error('QR memories ensure failed:', error.message);
}
