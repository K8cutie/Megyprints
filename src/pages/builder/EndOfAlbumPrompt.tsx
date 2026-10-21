/* ══════════════════════════════════════════════════════════════════════════
   EndOfAlbumPrompt — shown on the preview's last spread (when: see
   useEndOfAlbumPrompt). Order is the big button; "Check your cover" because
   by Preview every customer has already been through the cover step (it used
   to say "Design your cover" / "Give it a cover", as if they hadn't); and
   "Continue editing" back to the pages (owner, 2026-10-02). Tap outside or ✕
   to keep browsing.
   While the album is saved on its way to checkout, Order says so and waits;
   if the save fails, the reason shows under it (lib/orderAlbum).

   BLANK PAGES (owner, 2026-10-21: "it becomes a reminder at the end with an
   option to further edit the pages or delete them"): while the album has
   pages with nothing on them, the card is that reminder instead: "5 pages
   are blank", [Delete 5 blank pages] (filled), [Edit the blank pages], and a
   quiet "Order with blank pages". Under the 40-page floor it says how many
   can go (blankPages.ts); at 40 only Edit is offered. Once they are deleted
   the card is the usual one, with what was deleted said on top.
   ══════════════════════════════════════════════════════════════════════════ */

import { useEffect, type ReactNode } from 'react';
import { ChevronLeft, Loader2, X } from 'lucide-react';
import { useModalDialog } from '../../lib/useModalDialog';
import { blankPagesBody, blankPagesTitle, deleteBlankLabel, editBlankLabel, orderWithBlankLabel, type BlankPagePlan } from './blankPages';

const PRIMARY = 'w-full py-4 bg-blush-pink text-white text-lg font-bold tracking-wide rounded-xl hover:brightness-105 active:scale-[0.98] transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-wait';
const SECONDARY = 'w-full mt-3 py-3 rounded-xl border border-line text-cocoa text-sm font-semibold hover:bg-blush active:scale-[0.98] transition-all flex items-center justify-center gap-1.5';

export default function EndOfAlbumPrompt({ onClose, onCheckCover, onOrder, onContinueEditing, saving = false, error = null, blank = null, onDeleteBlank, onEditBlank, onOrderWithBlank, note = null }: {
  onClose: () => void;
  onCheckCover: () => void;
  onOrder: () => void;
  onContinueEditing: () => void;
  /** The album is being saved to the account on its way to checkout. */
  saving?: boolean;
  /** Why the album could not go to checkout (the save failed). */
  error?: ReactNode;
  /** The album's blank pages (blankPagePlan): any → the card is the reminder. */
  blank?: BlankPagePlan | null;
  onDeleteBlank?: () => void;
  onEditBlank?: () => void;
  onOrderWithBlank?: () => void;
  /** Said on top: "Deleted 5 blank pages. Your album has 45 pages." */
  note?: string | null;
}) {
  // Keyboard (KB-2): focus on the filled button, Tab kept inside, Escape = keep browsing.
  const panelRef = useModalDialog<HTMLDivElement>(true, onClose);
  const blanks = blank?.blank.length ?? 0;
  const deletable = blank?.deletable.length ?? 0;
  // The tapped Delete is gone once the pages are: focus goes to the new filled button.
  useEffect(() => {
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) panel.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }, [panelRef, blanks, deletable]);
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-6" onClick={onClose} data-testid="end-prompt">
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="end-prompt-title" tabIndex={-1}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-7 text-center relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Keep browsing" className="absolute top-3 right-3 text-light hover:text-medium p-1"><X size={18} /></button>
        {note && <p role="status" data-testid="end-prompt-note" className="text-sm font-semibold text-[#2F6B3A] mb-3 pr-5">✓ {note}</p>}
        {blank && blanks > 0 ? (
          <>
            <div className="text-4xl mb-2">📄</div>
            <h3 id="end-prompt-title" className="font-display text-2xl font-semibold text-dark mb-1">{blankPagesTitle(blanks)}</h3>
            <p className="text-sm text-medium mb-5" data-testid="end-prompt-blank-body">{blankPagesBody(blank)}</p>
            {deletable > 0 && (
              <button onClick={onDeleteBlank} data-autofocus data-testid="end-prompt-delete-blank" className={PRIMARY}>
                {deleteBlankLabel(deletable)}
              </button>
            )}
            <button onClick={onEditBlank} data-autofocus={deletable > 0 ? undefined : true} data-testid="end-prompt-edit-blank"
              className={deletable > 0 ? SECONDARY : PRIMARY}>
              {deletable > 0 && <ChevronLeft size={16} />} {editBlankLabel(blanks)}
            </button>
            <button onClick={onOrderWithBlank} disabled={saving} data-testid="end-prompt-order-blank"
              className="w-full mt-3 py-2 text-sm font-semibold text-cocoa underline underline-offset-2 hover:no-underline disabled:opacity-70 disabled:cursor-wait">
              {saving ? 'Saving your album…' : orderWithBlankLabel(blanks)}
            </button>
            {error && <div className="mt-3">{error}</div>}
          </>
        ) : (
          <>
            <div className="text-4xl mb-2">📦</div>
            <h3 id="end-prompt-title" className="font-display text-2xl font-semibold text-dark mb-1">You've reached the end</h3>
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
              data-autofocus
              disabled={saving}
              data-testid="end-prompt-order"
              className={PRIMARY}
            >
              {saving ? <><Loader2 size={18} className="animate-spin" /> Saving your album…</> : 'ORDER ALBUM'}
            </button>
            {error && <div className="mt-3">{error}</div>}
            <button
              onClick={onContinueEditing}
              data-testid="end-prompt-back"
              className={SECONDARY}
            >
              <ChevronLeft size={16} /> Continue editing
            </button>
          </>
        )}
      </div>
    </div>
  );
}
