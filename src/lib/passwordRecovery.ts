/* ══════════════════════════════════════════════════════════════════════════
   The second half of "Forgot password": the person opened the emailed link.

   supabase-js reads the link's tokens from the #hash while it starts up and
   fires PASSWORD_RECOVERY once. That can happen before React has mounted the
   AuthProvider, and a listener added later only hears INITIAL_SESSION, so the
   "Make a new password" screen never opened. This module listens from the
   moment it's imported (before any render) and keeps the answer for the
   screen. See passwordReset.ts for the whole flow.
   ══════════════════════════════════════════════════════════════════════════ */
import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import { isNativeShell } from './nativeAuth';
import { isExpiredEmailLink } from './passwordReset';

/** 'ready' = signed in from a reset link, show "Make a new password".
 *  'expired' = the link was used up or too old, offer a new one. */
export type RecoveryState = 'none' | 'ready' | 'expired';

/* Kept in this tab's sessionStorage too: a reset link is often opened on a
   device that has never visited (or in an email app's browser), and on a first
   visit main.tsx reloads the page when the service worker takes over. By then
   supabase-js has already used and cleared the link's tokens, so without this
   the "Make a new password" box vanished mid-typing. */
const KEY = 'megy-password-recovery';

function stored(): RecoveryState {
  try {
    const v = sessionStorage.getItem(KEY);
    return v === 'ready' || v === 'expired' ? v : 'none';
  } catch { return 'none'; }
}

function remember(s: RecoveryState): void {
  try {
    if (s === 'none') sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, s);
  } catch { /* private mode — the box just won't survive a reload */ }
}

let state: RecoveryState = typeof window === 'undefined' ? 'none'
  : isExpiredEmailLink(window.location.hash) ? 'expired' : stored();
remember(state);
const listeners = new Set<() => void>();

function setState(next: RecoveryState): void {
  if (next === state) return;
  state = next;
  remember(next);
  listeners.forEach((l) => l());
}

supabase.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') setState('ready');
});

export function endRecovery(): void {
  setState('none');
}

export function useRecoveryState(): RecoveryState {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => state,
  );
}

/** Where the emailed link brings the person back. The site root: Supabase
 *  always allows its own Site URL host. In the Android shell the origin is the
 *  app's own (https://localhost), which the email can't open, so send them to
 *  the website; they make the new password there and sign in on the app. */
function resetReturnUrl(): string {
  return isNativeShell() ? 'https://megyprints.vercel.app/' : `${window.location.origin}/`;
}

/** Email a reset link. Supabase answers the same whether or not the email has
 *  an account, so this never tells a stranger who has signed up. */
export async function sendResetLink(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: resetReturnUrl(),
  });
  return error;
}

export async function saveNewPassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  return error;
}
