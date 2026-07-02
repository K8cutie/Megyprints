/* ══════════════════════════════════════════════════════════════════════════
   SlotChooser — the per-slot content chooser.
   Tapping an EMPTY box in the builder opens this 3-way chooser: Add Photo /
   Add Text / Add QR. The picked kind becomes the slot's content (photo →
   slotFills, text → slotTexts, QR → qrFills), on EVERY template + album size.

   On mobile it renders as a bottom sheet (matching the "Add a photo" sheet in
   MobileReview); on desktop as a small centered modal.
   ══════════════════════════════════════════════════════════════════════════ */

import { motion, AnimatePresence } from 'framer-motion';
import { Image as ImageIcon, Type, QrCode, X } from 'lucide-react';

interface SlotChooserProps {
  onPhoto: () => void;
  onText: () => void;
  onQr: () => void;
  onClose: () => void;
  /** Render as a bottom sheet (phone) instead of a centered modal (desktop). */
  mobile?: boolean;
}

interface Option {
  key: 'photo' | 'text' | 'qr';
  label: string;
  desc: string;
  Icon: typeof ImageIcon;
  run: () => void;
}

export default function SlotChooser({ onPhoto, onText, onQr, onClose, mobile }: SlotChooserProps) {
  const options: Option[] = [
    { key: 'photo', label: 'Add Photo', desc: 'Place one of your photos here', Icon: ImageIcon, run: onPhoto },
    { key: 'text', label: 'Add Text', desc: 'Type a caption or title in this box', Icon: Type, run: onText },
    { key: 'qr', label: 'Add QR', desc: 'A scannable living-memory code', Icon: QrCode, run: onQr },
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
