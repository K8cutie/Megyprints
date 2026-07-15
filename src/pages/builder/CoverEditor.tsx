/* ══════════════════════════════════════════════════════════════════════════
   CoverEditor — edit the FRONT and BACK covers as PAGES, one panel at a time,
   with the SAME per-page canvas + tap wiring as interior pages (cover-as-pages).
   The SPINE is never edited: its text is derived from the front cover page and
   shown live in the wrap-preview strip (see coverLayout.deriveSpine).

   Reuses PageView + the shared content modals (SlotChooser / MobileTextEditor /
   AiClipartModal). Every setter call OMITS pageIndex on purpose: that routes the
   edit through the scope-aware updateCurrentPage, which writes to the ACTIVE
   cover page (editScope) instead of an interior page.

   Modes:
   • 'step'  — embedded wizard step (after album size). Back / Continue drive nav.
   • 'modal' — full-screen overlay opened from the Preview screen ("Design cover").
   ══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, LayoutGrid } from 'lucide-react';
import { useBuilderContext } from './BuilderContext';
import { PageView } from './BuilderPreview';
import { CoverWrapPreview } from './CoverWrapPreview';
import { getCanvasDimensions } from './layouts';
import { getCoverTemplates } from './pageTemplates';
import { coverWrapGeometry } from './coverGeometry';
import MobileTextEditor, { type BoxTextContent } from './MobileTextEditor';
import AiClipartModal from './AiClipartModal';
import SlotChooser from './SlotChooser';
import { DEFAULT_COVER, type AlbumPage } from './types';

interface Props {
  mode?: 'step' | 'modal';
  onNext?: () => void;
  onBack?: () => void;
  onClose?: () => void;
}

export default function CoverEditor({ mode = 'modal', onNext, onBack, onClose }: Props) {
  const b = useBuilderContext();
  const { editScope, setEditScope, coverFront, coverBack, albumSize, albumPages, uploadedPhotos } = b;

  // Own the cover scope for the lifetime of the editor; always restore 'interior'
  // on unmount so a stale cover scope can never corrupt the next interior edit.
  useEffect(() => {
    setEditScope('coverFront');
    return () => setEditScope('interior');
  }, [setEditScope]);

  const isFront = editScope !== 'coverBack';
  const page: AlbumPage = isFront ? coverFront : coverBack;

  // ── Content-editing modal state (mirrors MobileReview) ──
  const [chooserSlot, setChooserSlot] = useState<number | null>(null);      // empty photo/hero slot
  const [replaceSlot, setReplaceSlot] = useState<number | null>(null);      // photo picker for a slot
  const [slotTextEditSlot, setSlotTextEditSlot] = useState<number | null>(null);
  const [editSlot, setEditSlot] = useState<number | null>(null);            // caption/title box text
  const [editTextId, setEditTextId] = useState<string | null>(null);        // free text by id
  const [ornamentEditSlot, setOrnamentEditSlot] = useState<number | null>(null);        // hero-slot graphic
  const [chooserTextSlot, setChooserTextSlot] = useState<number | null>(null);          // empty caption box
  const [textReplaceSlot, setTextReplaceSlot] = useState<number | null>(null);          // caption-box photo
  const [textSlotOrnamentEditSlot, setTextSlotOrnamentEditSlot] = useState<number | null>(null); // caption-box graphic

  const template = page.templateId ? getCoverTemplates(albumSize).find((t) => t.id === page.templateId) : null;

  const buildBoxInitial = (slotIndex: number): BoxTextContent => {
    const existing = page.textElements?.find((t) => t.boxIndex === slotIndex);
    if (existing) {
      return {
        text: existing.text, fontSize: existing.fontSize, fontFamily: existing.fontFamily,
        color: existing.color, bold: existing.bold, italic: existing.italic,
        underline: existing.underline, alignment: existing.alignment,
        outlineColor: existing.outlineColor, outlineWidth: existing.outlineWidth, shadow: existing.shadow,
      };
    }
    const ts = template?.textSlots?.[slotIndex];
    return {
      text: '', fontSize: 36, fontFamily: 'Cinzel, Georgia, serif',
      color: '#2D2D2D', bold: true, italic: false, underline: false, alignment: ts?.align ?? 'center',
    };
  };
  const buildSlotTextInitial = (slotIndex: number): BoxTextContent => {
    const existing = page.slotTexts?.[slotIndex];
    if (existing) return { ...existing };
    return { text: '', fontSize: 32, fontFamily: 'Cinzel, Georgia, serif', color: '#2D2D2D', bold: true, italic: false, underline: false, alignment: 'center' };
  };
  const buildTextInitial = (textId: string): BoxTextContent => {
    const el = page.textElements?.find((t) => t.id === textId);
    return {
      text: el?.text ?? '', fontSize: el?.fontSize ?? 36, fontFamily: el?.fontFamily ?? 'Cinzel, Georgia, serif',
      color: el?.color ?? '#2D2D2D', bold: el?.bold ?? true, italic: el?.italic ?? false,
      underline: el?.underline ?? false, alignment: el?.alignment ?? 'center',
      outlineColor: el?.outlineColor, outlineWidth: el?.outlineWidth, shadow: el?.shadow,
    };
  };

  // Fit the single panel into the available space (both dimensions).
  const [dims, setDims] = useState({ w: 260, h: 260, wrapW: 460 });
  useEffect(() => {
    const compute = () => {
      const c = getCanvasDimensions(albumSize);
      const aspect = c.width / Math.max(1, c.height);
      // The full cover wrap is the front-and-centre hero.
      const wrapW = Math.round(Math.min(window.innerWidth - 40, 600));
      // The single-panel editor for the active side sits below it, sized to fit.
      const availW = Math.min(window.innerWidth - 40, 400);
      const availH = window.innerHeight - 500; // header + toggle + wrap + layout + footer
      let w = availW;
      let h = w / aspect;
      if (h > availH) { h = availH; w = h * aspect; }
      setDims({ w: Math.round(Math.max(150, w)), h: Math.round(Math.max(150, h)), wrapW });
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [albumSize]);

  const wrapGeom = useMemo(() => coverWrapGeometry(albumSize, albumPages.length, DEFAULT_COVER), [albumSize, albumPages.length]);
  const coverTemplates = useMemo(() => getCoverTemplates(albumSize), [albumSize]);

  const toggle = (front: boolean) => setEditScope(front ? 'coverFront' : 'coverBack');

  const header = (
    <div className="flex items-center justify-between px-5 h-14 border-b border-[#EADFD3] shrink-0">
      <div>
        <h2 className="font-display text-lg font-semibold text-[#2D2D2D]">Design your cover</h2>
        <p className="text-[11px] text-[#9B8B7A] -mt-0.5">Edit the front &amp; back like pages — the spine follows your front title</p>
      </div>
      {mode === 'modal' && (
        <button onClick={onClose} className="p-2 rounded-full hover:bg-black/5 text-[#6B6B6B]"><X size={20} /></button>
      )}
    </div>
  );

  const frontBackToggle = (
    <div className="shrink-0 flex justify-center pt-3">
      <div className="inline-flex rounded-full bg-[#F1E7DA] p-1">
        {([['Front', true], ['Back', false]] as const).map(([label, front]) => (
          <button
            key={label}
            onClick={() => toggle(front)}
            className={`px-6 py-1.5 rounded-full text-sm font-semibold transition-colors ${isFront === front ? 'bg-white text-[#2D2D2D] shadow-sm' : 'text-[#9B8B7A]'}`}
          >
            {label} cover
          </button>
        ))}
      </div>
    </div>
  );

  const body = (
    <div className="flex-1 overflow-auto min-h-0 flex flex-col items-center px-4 pt-4 gap-5">
      {/* The full cover wrap (back · spine · front) — FRONT AND CENTRE. */}
      <div className="w-full flex flex-col items-center">
        <CoverWrapPreview
          geometry={wrapGeom}
          coverDesign={b.coverDesign}
          coverFront={coverFront}
          coverBack={coverBack}
          photos={uploadedPhotos}
          width={dims.wrapW}
          showGuides
        />
        <div className="flex justify-between mt-1.5 px-1 text-[10px] uppercase tracking-wide text-[#B9A992]" style={{ width: dims.wrapW }}>
          <span>← Back</span><span>Spine</span><span>Front →</span>
        </div>
      </div>

      {/* Edit the active side (Front/Back toggle above) + its layout options. */}
      <div className="flex flex-col items-center gap-2.5">
        <div className="flex items-center gap-2">
          <LayoutGrid size={15} className="text-[#B9A992]" />
          {coverTemplates.map((t) => (
            <button
              key={t.id}
              onClick={() => b.applyCoverLayout(t.id)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-colors ${page.templateId === t.id ? 'bg-[#E8A598] text-white border-[#E8A598]' : 'bg-white text-[#6B5842] border-[#E4D8C9] hover:bg-[#FBF3EA]'}`}
            >
              {t.name}
            </button>
          ))}
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={editScope}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={(_e, info) => {
              if (info.offset.x < -60) toggle(false);
              else if (info.offset.x > 60) toggle(true);
            }}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.16 }}
            className="bg-white shadow-lg shrink-0 relative overflow-hidden mb-4"
            style={{ width: dims.w, height: dims.h, touchAction: 'pan-y' }}
          >
            <PageView
              page={page} photos={uploadedPhotos} singleW={dims.w} H={dims.h} pageIndex={0}
              editable
              coverMode
              onChooseSlot={(s) => setChooserSlot(s)}
              onRemoveFromSlot={(s) => b.clearSlot(s)}
              onSlotTextTap={(s) => setSlotTextEditSlot(s)}
              onTextSlotTap={(s) => setEditSlot(s)}
              onTextTap={(id) => setEditTextId(id)}
              onOrnamentSlotTap={(s) => setOrnamentEditSlot(s)}
              onChooseTextSlot={(s) => setChooserTextSlot(s)}
              onTextSlotPhotoTap={(s) => setTextReplaceSlot(s)}
              onTextSlotOrnamentTap={(s) => setTextSlotOrnamentEditSlot(s)}
            />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );

  const footer =
    mode === 'step' ? (
      <div className="shrink-0 border-t border-[#EADFD3] p-3 flex justify-between items-center bg-[#FFF8F0]">
        <button onClick={onBack} className="px-4 py-2.5 rounded-xl text-[#8B7E7A] font-medium hover:bg-black/5 transition-colors">← Back</button>
        <button onClick={onNext} className="px-6 py-2.5 rounded-xl bg-[#E8A598] text-white font-semibold hover:brightness-105 active:scale-[0.98] transition-all shadow-sm">
          Continue to photos →
        </button>
      </div>
    ) : (
      <div className="shrink-0 border-t border-[#EADFD3] p-3 flex justify-end bg-[#FFF8F0]">
        <button onClick={onClose} className="px-6 py-2.5 rounded-xl bg-[#E8A598] text-white font-semibold hover:brightness-105 active:scale-[0.98] transition-all shadow-sm">
          Done
        </button>
      </div>
    );

  const modals = (
    <>
      {/* Empty hero slot → Photo / Text / Graphic */}
      {chooserSlot !== null && (
        <SlotChooser
          mobile
          onPhoto={() => setReplaceSlot(chooserSlot)}
          onText={() => setSlotTextEditSlot(chooserSlot)}
          onGraphic={() => setOrnamentEditSlot(chooserSlot)}
          onClose={() => setChooserSlot(null)}
        />
      )}
      {/* Empty caption/title box → Text or Graphic */}
      {chooserTextSlot !== null && (
        <SlotChooser
          mobile
          onText={() => setEditSlot(chooserTextSlot)}
          onGraphic={() => setTextSlotOrnamentEditSlot(chooserTextSlot)}
          onClose={() => setChooserTextSlot(null)}
        />
      )}
      {/* Photo picker (slot OR caption box) */}
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
              {uploadedPhotos.length === 0 ? (
                <p className="p-6 text-center text-sm text-[#9B9B9B]">No photos uploaded yet — add some from the next step, then come back to set a cover photo.</p>
              ) : (
                <div className="overflow-y-auto p-3 grid grid-cols-3 gap-2">
                  {uploadedPhotos.map((p, i) => (
                    <button key={i}
                      onClick={() => {
                        if (replaceSlot !== null) b.fillSlot(replaceSlot, i);
                        else if (textReplaceSlot !== null) b.setTextSlotPhoto(textReplaceSlot, i);
                        setReplaceSlot(null); setTextReplaceSlot(null);
                      }}
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
      {/* Caption/title box text */}
      {editSlot !== null && (
        <MobileTextEditor
          initial={buildBoxInitial(editSlot)}
          onSave={(content) => b.setBoxText(editSlot, content)}
          onClose={() => setEditSlot(null)}
        />
      )}
      {/* Per-slot text (chooser "Add Text") */}
      {slotTextEditSlot !== null && (
        <MobileTextEditor
          initial={buildSlotTextInitial(slotTextEditSlot)}
          onSave={(content) => b.setSlotText(slotTextEditSlot, content.text.trim() ? content : null)}
          onClose={() => setSlotTextEditSlot(null)}
        />
      )}
      {/* Free text by id */}
      {editTextId !== null && (
        <MobileTextEditor
          initial={buildTextInitial(editTextId)}
          onSave={(content) => b.updateTextElement(editTextId, content)}
          onClose={() => setEditTextId(null)}
        />
      )}
      {/* Hero-slot graphic */}
      {ornamentEditSlot !== null && (
        <AiClipartModal
          initial={page.ornamentFills?.[ornamentEditSlot] ?? null}
          onSave={(fill) => { b.setOrnamentFill(ornamentEditSlot, fill); setOrnamentEditSlot(null); }}
          onRemove={() => { b.setOrnamentFill(ornamentEditSlot, null); setOrnamentEditSlot(null); }}
          onClose={() => setOrnamentEditSlot(null)}
        />
      )}
      {/* Caption/title box graphic */}
      {textSlotOrnamentEditSlot !== null && (
        <AiClipartModal
          initial={page.textSlotOrnament?.[textSlotOrnamentEditSlot] ?? null}
          onSave={(fill) => { b.setTextSlotOrnament(textSlotOrnamentEditSlot, fill); setTextSlotOrnamentEditSlot(null); }}
          onRemove={() => { b.setTextSlotOrnament(textSlotOrnamentEditSlot, null); setTextSlotOrnamentEditSlot(null); }}
          onClose={() => setTextSlotOrnamentEditSlot(null)}
        />
      )}
    </>
  );

  if (mode === 'step') {
    return (
      <div className="h-full flex flex-col bg-[#FFF8F0] relative">
        {header}
        {frontBackToggle}
        {body}
        {footer}
        {modals}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-stretch sm:items-center justify-center sm:p-4">
      <div className="bg-[#FFF8F0] w-full sm:max-w-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-full overflow-hidden relative">
        {header}
        {frontBackToggle}
        {body}
        {footer}
        {modals}
      </div>
    </div>
  );
}
