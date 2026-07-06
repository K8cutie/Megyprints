/* ══════════════════════════════════════════════════════════════════════════
   MobileReview — the phone review experience: "Megy does it, you approve."
   Each page fills the screen; swipe (or arrows) to move freely. "Change layout"
   opens a picker of the available templates for that page. "Done" appears only on
   the LAST page → a brief "Loading album preview…" beat → Preview.
   ══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, LayoutGrid, Check, Loader2, X, Youtube } from 'lucide-react';
import type { BuilderContextValue } from './BuilderContext';
import { PageView } from './BuilderPreview';
import { getCanvasDimensions } from './layouts';
import { getTemplateById } from './pageTemplates';
import MobileTextEditor, { type BoxTextContent } from './MobileTextEditor';
import AddQrModal from './AddQrModal';
import AddOrnamentModal from './AddOrnamentModal';
import SlotChooser from './SlotChooser';
import type { QrFill } from './types';

export default function MobileReview({ actions, onDone }: { actions: BuilderContextValue; onDone: () => void }) {
  const pages = actions.albumPages;
  const idx = actions.currentPageIndex;
  const total = pages.length;
  const page = pages[idx];
  const isLast = idx >= total - 1;
  const [finishing, setFinishing] = useState(false);
  const [chooserSlot, setChooserSlot] = useState<number | null>(null); // empty-slot content chooser
  const [replaceSlot, setReplaceSlot] = useState<number | null>(null); // tap-to-replace target
  const [editSlot, setEditSlot] = useState<number | null>(null); // tap-to-edit-text target (template caption box)
  const [slotTextEditSlot, setSlotTextEditSlot] = useState<number | null>(null); // per-slot text (chooser)
  const [editTextId, setEditTextId] = useState<string | null>(null); // tap-to-edit free text (theme title)
  const [qrEditSlot, setQrEditSlot] = useState<number | null>(null); // tap-to-add/edit QR memory
  const [ornamentEditSlot, setOrnamentEditSlot] = useState<number | null>(null); // themed-ornament picker target
  const [chooserTextSlot, setChooserTextSlot] = useState<number | null>(null); // empty caption-box chooser
  const [textReplaceSlot, setTextReplaceSlot] = useState<number | null>(null); // caption-box photo target
  const [textSlotQrEditSlot, setTextSlotQrEditSlot] = useState<number | null>(null); // caption-box QR target
  const [memoryOpen, setMemoryOpen] = useState(false); // "Add memory video" (full-bleed corner QR badge)
  // Pulse the button until it's been clicked once (discovery, not a nag).
  const [memoryDiscovered, setMemoryDiscovered] = useState(() => {
    try { return localStorage.getItem('megy-memory-discovered') === '1'; } catch { return false; }
  });
  const openMemory = () => {
    setMemoryDiscovered(true);
    try { localStorage.setItem('megy-memory-discovered', '1'); } catch { /* ignore */ }
    setMemoryOpen(true);
  };

  // Seed the editor from a FREE text element (e.g. the theme title) by id.
  const buildTextInitial = (textId: string): BoxTextContent => {
    const el = page?.textElements?.find((t) => t.id === textId);
    return {
      text: el?.text ?? '', fontSize: el?.fontSize ?? 28,
      fontFamily: el?.fontFamily ?? 'Georgia, "Times New Roman", serif',
      color: el?.color ?? '#2D2D2D', bold: el?.bold ?? false, italic: el?.italic ?? false,
      underline: el?.underline ?? false, alignment: el?.alignment ?? 'center',
    };
  };

  // Seed the editor from the box's existing text, or the template's defaults.
  const template = page?.templateId ? getTemplateById(page.templateId) : null;
  const buildInitial = (slotIndex: number): BoxTextContent => {
    const existing = page?.textElements?.find((t) => t.boxIndex === slotIndex);
    if (existing) {
      return {
        text: existing.text, fontSize: existing.fontSize, fontFamily: existing.fontFamily,
        color: existing.color, bold: existing.bold, italic: existing.italic,
        underline: existing.underline, alignment: existing.alignment,
      };
    }
    const ts = template?.textSlots?.[slotIndex];
    return {
      text: '', fontSize: 28, fontFamily: 'Georgia, "Times New Roman", serif',
      color: '#2D2D2D', bold: false, italic: false, underline: false,
      alignment: ts?.align ?? 'center',
    };
  };

  // Seed the per-slot text editor (chooser "Add Text") from any existing slot text.
  const buildSlotTextInitial = (slotIndex: number): BoxTextContent => {
    const existing = page?.slotTexts?.[slotIndex];
    if (existing) return { ...existing };
    return {
      text: '', fontSize: 28, fontFamily: 'Georgia, "Times New Roman", serif',
      color: '#2D2D2D', bold: false, italic: false, underline: false, alignment: 'center',
    };
  };

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
    <div className="h-full flex flex-col bg-[#F5F5F5] relative">
      {/* Page counter */}
      <div className="shrink-0 text-center py-2.5 text-xs font-medium text-[#6B6B6B]">
        Page {idx + 1} of {total} · tap 🗑 to remove a photo, + to add one
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
            className="bg-white shadow-xl shrink-0 relative overflow-hidden"
            style={{ width: dims.w, height: dims.h, touchAction: 'pan-y' }}
          >
            {page && <PageView page={page} photos={actions.uploadedPhotos} singleW={dims.w} H={dims.h} pageIndex={idx}
              editable
              onChooseSlot={(slotIndex) => setChooserSlot(slotIndex)}
              onRemoveFromSlot={(slotIndex) => actions.clearSlot(slotIndex)}
              onSlotTextTap={(slotIndex) => setSlotTextEditSlot(slotIndex)}
              onTextSlotTap={(slotIndex) => setEditSlot(slotIndex)}
              onTextTap={(textId) => setEditTextId(textId)}
              onQrSlotTap={(slot) => setQrEditSlot(slot)}
              onOrnamentSlotTap={(slot) => setOrnamentEditSlot(slot)}
              onChooseTextSlot={(slotIndex) => setChooserTextSlot(slotIndex)}
              onTextSlotPhotoTap={(slotIndex) => setTextReplaceSlot(slotIndex)}
              onTextSlotQrTap={(slot) => setTextSlotQrEditSlot(slot)} />}
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
          <button onClick={() => actions.setLayoutPickerOpen(true)}
            className="flex-1 h-12 rounded-xl bg-[#F4C2A1] text-white font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
            <LayoutGrid size={18} /> Change layout
          </button>
          <button onClick={goNext} disabled={isLast}
            className="w-12 h-12 rounded-full bg-[#FFF8F0] flex items-center justify-center text-[#6B6B6B] disabled:opacity-30 transition-opacity">
            <ChevronRight size={22} />
          </button>
        </div>
        {/* Living-memory QR — offered on a single full photo page; turns it into
            a full-bleed photo with a scannable corner badge (face-picked corner). */}
        {actions.canAddMemoryQr && (
          <button onClick={openMemory}
            className={`w-full mt-3 h-11 rounded-xl font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform bg-[#E8A598] text-white shadow-sm ${memoryDiscovered ? '' : 'memory-pulse'}`}>
            <Youtube size={18} /> Add YouTube Memory
          </button>
        )}
        {isLast && (
          <button onClick={handleDone}
            className="w-full mt-3 h-12 rounded-xl bg-[#2E7D4A] text-white font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
            <Check size={18} /> Done — Preview my album
          </button>
        )}
      </div>

      {/* Empty-slot content chooser — Photo / Text / Ornament (bottom sheet) */}
      {chooserSlot !== null && (
        <SlotChooser
          mobile
          onPhoto={() => setReplaceSlot(chooserSlot)}
          onText={() => setSlotTextEditSlot(chooserSlot)}
          onOrnament={() => setOrnamentEditSlot(chooserSlot)}
          onClose={() => setChooserSlot(null)}
        />
      )}

      {/* Tap-to-replace photo picker — bottom sheet. Targets a photo SLOT
          (replaceSlot → fillSlot) or a CAPTION BOX (textReplaceSlot → setTextSlotPhoto). */}
      <AnimatePresence>
        {(replaceSlot !== null || textReplaceSlot !== null) && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-black/40 flex items-end"
            onClick={() => { setReplaceSlot(null); setTextReplaceSlot(null); }}
          >
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 320 }}
              className="w-full bg-white rounded-t-2xl max-h-[60vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#E8E8E8] shrink-0">
                <span className="text-sm font-semibold text-[#2D2D2D]">Add a photo</span>
                <button onClick={() => { setReplaceSlot(null); setTextReplaceSlot(null); }} className="text-[#9B9B9B] p-1"><X size={18} /></button>
              </div>
              {actions.uploadedPhotos.length === 0 ? (
                <p className="p-6 text-center text-sm text-[#9B9B9B]">No photos uploaded yet.</p>
              ) : (
                <div className="overflow-y-auto p-3 grid grid-cols-3 gap-2">
                  {actions.uploadedPhotos.map((p, i) => (
                    <button key={i}
                      onClick={() => {
                        if (replaceSlot !== null) actions.fillSlot(replaceSlot, i);
                        else if (textReplaceSlot !== null) actions.setTextSlotPhoto(textReplaceSlot, i, idx);
                        setReplaceSlot(null); setTextReplaceSlot(null);
                      }}
                      // Square cell via the padding-bottom technique (NOT CSS aspect-ratio,
                      // which older Android/Samsung browsers don't support → cells collapse
                      // and thumbnails overlap). h-0 + pb-[100%] forces height = width on any
                      // browser; the image is absolutely positioned to fill it.
                      className="relative h-0 pb-[100%] rounded-lg overflow-hidden bg-[#F0F0F0] active:scale-95 transition-transform">
                      <img src={p.previewUrl} alt="" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty caption-box content chooser — Photo / Text / QR (bottom sheet).
          Text reuses the existing setBoxText path (setEditSlot). */}
      {chooserTextSlot !== null && (
        <SlotChooser
          mobile
          onPhoto={() => setTextReplaceSlot(chooserTextSlot)}
          onText={() => setEditSlot(chooserTextSlot)}
          onQr={() => setTextSlotQrEditSlot(chooserTextSlot)}
          onClose={() => setChooserTextSlot(null)}
        />
      )}

      {/* Caption-box QR add/edit */}
      {textSlotQrEditSlot !== null && (
        <AddQrModal
          initial={page?.textSlotQr?.[textSlotQrEditSlot] ?? null}
          onSave={(fill: QrFill) => { actions.setTextSlotQr(textSlotQrEditSlot, fill, idx); setTextSlotQrEditSlot(null); }}
          onRemove={() => { actions.setTextSlotQr(textSlotQrEditSlot, null, idx); setTextSlotQrEditSlot(null); }}
          onClose={() => setTextSlotQrEditSlot(null)}
        />
      )}

      {/* Tap-to-edit text — the floating-bar editor above the keyboard */}
      {editSlot !== null && (
        <MobileTextEditor
          initial={buildInitial(editSlot)}
          onSave={(content) => actions.setBoxText(editSlot, content)}
          onClose={() => setEditSlot(null)}
        />
      )}
      {/* Per-slot text (chooser "Add Text") → saves via setSlotText. Clearing the
          text (empty) removes the slot text so the box returns to a "+" chooser. */}
      {slotTextEditSlot !== null && (
        <MobileTextEditor
          initial={buildSlotTextInitial(slotTextEditSlot)}
          onSave={(content) => actions.setSlotText(slotTextEditSlot, content.text.trim() ? content : null, idx)}
          onClose={() => setSlotTextEditSlot(null)}
        />
      )}
      {/* Free text (theme title) → saves by id so the font/color/text stick. */}
      {editTextId !== null && (
        <MobileTextEditor
          initial={buildTextInitial(editTextId)}
          onSave={(content) => actions.updateTextElement(editTextId, content)}
          onClose={() => setEditTextId(null)}
        />
      )}
      {qrEditSlot !== null && (
        <AddQrModal
          initial={page?.qrFills?.[qrEditSlot] ?? null}
          onSave={(fill: QrFill) => { actions.setQrFill(qrEditSlot, fill, idx); setQrEditSlot(null); }}
          onRemove={() => { actions.setQrFill(qrEditSlot, null, idx); setQrEditSlot(null); }}
          onClose={() => setQrEditSlot(null)}
        />
      )}
      {ornamentEditSlot !== null && (
        <AddOrnamentModal
          initial={page?.ornamentFills?.[ornamentEditSlot] ?? null}
          onSave={(fill) => { actions.setOrnamentFill(ornamentEditSlot, fill, idx); setOrnamentEditSlot(null); }}
          onRemove={() => { actions.setOrnamentFill(ornamentEditSlot, null, idx); setOrnamentEditSlot(null); }}
          onClose={() => setOrnamentEditSlot(null)}
        />
      )}
      {/* New living-memory: convert this single-photo page to a corner badge.
          (Editing/removing an existing badge is via tapping the chip → qrEditSlot.) */}
      {memoryOpen && (
        <AddQrModal
          initial={null}
          onSave={(fill: QrFill) => { void actions.applyMemoryQr(fill); setMemoryOpen(false); }}
          onRemove={() => setMemoryOpen(false)}
          onClose={() => setMemoryOpen(false)}
        />
      )}
    </div>
  );
}
