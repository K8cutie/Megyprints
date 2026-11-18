/* ══════════════════════════════════════════════════════════════════════════
   AFFILIATES IN THE APP (0061): the website's rules and calls (shared
   src/lib/orderCodes.ts) with the phone's Supabase client. The database
   decides everything; the app only shows what it answered.

   The link an affiliate shares opens the public website (it keeps the code
   for 30 days in that browser). In the app, a client types the code at
   checkout.
   ══════════════════════════════════════════════════════════════════════════ */
import {
  affiliateLinkOn,
  applyAffiliateWith,
  checkOrderCodeWith,
  fetchAffiliateProgramWith,
  fetchMyAffiliateWith,
  normalizeAffiliateCode,
  type AffiliateApplication,
  type AffiliateProgram,
  type CodeCheck,
  type CodesClient,
  type MyAffiliate,
} from '@web/lib/orderCodes';
import { checkTesterCode } from './checkout/testerCode';
import { WEBSITE_URL } from './checkout/site';
import { supabase, supabaseConfigured } from './supabase';

const client = supabase as unknown as CodesClient;

/** An affiliate's link: the public website, with their code. */
export const affiliateLink = (code: string): string => affiliateLinkOn(WEBSITE_URL, code);

/** Anyone can read it: the invite page shows the rate and the discount. */
export function fetchAffiliateProgram(): Promise<AffiliateProgram | null> {
  return supabaseConfigured ? fetchAffiliateProgramWith(client) : Promise.resolve(null);
}

/** The signed-in person's application and earnings. Throws a plain sentence. */
export function fetchMyAffiliate(): Promise<MyAffiliate> {
  return supabaseConfigured ? fetchMyAffiliateWith(client) : Promise.reject(new Error('Not connected. Try again later.'));
}

export function applyAffiliate(f: AffiliateApplication): Promise<MyAffiliate> {
  return applyAffiliateWith(client, f);
}

/** The checkout's one code box: the tester code or an affiliate code. Never
 *  throws. A database without 0061 still takes the tester code. */
export function checkCheckoutCode(raw: string): Promise<CodeCheck> {
  if (!normalizeAffiliateCode(raw)) return Promise.resolve({ ok: false, message: 'Type the code first.' });
  if (!supabaseConfigured) return Promise.resolve({ ok: false, message: "Codes can't be checked right now. Try again later." });
  return checkOrderCodeWith(client, raw, (typed) => checkTesterCode(supabase, typed, supabaseConfigured));
}
