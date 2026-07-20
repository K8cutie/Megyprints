import { X, Trash2 } from 'lucide-react';

/* Adding AI graphics was retired — themed quotes took their place in the slot
   chooser. Graphics already placed in saved albums still render and print
   (removing the render path would blank real content), so tapping one offers
   the only action that still makes sense: take it out.

   When the last placed graphic is gone from every saved album, this component
   and the ornament render/persistence path can be swept together. */
export default function RemoveGraphicModal({ onRemove, onClose, mobile }: {
  onRemove: () => void;
  onClose: () => void;
  mobile?: boolean;
}) {
  const Card = (
    <div
      className={`bg-white shadow-2xl flex flex-col ${mobile ? 'w-full rounded-t-2xl' : 'w-full max-w-xs rounded-2xl'}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#E8E8E8]">
        <span className="text-sm font-semibold text-[#2D2D2D]">Graphic</span>
        <button onClick={onClose} className="text-[#9B9B9B] p-1"><X size={18} /></button>
      </div>
      <div className="px-5 py-4">
        <p className="text-xs text-[#9B8B7A] leading-relaxed">
          Graphics have been replaced by themed quotes. This one still prints, but
          it can’t be swapped for another — remove it and the box is free for a
          quote, your own text, or a photo.
        </p>
      </div>
      <div className="px-5 pb-4 flex gap-2">
        <button onClick={onClose}
          className="flex-1 h-10 rounded-xl border border-[#EDE7E0] text-sm font-medium text-[#6B5842] hover:bg-[#FFF8F0]">
          Keep it
        </button>
        <button onClick={onRemove}
          className="flex-1 h-10 rounded-xl bg-red-500 text-white text-sm font-semibold flex items-center justify-center gap-1.5 active:scale-[0.98] transition">
          <Trash2 size={15} /> Remove
        </button>
      </div>
    </div>
  );

  if (mobile) {
    return (
      <div className="absolute inset-0 z-[120] bg-black/40 flex items-end" onClick={onClose}>{Card}</div>
    );
  }
  return (
    <div className="fixed inset-0 z-[120] bg-black/40 flex items-center justify-center p-6" onClick={onClose}>{Card}</div>
  );
}
