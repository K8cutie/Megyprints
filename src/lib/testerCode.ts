/* ══════════════════════════════════════════════════════════════════════════
   TESTER CODE (0057). Owner, 2026-10-26, testing phase: "Testers see the
   real price, type the code, and the album is free: no pay step, straight to
   thank-you, order arrives Paid and marked as a tester order." Then: "the
   code to make the album free is the way to go" (no ₱1 option).

   The database decides all of it: whether a code works (check_tester_code,
   10 wrong tries an hour), what the order asks (orders_tester_code_trg, only
   for an account that checked the code first), and marking a free order paid
   (claim_tester_order). The app only shows what it answered.
   ══════════════════════════════════════════════════════════════════════════ */
import { supabase, supabaseConfigured } from './supabase';

/** A code the database said works: the album is free. */
export interface TesterCode { code: string }

/** The shape the database keeps a code in (store_settings_tester_code_chk). */
export const TESTER_CODE_PATTERN = /^[A-Z0-9]{4,24}$/;
/** The order was placed with a code that has since stopped working (0057). */
export const TESTER_CODE_GONE_SQLSTATE = 'MP007';

/** As the database compares it: no spaces, capitals. */
export function normalizeTesterCode(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

/** What a tester pays: nothing while a code is on, else the total. */
export function amountToPay(total: number, tester: TesterCode | null): number {
  return tester ? 0 : total;
}

/** The checkout line under the real price. */
export function testerLine(t: TesterCode): string {
  return `Tester code ${t.code}: free`;
}

/** Why a code didn't work, in the customer's words. */
export function testerCheckMessage(reason: string | undefined): string {
  if (reason === 'sign_in') return 'Sign in first, then type the code.';
  if (reason === 'too_many') return 'Too many wrong codes. Try again in an hour.';
  return "That code doesn't work. Check the spelling.";
}

export type TesterCheck = { ok: true; tester: TesterCode } | { ok: false; message: string };

/** Ask the database whether a code works. Never throws. */
export async function checkTesterCode(raw: string): Promise<TesterCheck> {
  const code = normalizeTesterCode(raw);
  if (!code) return { ok: false, message: 'Type the code first.' };
  if (!supabaseConfigured) return { ok: false, message: "Codes can't be checked right now. Try again later." };
  const { data, error } = await supabase.rpc('check_tester_code', { p_code: code });
  if (error) return { ok: false, message: "We couldn't check the code. Check your internet, then try again." };
  const r = (data ?? {}) as { ok?: boolean; code?: unknown; reason?: string };
  if (r.ok && typeof r.code === 'string' && TESTER_CODE_PATTERN.test(r.code)) {
    return { ok: true, tester: { code: r.code } };
  }
  return { ok: false, message: testerCheckMessage(r.reason) };
}

/** A tester order, its files in: the database marks it paid. Safe to ask
 *  twice (a retry after a lost answer). */
export async function claimTesterOrder(orderId: string): Promise<void> {
  const { error } = await supabase.rpc('claim_tester_order', { p_order_id: orderId });
  if (error) throw new Error("We couldn't finish your free tester order. Your order is saved: tap Place order again.");
}

/** The code stopped working between checking it and placing the order (the
 *  owner switched it off or changed it). Nothing was placed. */
export class TesterCodeGoneError extends Error {
  constructor(code: string) {
    super(`The tester code ${code} doesn't work any more, so nothing was ordered. Remove the code to order at the normal price.`);
    this.name = 'TesterCodeGoneError';
  }
}

export function isTesterCodeGoneError(error: { code?: string | null } | null | undefined): boolean {
  return !!error && error.code === TESTER_CODE_GONE_SQLSTATE;
}

// ── The owner's settings (Pricing tab). store_settings is owner-only (0025). ──

export interface TesterSettings { code: string; on: boolean }

export async function loadTesterSettings(): Promise<TesterSettings | null> {
  if (!supabaseConfigured) return null;
  const { data, error } = await supabase
    .from('store_settings')
    .select('tester_code, tester_code_on')
    .eq('id', 1)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { tester_code: string | null; tester_code_on: boolean };
  return { code: row.tester_code ?? '', on: !!row.tester_code_on };
}

/** Save the code and the switch. Returns a message, or null when saved. */
export async function saveTesterSettings(next: TesterSettings): Promise<string | null> {
  const code = normalizeTesterCode(next.code);
  if (!TESTER_CODE_PATTERN.test(code)) return 'The code must be 4 to 24 letters or numbers, no spaces.';
  if (!supabaseConfigured) return 'Not connected: nothing was saved.';
  const { data, error } = await supabase
    .from('store_settings')
    .update({ tester_code: code, tester_code_on: next.on, updated_at: new Date().toISOString() })
    .eq('id', 1)
    .select('id');
  if (error) return error.message;
  if (!data || data.length === 0) return 'Not saved: only the owner can change the tester code.';
  return null;
}
