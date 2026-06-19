import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, Lock, UserPlus, User } from 'lucide-react';
import { useAuth } from '../../lib/authContext';

// =============================================================================
// Types
// =============================================================================

export interface SignupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToLogin: () => void;
}

// =============================================================================
// Component
// =============================================================================

export function SignupModal({ isOpen, onClose, onSwitchToLogin }: SignupModalProps) {
  const { signup, loading, error, clearError } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    fullName?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Clear fields when modal opens
  useEffect(() => {
    if (isOpen) {
      setFullName('');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setFieldErrors({});
      setSuccessMessage(null);
      clearError();
    }
  }, [isOpen, clearError]);

  const validate = useCallback((): boolean => {
    const errors: {
      fullName?: string;
      email?: string;
      password?: string;
      confirmPassword?: string;
    } = {};

    if (!fullName.trim()) {
      errors.fullName = 'Full name is required';
    }

    if (!email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^\S+@\S+\.\S+$/.test(email)) {
      errors.email = 'Please enter a valid email';
    }

    if (!password) {
      errors.password = 'Password is required';
    } else if (password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    }

    if (!confirmPassword) {
      errors.confirmPassword = 'Please confirm your password';
    } else if (confirmPassword !== password) {
      errors.confirmPassword = 'Passwords do not match';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, [fullName, email, password, confirmPassword]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      clearError();
      setSuccessMessage(null);

      if (!validate()) return;

      try {
        await signup(email, password, { full_name: fullName.trim() });
        setSuccessMessage('Account created! Check your email to confirm your account.');
        // Don't close immediately — let user see the success message
      } catch {
        // Error is handled by auth context — displayed below
      }
    },
    [clearError, validate, signup, email, password, fullName]
  );

  const handleSwitch = useCallback(() => {
    setFullName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setFieldErrors({});
    setSuccessMessage(null);
    clearError();
    onSwitchToLogin();
  }, [onSwitchToLogin, clearError]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center"
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
            className="relative z-10 w-full max-w-md mx-4 rounded-2xl bg-[#FFFBF7] shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
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
                <h2 className="text-2xl font-bold text-[#4A423F]">Create Account</h2>
                <p className="mt-1 text-sm text-[#8B7E7A]">
                  Start building beautiful photo albums
                </p>
              </div>
            </div>

            {/* Content */}
            <div className="px-6 pb-6">
              {/* Success Message */}
              {successMessage && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700"
                >
                  {successMessage}
                </motion.div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Full Name */}
                <div>
                  <label
                    htmlFor="signup-fullname"
                    className="block text-sm font-medium text-[#4A423F] mb-1"
                  >
                    Full Name
                  </label>
                  <div className="relative">
                    <User
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8B7E7A]"
                    />
                    <input
                      id="signup-fullname"
                      type="text"
                      value={fullName}
                      onChange={(e) => {
                        setFullName(e.target.value);
                        if (fieldErrors.fullName)
                          setFieldErrors((p) => ({ ...p, fullName: undefined }));
                      }}
                      placeholder="Your full name"
                      className="w-full rounded-xl border-2 border-[#E8D5D0] bg-white py-2.5 pl-10 pr-4 text-sm text-[#4A423F] placeholder-[#8B7E7A]/50 focus:border-[#E8A598] focus:outline-none focus:ring-2 focus:ring-[#E8A598]/20 transition-all"
                      autoComplete="name"
                    />
                  </div>
                  {fieldErrors.fullName && (
                    <p className="mt-1 text-xs text-red-500">{fieldErrors.fullName}</p>
                  )}
                </div>

                {/* Email */}
                <div>
                  <label
                    htmlFor="signup-email"
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
                      id="signup-email"
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (fieldErrors.email)
                          setFieldErrors((p) => ({ ...p, email: undefined }));
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
                    htmlFor="signup-password"
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
                      id="signup-password"
                      type="password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (fieldErrors.password)
                          setFieldErrors((p) => ({ ...p, password: undefined }));
                      }}
                      placeholder="At least 8 characters"
                      className="w-full rounded-xl border-2 border-[#E8D5D0] bg-white py-2.5 pl-10 pr-4 text-sm text-[#4A423F] placeholder-[#8B7E7A]/50 focus:border-[#E8A598] focus:outline-none focus:ring-2 focus:ring-[#E8A598]/20 transition-all"
                      autoComplete="new-password"
                    />
                  </div>
                  {fieldErrors.password && (
                    <p className="mt-1 text-xs text-red-500">{fieldErrors.password}</p>
                  )}
                </div>

                {/* Confirm Password */}
                <div>
                  <label
                    htmlFor="signup-confirm"
                    className="block text-sm font-medium text-[#4A423F] mb-1"
                  >
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8B7E7A]"
                    />
                    <input
                      id="signup-confirm"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        if (fieldErrors.confirmPassword)
                          setFieldErrors((p) => ({ ...p, confirmPassword: undefined }));
                      }}
                      placeholder="Re-enter your password"
                      className="w-full rounded-xl border-2 border-[#E8D5D0] bg-white py-2.5 pl-10 pr-4 text-sm text-[#4A423F] placeholder-[#8B7E7A]/50 focus:border-[#E8A598] focus:outline-none focus:ring-2 focus:ring-[#E8A598]/20 transition-all"
                      autoComplete="new-password"
                    />
                  </div>
                  {fieldErrors.confirmPassword && (
                    <p className="mt-1 text-xs text-red-500">{fieldErrors.confirmPassword}</p>
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
                  disabled={loading || !!successMessage}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#E8A598] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-[#E8A598]/25 hover:bg-[#D8958D] hover:shadow-xl hover:shadow-[#E8A598]/30 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <UserPlus size={16} />
                  )}
                  {loading ? 'Creating account...' : 'Create Account'}
                </button>
              </form>

              {/* Switch to login */}
              <p className="mt-5 text-center text-sm text-[#8B7E7A]">
                Already have an account?{' '}
                <button
                  onClick={handleSwitch}
                  className="font-medium text-[#E8A598] hover:text-[#D8958D] transition-colors"
                >
                  Log in
                </button>
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default SignupModal;
