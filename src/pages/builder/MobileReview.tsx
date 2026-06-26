/* ══════════════════════════════════════════════════════════════════════════
   MobileReview — the phone review experience: "Megy does it, you approve."
   Each page fills the screen; swipe (or arrows) to move freely. "Change" cycles
   the page's layout to the next template (loops). "Done" appears only on the
   LAST page → a brief "Loading album preview…" beat → Preview.
   ══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, RefreshCw, Check, Loader2 } from 'lucide-react';
import type { BuilderContextValue } from './BuilderContext';
import { PageView } from './BuilderPreview';
import { getCanvasDimensions } from './layouts';

export default function MobileReview({ actions, onDone }: { actions: BuilderContextValue; onDone: () => void }) {
  const pages = actions.albumPages;
  const idx = actions.currentPageIndex;
  const total = pages.length;
  const page = pages[idx];
  const isLast = idx >= total - 1;
  const [finishing, setFinishing] = useState(false);

  // Fit the page to the phone viewport (both dimensions).
  const [dims, setDims] = useState({ w: 320, h: 320 });
  useEffect(() => {
    const compute = () => {
      const c = getCanvasDimensions(actions.albumSize);
      const aspect = c.width / Math.max(1, c.height);
      const availW = window.innerWidth - 32;
      const availH = window.innerHeight - 200; // page counter + bottom bar
      let w = availW;
      let h = w / aspect;
      if (h > availH) { h = availH; w = h * aspect; }
      setDims({ w: Math.round(w), h: Math.round(h) });
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [actions.albumSize]);

  const goPrev = () => { if (idx > 0) actions.goToPage(idx - 1); };
  const goNext = () => { if (idx < total - 1) actions.goToPage(idx + 1); };

  const handleDone = () => {
    setFinishing(true);
    // "Loading album preview…" beat, then into Preview.
    setTimeout(onDone, 900);
  };

  if (finishing) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-[#FFF8F0] text-[#6B6B6B] gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-[#E8A598]" />
        <span className="text-sm font-medium">Loading album preview…</span>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#F5F5F5]">
      {/* Page counter */}
      <div className="shrink-0 text-center py-2.5 text-xs font-medium text-[#6B6B6B]">
        Page {idx + 1} of {total} · swipe to browse
      </div>

      {/* Swipeable page */}
      <div className="flex-1 flex items-center justify-center overflow-hidden px-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={idx}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={(_e, info) => {
              if (info.offset.x < -60) goNext();
              else if (info.offset.x > 60) goPrev();
            }}
            initial={{ opacity: 0, x: 36 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -36 }}
            transition={{ duration: 0.18 }}
            className="bg-white shadow-xl shrink-0"
            style={{ width: dims.w, height: dims.h, touchAction: 'pan-y' }}
          >
            {page && <PageView page={page} photos={actions.uploadedPhotos} singleW={dims.w} H={dims.h} pageIndex={idx} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom action bar */}
      <div className="shrink-0 px-4 pb-7 pt-3 bg-white border-t border-[#E8E8E8]">
        <div className="flex items-center gap-3">
          <button onClick={goPrev} disabled={idx === 0}
            className="w-12 h-12 rounded-full bg-[#FFF8F0] flex items-center justify-center text-[#6B6B6B] disabled:opacity-30 transition-opacity">
            <ChevronLeft size={22} />
          </button>
          <button onClick={() => actions.cycleLayout()}
            className="flex-1 h-12 rounded-xl bg-[#F4C2A1] text-white font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
            <RefreshCw size={18} /> Change
          </button>
          <button onClick={goNext} disabled={isLast}
            className="w-12 h-12 rounded-full bg-[#FFF8F0] flex items-center justify-center text-[#6B6B6B] disabled:opacity-30 transition-opacity">
            <ChevronRight size={22} />
          </button>
        </div>
        {isLast && (
          <button onClick={handleDone}
            className="w-full mt-3 h-12 rounded-xl bg-[#2E7D4A] text-white font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
            <Check size={18} /> Done — Preview my album
          </button>
        )}
      </div>
    </div>
  );
}
