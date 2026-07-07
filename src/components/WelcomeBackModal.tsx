import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, BookOpen, Sparkles, User } from 'lucide-react';
import { useAuth } from '../lib/authContext';

/* ══════════════════════════════════════════════════════════════════════════
   WelcomeBackModal — Shown once on login to greet returning users
   ══════════════════════════════════════════════════════════════════════════ */

const MODAL_DISMISS_KEY = 'megy-welcome-dismissed';
const MODAL_COOLDOWN_HOURS = 24;

interface WelcomeBackModalProps {
  onViewProjects?: () => void;
}

function getDisplayName(user: ReturnType<typeof useAuth>['user']): string {
  if (!user) return 'there';
  const meta = user.user_metadata;
  const name = (meta?.full_name as string) || (meta?.name as string) || '';
  if (name) return name.split(' ')[0]; // First name only
  const email = user.email || '';
  if (email) return email.split('@')[0]; // Fallback to email prefix
  return 'there';
}

function wasRecentlyDismissed(): boolean {
  try {
    const raw = localStorage.getItem(MODAL_DISMISS_KEY);
    if (!raw) return false;
    const dismissedAt = new Date(raw);
    const now = new Date();
    const hoursSince = (now.getTime() - dismissedAt.getTime()) / (1000 * 60 * 60);
    return hoursSince < MODAL_COOLDOWN_HOURS;
  } catch {
    return false;
  }
}

function markDismissed(): void {
  try {
    localStorage.setItem(MODAL_DISMISS_KEY, new Date().toISOString());
  } catch { /* ignore */ }
}

export function WelcomeBackModal({ onViewProjects }: WelcomeBackModalProps) {
  const { user, loading } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  // Show modal when user logs in (user transitions from null to object)
  useEffect(() => {
    if (loading) return;
    if (!user) {
      setIsOpen(false);
      return;
    }
    // Only show if not recently dismissed
    if (!wasRecentlyDismissed()) {
      // Small delay for smooth entry after page load
      const timer = setTimeout(() => setIsOpen(true), 800);
      return () => clearTimeout(timer);
    }
  }, [user, loading]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    markDismissed();
  }, []);

  const handleViewProjects = useCallback(() => {
    handleClose();
    onViewProjects?.();
  }, [handleClose, onViewProjects]);

  const handleCreateNew = useCallback(() => {
    handleClose();
    // HashRouter route — a bare "/builder" path 404s on Vercel (and lands on Home).
    window.location.hash = '#/builder';
  }, [handleClose]);

  const firstName = getDisplayName(user);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300, delay: 0.1 }}
            onClick={(e) => e.stopPropagation()}
            className="relative bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden"
          >
            {/* Decorative header gradient */}
            <div
              className="h-24 relative"
              style={{
                background: 'linear-gradient(135deg, #F4C2A1 0%, #E8A598 50%, #B8A9D9 100%)',
              }}
            >
              {/* Close button */}
              <button
                onClick={handleClose}
                className="absolute top-3 right-3 p-1.5 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors"
              >
                <X size={16} />
              </button>

              {/* Avatar circle */}
              <div className="absolute -bottom-10 left-1/2 -translate-x-1/2">
                <div className="w-20 h-20 rounded-full bg-white shadow-lg flex items-center justify-center border-4 border-white">
                  <User size={32} className="text-[#E8A598]" />
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="pt-14 pb-8 px-8 text-center">
              <h2 className="font-display text-2xl font-bold text-[#2D2D2D] mb-1">
                Welcome back, {firstName}!
              </h2>
              <p className="text-[#6B6B6B] text-sm leading-relaxed mb-6">
                Ready to continue working on your albums? You can pick up right where you left off.
              </p>

              {/* Action buttons */}
              <div className="flex flex-col gap-3">
                <button
                  onClick={handleViewProjects}
                  className="flex items-center justify-center gap-2 w-full py-3 bg-[#F4C2A1] text-white font-semibold rounded-xl hover:brightness-105 transition-all"
                >
                  <BookOpen size={18} />
                  View My Projects
                </button>

                <button
                  onClick={handleCreateNew}
                  className="flex items-center justify-center gap-2 w-full py-3 bg-white border-2 border-[#F4C2A1] text-[#F4C2A1] font-semibold rounded-xl hover:bg-[#F4C2A1]/5 transition-all"
                >
                  <Sparkles size={18} />
                  Create New Album
                </button>

                <button
                  onClick={handleClose}
                  className="text-[#9B9B9B] text-sm hover:text-[#6B6B6B] transition-colors pt-1"
                >
                  Maybe later
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default WelcomeBackModal;
