/* ══════════════════════════════════════════════════════════════════════════
   Is a password reset open right now? The state only — no Supabase here, so
   screens that just need to step aside for it (ResumePrompt) can read it
   without pulling in the client. passwordRecovery.ts sets it from Supabase;
   passwordReset.ts has the whole flow.
   ══════════════════════════════════════════════════════════════════════════ */
import { useSyncExternalStore } from 'react';
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

export function setRecoveryState(next: RecoveryState): void {
  if (next === state) return;
  state = next;
  remember(next);
  listeners.forEach((l) => l());
}

export function endRecovery(): void {
  setRecoveryState('none');
}

export function useRecoveryState(): RecoveryState {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => state,
  );
}
