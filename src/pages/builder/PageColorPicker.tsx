/* ══════════════════════════════════════════════════════════════════════════
   PageColorPicker — the page colours and gradients (pageColors.ts) as round
   swatches, the chosen one ringed and ticked, its name said under them. Used
   by the cover editor, the desktop studio strip (`variant="strip"`: small, in
   one row that scrolls) and the phone's bottom sheet (PageColorSheet below),
   so a page and the cover are coloured from the one list: the words' 28
   colours, then 12 gradients (owner, 2026-11-08).

   A swatch passes its KEY (a colour's hex, or 'gradient:<id>') to onPick and
   onPickAll, which the builder's setPageColor / applyPageColorToAllPages take.

   "Use <colour> on every page" shows only once a swatch is chosen (a button
   that can't do anything isn't shown — no greyed dead taps).
   ══════════════════════════════════════════════════════════════════════════ */

import { Check, Layers, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PAGE_COLORS, PAGE_GRADIENTS, pageFillOf, inkOn, type PageFill } from './pageColors';
import type { AlbumBackground } from './types';

const RING = '0 0 0 2px #FFFFFF, 0 0 0 4px #9A4A2C';

const COLOR_FILLS: readonly PageFill[] = PAGE_COLORS.map((c) => ({ key: c.hex, name: c.name, background: { type: 'solid', solid: c.hex }, swatch: c.hex, middle: c.hex }));

export default function PageColorPicker({ background, onPick, onPickAll, variant = 'grid' }: {
  background: AlbumBackground | undefined;
  /** A swatch's key: a colour's hex, or 'gradient:<id>'. */
  onPick: (key: string) => void;
  /** Offered as "Use <colour> on every page" once a swatch is chosen. */
  onPickAll?: (key: string) => void;
  /** `strip`: small swatches in one row that scrolls (the desktop studio strip). */
  variant?: 'grid' | 'strip';
}) {
  const current = pageFillOf(background);
  const strip = variant === 'strip';
  const swatch = (f: PageFill, testId: string) => {
    const on = current?.key === f.key;
    return (
      <button
        key={f.key}
        type="button"
        role="radio"
        aria-checked={on}
        aria-label={f.name}
        title={f.name}
        data-testid={testId}
        onClick={() => onPick(f.key)}
        className={`${strip ? 'w-6 h-6' : 'w-[30px] h-[30px] sm:w-9 sm:h-9'} shrink-0 rounded-full flex items-center justify-center transition-transform active:scale-95`}
        style={{ background: f.swatch, border: '1px solid rgba(0,0,0,0.15)', boxShadow: on ? RING : 'none' }}
      >
        {on && <Check size={strip ? 12 : 16} strokeWidth={3} style={{ color: inkOn(f.middle) }} aria-hidden="true" />}
      </button>
    );
  };
  return (
    <div data-testid="page-color-picker" className={strip ? 'flex items-center gap-2 min-w-0' : ''}>
      <div role="radiogroup" aria-label="Page colour"
        className={strip ? 'flex items-center gap-1.5 overflow-x-auto py-1 px-0.5 min-w-0' : ''}
        style={strip ? { scrollbarWidth: 'none' } : undefined}>
        {strip ? (
          <>
            {COLOR_FILLS.map((f) => swatch(f, 'page-color'))}
            {PAGE_GRADIENTS.map((f) => swatch(f, 'page-gradient'))}
          </>
        ) : (
          <>
            <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2">{COLOR_FILLS.map((f) => swatch(f, 'page-color'))}</div>
            <p className="mt-2.5 mb-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-taupe">Gradients</p>
            <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2">{PAGE_GRADIENTS.map((f) => swatch(f, 'page-gradient'))}</div>
          </>
        )}
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
          onClick={() => onPickAll(current.key)}
          className={strip
            ? 'px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap bg-paper text-cocoa hover:bg-blush flex items-center gap-1 shrink-0'
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
  onPick: (key: string) => void;
  onPickAll: (key: string) => void;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      <motion.div key="sheet" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 z-50 bg-black/30 flex items-end" onClick={onClose} data-testid="page-color-sheet">
        <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 320 }}
          className="w-full bg-white rounded-t-2xl pb-6 max-h-[80%] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
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
