import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, LogIn, Chrome, Send } from 'lucide-react';
import { useAuth } from '../../lib/authContext';
import { useModalDialog } from '../../lib/useModalDialog';
import { sendResetLink, resendSignupLink } from '../../lib/passwordRecovery';
import { sendLinkErrorText } from '../../lib/passwordReset';
import { signInErrorText } from '../../lib/accountErrors';
import { PasswordInput } from './PasswordInput';

// =============================================================================
// Types
// =============================================================================

export interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToSignup: () => void;
  /** Open straight on "Forgot your password?" (from an expired reset link). */
  startOnForgot?: boolean;
  /** Fill the email (sign-up found this email already has an account). */
  startEmail?: string;
  /** Shown above the form: why Google sign-in didn't finish (authNotice.ts). */
  notice?: string | null;
}

/** signin → forgot ("Email me a link") → sent ("Check your email"). */
type View = 'signin' | 'forgot' | 'sent';

const HEADINGS: Record<View, { title: string; sub: string }> = {
  signin: { title: 'Welcome Back', sub: 'Sign in to access your albums and photos' },
  forgot: { title: 'Forgot your password?', sub: 'We will email you a link to make a new one.' },
  sent: { title: 'Check your email', sub: 'The link to make a new password is on its way.' },
};

// =============================================================================
// Component
// =============================================================================

export function LoginModal({ isOpen, onClose, onSwitchToSignup, startOnForgot = false, startEmail = '', notice = null }: LoginModalProps) {
  // Keyboard: focus in, Tab kept inside, Escape closes, focus back after (KB-2).
  const panelRef = useModalDialog<HTMLDivElement>(isOpen, onClose);
  const { login, signInWithOAuth, loading, error, clearError } = useAuth();
  const [view, setView] = useState<View>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  // "Send the link again" for an account still waiting for its email link.
  const [resent, setResent] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [resendError, setResendError] = useState<string | null>(null);

  // Clear fields when modal opens
  useEffect(() => {
    if (isOpen) {
      setView(startOnForgot ? 'forgot' : 'signin');
      setEmail(startEmail);
      setPassword('');
      setFieldErrors({});
      setSendError(null);
      setResent('idle');
      clearError();
    }
  }, [isOpen, startOnForgot, startEmail, clearError]);

  const signInError = error ? signInErrorText(error) : null;

  const handleResend = useCallback(async () => {
    setResent('sending');
    setResendError(null);
    try {
      const err = await resendSignupLink(email);
      // Supabase allows one link a minute per email: say "wait", not "failed".
      if (err) setResendError(sendLinkErrorText(err));
      setResent(err ? 'failed' : 'sent');
    } catch {
      setResendError(sendLinkErrorText({}));
      setResent('failed');
    }
  }, [email]);

  // Switching views unmounts the button that was pressed — keep the keyboard
  // in the dialog by focusing the new view's first field.
  useEffect(() => {
    if (isOpen) panelRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }, [view, isOpen, panelRef]);

  const showView = useCallback((next: View) => {
    setFieldErrors({});
    setSendError(null);
    clearError();
    setView(next);
  }, [clearError]);

  const handleSendLink = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSendError(null);
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
        setFieldErrors({ email: email.trim() ? 'Please enter a valid email' : 'Email is required' });
        return;
      }
      setFieldErrors({});
      setSending(true);
      try {
        const err = await sendResetLink(email);
        if (err) setSendError(sendLinkErrorText(err));
        else setView('sent');
      } catch {
        setSendError(sendLinkErrorText({}));
      } finally {
        setSending(false);
      }
    },
    [email]
  );

  const validate = useCallback((): boolean => {
    const errors: { email?: string; password?: string } = {};

    if (!email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^\S+@\S+\.\S+$/.test(email)) {
      errors.email = 'Please enter a valid email';
    }

    if (!password) {
      errors.password = 'Password is required';
    } else if (password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, [email, password]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      clearError();

      if (!validate()) return;

      try {
        await login(email, password);
        onClose();
      } catch {
        // Error is handled by auth context — displayed below
      }
    },
    [clearError, validate, login, email, password, onClose]
  );

  const handleGoogleSignIn = useCallback(async () => {
    clearError();
    try {
      await signInWithOAuth('google');
    } catch {
      // Error handled by auth context
    }
  }, [clearError, signInWithOAuth]);

  const handleSwitch = useCallback(() => {
    setEmail('');
    setPassword('');
    setFieldErrors({});
    clearError();
    onSwitchToSignup();
  }, [onSwitchToSignup, clearError]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="login-title"
            tabIndex={-1}
            className="relative z-10 w-full max-w-md mx-4 rounded-2xl bg-warm-white shadow-2xl overflow-hidden"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          >
            {/* Header */}
            <div className="relative px-6 pt-6 pb-4">
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-1.5 rounded-full text-taupe hover:text-ink-warm hover:bg-blush-pink/10 transition-colors"
                aria-label="Close"
              >
                <X size={20} />
              </button>

              <div className="text-center">
                <h2 id="login-title" className="text-2xl font-bold text-ink-warm">{HEADINGS[view].title}</h2>
                <p className="mt-1 text-sm text-taupe">
                  {HEADINGS[view].sub}
                </p>
              </div>
            </div>

            {/* Content */}
            {view === 'forgot' && (
              <div className="px-6 pb-6">
                <form onSubmit={handleSendLink} className="space-y-4" noValidate>
                  <div>
                    <label htmlFor="forgot-email" className="block text-sm font-medium text-ink-warm mb-1">
                      The email you signed up with
                    </label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-taupe" />
                      <input
                        id="forgot-email"
                        type="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (fieldErrors.email) setFieldErrors({});
                        }}
                        placeholder="you@example.com"
                        data-autofocus
                        className="w-full rounded-xl border-2 border-blush-deep bg-white py-2.5 pl-10 pr-4 text-sm text-ink-warm placeholder-taupe/50 focus:border-blush-pink focus:outline-none focus:ring-2 focus:ring-blush-pink/20 transition-all"
                        autoComplete="email"
                      />
                    </div>
                    {fieldErrors.email && <p className="mt-1 text-xs text-red-500">{fieldErrors.email}</p>}
                  </div>

                  {/* error = the Google button below failed */}
                  {(sendError || error) && (
                    <p role="alert" className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{sendError || error}</p>
                  )}

                  <button
                    type="submit"
                    disabled={sending}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-blush-pink px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blush-pink/25 hover:bg-coral-soft active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {sending ? (
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      <Send size={16} />
                    )}
                    {sending ? 'Sending...' : 'Email me a link'}
                  </button>
                </form>

                {/* Google sign-in lands in the same account when the Gmail
                    matches (Supabase links identities by verified email), so a
                    Gmail user needs no email at all. */}
                <div className="mt-5 rounded-xl bg-blush-deep/40 px-4 py-3">
                  <p className="text-sm text-ink-warm">
                    Signed up with a Gmail? Sign in with Google using that same Gmail. Your albums will be there.
                  </p>
                  <button
                    onClick={handleGoogleSignIn}
                    disabled={loading}
                    className="mt-3 flex w-full items-center justify-center gap-2.5 rounded-xl border-2 border-blush-deep bg-white px-4 py-2.5 text-sm font-medium text-ink-warm hover:border-blush-pink/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Chrome size={18} className="text-[#4285F4]" />
                    Sign in with Google
                  </button>
                </div>

                <p className="mt-5 text-center text-sm">
                  <button onClick={() => showView('signin')} className="font-medium text-blush-pink hover:text-coral-soft transition-colors">
                    Back to sign in
                  </button>
                </p>
              </div>
            )}

            {view === 'sent' && (
              <div className="px-6 pb-6">
                <p className="text-sm text-ink-warm">
                  We sent a link to <span className="font-semibold break-all">{email.trim()}</span>. Open it to make a new password.
                </p>
                <p className="mt-3 text-sm text-taupe">
                  Not there after a few minutes? Look in Spam. Check that this is the email you signed up with.
                </p>
                <button
                  onClick={onClose}
                  data-autofocus
                  className="mt-5 flex w-full items-center justify-center rounded-xl bg-blush-pink px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blush-pink/25 hover:bg-coral-soft active:scale-[0.98] transition-all"
                >
                  Done
                </button>
                <p className="mt-5 text-center text-sm">
                  <button onClick={() => showView('signin')} className="font-medium text-blush-pink hover:text-coral-soft transition-colors">
                    Back to sign in
                  </button>
                </p>
              </div>
            )}

            {view === 'signin' && (
            <div className="px-6 pb-6">
              {notice && (
                <p role="alert" className="mb-4 rounded-xl bg-blush-deep/40 px-4 py-3 text-sm text-ink-warm break-words">
                  {notice}
                </p>
              )}

              {/* Google Sign In */}
              <button
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2.5 rounded-xl border-2 border-blush-deep bg-white px-4 py-3 text-sm font-medium text-ink-warm hover:bg-blush hover:border-blush-pink/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Chrome size={18} className="text-[#4285F4]" />
                Sign in with Google
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3 my-5">
                <div className="h-px flex-1 bg-blush-deep" />
                <span className="text-xs text-taupe font-medium uppercase tracking-wide">
                  or use email
                </span>
                <div className="h-px flex-1 bg-blush-deep" />
              </div>

              {/* Email/Password Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Email */}
                <div>
                  <label
                    htmlFor="login-email"
                    className="block text-sm font-medium text-ink-warm mb-1"
                  >
                    Email
                  </label>
                  <div className="relative">
                    <Mail
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-taupe"
                    />
                    <input
                      id="login-email"
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: undefined }));
                      }}
                      placeholder="you@example.com"
                      data-autofocus
                      className="w-full rounded-xl border-2 border-blush-deep bg-white py-2.5 pl-10 pr-4 text-sm text-ink-warm placeholder-taupe/50 focus:border-blush-pink focus:outline-none focus:ring-2 focus:ring-blush-pink/20 transition-all"
                      autoComplete="email"
                    />
                  </div>
                  {fieldErrors.email && (
                    <p className="mt-1 text-xs text-red-500">{fieldErrors.email}</p>
                  )}
                </div>

                {/* Password */}
                <div>
                  <label
                    htmlFor="login-password"
                    className="block text-sm font-medium text-ink-warm mb-1"
                  >
                    Password
                  </label>
                  <PasswordInput
                    id="login-password"
                    value={password}
                    onChange={(v) => {
                      setPassword(v);
                      if (fieldErrors.password)
                        setFieldErrors((p) => ({ ...p, password: undefined }));
                    }}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                  />
                  {fieldErrors.password && (
                    <p className="mt-1 text-xs text-red-500">{fieldErrors.password}</p>
                  )}
                  <div className="mt-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => showView('forgot')}
                      className="text-sm font-medium text-blush-pink hover:text-coral-soft transition-colors"
                    >
                      Forgot password?
                    </button>
                  </div>
                </div>

                {/* Global Error */}
                {signInError && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2"
                  >
                    <p>{signInError.text}</p>
                    {signInError.unconfirmed && (
                      resent === 'sent' ? (
                        <p className="mt-1 text-ink-warm">Sent to {email.trim()}. Not there? Look in Spam.</p>
                      ) : (
                        <>
                          {resendError && <p className="mt-1">{resendError}</p>}
                          <button
                            type="button"
                            onClick={handleResend}
                            disabled={resent === 'sending'}
                            className="mt-1 font-semibold text-blush-pink hover:text-coral-soft transition-colors disabled:opacity-60"
                          >
                            {resent === 'sending' ? 'Sending...' : 'Send the link again'}
                          </button>
                        </>
                      )
                    )}
                  </motion.div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-blush-pink px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blush-pink/25 hover:bg-coral-soft hover:shadow-xl hover:shadow-blush-pink/30 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <LogIn size={16} />
                  )}
                  {loading ? 'Signing in...' : 'Sign In'}
                </button>
              </form>

              {/* Switch to signup */}
              <p className="mt-5 text-center text-sm text-taupe">
                Don&apos;t have an account?{' '}
                <button
                  onClick={handleSwitch}
                  className="font-medium text-blush-pink hover:text-coral-soft transition-colors"
                >
                  Sign up
                </button>
              </p>
            </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default LoginModal;
