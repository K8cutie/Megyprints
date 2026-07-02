import { useState, useEffect } from 'react';
import { LogIn, UserPlus, Sparkles } from 'lucide-react';
import { useAuth } from '../lib/authContext';
import { useAuthModal } from './AuthModalProvider';

/* Soft sign-in nudge — a friendly, DISMISSIBLE prompt shown once per session when
   a signed-out user enters the builder. "Continue without an account" is always
   fine; the HARD gates (adding a QR, checkout) enforce sign-in at the point of
   action. Dismissal is remembered for the session so we never nag. */
const DISMISS_KEY = 'megy_soft_auth_dismissed';

export default function SoftAuthGate() {
  const { user, loading } = useAuth();
  const { openLogin, openSignup } = useAuthModal();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (user) { setShow(false); return; }
    if (sessionStorage.getItem(DISMISS_KEY)) return;
    // Let the builder paint first so the nudge doesn't fight the entry animation.
    const t = setTimeout(() => setShow(true), 700);
    return () => clearTimeout(t);
  }, [user, loading]);

  const dismiss = () => {
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* private mode */ }
    setShow(false);
  };

  if (!show || user) return null;

  return (
    <div className="fixed inset-0 z-[130] bg-black/40 flex items-center justify-center p-4" onClick={dismiss}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="w-12 h-12 rounded-full bg-[#FDE8E4] flex items-center justify-center mx-auto mb-3">
          <Sparkles size={22} className="text-[#E8A598]" />
        </div>
        <h2 className="font-display text-lg font-semibold text-[#2D2D2D]">Have an account?</h2>
        <p className="text-sm text-[#6B6B6B] mt-1.5 mb-5">
          Sign in to use all the features — save your album, add QR memories, and order prints.
        </p>
        <div className="space-y-2">
          <button
            onClick={() => { dismiss(); openLogin(); }}
            className="w-full py-2.5 rounded-lg bg-[#E8A598] text-white text-sm font-semibold hover:brightness-105 transition-all flex items-center justify-center gap-2"
          >
            <LogIn size={16} /> Log In
          </button>
          <button
            onClick={() => { dismiss(); openSignup(); }}
            className="w-full py-2.5 rounded-lg border border-[#F4C2A1] text-[#E8A598] text-sm font-semibold hover:bg-[#FDE8E4] transition-colors flex items-center justify-center gap-2"
          >
            <UserPlus size={16} /> Create an account
          </button>
        </div>
        <button onClick={dismiss} className="mt-3 text-xs text-[#9B9B9B] hover:text-[#6B6B6B]">
          Continue without an account
        </button>
      </div>
    </div>
  );
}
