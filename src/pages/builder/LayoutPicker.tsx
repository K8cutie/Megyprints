/* ══════════════════════════════════════════════════════════════════════════
   LayoutPicker — the "Change layout" picker. Shows every template available for
   the current page (matching its photo count + ratio, active only) as a REAL
   preview (the page rendered with your actual photos), so the user picks the
   look directly. Bottom sheet on phones/tablets, centered modal on desktop.
   Shared: opened from the mobile review AND the desktop panel via
   actions.layoutPickerOpen.
   ══════════════════════════════════════════════════════════════════════════ */

import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import type { BuilderContextValue } from './BuilderContext';
import type { AlbumPage } from './types';
import { PageView } from './BuilderPreview';
import { getCanvasDimensions } from './layouts';

export default function LayoutPicker({ actions }: { actions: BuilderContextValue }) {
  const open = actions.layoutPickerOpen;
  const idx = actions.currentPageIndex;
  const page = actions.albumPages[idx];
  const close = () => actions.setLayoutPickerOpen(false);

  // Preview thumbnail size at the album's aspect ratio.
  const dims = getCanvasDimensions(actions.albumSize);
  const aspect = dims.width / Math.max(1, dims.height);
  const W = 150;
  const H = Math.round(W / aspect);

  const layouts = open && page ? actions.availableTemplatesForCurrentPage() : [];
  const existingFills = page
    ? [...new Set((page.slotFills ?? []).filter((f): f is number => f !== null))]
    : [];

  return (
    <AnimatePresence>
      {open && page && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] bg-black/40 flex items-end lg:items-center justify-center"
          onClick={close}
        >
          <motion.div
            initial={{ y: '100%', opacity: 0.6 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '100%', opacity: 0.6 }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className="w-full lg:max-w-2xl bg-white rounded-t-2xl lg:rounded-2xl max-h-[80vh] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#E8E8E8] shrink-0">
              <span className="text-sm font-semibold text-[#2D2D2D]">Choose a layout</span>
              <button onClick={close} className="text-[#9B9B9B] p-1" aria-label="Close"><X size={18} /></button>
            </div>
            {layouts.length === 0 ? (
              <p className="p-6 text-center text-sm text-[#9B9B9B]">No other layouts fit this page.</p>
            ) : (
              <div className="overflow-y-auto p-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
                {layouts.map((t) => {
                  const current = t.id === page.templateId;
                  const slotCount = t.slots.length;
                  const previewPage: AlbumPage = {
                    ...page,
                    templateId: t.id,
                    slotFills: new Array(slotCount).fill(null).map((_, i) => existingFills[i] ?? null),
                    slotScales: new Array(slotCount).fill(1),
                    slotOffsetsX: new Array(slotCount).fill(0),
                    slotOffsetsY: new Array(slotCount).fill(0),
                  };
                  return (
                    <button key={t.id}
                      onClick={() => { actions.applyPageLayout(t.id); close(); }}
                      className={`rounded-xl border-2 p-1.5 active:scale-95 transition-transform ${current ? 'border-[#F4C2A1] bg-[#FFF8F0]' : 'border-[#F0F0F0] bg-white'}`}>
                      <div className="relative overflow-hidden bg-white mx-auto rounded-md" style={{ width: W, height: H }}>
                        <PageView page={previewPage} photos={actions.uploadedPhotos} singleW={W} H={H} pageIndex={idx} />
                      </div>
                      <span className="block text-[11px] text-center truncate mt-1.5"
                        style={{ color: current ? '#E8A598' : '#6B6B6B', fontWeight: current ? 600 : 400 }}>
                        {current ? '✓ Current' : t.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
