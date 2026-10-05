/* ══════════════════════════════════════════════════════════════════════════
   StartNewAlbumPrompt — "Start Creating" with an album already in progress.

   Home's "Start Creating" opened a brand-new album with no question asked
   (1-star testers, 2026-10-04: the Quitter lost an album that way). Signed
   out, starting new DELETES the album in progress from the device — there is
   no account to keep it — and signed in, an album with only a name was not
   worth saving, so it went too. So when this device has an album in
   progress, Start Creating asks first; continuing is the way on.
   ══════════════════════════════════════════════════════════════════════════ */

import { X, BookOpen, Sparkles } from 'lucide-react';
import type { LocalDraftSummary } from '../lib/localDraft';
import { useModalDialog } from '../lib/useModalDialog';

export default function StartNewAlbumPrompt({ draft, signedIn, onContinue, onStartNew, onClose }: {
  draft: LocalDraftSummary;
  signedIn: boolean;
  onContinue: () => void;
  onStartNew: () => void;
  onClose: () => void;
}) {
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
        <img src="/megy-character.png" alt="" className="w-16 h-16 mx-auto object-contain mb-2" draggable={false} />
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
          <button onClick={onContinue} data-testid="start-new-continue" data-autofocus
            className="w-full py-3 rounded-xl bg-peach text-white text-sm font-semibold hover:brightness-105 transition-all">
            Continue my album
          </button>
          <button onClick={onStartNew} data-testid="start-new-confirm"
            className="w-full py-3 rounded-xl border border-peach text-blush-pink text-sm font-semibold hover:bg-blush transition-colors flex items-center justify-center gap-2">
            <Sparkles size={15} /> Start a new album
          </button>
        </div>
        <p className="text-xs text-taupe mt-3" data-testid="start-new-note">
          {signedIn
            ? draft.hasContent ? 'This one stays in Your Projects.' : "This one has no photos yet, so it won't be kept."
            : 'Starting a new one deletes this album from this device. Sign in first to keep it.'}
        </p>
      </div>
    </div>
  );
}
