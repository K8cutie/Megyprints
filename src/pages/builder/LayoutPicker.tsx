/* ══════════════════════════════════════════════════════════════════════════
   LayoutPicker — the "Change layout" picker. Shows the page's own layout first
   ("✓ Current"), then every layout that holds its photos without a bad crop,
   same photo count first (layoutChoicesForPage), each as a REAL preview (the
   page rendered with your actual photos), so the user picks the look directly.
   Bottom sheet on phones/tablets, centered modal on desktop.
   Shared: opened from the mobile review AND the desktop panel via
   actions.layoutPickerOpen.

   A layout that holds fewer photos than the page has, or no box for its
   caption, asks first what happens to them: "Full Page" on a 3-photo page
   took 2 photos out of the album and left the quote printing over the photo,
   without a word (1-star testers round 3, the Indecisive One).
   ══════════════════════════════════════════════════════════════════════════ */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import type { BuilderContextValue } from './BuilderContext';
import type { AlbumPage, PageTemplate } from './types';
import { PageView } from './BuilderPreview';
import { getCanvasDimensions } from './layouts';
import { useModalDialog } from '../../lib/useModalDialog';
import { relayPageOnTemplate } from './useBuilderState';
import { memoriesOn } from './generateAlbum';

export default function LayoutPicker({ actions }: { actions: BuilderContextValue }) {
  const open = actions.layoutPickerOpen;
  const idx = actions.currentPageIndex;
  const page = actions.albumPages[idx];
  // The layout tapped that would take something off the page, while it asks.
  const [asking, setAsking] = useState<{ t: PageTemplate; photos: number; captions: number } | null>(null);
  const close = () => { setAsking(null); actions.setLayoutPickerOpen(false); };
  const choose = (t: PageTemplate) => {
    const loses = actions.layoutChangeLoses(t.id);
    if (loses.photos === 0 && loses.captions === 0) { actions.applyPageLayout(t.id); close(); return; }
    setAsking({ t, ...loses });
  };
  const apply = (leftover: 'new-page' | 'leave-out') => {
    if (!asking) return;
    actions.applyPageLayout(asking.t.id, leftover);
    close();
  };
  // Keyboard: focus on the current layout, Tab kept inside, Escape closes (KB-2).
  const panelRef = useModalDialog<HTMLDivElement>(!!(open && page), close);

  // Preview thumbnail size at the album's aspect ratio.
  const dims = getCanvasDimensions(actions.albumSize);
  const aspect = dims.width / Math.max(1, dims.height);
  const W = 150;
  const H = Math.round(W / aspect);

  const layouts = open && page ? actions.availableTemplatesForCurrentPage() : [];
  // A video memory only ever sits on a full-page photo, so its page offers
  // only that (relayPageOnTemplate). Say why, and how to get more layouts.
  const hasMemory = !!page && memoriesOn(page).length > 0;

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
            ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="layout-picker-title" tabIndex={-1}
            className="w-full lg:max-w-2xl bg-white rounded-t-2xl lg:rounded-2xl max-h-[80vh] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-line shrink-0">
              <span id="layout-picker-title" className="text-sm font-semibold text-dark">Choose a layout</span>
              <button onClick={close} className="text-light p-1" aria-label="Close"><X size={18} /></button>
            </div>
            {hasMemory && !asking && (
              <p className="px-4 pt-3 text-sm text-medium" data-testid="layout-memory-note">
                This page has a video memory, so it stays one full photo with the QR in the corner. To use a layout with more photos, tap the QR and remove the video first.
              </p>
            )}
            {asking ? (
              <LeftoverQuestion asking={asking} onNewPage={() => apply('new-page')} onLeaveOut={() => apply('leave-out')} onBack={() => setAsking(null)} />
            ) : layouts.length === 0 ? (
              <p className="p-6 text-center text-sm text-light">No other layouts fit this page.</p>
            ) : (
              <div className="overflow-y-auto p-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
                {layouts.map((t) => {
                  const current = t.id === page.templateId;
                  // The page as this layout would make it — the same re-lay the
                  // tap applies. The preview used to build its own copy and kept
                  // the page's QR by slot number, drawing a memory's QR as a
                  // whole photo square in layouts it could never go on.
                  const previewPage: AlbumPage = relayPageOnTemplate(page, t);
                  return (
                    <button key={t.id} data-autofocus={current ? true : undefined} aria-pressed={current}
                      onClick={() => choose(t)}
                      className={`rounded-xl border-2 p-1.5 active:scale-95 transition-transform ${current ? 'border-peach bg-cream' : 'border-line-soft bg-white'}`}>
                      <div className="relative overflow-hidden bg-white mx-auto rounded-md" style={{ width: W, height: H }}>
                        <PageView page={previewPage} photos={actions.uploadedPhotos} singleW={W} H={H} pageIndex={idx} />
                      </div>
                      <span className="block text-[11px] text-center truncate mt-1.5"
                        style={{ color: current ? '#9A4A2C' : '#6B6B6B', fontWeight: current ? 600 : 400 }}>
                        {current ? '✓ Current' : t.name}
                      </span>
                    </button>
                  );
                })}
                {layouts.length === 1 && layouts[0].id === page.templateId && !hasMemory && (
                  <p className="col-span-full px-3 pb-3 text-center text-sm text-light">No other layouts fit this page.</p>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** "Where should they go?" for the photos (and captions) a layout can't hold. */
function LeftoverQuestion({ asking, onNewPage, onLeaveOut, onBack }: {
  asking: { t: PageTemplate; photos: number; captions: number };
  onNewPage: () => void;
  onLeaveOut: () => void;
  onBack: () => void;
}) {
  const { t, photos, captions } = asking;
  const holds = t.slots.filter((sl) => sl.kind !== 'qr').length;
  const them = photos === 1 ? 'it' : 'them';
  return (
    <div className="p-5 overflow-y-auto" data-testid="layout-leftover">
      <p className="text-sm font-semibold text-dark mb-1">“{t.name}” holds {holds} {holds === 1 ? 'photo' : 'photos'}.</p>
      {photos > 0 && (
        <p className="text-sm text-medium mb-3" data-testid="layout-leftover-photos">
          {photos === 1 ? 'One photo on this page doesn’t fit it.' : `${photos} photos on this page don’t fit it.`} Where should {photos === 1 ? 'it' : 'they'} go?
        </p>
      )}
      {captions > 0 && (
        <p className="text-sm text-medium mb-3" data-testid="layout-leftover-captions">
          It has no box for {captions === 1 ? 'the caption' : 'the captions'} on this page, so {captions === 1 ? 'it goes' : 'they go'} with the old layout.
        </p>
      )}
      <div className="space-y-2">
        {photos > 0 ? (
          <>
            <button type="button" onClick={onNewPage} data-testid="layout-leftover-new-page" data-autofocus
              className="w-full py-3 px-4 rounded-xl bg-peach text-white text-sm font-semibold hover:brightness-105 transition-all text-left">
              Put {them} on a new page after this one
              <span className="block text-xs font-normal opacity-90">The album gets one more page.</span>
            </button>
            <button type="button" onClick={onLeaveOut} data-testid="layout-leftover-leave-out"
              className="w-full py-3 px-4 rounded-xl border border-line bg-white text-sm font-semibold text-dark hover:bg-blush transition-colors text-left">
              Take {them} out of the album
              <span className="block text-xs font-normal text-taupe">{photos === 1 ? 'It stays' : 'They stay'} in your photos, ready to place again.</span>
            </button>
          </>
        ) : (
          <button type="button" onClick={onLeaveOut} data-testid="layout-leftover-apply" data-autofocus
            className="w-full py-3 rounded-xl bg-peach text-white text-sm font-semibold hover:brightness-105 transition-all">
            Use this layout
          </button>
        )}
        <button type="button" onClick={onBack} data-testid="layout-leftover-back"
          className="w-full py-2.5 rounded-xl text-sm font-semibold text-cocoa hover:bg-cream transition-colors">
          ‹ Choose another layout
        </button>
      </div>
    </div>
  );
}
