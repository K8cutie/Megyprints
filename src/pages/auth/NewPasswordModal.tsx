import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Lock, Eye, EyeOff, Check } from 'lucide-react';
import { useModalDialog } from '../../lib/useModalDialog';
import { useAuth } from '../../lib/authContext';
import { useRecoveryState, endRecovery, saveNewPassword } from '../../lib/passwordRecovery';
import type { RecoveryState } from '../../lib/passwordRecovery';
import { NEW_PASSWORD_MIN, newPasswordErrorText } from '../../lib/passwordReset';

// =============================================================================
// "Make a new password" — opens by itself, on any page, when the person
// arrives from the emailed reset link (they are already signed in by then).
// Also says so when the link was used up or too old, and offers a new one.
// =============================================================================

export interface NewPasswordModalProps {
  /** Open sign-in on "Forgot your password?" to send a fresh link. */
  onAskForNewLink: () => void;
}

export function NewPasswordModal({ onAskForNewLink }: NewPasswordModalProps) {
  const recovery = useRecoveryState();
  return (
    <AnimatePresence>
      {recovery !== 'none' && <NewPasswordPanel recovery={recovery} onAskForNewLink={onAskForNewLink} />}
    </AnimatePresence>
  );
}

/** Mounted only while open, so every visit starts with an empty form. */
function NewPasswordPanel({ recovery, onAskForNewLink }: NewPasswordModalProps & { recovery: RecoveryState }) {
  const panelRef = useModalDialog<HTMLDivElement>(true, endRecovery);
  const { user } = useAuth();
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [linkGone, setLinkGone] = useState(false);
  const expired = recovery === 'expired' || linkGone;

  // Saved / run out swap the form out from under the focused button.
  useEffect(() => {
    if (saved || expired) panelRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }, [saved, expired, panelRef]);

  const handleSave = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (password.length < NEW_PASSWORD_MIN) {
        setError(`Use at least ${NEW_PASSWORD_MIN} letters or numbers.`);
        return;
      }
      setError(null);
      setSaving(true);
      try {
        const err = await saveNewPassword(password);
        if (!err) {
          setSaved(true);
        } else {
          const { text, expired: gone } = newPasswordErrorText(err);
          if (gone) setLinkGone(true);
          else setError(text);
        }
      } catch {
        setError(newPasswordErrorText({}).text);
      } finally {
        setSaving(false);
      }
    },
    [password]
  );

  const handleNewLink = useCallback(() => {
    endRecovery();
    onAskForNewLink();
  }, [onAskForNewLink]);

  const title = expired ? 'This link has run out' : saved ? 'New password saved' : 'Make a new password';

  return (
    <motion.div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={endRecovery}
      />

      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-password-title"
        tabIndex={-1}
        className="relative z-10 w-full max-w-md mx-4 rounded-2xl bg-warm-white shadow-2xl overflow-hidden"
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      >
        <div className="relative px-6 pt-6 pb-4">
          <button
            onClick={endRecovery}
            className="absolute top-4 right-4 p-1.5 rounded-full text-taupe hover:text-ink-warm hover:bg-blush-pink/10 transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
          <h2 id="new-password-title" className="text-center text-2xl font-bold text-ink-warm">{title}</h2>
          {/* Whose account: someone could email you a reset link for THEIR
              account, and you'd be signed in as them. Showing the email
              lets you notice before putting your albums there. */}
          {!expired && user?.email && (
            <p className="mt-1 text-center text-sm text-taupe break-all">For {user.email}</p>
          )}
        </div>

        <div className="px-6 pb-6">
          {expired ? (
            <>
              <p className="text-sm text-ink-warm">
                A reset link works once, for one hour. Ask for a new one and use the newest email.
              </p>
              <button
                onClick={handleNewLink}
                data-autofocus
                className="mt-5 flex w-full items-center justify-center rounded-xl bg-blush-pink px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blush-pink/25 hover:bg-coral-soft active:scale-[0.98] transition-all"
              >
                Get a new link
              </button>
            </>
          ) : saved ? (
            <>
              <p className="text-sm text-ink-warm">
                You are signed in. Next time, sign in with your email and this new password.
              </p>
              <button
                onClick={endRecovery}
                data-autofocus
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-blush-pink px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blush-pink/25 hover:bg-coral-soft active:scale-[0.98] transition-all"
              >
                <Check size={16} />
                Done
              </button>
            </>
          ) : (
            <form onSubmit={handleSave} className="space-y-4" noValidate>
              <div>
                <label htmlFor="new-password" className="block text-sm font-medium text-ink-warm mb-1">
                  New password
                </label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-taupe" />
                  <input
                    id="new-password"
                    type={show ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); if (error) setError(null); }}
                    placeholder={`At least ${NEW_PASSWORD_MIN} letters or numbers`}
                    data-autofocus
                    autoComplete="new-password"
                    className="w-full rounded-xl border-2 border-blush-deep bg-white py-2.5 pl-10 pr-20 text-sm text-ink-warm placeholder-taupe/50 focus:border-blush-pink focus:outline-none focus:ring-2 focus:ring-blush-pink/20 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    aria-pressed={show}
                    className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-taupe hover:text-ink-warm"
                  >
                    {show ? <EyeOff size={14} /> : <Eye size={14} />}
                    {show ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              {error && (
                <p role="alert" className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
              )}

              <button
                type="submit"
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blush-pink px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blush-pink/25 hover:bg-coral-soft active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {saving && (
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                )}
                {saving ? 'Saving...' : 'Save new password'}
              </button>
            </form>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

export default NewPasswordModal;
