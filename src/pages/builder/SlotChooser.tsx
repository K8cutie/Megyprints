/* ══════════════════════════════════════════════════════════════════════════
   SlotChooser — the per-slot content chooser.
   Tapping an EMPTY box in the builder opens this chooser: Add Photo (photo
   slots only) / Add Quote / Your Text. The picked kind becomes the slot's
   content, on EVERY template + album size.

   (QR living-memory is NO LONGER here — it's added as a full-bleed corner badge
   via the "Add memory video" button on a single-photo page, so it never sits in
   a box as dead space. AI GRAPHICS are no longer here either: themed quotes
   replaced them as what a caption box offers besides your own words. Graphics
   already placed in saved albums still render and print — only the way to add a
   NEW one is gone.)

   On mobile it renders as a bottom sheet (matching the "Add a photo" sheet in
   MobileReview); on desktop as a small centered modal.
   ══════════════════════════════════════════════════════════════════════════ */

import { motion, AnimatePresence } from 'framer-motion';
import { Image as ImageIcon, Type, Quote, X } from 'lucide-react';

interface SlotChooserProps {
  /** Open the photo picker. Optional — when omitted, the Photo option is hidden
   *  (the combo/caption box offers Quote + Text only, no Photo). */
  onPhoto?: () => void;
  onText: () => void;
  /** Deprecated: QR moved to the corner-badge flow. Kept optional for callers. */
  onQr?: () => void;
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

  const Buttons = (
    <div className="flex flex-col gap-2">
      {options.map(({ key, label, desc, Icon, run }) => (
        <button
          key={key}
          onClick={() => pick(run)}
          className="flex items-center gap-3 w-full p-3 rounded-xl border border-[#EDE7E0] bg-[#FFF8F0] hover:bg-[#FDE8E4] active:scale-[0.98] transition text-left"
        >
          <span className="w-10 h-10 rounded-full bg-[#F4C2A1] flex items-center justify-center text-white shrink-0">
            <Icon size={20} />
          </span>
          <span className="flex flex-col">
            <span className="text-sm font-semibold text-[#2D2D2D]">{label}</span>
            <span className="text-xs text-[#9B8B7A]">{desc}</span>
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
            className="w-full bg-white rounded-t-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#E8E8E8] shrink-0">
              <span className="text-sm font-semibold text-[#2D2D2D]">Add to this box</span>
              <button onClick={onClose} className="text-[#9B9B9B] p-1"><X size={18} /></button>
            </div>
            <div className="p-3">{Buttons}</div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-base font-semibold text-[#2D2D2D]">Add to this box</span>
          <button onClick={onClose} className="text-[#9B9B9B] p-1"><X size={18} /></button>
        </div>
        {Buttons}
      </div>
    </div>
  );
}
