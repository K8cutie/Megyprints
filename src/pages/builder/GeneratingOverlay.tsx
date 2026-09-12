import { Sparkles } from 'lucide-react';
import { useBuilderContext } from './BuilderContext';
import type { GeneratingPhase } from './useBuilderState';

/** What each stage says to the customer. Plain words, no jargon. */
export const GENERATING_COPY: Record<GeneratingPhase, string> = {
  measuring: 'Looking at your photos…',
  laying_out: 'Arranging them across the pages…',
  quotes: 'Choosing lines for your theme…',
  finishing: 'Almost there…',
};

/**
 * "Making your album" screen — shown for the whole of a generation so a
 * several-second wait never looks like a hang. Sits above everything in the
 * builder (the wizard is z-95, the sign-in gate z-130). Its own blur is fine:
 * the fixed-position gotcha is a blur on an ANCESTOR of fixed elements, and
 * nothing is nested under this one.
 */
export default function GeneratingOverlay() {
  const { generating } = useBuilderContext();
  if (!generating) return null;
  return (
    <div
      className="fixed inset-0 z-[140] bg-warm-white/85 backdrop-blur-sm flex items-center justify-center p-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-testid="generating-overlay"
    >
      <div className="flex flex-col items-center text-center gap-4 max-w-xs">
        <div className="relative w-16 h-16">
          <span className="absolute inset-0 rounded-full border-[3px] border-blush border-t-peach animate-spin" />
          <Sparkles size={22} className="absolute inset-0 m-auto text-peach animate-pulse" />
        </div>
        <div>
          <p className="text-lg font-semibold text-dark">Making your album</p>
          <p className="mt-1 text-sm text-light">{GENERATING_COPY[generating]}</p>
        </div>
        <p className="text-xs text-light/80">Please stand by while Megy does the magic. This takes a few seconds.</p>
      </div>
    </div>
  );
}
