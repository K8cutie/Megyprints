/* The builder's soft sign-in nudge, "Have an account?" (components/
   SoftAuthGate): shown once per visit to a signed-out customer. Its own small
   module so Home can answer it without loading the sign-in screens. */

export const SOFT_AUTH_DISMISS_KEY = 'megy_soft_auth_dismissed';

/** Home's "Make today's sample album" (testing, pages/home/TodaysSampleAlbum):
 *  a sample album needs no account, and the nudge popped over it while Megy
 *  made it, one more thing to read and tap. Counts as answered this visit. */
export function skipSoftAuthThisVisit(): void {
  try { sessionStorage.setItem(SOFT_AUTH_DISMISS_KEY, '1'); } catch { /* private mode */ }
}
