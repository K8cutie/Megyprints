/* ══════════════════════════════════════════════════════════════════════════
   PageTurnBar — the page turn under the page, phone AND desktop, in words.
   Testers read a bare › as decoration and stopped on page 1 (PR #42), and a
   bare ‹ is the same trap going back (owner, 2026-10-02: "we would need a
   previous button for the previous page"). So:
     page 1      →                     [ Next page › ]
     page 2 on   → [ ‹ Previous page ] [ Next page › ]
     last page   → [ ‹ Previous page ] [ (✓) Done — Preview my album ]
   Page 1 has nothing before it, so it shows no Previous at all (not a greyed
   one). "Next page" / "Done" stays the filled button — the way forward.

   Owner (2026-10-11): editing from the Preview ("Edit pages"), the only way
   back was Done on the LAST page: fix page 12, page through to 40. Once the
   album has been previewed, every other page also shows
     [ ‹ Back to preview ]
   which opens the Preview on the page being edited. A quiet button: Next
   page stays the filled one.
   ══════════════════════════════════════════════════════════════════════════ */

import { ChevronLeft, ChevronRight, Check, BookOpen } from 'lucide-react';
import { useSettleGuard } from '../../lib/settleGuard';
import { PAGE_TURN_STYLES, type PageTurnVariant } from './pageTurnStyles';

export type { PageTurnVariant } from './pageTurnStyles';

export default function PageTurnBar({ index, total, onPrev, onNext, onDone, onBackToPreview, variant, className = '' }: {
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onDone: () => void;
  /** Given once the album has been previewed: a way back from any page. */
  onBackToPreview?: () => void;
  variant: PageTurnVariant;
  className?: string;
}) {
  const s = PAGE_TURN_STYLES[variant];
  const isLast = index >= total - 1;
  // A double tap turns ONE page: the second tap would land on the next page's
  // button in the same spot — on page 39, "Done" (settleGuard).
  const tooSoon = useSettleGuard(index);
  const turn = (fn: () => void) => () => { if (!tooSoon()) fn(); };
  // The last page's Done already goes to the Preview.
  const back = onBackToPreview && !isLast && (
    <button type="button" onClick={turn(onBackToPreview)} data-testid="back-to-preview" className={s.back}>
      <BookOpen size={s.prevIcon - 2} /> Back to preview
    </button>
  );
  return (
    <div className={`${s.wrap} ${className}`}>
      <div className={s.row} data-testid="page-turn">
        {index > 0 && (
          <button type="button" onClick={turn(onPrev)} data-testid="prev-page" className={s.prev}>
            <ChevronLeft size={s.prevIcon} /> Previous page
          </button>
        )}
        {isLast ? (
          <button type="button" onClick={turn(onDone)} data-testid="done-preview" className={s.done}>
            {s.doneIcon && <Check size={s.doneIcon} />} Done — Preview my album
          </button>
        ) : (
          <button type="button" onClick={turn(onNext)} data-testid="next-page" className={s.next}>
            Next page <ChevronRight size={s.nextIcon} />
          </button>
        )}
        {variant === 'desktop' && back}
      </div>
      {variant === 'phone' && back}
    </div>
  );
}
