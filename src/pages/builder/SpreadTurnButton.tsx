/* ══════════════════════════════════════════════════════════════════════════
   SpreadTurnButton — the book preview's page turn, in words. The preview
   turned spreads with bare ‹ › arrows, the trap testers fell into on Review
   (#42, #50), and greyed the one with nowhere to go. Owner, 2026-10-04: "make
   it look like a next or prev button but dont make it take too much space".
   So each side is a small labelled button, arrow over word, in the same
   56-px column the arrows had: the book stays just as big. Next is the filled
   one, the way forward. With nowhere to go there is no button at all, but
   the column stays so the book does not jump sideways.
   ══════════════════════════════════════════════════════════════════════════ */

import { ChevronLeft, ChevronRight } from 'lucide-react';

/** The side column the preview reserves for each button (its fit math uses it). */
export const SPREAD_TURN_W = 56;

export default function SpreadTurnButton({ dir, show, onClick }: {
  dir: 'prev' | 'next';
  /** False on the first spread (prev) or the last (next). */
  show: boolean;
  onClick: () => void;
}) {
  if (!show) return <div aria-hidden="true" className="shrink-0" style={{ width: SPREAD_TURN_W }} />;
  const next = dir === 'next';
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={next ? 'spread-next' : 'spread-prev'}
      className={`shrink-0 py-2.5 rounded-2xl flex flex-col items-center gap-0.5 text-[11px] font-bold leading-none shadow-md active:scale-[0.97] transition-all ${
        next
          ? 'bg-peach text-white border border-transparent hover:brightness-105'
          : 'bg-white text-medium border border-line hover:bg-blush hover:text-blush-pink hover:border-peach'
      }`}
      style={{ width: SPREAD_TURN_W }}
    >
      {next ? <ChevronRight size={22} /> : <ChevronLeft size={22} />}
      {next ? 'Next' : 'Previous'}
    </button>
  );
}
