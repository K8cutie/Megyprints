/* ══════════════════════════════════════════════════════════════════════════
   SIGN IN WITH GOOGLE, the 1.x app's way (the website's src/lib/nativeAuth.ts):
   Google refuses sign-in inside an app's own web view, so it opens in a
   Chrome tab. Google → Supabase → the website's /auth-native.html, which
   hands the sign-in back to THIS app (com.megyprints.app): as a verified
   link (https://megyprints.vercel.app/auth-native.html#…) or as
   megyprints://auth?… pinned to the app. A one-time code (n) rides along,
   so a crafted link can't sign anyone into someone else's account.

   Nothing new in Google or Supabase: the same page, the same app name and
   scheme as 1.x. That page names the release app (com.megyprints.app), so
   Google sign-in comes back to the Play build, not to a dev build
   (com.megyprints.app.dev).

   The way back opens the auth-return screen (src/app/+native-intent.tsx);
   finishGoogleSignIn sets the session there. test/googleSignIn.test.ts.
   ══════════════════════════════════════════════════════════════════════════ */
import { googleRefusedNotice } from '@web/lib/accountErrors';

/** nativeAuth.ts RETURN_PAGE: where Supabase sends Google's answer. */
export const GOOGLE_RETURN_PAGE = 'https://megyprints.vercel.app/auth-native.html';

/** Where the one-time code waits while Google is open (the phone may close
 *  the app meanwhile, so it is written down). */
export interface NonceStore {
  get(): Promise<string | null>;
  set(value: string | null): Promise<void>;
}

interface OAuthClient {
  auth: {
    signInWithOAuth(args: { provider: 'google'; options: { redirectTo: string; skipBrowserRedirect: true } }): Promise<{ data: { url?: string | null } | null; error: { message: string } | null }>;
    setSession(args: { access_token: string; refresh_token: string }): Promise<{ error: { message: string } | null }>;
  };
}

/** nativeAuth.ts parseAuthReturn: the sign-in's answer from either shape of
 *  the way back, or null for any other link. */
export function parseAuthReturn(url: string): URLSearchParams | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  const isAppLink = u.protocol === 'https:' && u.hostname === 'megyprints.vercel.app' && u.pathname === '/auth-native.html';
  const isScheme = u.protocol === 'megyprints:' && (u.hostname === 'auth' || u.pathname.replace(/^\/+/, '') === 'auth');
  if (!isAppLink && !isScheme) return null;
  const p = new URLSearchParams(u.search);
  new URLSearchParams(u.hash.replace(/^#/, '')).forEach((v, k) => p.set(k, v));
  return p;
}

/** The scheme the website's page hands the answer to (public/auth-native.js). */
export const APP_RETURN = 'megyprints://auth';

/** iPhone: Google opens in Apple's sign-in window (ASWebAuthenticationSession),
 *  which catches the website's megyprints://auth?… link itself and gives it
 *  only to this app (so the test app gets it too); the answer then goes to
 *  the same auth-return screen as Android's link. Closed without signing in:
 *  nothing happens. */
export async function openGoogleOnIphone(
  url: string,
  o: { openAuth: (url: string, returnUrl: string) => Promise<{ type: string; url?: string }>; goTo: (path: string) => void },
): Promise<void> {
  const r = await o.openAuth(url, APP_RETURN);
  if (r.type !== 'success' || !r.url) return;
  const p = parseAuthReturn(r.url);
  if (p) o.goTo(`/auth-return?${p.toString()}`);
}

/** "Sign in with Google": a new one-time code kept, Supabase asked for
 *  Google's page (the website's call), the page opened in a Chrome tab
 *  (iPhone: openGoogleOnIphone). */
export async function startGoogleSignIn(o: { client: OAuthClient; store: NonceStore; open: (url: string) => Promise<unknown>; randomHex: () => string }): Promise<void> {
  const nonce = o.randomHex();
  await o.store.set(nonce);
  const { data, error } = await o.client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${GOOGLE_RETURN_PAGE}?n=${nonce}`, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('No sign-in URL');
  await o.open(data.url);
}

/** The way back: signed in (`ok`), refused or cancelled (`error`, the
 *  website's words), or null when it isn't a sign-in this phone started
 *  (ignored: a real one still waiting keeps its code). */
export async function finishGoogleSignIn(p: URLSearchParams, o: { client: OAuthClient; store: NonceStore }): Promise<{ ok: true } | { ok: false; error: string } | null> {
  const expected = await o.store.get();
  if (!expected || p.get('n') !== expected) return null;
  await o.store.set(null);
  const access_token = p.get('access_token');
  const refresh_token = p.get('refresh_token');
  if (!access_token || !refresh_token) return { ok: false, error: googleRefusedNotice(p.get('error_description') ?? '').text };
  const { error } = await o.client.auth.setSession({ access_token, refresh_token });
  if (error) return { ok: false, error: googleRefusedNotice('').text };
  return { ok: true };
}
