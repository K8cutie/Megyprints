/* ══════════════════════════════════════════════════════════════════════════
   VideoMemoryButton — "Add a video memory", phone AND desktop.
   The video memory is the crème de la crème of the album (owner, 2026-10-04:
   "make it more noticeable like a shiny glowing feature, a different color
   which catches attention"). So it is GOLD, not terracotta: it glows softly
   and a light sweeps across it, every time, not only until the first tap.
   Gold also keeps it from reading as a second "Next page" — the terracotta
   filled button stays the one way forward. The look lives in index.css
   (.memory-shine) and holds still under prefers-reduced-motion.
   ══════════════════════════════════════════════════════════════════════════ */

import { Video } from 'lucide-react';

export type VideoMemoryVariant = 'phone' | 'desktop';

const STYLES: Record<VideoMemoryVariant, { button: string; icon: number }> = {
  // Its own full-width row between the tools and the page turn.
  phone: { button: 'w-full mt-3 h-11 rounded-xl text-[15px] font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform', icon: 18 },
  // In the toolbar, sized like its neighbours.
  desktop: { button: 'px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 hover:brightness-105 transition-[filter]', icon: 13 },
};

export default function VideoMemoryButton({ variant, onClick }: { variant: VideoMemoryVariant; onClick: () => void }) {
  const s = STYLES[variant];
  return (
    <button type="button" onClick={onClick} data-testid="video-memory-button"
      title="Add a video that plays when this page's printed QR is scanned"
      className={`memory-shine ${s.button}`}>
      <Video size={s.icon} strokeWidth={2.25} /> <span>Add a video memory</span>
    </button>
  );
}
