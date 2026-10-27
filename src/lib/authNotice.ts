/* ══════════════════════════════════════════════════════════════════════════
   A note for the sign-in box when Google sign-in came back without signing
   the person in, e.g. 0054 refused it because that Gmail already has an
   account under another spelling (accountErrors.ts has the words).

   On the web Supabase sends the error back in the return URL. The router and
   the "back to where you were" step in App.tsx replace that URL straight
   away, so it is read here, the moment this module loads, like
   recoveryState.ts does for an expired reset link. In the Android app the
   error comes back through nativeAuth.ts, which calls showAuthNotice().
   AuthModalProvider opens the sign-in box with the note.
   ══════════════════════════════════════════════════════════════════════════ */
import { useSyncExternalStore } from 'react';
import { oauthReturnNotice } from './accountErrors';
import type { AuthNotice } from './accountErrors';

/** Only when THIS tab started a Google sign-in (signInWithOAuth stashes
 *  megy-auth-return just before leaving). Red team 2026-10-24: otherwise a
 *  crafted link could open sign-in saying "already has an account: <their
 *  email>" with that email filled in. */
function startedGoogleSignIn(): boolean {
  try { return sessionStorage.getItem('megy-auth-return') !== null; } catch { return false; }
}

let notice: AuthNotice | null = typeof window === 'undefined' || !startedGoogleSignIn() ? null
  : oauthReturnNotice(window.location.search, window.location.hash);
const listeners = new Set<() => void>();

export function showAuthNotice(next: AuthNotice): void {
  notice = next;
  listeners.forEach((l) => l());
}

export function clearAuthNotice(): void {
  if (!notice) return;
  notice = null;
  listeners.forEach((l) => l());
}

export function useAuthNotice(): AuthNotice | null {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => notice,
  );
}
