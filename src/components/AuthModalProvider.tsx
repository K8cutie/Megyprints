import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import type { ReactNode } from 'react';
import LoginModal from '../pages/auth/LoginModal';
import SignupModal from '../pages/auth/SignupModal';
import NewPasswordModal from '../pages/auth/NewPasswordModal';
import { useAuthNotice, clearAuthNotice } from '../lib/authNotice';

/* Global auth-modal controller. The Login/Signup modals live here (rendered once
   at the app root, above everything) so ANY surface — the soft sign-in nudge, the
   QR gate, the checkout gate — can open sign-in via useAuthModal(), not just the
   nav bar. The builder runs outside the marketing Layout (no nav), so without this
   a signed-out builder user would have no way to reach sign-in. */
interface AuthModalValue {
  openLogin: () => void;
  openSignup: () => void;
  closeAuthModal: () => void;
}

const AuthModalContext = createContext<AuthModalValue | undefined>(undefined);

export function AuthModalProvider({ children }: { children: ReactNode }) {
  // 'forgot' = sign-in opened on "Forgot your password?" (an expired reset link).
  const [mode, setMode] = useState<'login' | 'forgot' | 'signup' | null>(null);
  // The email sign-in opens with: the account sign-up found for that email.
  const [loginEmail, setLoginEmail] = useState('');
  // Why Google sign-in didn't finish (0054 refused a second account for that Gmail).
  const notice = useAuthNotice();
  const openLogin = useCallback(() => { setLoginEmail(''); setMode('login'); }, []);
  const openLoginAs = useCallback((email?: string) => { setLoginEmail(email ?? ''); setMode('login'); }, []);
  const openSignup = useCallback(() => setMode('signup'), []);
  const openForgot = useCallback(() => setMode('forgot'), []);
  const closeAuthModal = useCallback(() => { setMode(null); clearAuthNotice(); }, []);
  const value = useMemo(
    () => ({ openLogin, openSignup, closeAuthModal }),
    [openLogin, openSignup, closeAuthModal],
  );

  useEffect(() => {
    if (notice) openLoginAs(notice.email);
  }, [notice, openLoginAs]);

  return (
    <AuthModalContext value={value}>
      {children}
      <LoginModal
        isOpen={mode === 'login' || mode === 'forgot'}
        startOnForgot={mode === 'forgot'}
        startEmail={loginEmail}
        notice={notice?.text}
        onClose={closeAuthModal}
        onSwitchToSignup={() => { clearAuthNotice(); openSignup(); }}
      />
      <SignupModal isOpen={mode === 'signup'} onClose={closeAuthModal} onSwitchToLogin={openLoginAs} />
      <NewPasswordModal onAskForNewLink={openForgot} />
    </AuthModalContext>
  );
}

export function useAuthModal(): AuthModalValue {
  const ctx = useContext(AuthModalContext);
  if (!ctx) throw new Error('useAuthModal must be used within <AuthModalProvider>');
  return ctx;
}
