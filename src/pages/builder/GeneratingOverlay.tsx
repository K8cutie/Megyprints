import { Sparkles } from 'lucide-react';
import { useBuilderContext } from './BuilderContext';
import type { GeneratingPhase } from './useBuilderState';

/** What each step says to the customer. Plain words, no jargon. The owner's
 *  words (2026-11-09): a wait is fine when the screen says what the phone is
 *  doing, with a real count, and never pads with a fake delay. The app's
 *  making screen says the same (mobile albumFlow GENERATING_COPY). */
export const GENERATING_COPY: Record<GeneratingPhase, string> = {
  measuring: 'Looking at your photos',
  checking: 'Checking photos for blur',
  faces: 'Finding the faces',
  places: 'Sorting by place',
  grouping: 'Grouping the moments',
  laying_out: 'Laying out the pages',
  quotes: 'Choosing the words',
  finishing: 'Almost done',
};

/** The line under a step with a count: "Checking photos for blur. 37 of 200". */
export function stageLine(phase: GeneratingPhase, count: { done: number; total: number } | null): string {
  return count && count.total > 0 ? `${GENERATING_COPY[phase]}. ${count.done} of ${count.total}` : GENERATING_COPY[phase];
}

/** "200 photos" under the title. */
export function photosLine(n: number): string {
  return `${n} photo${n === 1 ? '' : 's'}`;
}

/**
 * "Making your album" screen — shown for the whole of a generation so a
 * several-second wait never looks like a hang. Sits above everything in the
 * builder (the wizard is z-95, the sign-in gate z-130). Its own blur is fine:
 * the fixed-position gotcha is a blur on an ANCESTOR of fixed elements, and
 * nothing is nested under this one.
 */
export default function GeneratingOverlay() {
  const { generating, generatingCount, heicProgress, uploadedPhotos } = useBuilderContext();
  if (!generating) return null;
  // Tapped Generate while iPhone photos are still being made ready: the album
  // waits for them, so say that, with the count (owner, 2026-10-12: a long
  // wait with no word looks like a hang). Not "a few seconds".
  const heicWait = generating === 'measuring' && heicProgress && heicProgress.done < heicProgress.total ? heicProgress : null;
  const count = heicWait ?? generatingCount;
  const photos = (uploadedPhotos ?? []).filter((p) => !p.leftOut).length;
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
          <p className="mt-0.5 text-sm text-light" data-testid="generating-photos">{photosLine(photos)}</p>
          <p className="mt-2 text-sm text-dark" data-testid="generating-stage">
            {heicWait ? `Getting your photos ready: ${heicWait.done} of ${heicWait.total}` : stageLine(generating, generatingCount)}
          </p>
          {count && count.total > 0 && (
            <div className="mx-auto mt-2 h-1.5 w-48 overflow-hidden rounded-full bg-blush" aria-hidden="true">
              <div className="h-full rounded-full bg-peach transition-[width] duration-300"
                style={{ width: `${Math.round((count.done / count.total) * 100)}%` }} />
            </div>
          )}
        </div>
        <p className="text-xs text-light/80">
          {heicWait ? 'This can take a minute on a phone. Keep this page open.' : 'Your photos stay on this device.'}
        </p>
      </div>
    </div>
  );
}
