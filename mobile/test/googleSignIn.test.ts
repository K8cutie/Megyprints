/* ══════════════════════════════════════════════════════════════════════════
   SIGN IN WITH GOOGLE (src/lib/googleSignIn.ts), the 1.x app's way
   (src/lib/nativeAuth.ts): Google opens in a Chrome tab; Supabase sends it
   to the website's /auth-native.html, which hands the sign-in back to the
   app (com.megyprints.app) as megyprints://auth?… or the verified
   https://megyprints.vercel.app/auth-native.html#… link. A one-time code
   (n) rides along, so a crafted link can't sign anyone in. Nothing new to
   set up in Google or Supabase: the same page and the same app name.
     • start: the same Supabase call as the website, the code kept;
     • the way back (+native-intent.tsx): both shapes go to the
       auth-return screen, nothing else changes;
     • finish: only with the code this phone started, the session set; a
       refused sign-in in the website's words (accountErrors).
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { googleRefusedNotice } from '@web/lib/accountErrors';
import { finishGoogleSignIn, GOOGLE_RETURN_PAGE, parseAuthReturn, startGoogleSignIn, type NonceStore } from '../src/lib/googleSignIn';
import { redirectSystemPath } from '../src/app/+native-intent';

const REPO = path.resolve(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(REPO, rel), 'utf8');

function memoryStore(): NonceStore & { value: string | null } {
  const s = { value: null as string | null, async get() { return s.value; }, async set(v: string | null) { s.value = v; } };
  return s;
}

function client() {
  const calls: { fn: string; args: unknown }[] = [];
  return {
    calls,
    auth: {
      async signInWithOAuth(args: unknown) { calls.push({ fn: 'signInWithOAuth', args }); return { data: { url: 'https://example.supabase.co/auth/v1/authorize?provider=google' }, error: null }; },
      async setSession(args: unknown) { calls.push({ fn: 'setSession', args }); return { data: {}, error: null }; },
    },
  };
}

describe('the way back is the website\'s (nativeAuth.ts, auth-native.js)', () => {
  it('the same return page, the same app name and scheme', () => {
    expect(read('src/lib/nativeAuth.ts')).toContain(`const RETURN_PAGE = '${GOOGLE_RETURN_PAGE}';`);
    expect(read('public/auth-native.js')).toContain("'#Intent;scheme=megyprints;package=com.megyprints.app;end'");
  });

  it('reads both shapes of the way back, and nothing else', () => {
    const a = parseAuthReturn('megyprints://auth?access_token=A&refresh_token=R&n=abc');
    expect(a && Object.fromEntries(a)).toEqual({ access_token: 'A', refresh_token: 'R', n: 'abc' });
    const b = parseAuthReturn('https://megyprints.vercel.app/auth-native.html?n=abc#access_token=A&refresh_token=R');
    expect(b && Object.fromEntries(b)).toEqual({ n: 'abc', access_token: 'A', refresh_token: 'R' });
    expect(parseAuthReturn('https://megyprints.vercel.app/m/abcd2345')).toBeNull();
    expect(parseAuthReturn('megyprints-dev://albums')).toBeNull();
    expect(parseAuthReturn('not a url')).toBeNull();
  });

  it('the app\'s links: a sign-in coming back opens the auth-return screen; others go where they went', async () => {
    expect(await redirectSystemPath({ path: 'megyprints://auth?access_token=A&refresh_token=R&n=abc', initial: false }))
      .toBe('/auth-return?access_token=A&refresh_token=R&n=abc');
    expect(await redirectSystemPath({ path: 'https://megyprints.vercel.app/auth-native.html?n=abc#error=access_denied&error_description=Nope', initial: true }))
      .toBe('/auth-return?n=abc&error=access_denied&error_description=Nope');
    expect(await redirectSystemPath({ path: '/albums', initial: false })).toBe('/albums');
  });
});

describe('Sign in with Google', () => {
  it('start: the website\'s Supabase call, the one-time code kept, Google opened in a tab', async () => {
    const c = client();
    const store = memoryStore();
    const opened: string[] = [];
    await startGoogleSignIn({ client: c, store, open: async (u) => { opened.push(u); }, randomHex: () => 'c0ffee00c0ffee00c0ffee00c0ffee00' });
    expect(store.value).toBe('c0ffee00c0ffee00c0ffee00c0ffee00');
    expect(c.calls).toEqual([{ fn: 'signInWithOAuth', args: {
      provider: 'google', options: { redirectTo: `${GOOGLE_RETURN_PAGE}?n=c0ffee00c0ffee00c0ffee00c0ffee00`, skipBrowserRedirect: true },
    } }]);
    expect(opened).toEqual(['https://example.supabase.co/auth/v1/authorize?provider=google']);
  });

  it('finish: signed in only with the code this phone started; the code is used once', async () => {
    const c = client();
    const store = memoryStore();
    store.value = 'abc';
    expect(await finishGoogleSignIn(new URLSearchParams('n=other&access_token=A&refresh_token=R'), { client: c, store })).toBeNull();
    expect(c.calls).toHaveLength(0);
    expect(store.value).toBe('abc'); // a real sign-in still waiting keeps its code
    expect(await finishGoogleSignIn(new URLSearchParams('n=abc&access_token=A&refresh_token=R'), { client: c, store })).toEqual({ ok: true });
    expect(c.calls).toEqual([{ fn: 'setSession', args: { access_token: 'A', refresh_token: 'R' } }]);
    expect(store.value).toBeNull();
    // The same link again: ignored.
    expect(await finishGoogleSignIn(new URLSearchParams('n=abc&access_token=A&refresh_token=R'), { client: c, store })).toBeNull();
  });

  it('refused or cancelled: the website\'s words', async () => {
    const c = client();
    const store = memoryStore();
    store.value = 'abc';
    const taken = 'A user with this email address has already been registered: maria@gmail.com';
    const r = await finishGoogleSignIn(new URLSearchParams({ n: 'abc', error: 'server_error', error_description: taken }), { client: c, store });
    expect(r).toEqual({ ok: false, error: googleRefusedNotice(taken).text });
    store.value = 'abc';
    expect(await finishGoogleSignIn(new URLSearchParams('n=abc'), { client: c, store })).toEqual({ ok: false, error: googleRefusedNotice('').text });
  });
});
