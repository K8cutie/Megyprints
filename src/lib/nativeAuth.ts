/* ══════════════════════════════════════════════════════════════════════════
   Google sign-in inside the native Android shell.

   Google refuses OAuth inside an embedded WebView ("disallowed_useragent"), so
   in the shell the consent screen opens in a Chrome Custom Tab instead. Google
   → Supabase → /auth-native.html, which hands the tokens back to THIS app:
     • verified App Link (assetlinks.json) — the tab never even loads the page, or
     • the page's intent:// link, pinned to package com.megyprints.app.
   A one-time nonce rides along so a crafted link can't sign the user into
   someone else's account (login CSRF). On the web / old TWA nothing here runs.
   ══════════════════════════════════════════════════════════════════════════ */
import { Capacitor } from '@capacitor/core';
import type { Provider } from '@supabase/supabase-js';
import { supabase } from './supabase';

const RETURN_PAGE = 'https://megyprints.vercel.app/auth-native.html';
const NONCE_KEY = 'megy-native-auth-nonce';

export const isNativeShell = (): boolean => Capacitor.isNativePlatform();

/** Pull the auth params out of either return shape: https://…/auth-native.html#… or megyprints://auth?… */
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

export async function nativeSignInWithOAuth(provider: Provider): Promise<void> {
  // getRandomValues (not randomUUID) — it also exists outside secure contexts.
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  try { localStorage.setItem(NONCE_KEY, nonce); } catch { /* ignore */ }
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${RETURN_PAGE}?n=${nonce}`, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('No sign-in URL');
  const { Browser } = await import('@capacitor/browser');
  await Browser.open({ url: data.url });
}

async function handleReturn(url: string): Promise<void> {
  const p = parseAuthReturn(url);
  if (!p) return;
  let expected: string | null = null;
  try { expected = localStorage.getItem(NONCE_KEY); } catch { /* ignore */ }
  // No matching nonce = not a sign-in THIS app started → ignore it entirely
  // (and leave a real pending sign-in's nonce alone).
  if (!expected || p.get('n') !== expected) return;
  try { localStorage.removeItem(NONCE_KEY); } catch { /* ignore */ }
  const { Browser } = await import('@capacitor/browser');
  void Browser.close().catch(() => { /* already closed */ });
  const access_token = p.get('access_token');
  const refresh_token = p.get('refresh_token');
  if (!access_token || !refresh_token) return; // cancelled or provider error
  const { error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) return;
  // Back to the screen the sign-in started from (same stash the web flow uses).
  let ret: string | null = null;
  try { ret = sessionStorage.getItem('megy-auth-return'); sessionStorage.removeItem('megy-auth-return'); } catch { /* ignore */ }
  if (ret && ret !== '#/' && window.location.hash !== ret) window.location.hash = ret;
}

export function installNativeAuth(): void {
  if (!isNativeShell()) return;
  // .catch: an older installed shell without the App plugin must not crash the site.
  void import('@capacitor/app')
    .then(({ App }) => App.addListener('appUrlOpen', ({ url }) => { void handleReturn(url); }))
    .catch(() => { /* shell predates this plugin — web sign-in still works */ });
}
