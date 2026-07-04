import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { User, Session, Provider } from '@supabase/supabase-js';
import { AuthError } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from './supabase';

// =============================================================================
// Types
// =============================================================================

export interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
}

export interface AuthActions {
  login: (email: string, password: string) => Promise<void>;
  /** Resolves true when the account still needs email confirmation (no session
   *  was created); false when auto-confirm is on and the user is already signed
   *  in — so the UI must NOT tell them to check a (never-sent) email. */
  signup: (email: string, password: string, metadata?: { full_name?: string }) => Promise<boolean>;
  logout: () => Promise<void>;
  signInWithOAuth: (provider: Provider) => Promise<void>;
  clearError: () => void;
}

export type AuthContextValue = AuthState & AuthActions;

// =============================================================================
// Context
// =============================================================================

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// =============================================================================
// Provider
// =============================================================================

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize auth state from existing session
  useEffect(() => {
    let mounted = true;

    async function getInitialSession() {
      // Local-only mode (no Supabase keys configured): skip the network call,
      // stay logged out, let the album builder run.
      if (!supabaseConfigured) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          console.error('Auth session error:', sessionError);
        }
        if (mounted) {
          setSession(data.session ?? null);
          setUser(data.session?.user ?? null);
        }
      } catch (err) {
        // Network failure / Supabase unreachable — stay logged out, don't crash.
        console.error('Failed to get initial session:', err);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void getInitialSession();

    // Listen for auth state changes
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (mounted) {
          setSession(newSession);
          setUser(newSession?.user ?? null);
        }
      }
    );

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        throw signInError;
      }
    } catch (err: unknown) {
      const message = err instanceof AuthError ? err.message : 'Failed to sign in. Please try again.';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const signup = useCallback(
    async (email: string, password: string, metadata?: { full_name?: string }) => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: metadata,
          },
        });
        if (signUpError) {
          throw signUpError;
        }
        // With email auto-confirm ON (this project), signUp returns a live
        // session and the user is signed in immediately — no email is sent, so
        // the caller must NOT tell them to check their inbox. Only when there's
        // no session (email confirmation required) is a mail actually sent.
        return !data.session;
      } catch (err: unknown) {
        const message = err instanceof AuthError ? err.message : 'Failed to sign up. Please try again.';
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const logout = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        throw signOutError;
      }
      setUser(null);
      setSession(null);
    } catch (err: unknown) {
      const message = err instanceof AuthError ? err.message : 'Failed to sign out. Please try again.';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const signInWithOAuth = useCallback(async (provider: Provider) => {
    setLoading(true);
    setError(null);
    try {
      // Remember the route we're leaving so we can return here after the OAuth
      // round-trip. redirectTo CANNOT carry a #hash (OAuth providers reject
      // fragments), so on a HashRouter SPA the return lands on a bare path →
      // Home, silently dropping an in-progress builder. App.tsx restores this.
      try { sessionStorage.setItem('megy-auth-return', window.location.hash || '#/'); } catch { /* ignore */ }
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/profile`,
        },
      });
      if (oauthError) {
        throw oauthError;
      }
    } catch (err: unknown) {
      const message = err instanceof AuthError ? err.message : 'OAuth sign in failed. Please try again.';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      loading,
      error,
      login,
      signup,
      logout,
      signInWithOAuth,
      clearError,
    }),
    [user, session, loading, error, login, signup, logout, signInWithOAuth, clearError]
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

// =============================================================================
// Hook
// =============================================================================

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error('useAuth must be used within an <AuthProvider>');
  }
  return ctx;
}
