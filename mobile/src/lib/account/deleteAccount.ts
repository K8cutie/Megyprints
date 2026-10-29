/* ══════════════════════════════════════════════════════════════════════════
   DELETE MY ACCOUNT FROM THE APP: the in-app deletion path Google Play
   requires of any app that makes accounts (the website's
   DeleteAccountSection, src/lib/accountDeletion.ts).

   The same two calls as the website, through the website's shared code
   (src/lib/accountDeletionRules.ts):
     preflight — account_deletion_preflight(), read only: the real counts
                 and any order that blocks it, shown before anything goes;
     delete    — POST to the website's own endpoint, api/delete-account.mjs,
                 with the customer's sign-in token. The app has no site of
                 its own, so it calls it by its full address
                 (LIVE_DELETE_ACCOUNT_URL). The endpoint removes the print
                 files, receipts and memory videos (the customer's own
                 session can't), then the database deletes the rest.
   Then, on the phone: the album in progress and its photo grants are let go
   (a deletion that leaves the last album on the phone is not one the
   customer would recognise), and the sign-in is dropped.

   TESTS AND WALKS NEVER CALL THE LIVE ENDPOINT. jest hands in a fake fetch.
   A build that talks to a local Supabase refuses to use the live address
   (deleteAccountEndpoint): a walk points EXPO_PUBLIC_DELETE_ACCOUNT_URL at a
   local copy of the endpoint (scripts/local-delete-account.mjs, which runs
   the website's own handler against the local Supabase only).
   ══════════════════════════════════════════════════════════════════════════ */
import { requestAccountDeletion, type DeletionFetch, type DeletionResult } from '@web/lib/accountDeletionRules';

/** The website's endpoint, by its full address. */
export const LIVE_DELETE_ACCOUNT_URL = 'https://megyprints.vercel.app/api/delete-account';

/** The shop's email (the website's DeleteAccountSection and delete-account.html). */
export const SHOP_EMAIL = 'megyprintsph@gmail.com';
/** Option 2 of the public delete-account page: email the shop. */
export const EMAIL_DELETE_URL = `mailto:${SHOP_EMAIL}?subject=${encodeURIComponent('Delete my account')}`;

/** A server on this computer or the emulator's host (a local Supabase). */
export function isLocalServer(url: string): boolean {
  let host: string;
  try { host = new URL(url).hostname.toLowerCase(); } catch { return false; }
  return host === 'localhost' || host === '127.0.0.1' || host === '10.0.2.2' || host === '[::1]' || host === '::1'
    || host.endsWith('.localhost') || host.endsWith('.test');
}

/** Where this build sends "Delete forever". A build on a local Supabase
 *  never uses the live website's endpoint (its token means nothing there,
 *  and tests and walks must never reach it): it needs a local one. */
export function deleteAccountEndpoint(supabaseUrl: string, override: string | undefined): { url: string } | { problem: string } {
  const set = (override ?? '').trim();
  if (set) return { url: set };
  if (isLocalServer(supabaseUrl)) {
    return { problem: 'This test build uses a test copy of the shop, so it cannot delete accounts through the website.' };
  }
  return { url: LIVE_DELETE_ACCOUNT_URL };
}

/** The endpoint's own refusals that are not about the account (its abuse
 *  guard, api/_guard.mjs, and its method check). They are not written for a
 *  customer, so the app says what to do instead. The guard's origin list,
 *  if it is ever switched on, would refuse the app: it sends no Origin
 *  (the fix is a server rule for the app, held until Nov 9). */
const NOT_FOR_CUSTOMERS = ['origin not allowed', 'too many requests', 'request body too large', 'POST only'];

/** Said when the app could not get the deletion done and the customer
 *  should use the other way the public page offers: email the shop. */
export const DELETE_BY_EMAIL = `We couldn't delete your account from the app just now. Email ${SHOP_EMAIL} from the address you signed up with, with the subject "Delete my account", and we will delete it for you.`;
export const OFFLINE = 'Could not reach Megy Prints. Check that the phone is online, then try again.';

export class DeleteByEmailError extends Error {
  constructor() { super(DELETE_BY_EMAIL); this.name = 'DeleteByEmailError'; }
}

export interface DeleteDeps {
  endpoint: string;
  /** The signed-in account's access token, or null. */
  token(): Promise<string | null>;
  fetch: DeletionFetch;
  /** Let go of what the phone keeps: the album in progress, its photo grants. */
  wipe(): Promise<void>;
  /** Drop the sign-in on the phone (the account is gone on the server). */
  signOut(): Promise<void>;
}

/** Deletes the signed-in account. Throws with words for the customer. */
export async function deleteAccountFromApp(deps: DeleteDeps): Promise<DeletionResult> {
  const token = await deps.token().catch(() => null);
  if (!token) throw new Error('You are not signed in.');
  let result: DeletionResult;
  try {
    result = await requestAccountDeletion(deps.endpoint, token, deps.fetch);
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    if (NOT_FOR_CUSTOMERS.includes(message)) throw new DeleteByEmailError();
    if (/network request failed|failed to fetch|fetch failed|network error/i.test(message)) throw new Error(OFFLINE);
    throw e instanceof Error ? e : new Error(String(e));
  }
  // Only after the server said yes: wiping first would lose the customer's
  // album if the deletion then failed (the website's order too).
  await deps.wipe().catch(() => { /* nothing left to let go of */ });
  await deps.signOut().catch(() => { /* the sign-in is gone with the account */ });
  return result;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "October 2031", in Manila time, as the website's dialog says when memory
 *  hosting runs until (toLocaleDateString('en-PH', { month: 'long', year })). */
export function hostedUntilMonth(iso: string | null): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const d = new Date(t + 8 * 3_600_000);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
