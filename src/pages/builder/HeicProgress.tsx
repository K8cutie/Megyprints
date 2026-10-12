/* ══════════════════════════════════════════════════════════════════════════
   HeicProgress — "Getting your iPhone photos ready: 12 of 44".

   iPhone photos (HEIC) are turned into JPEGs as they come in (lib/heicPhoto).
   On an Android phone a batch takes tens of seconds; with nothing but grey
   squares the customer would think the app had hung (owner, 2026-10-12).
   This says what is happening and how far along it is, over every builder
   screen (the "Making your album" screen too: it waits for these), then
   "Your iPhone photos are ready" for a moment.
   ══════════════════════════════════════════════════════════════════════════ */

import { Check } from 'lucide-react';

export default function HeicProgress({ progress }: { progress: { done: number; total: number } | null }) {
  if (!progress || progress.total === 0) return null;
  const { done, total } = progress;
  const ready = done >= total;
  const pct = Math.round((Math.min(done, total) / total) * 100);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-14 z-[150] flex justify-center px-4" data-testid="heic-progress">
      <div role="status" aria-live="polite"
        className="w-full max-w-sm rounded-2xl border border-line bg-white/95 px-4 py-3 shadow-lg">
        <div className="flex items-center gap-2.5">
          {ready ? (
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success text-white" aria-hidden="true">
              <Check size={13} strokeWidth={3} />
            </span>
          ) : (
            <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-blush border-t-peach" aria-hidden="true" />
          )}
          <p className="text-sm font-semibold text-dark" data-testid="heic-progress-text">
            {ready
              ? `Your iPhone photo${total === 1 ? ' is' : 's are'} ready`
              : `Getting your iPhone photos ready: ${done} of ${total}`}
          </p>
        </div>
        {!ready && (
          <>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-blush" aria-hidden="true">
              <div className="h-full rounded-full bg-peach transition-[width] duration-300" style={{ width: `${pct}%` }} data-testid="heic-progress-bar" />
            </div>
            <p className="mt-1.5 text-xs text-taupe">This can take a minute on a phone. Keep this page open.</p>
          </>
        )}
      </div>
    </div>
  );
}
