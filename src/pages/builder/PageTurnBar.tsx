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
   ══════════════════════════════════════════════════════════════════════════ */

import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { useSettleGuard } from '../../lib/settleGuard';
import { PAGE_TURN_STYLES, type PageTurnVariant } from './pageTurnStyles';

export type { PageTurnVariant } from './pageTurnStyles';

export default function PageTurnBar({ index, total, onPrev, onNext, onDone, variant, className = '' }: {
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onDone: () => void;
  variant: PageTurnVariant;
  className?: string;
}) {
  const s = PAGE_TURN_STYLES[variant];
  const isLast = index >= total - 1;
  // A double tap turns ONE page: the second tap would land on the next page's
  // button in the same spot — on page 39, "Done" (settleGuard).
  const tooSoon = useSettleGuard(index);
  const turn = (fn: () => void) => () => { if (!tooSoon()) fn(); };
  return (
    <div className={`${s.row} ${className}`} data-testid="page-turn">
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
    </div>
  );
}
