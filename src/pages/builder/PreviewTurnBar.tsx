/* ══════════════════════════════════════════════════════════════════════════
   PreviewTurnBar — the book preview's page turn on an UPRIGHT phone, under
   the book, in words: the same look as the editor's PageTurnBar.

     the cover       →                       [ Next page › ]
     a page          → [ ‹ Previous page ]   [ Next page › ]
     the last page   → [ ‹ Previous page ]   [ Order this album ]

   "pages" in the open-book view. The way forward is always the ONE filled
   button, and at the end it is the order: never a dead end. A double tap
   turns one page (settleGuard), so a fast second tap on the last turn can't
   land on "Order this album".
   ══════════════════════════════════════════════════════════════════════════ */

import { ChevronLeft, ChevronRight, ShoppingCart, Loader2 } from 'lucide-react';
import { useSettleGuard } from '../../lib/settleGuard';
import { PAGE_TURN_STYLES } from './pageTurnStyles';
import type { PreviewView } from './previewPaging';

export default function PreviewTurnBar({ view, settleKey, canBack, canForward, onBack, onForward, onOrder, ordering = false }: {
  view: PreviewView;
  /** Changes on every page turn (what is showing), for the double-tap guard. */
  settleKey: string;
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onOrder: () => void;
  /** The album is being saved on its way to checkout. */
  ordering?: boolean;
}) {
  const s = PAGE_TURN_STYLES.phone;
  const tooSoon = useSettleGuard(settleKey);
  const turn = (fn: () => void) => () => { if (!tooSoon()) fn(); };
  const word = view === 'page' ? 'page' : 'pages';
  return (
    <div className={s.row} data-testid="preview-turn">
      {canBack && (
        <button type="button" onClick={turn(onBack)} data-testid="preview-prev" className={s.prev}>
          <ChevronLeft size={s.prevIcon} /> Previous {word}
        </button>
      )}
      {canForward ? (
        <button type="button" onClick={turn(onForward)} data-testid="preview-next" className={s.next}>
          Next {word} <ChevronRight size={s.nextIcon} />
        </button>
      ) : (
        <button type="button" onClick={turn(onOrder)} disabled={ordering} data-testid="preview-turn-order"
          className={`${s.next} disabled:opacity-70 disabled:cursor-wait`}>
          {ordering
            ? <><Loader2 size={18} className="animate-spin" /> Saving your album…</>
            : <><ShoppingCart size={18} /> Order this album</>}
        </button>
      )}
    </div>
  );
}
