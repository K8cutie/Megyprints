import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/* ══════════════════════════════════════════════════════════════════════════
 *  BuilderBackGuard — stop the mobile Back button from nuking a draft
 *  ──────────────────────────────────────────────────────────────────────────
 *  The builder is a single route (`/builder`) whose steps are internal state —
 *  the URL never changes as you work. So a single hardware/browser Back press
 *  pops the `/builder` entry off history and, on an installed PWA (no chrome to
 *  fall back to), CLOSES THE APP — taking any unsaved, in-memory draft with it.
 *
 *  This arms a sentinel history entry so the FIRST Back press lands back here
 *  instead of leaving. On that press we:
 *    1. flush the draft to localStorage SYNCHRONOUSLY (belt: even a force-close
 *       right after can't lose work sitting in the 30s autosave debounce),
 *    2. re-arm immediately (so the next Back is captured too),
 *    3. give Back a natural in-app meaning where it's unambiguous (Preview →
 *       Edit), otherwise ask before leaving — never a silent exit.
 *
 *  Robustness notes:
 *   • HashRouter-safe: the sentinel is pushed with the SAME url (hash), so
 *     react-router sees no location change and stays on the builder. Only our
 *     own popstate handler reacts.
 *   • No framer-motion: the confirm is the user's escape hatch, so it renders
 *     with a plain conditional — it can never get stuck mid-animation.
 * ══════════════════════════════════════════════════════════════════════════ */

interface BuilderBackGuardProps {
  /** Synchronous localStorage flush of the current draft (builder `saveDraftNow`). */
  flush: () => void;
  /** Current builder phase ('setup' | 'edit' | 'preview') — lets Back mean
   *  "previous screen" where that's clear. Typed loosely to match the store. */
  phase: string;
  /** Step back one screen without leaving the builder (Preview → Edit). */
  onStepBack: () => void;
}

export default function BuilderBackGuard({ flush, phase, onStepBack }: BuilderBackGuardProps) {
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Latest props in refs so the mount-once popstate listener always reads fresh.
  const flushRef = useRef(flush);
  const phaseRef = useRef(phase);
  const stepBackRef = useRef(onStepBack);
  flushRef.current = flush;
  phaseRef.current = phase;
  stepBackRef.current = onStepBack;
  // Set while a deliberate "Leave" navigation is in flight so the guard stands down.
  const leavingRef = useRef(false);

  // Push one sentinel entry (same URL → react-router ignores it) so the next
  // Back press is captured by our handler instead of popping the builder route.
  const arm = useCallback(() => {
    try { window.history.pushState({ __mpBuilderGuard: true }, ''); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    arm(); // arm on mount

    const onPop = () => {
      if (leavingRef.current) return; // a deliberate Leave is already navigating away

      // Save first — this is the whole point. localStorage.setItem is synchronous,
      // so the draft is durable before we do anything else.
      try { flushRef.current(); } catch { /* ignore */ }

      // Re-arm right away: the Back press consumed our sentinel, so push a fresh
      // one to capture the NEXT press too. A rapid double-Back can never escape.
      arm();

      if (phaseRef.current === 'preview') {
        // Preview → Edit: hardware Back mirrors the on-screen Back, no prompt.
        stepBackRef.current();
      } else {
        // Setup / Edit: this IS the exit point — confirm before leaving.
        setConfirmOpen(true);
      }
    };

    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [arm]);

  const stay = useCallback(() => setConfirmOpen(false), []);

  const leave = useCallback(() => {
    leavingRef.current = true;
    try { flushRef.current(); } catch { /* ignore */ } // final save before leaving
    setConfirmOpen(false);
    navigate('/');
  }, [navigate]);

  if (!confirmOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mp-backguard-title"
      onClick={stay}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden"
      >
        <div className="px-7 pt-7 pb-6 text-center">
          <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-[#FDE8E4] flex items-center justify-center">
            <ArrowLeft size={24} className="text-[#E8A598]" />
          </div>
          <h2 id="mp-backguard-title" className="font-display text-xl font-bold text-[#2D2D2D] mb-1.5">
            Leave the builder?
          </h2>
          <p className="text-[#6B6B6B] text-sm leading-relaxed mb-6">
            Your progress is saved — you can pick up right where you left off. Leave now,
            or keep working on your album?
          </p>

          <div className="flex flex-col gap-2.5">
            <button
              onClick={stay}
              className="w-full py-3 bg-[#F4C2A1] text-white font-semibold rounded-xl hover:brightness-105 transition-all"
            >
              Keep editing
            </button>
            <button
              onClick={leave}
              className="w-full py-3 bg-white border-2 border-[#EAEAEA] text-[#6B6B6B] font-semibold rounded-xl hover:bg-[#F7F7F7] transition-all"
            >
              Leave
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
