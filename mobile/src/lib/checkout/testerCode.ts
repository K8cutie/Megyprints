/* ══════════════════════════════════════════════════════════════════════════
   THE TESTER CODE (0057) at the app's checkout.

   A tester sees the real price, types the code (MEGYTEST today), and the
   album is free: no pay step, the order arrives Paid and marked as a test.
   Nothing on a test order is printed or sent. The DATABASE decides all of
   it: whether a code works (check_tester_code), what the order asks, and
   marking it paid (claim_tester_order). The app only shows the answer.

   A MIRROR of the pure part of src/lib/testerCode.ts (that file also calls
   the website's Supabase client, so it can't be shared until it is split,
   after Nov 9). test/checkoutParity.test.ts runs the website's functions
   beside these and fails on any difference.

   NOT CALLED IN THIS BUILD: check_tester_code writes a row (each try is
   counted, 10 wrong an hour), and this build never writes to the live
   database. The checkout here uses checkTesterCodeOffline, which only checks
   the code's shape and says so in the test panel. checkTesterCode (below) is
   the real call, ready for when ordering is switched on.
   ══════════════════════════════════════════════════════════════════════════ */
import type { RpcClient } from './rpcClient';

/** A code the database said works: the album is free. */
export interface TesterCode {
  code: string;
  /** Only in this build: the code's shape was checked, not the database. */
  unchecked?: boolean;
}

/** The shape the database keeps a code in (store_settings_tester_code_chk). */
export const TESTER_CODE_PATTERN = /^[A-Z0-9]{4,24}$/;
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

/** Ask the database whether a code works (writes a try row). Never throws. */
export async function checkTesterCode(client: RpcClient, raw: string, configured: boolean): Promise<TesterCheck> {
  const code = normalizeTesterCode(raw);
  if (!code) return { ok: false, message: 'Type the code first.' };
  if (!configured) return { ok: false, message: "Codes can't be checked right now. Try again later." };
  const { data, error } = await client.rpc('check_tester_code', { p_code: code });
  if (error) return { ok: false, message: "We couldn't check the code. Check your internet, then try again." };
  const r = (data ?? {}) as { ok?: boolean; code?: unknown; reason?: string };
  if (r.ok && typeof r.code === 'string' && TESTER_CODE_PATTERN.test(r.code)) {
    return { ok: true, tester: { code: r.code } };
  }
  return { ok: false, message: testerCheckMessage(r.reason) };
}

/** This build's check: the code's shape only, never the database (see the
 *  top of this file). A code the database would refuse still looks free
 *  here; the test panel says it was not checked. */
export async function checkTesterCodeOffline(raw: string, signedIn: boolean): Promise<TesterCheck> {
  const code = normalizeTesterCode(raw);
  if (!code) return { ok: false, message: 'Type the code first.' };
  if (!signedIn) return { ok: false, message: testerCheckMessage('sign_in') };
  if (!TESTER_CODE_PATTERN.test(code)) return { ok: false, message: testerCheckMessage('wrong') };
  return { ok: true, tester: { code, unchecked: true } };
}

/** The order was placed with a code that has since stopped working. */
export class TesterCodeGoneError extends Error {
  constructor(code: string) {
    super(`The tester code ${code} doesn't work any more, so nothing was ordered. Remove the code to order at the normal price.`);
    this.name = 'TesterCodeGoneError';
  }
}

export function isTesterCodeGoneError(error: { code?: string | null } | null | undefined): boolean {
  return !!error && error.code === TESTER_CODE_GONE_SQLSTATE;
}
