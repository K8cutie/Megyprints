/* ══════════════════════════════════════════════════════════════════════════
   PageColorPicker — the page colours (pageColors.ts) as round swatches, the
   chosen one ringed and ticked, its name said under them. Used by the cover
   editor, the desktop studio strip (`variant="strip"`: small, in a row) and
   the phone's bottom sheet (PageColorSheet below), so a page and the cover
   are coloured from the one list.

   "Use <colour> on every page" shows only once a swatch is chosen (a button
   that can't do anything isn't shown — no greyed dead taps).
   ══════════════════════════════════════════════════════════════════════════ */

import { Check, Layers, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PAGE_COLORS, pageColorOf, inkOn } from './pageColors';
import type { AlbumBackground } from './types';

const RING = '0 0 0 2px #FFFFFF, 0 0 0 4px #9A4A2C';

export default function PageColorPicker({ background, onPick, onPickAll, variant = 'grid' }: {
  background: AlbumBackground | undefined;
  onPick: (hex: string) => void;
  /** Offered as "Use <colour> on every page" once a swatch is chosen. */
  onPickAll?: (hex: string) => void;
  /** `strip`: small swatches in one row (the desktop studio strip). */
  variant?: 'grid' | 'strip';
}) {
  const current = pageColorOf(background);
  const strip = variant === 'strip';
  return (
    <div data-testid="page-color-picker" className={strip ? 'flex items-center gap-2' : ''}>
      {/* Nine in ONE row on a phone too: 30px + 6px gaps = 318px, inside a
          360px phone's sheet (a lone ninth swatch on its own row read as odd). */}
      <div role="radiogroup" aria-label="Page colour" className={strip ? 'flex items-center gap-1.5' : 'flex flex-wrap justify-center gap-1.5 sm:gap-2'}>
        {PAGE_COLORS.map((c) => {
          const on = current?.hex === c.hex;
          return (
            <button
              key={c.hex}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={c.name}
              title={c.name}
              data-testid="page-color"
              onClick={() => onPick(c.hex)}
              className={`${strip ? 'w-6 h-6' : 'w-[30px] h-[30px] sm:w-9 sm:h-9'} shrink-0 rounded-full flex items-center justify-center transition-transform active:scale-95`}
              style={{ background: c.hex, border: '1px solid rgba(0,0,0,0.15)', boxShadow: on ? RING : 'none' }}
            >
              {on && <Check size={strip ? 12 : 16} strokeWidth={3} style={{ color: inkOn(c.hex) }} aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      {!strip && (
        <p className="mt-1.5 text-center text-[11px] text-taupe" data-testid="page-color-name" aria-live="polite">
          {current?.name ?? ''}
        </p>
      )}
      {onPickAll && current && (
        <button
          type="button"
          data-testid="page-color-all"
          onClick={() => onPickAll(current.hex)}
          className={strip
            ? 'px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap bg-paper text-cocoa hover:bg-blush flex items-center gap-1'
            : 'mt-2.5 w-full h-10 rounded-xl border border-peach bg-white text-[13px] font-semibold text-dark flex items-center justify-center gap-2 active:scale-[0.98] transition-transform'}
        >
          <Layers size={strip ? 12 : 14} /> Use {current.name.toLowerCase()} on every page
        </button>
      )}
    </div>
  );
}

/** The phone's bottom sheet: the swatches, and "Use <colour> on every page". */
export function PageColorSheet({ background, onPick, onPickAll, onClose }: {
  background: AlbumBackground | undefined;
  onPick: (hex: string) => void;
  onPickAll: (hex: string) => void;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      <motion.div key="sheet" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 z-50 bg-black/30 flex items-end" onClick={onClose} data-testid="page-color-sheet">
        <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 320 }}
          className="w-full bg-white rounded-t-2xl pb-6" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-line">
            <span className="text-sm font-semibold text-dark">Page colour</span>
            <button onClick={onClose} className="text-light p-1" aria-label="Close"><X size={18} /></button>
          </div>
          <div className="px-4 pt-3">
            <PageColorPicker background={background} onPick={onPick} onPickAll={onPickAll} />
            <p className="pt-2 text-[11px] text-light">Tap a colour for this page. Words that wouldn't show on it switch to an ink that does.</p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
