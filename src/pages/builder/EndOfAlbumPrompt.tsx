/* ══════════════════════════════════════════════════════════════════════════
   EndOfAlbumPrompt — shown on the preview's last spread (when: see
   useEndOfAlbumPrompt). Order is the big button; "Check your cover" because
   by Preview every customer has already been through the cover step (it used
   to say "Design your cover" / "Give it a cover", as if they hadn't); and
   "Continue editing" back to the pages (owner, 2026-10-02). Tap outside or ✕
   to keep browsing.
   ══════════════════════════════════════════════════════════════════════════ */

import { ChevronLeft, X } from 'lucide-react';

export default function EndOfAlbumPrompt({ onClose, onCheckCover, onOrder, onContinueEditing }: {
  onClose: () => void;
  onCheckCover: () => void;
  onOrder: () => void;
  onContinueEditing: () => void;
}) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-6" onClick={onClose} data-testid="end-prompt">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-7 text-center relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Keep browsing" className="absolute top-3 right-3 text-light hover:text-medium p-1"><X size={18} /></button>
        <div className="text-4xl mb-2">📦</div>
        <h3 className="font-display text-2xl font-semibold text-dark mb-1">You've reached the end</h3>
        <p className="text-sm text-medium mb-5">Your album looks beautiful. Check your cover, then make it real.</p>
        <button
          onClick={onCheckCover}
          data-testid="end-prompt-cover"
          className="w-full py-3 mb-3 bg-white border-2 border-blush-pink text-[#C56B4E] text-base font-semibold rounded-xl hover:bg-blush active:scale-[0.98] transition-all"
        >
          🎨 Check your cover
        </button>
        <button
          onClick={onOrder}
          data-testid="end-prompt-order"
          className="w-full py-4 bg-blush-pink text-white text-lg font-bold tracking-wide rounded-xl hover:brightness-105 active:scale-[0.98] transition-all shadow-md"
        >
          ORDER ALBUM
        </button>
        <button
          onClick={onContinueEditing}
          data-testid="end-prompt-back"
          className="w-full mt-3 py-3 rounded-xl border border-line text-cocoa text-sm font-semibold hover:bg-blush active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
        >
          <ChevronLeft size={16} /> Continue editing
        </button>
      </div>
    </div>
  );
}
