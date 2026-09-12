import { LogIn, UserPlus, PencilRuler } from 'lucide-react';
import { useAuthModal } from '../../components/AuthModalProvider';

/* Shown ONCE per session when a signed-out customer enters Studio. People who
   go into Studio spend days on an album; signed in, every page backs up as
   they work. "Continue without an account" is always allowed — this is a
   nudge, not a wall (the hard gates stay at QR + checkout). */
export const STUDIO_GATE_KEY = 'megy_studio_gate_dismissed';

export default function StudioGate({ onContinue, onClose }: { onContinue: () => void; onClose: () => void }) {
  const { openLogin, openSignup } = useAuthModal();
  const dismiss = () => { try { sessionStorage.setItem(STUDIO_GATE_KEY, '1'); } catch { /* private mode */ } };
  return (
    <div className="fixed inset-0 z-[130] bg-black/40 flex items-center justify-center p-4" onClick={onClose} data-testid="studio-gate">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="w-12 h-12 rounded-full bg-blush flex items-center justify-center mx-auto mb-3">
          <PencilRuler size={22} className="text-blush-pink" />
        </div>
        <h2 className="font-display text-lg font-semibold text-dark">Studio saves to your account</h2>
        <p className="text-sm text-medium mt-1.5 mb-5">
          People who go into Studio spend hours, sometimes days, on an album. Sign in once and every page backs up as you work, so a cleared browser never costs you the work.
        </p>
        <div className="space-y-2">
          <button onClick={() => { dismiss(); onClose(); openLogin(); }}
            className="w-full py-2.5 rounded-lg bg-blush-pink text-white text-sm font-semibold hover:brightness-105 transition-all flex items-center justify-center gap-2">
            <LogIn size={16} /> Log in
          </button>
          <button onClick={() => { dismiss(); onClose(); openSignup(); }}
            className="w-full py-2.5 rounded-lg border border-peach text-blush-pink text-sm font-semibold hover:bg-blush transition-colors flex items-center justify-center gap-2">
            <UserPlus size={16} /> Create an account
          </button>
        </div>
        <button onClick={() => { dismiss(); onContinue(); }} className="mt-3 text-xs text-light hover:text-medium">
          Continue without an account
        </button>
      </div>
    </div>
  );
}
