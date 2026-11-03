/* ══════════════════════════════════════════════════════════════════════════
   StartNewAlbumPrompt — "Start Creating" with an album already in progress.

   Home's "Start Creating" opened a brand-new album with no question asked
   (1-star testers, 2026-10-04: the Quitter lost an album that way). Signed
   out, starting new DELETES the album in progress from the device — there is
   no account to keep it — and signed in, an album with only a name was not
   worth saving, so it went too. So when this device has an album in
   progress, Start Creating asks first; continuing is the way on.

   Testing phase, in the Android app: when the album in progress is a sample
   album made on an earlier day, the way on is "Make today's sample album"
   (owner, 2026-10-28: "The resume will confuse testers"), as on "Welcome
   back" (ResumePrompt). Continuing would open the old day's album.
   ══════════════════════════════════════════════════════════════════════════ */

import { useState } from 'react';
import { X, BookOpen, Sparkles } from 'lucide-react';
import type { LocalDraftSummary } from '../lib/localDraft';
import { useModalDialog } from '../lib/useModalDialog';
import MegyMascot from './MegyMascot';
import { isNativeShell } from '../lib/nativeShell';
import { showSamplePhotos, sampleAlbumIsFromAnEarlierDay } from '../lib/samplePhotos';

export default function StartNewAlbumPrompt({ draft, signedIn, onContinue, onStartNew, onStartTodaysSample, onClose }: {
  draft: LocalDraftSummary;
  signedIn: boolean;
  onContinue: () => void;
  onStartNew: () => void;
  /** A new album, made at once as today's sample album. */
  onStartTodaysSample?: () => void;
  onClose: () => void;
}) {
  const [inApp] = useState(isNativeShell);
  const todaysSample = !!onStartTodaysSample && showSamplePhotos(inApp) && sampleAlbumIsFromAnEarlierDay(draft.sampleMadeAt, new Date());
  const photos = `${draft.photoCount} photo${draft.photoCount === 1 ? '' : 's'}`;
  // Keyboard (KB-2): focus on "Continue my album", Tab kept inside, Escape closes.
  const panelRef = useModalDialog<HTMLDivElement>(true, onClose);
  return (
    <div className="fixed inset-0 z-[135] flex items-center justify-center bg-black/40 px-4" onClick={onClose} data-testid="start-new-prompt">
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="start-new-title" tabIndex={-1} onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 text-center">
        <button onClick={onClose} aria-label="Close" className="absolute top-3 right-3 p-1.5 rounded-full text-light hover:text-medium hover:bg-line-soft transition-colors">
          <X size={16} />
        </button>
        <MegyMascot size={64} alt="" className="mx-auto object-contain mb-2" />
        <h2 id="start-new-title" className="font-display text-xl font-semibold text-dark">You have an album in progress</h2>
        <div className="flex items-center gap-3 text-left rounded-xl border border-line bg-paper px-4 py-3 my-4">
          <div className="w-10 h-10 shrink-0 rounded-full bg-blush flex items-center justify-center">
            <BookOpen size={18} className="text-blush-pink" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-dark text-sm truncate" data-testid="start-new-album-name">{draft.title.trim() || 'Your album'}</p>
            <p className="text-xs text-taupe">{photos} · on this device</p>
          </div>
        </div>
        <div className="space-y-2">
          <button onClick={todaysSample ? onStartTodaysSample : onContinue} data-testid="start-new-continue" data-today-sample={todaysSample || undefined} data-autofocus
            className="w-full py-3 rounded-xl bg-peach text-white text-sm font-semibold hover:brightness-105 transition-all">
            {todaysSample ? 'Start the User tutorial' : 'Continue my album'}
          </button>
          <button onClick={onStartNew} data-testid="start-new-confirm"
            className="w-full py-3 rounded-xl border border-peach text-blush-pink text-sm font-semibold hover:bg-blush transition-colors flex items-center justify-center gap-2">
            <Sparkles size={15} /> Start a new album
          </button>
        </div>
        <p className="text-xs text-taupe mt-3" data-testid="start-new-note">
          {todaysSample
            ? signedIn ? "The old tutorial album stays in Your Projects." : "The old tutorial album is replaced on this device."
            : signedIn
              ? draft.hasContent ? 'This one stays in Your Projects.' : "This one has no photos yet, so it won't be kept."
              : 'Starting a new one deletes this album from this device. Sign in first to keep it.'}
        </p>
      </div>
    </div>
  );
}
