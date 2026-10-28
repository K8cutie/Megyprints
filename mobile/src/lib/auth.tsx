/* ══════════════════════════════════════════════════════════════════════════
   Who is signed in, for every screen.

   Email and password only in Phase 1. Google sign-in needs owner steps in
   Google Cloud and Supabase first (docs/mobile-port-plan.md, Phase 1 notes).
   The words for a failed sign-in are the website's own (signInErrorText in
   src/lib/accountErrors.ts, shared code), so both say the same thing.
   ══════════════════════════════════════════════════════════════════════════ */
import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { signInErrorText } from '@web/lib/accountErrors';
import { supabase, supabaseConfigured } from './supabase';

export interface SignInResult {
  ok: boolean;
  /** Plain words for the person when it did not work. */
  error?: string;
}

interface AuthValue {
  /** Still reading a saved sign-in from the phone. */
  loading: boolean;
  session: Session | null;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

/** Google sign-in is not in the app yet (docs/mobile-port-plan.md, Phase 1
 *  notes). Until it is, the website's "Use Sign in with Google" would point
 *  at a button that is not there, so the app leaves that sentence out (the
 *  sign-in screen says Google sign-in is coming). */
export const GOOGLE_SIGN_IN_IN_APP = false;
const GOOGLE_HINT = /\s*Made your account with Google\? Use Sign in with Google\./;

/** What to tell the person, from what Supabase answered (or threw). */
export function signInFailureText(err: unknown): string {
  const message = err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : String(err ?? '');
  if (/network request failed|failed to fetch|fetch failed/i.test(message)) {
    return 'Could not reach Megy Prints. Check that the phone is online, then try again.';
  }
  const text = signInErrorText(message).text || 'Sign-in did not work. Try again.';
  return GOOGLE_SIGN_IN_IN_APP ? text : text.replace(GOOGLE_HINT, '');
}

/** Checks the boxes before asking the server. Null = fine. */
export function signInFormProblem(email: string, password: string): string | null {
  if (!email.trim()) return 'Type your email.';
  if (!/^\S+@\S+\.\S+$/.test(email.trim())) return 'Check your email: it should look like name@example.com.';
  if (!password) return 'Type your password.';
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession()
      .then(({ data }) => { if (alive) setSession(data.session); })
      .catch(() => { /* no saved sign-in */ })
      .finally(() => { if (alive) setLoading(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    // Supabase's advice for phones: keep the sign-in fresh only while the
    // app is on screen.
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
      appState.remove();
    };
  }, []);

  const value = useMemo<AuthValue>(() => ({
    loading,
    session,
    async signIn(email, password) {
      const problem = signInFormProblem(email, password);
      if (problem) return { ok: false, error: problem };
      if (!supabaseConfigured) {
        return { ok: false, error: 'This test build was made without the Megy Prints server address, so it cannot sign in.' };
      }
      try {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) return { ok: false, error: signInFailureText(error) };
        return { ok: true };
      } catch (err) {
        return { ok: false, error: signInFailureText(err) };
      }
    },
    async signOut() {
      await supabase.auth.signOut();
    },
  }), [loading, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
