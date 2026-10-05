/* ══════════════════════════════════════════════════════════════════════════
   RemakeAlbumAsk — "Make the album again?" before a made album is laid out
   from scratch. Making it again replaced every page without a word: placed
   video memories, layout changes and the text written in boxes were gone
   (1-star testers round 3, the Quitter and the Commuter). Keeping the pages
   is the way on; making it again is a choice, and says what it replaces.
   ══════════════════════════════════════════════════════════════════════════ */

import { X, RefreshCw } from 'lucide-react';
import { useModalDialog } from '../lib/useModalDialog';
import { remakeLosesMessage } from './rebuildQuestion';

export default function RemakeAlbumAsk({ memories, onKeep, onRemake, onClose }: {
  /** Video memories placed in the album (they go with the old pages). */
  memories: number;
  onKeep: () => void;
  onRemake: () => void;
  onClose: () => void;
}) {
  // Keyboard (KB-2): focus on "Keep my pages", Tab kept inside, Escape closes.
  const panelRef = useModalDialog<HTMLDivElement>(true, onClose);
  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/40 px-4" onClick={onClose} data-testid="remake-ask">
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="remake-ask-title" tabIndex={-1} onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 text-center">
        <button onClick={onClose} aria-label="Close" className="absolute top-3 right-3 p-1.5 rounded-full text-light hover:text-medium hover:bg-line-soft transition-colors">
          <X size={16} />
        </button>
        <h2 id="remake-ask-title" className="font-display text-xl font-semibold text-dark mb-2">Make the album again?</h2>
        <p className="text-sm text-medium mb-5" data-testid="remake-ask-loses">{remakeLosesMessage(memories)}</p>
        <div className="space-y-2">
          <button onClick={onKeep} data-testid="remake-keep" data-autofocus
            className="w-full py-3 rounded-xl bg-peach text-white text-sm font-semibold hover:brightness-105 transition-all">
            Keep my pages
          </button>
          <button onClick={onRemake} data-testid="remake-confirm"
            className="w-full py-3 rounded-xl border border-peach text-blush-pink text-sm font-semibold hover:bg-blush transition-colors flex items-center justify-center gap-2">
            <RefreshCw size={15} /> Make it again
          </button>
        </div>
      </div>
    </div>
  );
}
