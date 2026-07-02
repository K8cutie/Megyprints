import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, Lock, LogIn, Chrome } from 'lucide-react';
import { useAuth } from '../../lib/authContext';

// =============================================================================
// Types
// =============================================================================

export interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToSignup: () => void;
}

// =============================================================================
// Component
// =============================================================================

export function LoginModal({ isOpen, onClose, onSwitchToSignup }: LoginModalProps) {
  const { login, signInWithOAuth, loading, error, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  // Clear fields when modal opens
  useEffect(() => {
    if (isOpen) {
      setEmail('');
      setPassword('');
      setFieldErrors({});
      clearError();
    }
  }, [isOpen, clearError]);

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
            className="relative z-10 w-full max-w-md mx-4 rounded-2xl bg-[#FFFBF7] shadow-2xl overflow-hidden"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          >
            {/* Header */}
            <div className="relative px-6 pt-6 pb-4">
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-1.5 rounded-full text-[#8B7E7A] hover:text-[#4A423F] hover:bg-[#E8A598]/10 transition-colors"
                aria-label="Close"
              >
                <X size={20} />
              </button>

              <div className="text-center">
                <h2 className="text-2xl font-bold text-[#4A423F]">Welcome Back</h2>
                <p className="mt-1 text-sm text-[#8B7E7A]">
                  Sign in to access your albums and photos
                </p>
              </div>
            </div>

            {/* Content */}
            <div className="px-6 pb-6">
              {/* Google Sign In */}
              <button
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2.5 rounded-xl border-2 border-[#E8D5D0] bg-white px-4 py-3 text-sm font-medium text-[#4A423F] hover:bg-[#FFF5F2] hover:border-[#E8A598]/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Chrome size={18} className="text-[#4285F4]" />
                Sign in with Google
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3 my-5">
                <div className="h-px flex-1 bg-[#E8D5D0]" />
                <span className="text-xs text-[#8B7E7A] font-medium uppercase tracking-wide">
                  or use email
                </span>
                <div className="h-px flex-1 bg-[#E8D5D0]" />
              </div>

              {/* Email/Password Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Email */}
                <div>
                  <label
                    htmlFor="login-email"
                    className="block text-sm font-medium text-[#4A423F] mb-1"
                  >
                    Email
                  </label>
                  <div className="relative">
                    <Mail
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8B7E7A]"
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
                      className="w-full rounded-xl border-2 border-[#E8D5D0] bg-white py-2.5 pl-10 pr-4 text-sm text-[#4A423F] placeholder-[#8B7E7A]/50 focus:border-[#E8A598] focus:outline-none focus:ring-2 focus:ring-[#E8A598]/20 transition-all"
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
                    className="block text-sm font-medium text-[#4A423F] mb-1"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <Lock
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8B7E7A]"
                    />
                    <input
                      id="login-password"
                      type="password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (fieldErrors.password)
                          setFieldErrors((p) => ({ ...p, password: undefined }));
                      }}
                      placeholder="Enter your password"
                      className="w-full rounded-xl border-2 border-[#E8D5D0] bg-white py-2.5 pl-10 pr-4 text-sm text-[#4A423F] placeholder-[#8B7E7A]/50 focus:border-[#E8A598] focus:outline-none focus:ring-2 focus:ring-[#E8A598]/20 transition-all"
                      autoComplete="current-password"
                    />
                  </div>
                  {fieldErrors.password && (
                    <p className="mt-1 text-xs text-red-500">{fieldErrors.password}</p>
                  )}
                </div>

                {/* Global Error */}
                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2"
                  >
                    {error}
                  </motion.p>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#E8A598] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-[#E8A598]/25 hover:bg-[#D8958D] hover:shadow-xl hover:shadow-[#E8A598]/30 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
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
              <p className="mt-5 text-center text-sm text-[#8B7E7A]">
                Don&apos;t have an account?{' '}
                <button
                  onClick={handleSwitch}
                  className="font-medium text-[#E8A598] hover:text-[#D8958D] transition-colors"
                >
                  Sign up
                </button>
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default LoginModal;
