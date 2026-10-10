/* ══════════════════════════════════════════════════════════════════════════
   SlotChooser — the per-slot content chooser.
   Tapping an EMPTY box in the builder opens this chooser. The picked kind
   becomes the slot's content, on EVERY template + album size. Two shapes:

     COMBO / CAPTION box (template.textSlots) — the full content box:
       Add Quote · Your Text
     PHOTO slot (template.slots) — a photo, or words instead of one:
       Add Photo · Add Quote · Your Text

   (Clipart was SUNSET: the theme→Iconify fetch-and-rasterize pipeline dragged
   on old phones. Already-placed cliparts still render from their stored PNG
   and are removable via RemoveGraphicModal — see BuilderEdit/MobileReview.)

   Whatever is picked REPLACES whatever was there: the state setters null the
   sibling arrays at that index, so one box always holds exactly one thing.

   (QR left the boxes on 2026-10-02 — owner: video memories live on full-page
   photos, via the "Add a video memory" button on a single-photo page. A QR
   already placed in a box still renders and opens its own editor.)

   On mobile it renders as a bottom sheet (matching the "Add a photo" sheet in
   MobileReview); on desktop as a small centered modal.
   ══════════════════════════════════════════════════════════════════════════ */

import { motion, AnimatePresence } from 'framer-motion';
import { Image as ImageIcon, Type, Quote, X } from 'lucide-react';
import { useModalDialog } from '../../lib/useModalDialog';

interface SlotChooserProps {
  /** Open the photo picker. Optional — when omitted, the Photo option is hidden
   *  (a combo/caption box takes words, not a photo). */
  onPhoto?: () => void;
  onText: () => void;
  /** Open the themed-quote picker (AI lines for the album's theme, curated
   *  lines as the fallback). Optional — when omitted, the Quote option is hidden. */
  onQuote?: () => void;
  onClose: () => void;
  /** Render as a bottom sheet (phone) instead of a centered modal (desktop). */
  mobile?: boolean;
}

interface Option {
  key: 'photo' | 'quote' | 'text';
  label: string;
  desc: string;
  Icon: typeof ImageIcon;
  run: () => void;
}

export default function SlotChooser({ onPhoto, onText, onQuote, onClose, mobile }: SlotChooserProps) {
  const options: Option[] = [
    ...(onPhoto ? [{ key: 'photo' as const, label: 'Add Photo', desc: 'Place one of your photos here', Icon: ImageIcon, run: onPhoto }] : []),
    ...(onQuote ? [{ key: 'quote' as const, label: 'Add Quote', desc: 'A line written for your album’s theme', Icon: Quote, run: onQuote }] : []),
    { key: 'text', label: 'Your Text', desc: 'Type your own caption or title', Icon: Type, run: onText },
  ];

  const pick = (run: () => void) => { run(); onClose(); };
  // Keyboard (KB-2): focus on the first choice, Tab kept inside, Escape closes.
  const panelRef = useModalDialog<HTMLDivElement>(true, onClose);

  const Buttons = (
    <div className="flex flex-col gap-2">
      {options.map(({ key, label, desc, Icon, run }, i) => (
        <button
          key={key}
          data-autofocus={i === 0 ? true : undefined}
          onClick={() => pick(run)}
          className="flex items-center gap-3 w-full p-3 rounded-xl border border-line-soft bg-cream hover:bg-blush active:scale-[0.98] transition text-left"
        >
          <span className="w-10 h-10 rounded-full bg-peach flex items-center justify-center text-white shrink-0">
            <Icon size={20} />
          </span>
          <span className="flex flex-col">
            <span className="text-sm font-semibold text-dark">{label}</span>
            <span className="text-xs text-stone">{desc}</span>
          </span>
        </button>
      ))}
    </div>
  );

  if (mobile) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="absolute inset-0 z-50 bg-black/40 flex items-end"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            ref={panelRef} role="dialog" aria-modal="true" aria-label="Add to this box" tabIndex={-1}
            className="w-full bg-white rounded-t-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-line shrink-0">
              <span className="text-sm font-semibold text-dark">Add to this box</span>
              <button onClick={onClose} className="text-light p-1" aria-label="Close"><X size={18} /></button>
            </div>
            <div className="p-3">{Buttons}</div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6" onClick={onClose}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Add to this box" tabIndex={-1}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-base font-semibold text-dark">Add to this box</span>
          <button onClick={onClose} className="text-light p-1" aria-label="Close"><X size={18} /></button>
        </div>
        {Buttons}
      </div>
    </div>
  );
}
