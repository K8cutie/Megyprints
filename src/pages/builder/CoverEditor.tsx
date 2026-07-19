/* ══════════════════════════════════════════════════════════════════════════
   CoverEditor — Step-3-style cover editor.

   Same format as the "Style Your Album" step: a live PREVIEW panel + inline
   category TABS (Background / Text / Spine) + controls right below — no tap-a-box,
   no bottom sheet, no separate modal. The front & back covers are edited one face
   at a time (Front / Back toggle); the spine belongs to the front and auto-follows
   the front title (overridable in the Spine tab).

   • Background — reuses the exact Step-3 picker (Solid/Gradient/Image/Textures +
     opacity). Setting an Image here IS how you put a photo on the cover.
   • Text — the cover title, typed inline (+ font / colour).
   • Spine (front only) — a live spine preview; auto-uses the front title unless a
     custom spine text is typed here.
   ══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useBuilderContext } from './BuilderContext';
import { PageView } from './BuilderPreview';
import BackgroundDesigner from './BackgroundDesigner';
import { getCanvasDimensions } from './layouts';
import { coverWrapGeometry } from './coverGeometry';
import { deriveSpine } from './coverLayout';
import { FONTS, COLORS } from './MobileTextEditor';
import { DEFAULT_COVER, type AlbumPage, type TextStyle } from './types';

const SPINE_STRIP_W = 26;
type CoverTab = 'background' | 'text';

interface Props {
  mode?: 'step' | 'modal';
  onNext?: () => void;
  onBack?: () => void;
  onClose?: () => void;
}

export default function CoverEditor({ mode = 'modal', onNext, onBack, onClose }: Props) {
  const b = useBuilderContext();
  const { editScope, setEditScope, coverFront, coverBack, albumSize, albumPages, uploadedPhotos } = b;

  // Own the cover scope for the editor's lifetime; always restore 'interior' on
  // unmount so a stale cover scope can't corrupt the next interior edit.
  useEffect(() => {
    setEditScope('coverFront');
    return () => setEditScope('interior');
  }, [setEditScope]);

  const isFront = editScope !== 'coverBack';
  const page: AlbumPage = isFront ? coverFront : coverBack;

  const [tab, setTab] = useState<CoverTab>('background');
  const activeTab: CoverTab = tab;

  // Live preview panel size — kept modest so the inline controls fit below it.
  const [dims, setDims] = useState({ w: 200, h: 200 });
  useEffect(() => {
    const compute = () => {
      const c = getCanvasDimensions(albumSize);
      const aspect = c.width / Math.max(1, c.height);
      const availW = Math.min(window.innerWidth - 40, 440) - (SPINE_STRIP_W + 8);
      const maxH = 320;
      let w = availW;
      let h = w / aspect;
      if (h > maxH) { h = maxH; w = h * aspect; }
      setDims({ w: Math.round(Math.max(140, w)), h: Math.round(Math.max(140, h)) });
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [albumSize]);

  const wrapGeom = useMemo(() => coverWrapGeometry(albumSize, albumPages.length, DEFAULT_COVER), [albumSize, albumPages.length]);
  const spine = useMemo(() => deriveSpine(coverFront, wrapGeom), [coverFront, wrapGeom]);

  // The cover title lives in the template's first text box (box 0) — the same box
  // the spine reads. Keep a live content object so a font/colour change doesn't
  // drop the text.
  const titleEl = page.textElements?.find((t) => t.boxIndex === 0);
  const title = {
    text: titleEl?.text ?? '',
    fontFamily: titleEl?.fontFamily ?? FONTS[6].family,
    color: titleEl?.color ?? '#2D2D2D',
    bold: titleEl?.bold ?? true,
    italic: titleEl?.italic ?? false,
    underline: titleEl?.underline ?? false,
    alignment: (titleEl?.alignment ?? 'center') as 'left' | 'center' | 'right',
    fontSize: titleEl?.fontSize ?? 32,
  };
  const updateTitle = (patch: Partial<typeof title>) => b.setBoxText(0, { ...title, ...patch });

  // ── Cover photo crop: drag the preview to reposition, slider to zoom. A cover
  //    is one fixed-aspect panel, so a photo can't be ratio-matched to it — the
  //    user picks which part shows. Applies to covers only (coverMode). ──
  const bg = page.background as { type?: string; focusX?: number; focusY?: number; zoom?: number } | undefined;
  const bgIsImage = bg?.type === 'image';
  const bgFocusX = bg?.focusX ?? 0.5;
  const bgFocusY = bg?.focusY ?? 0.5;
  const bgZoom = bg?.zoom ?? 1;
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const panRef = useRef<{ x: number; y: number; fx: number; fy: number } | null>(null);

  const onPanStart = (e: React.PointerEvent) => {
    if (!bgIsImage) return;
    try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* capture is best-effort */ }
    panRef.current = { x: e.clientX, y: e.clientY, fx: bgFocusX, fy: bgFocusY };
  };
  const onPanMove = (e: React.PointerEvent) => {
    const d = panRef.current;
    if (!d) return;
    // Drag right → reveal more of the LEFT of the photo, so focus decreases.
    b.setBackgroundCrop({
      focusX: clamp01(d.fx - (e.clientX - d.x) / Math.max(1, dims.w)),
      focusY: clamp01(d.fy - (e.clientY - d.y) / Math.max(1, dims.h)),
    });
  };
  const onPanEnd = () => { panRef.current = null; };

  const toggle = (front: boolean) => setEditScope(front ? 'coverFront' : 'coverBack');

  const header = (
    <div className="flex items-center justify-between px-5 h-14 border-b border-[#EADFD3] shrink-0">
      <div>
        <h2 className="font-display text-lg font-semibold text-[#2D2D2D]">Design your cover</h2>
        <p className="text-[11px] text-[#9B8B7A] -mt-0.5">Style the front &amp; back — the spine follows your front title</p>
      </div>
      {mode === 'modal' && (
        <button onClick={onClose} className="p-2 rounded-full hover:bg-black/5 text-[#6B6B6B]"><X size={20} /></button>
      )}
    </div>
  );

  const faceToggle = (
    <div className="shrink-0 flex justify-center pt-3">
      <div className="inline-flex rounded-full bg-[#F1E7DA] p-1">
        {([['Front', true], ['Back', false]] as const).map(([label, front]) => (
          <button
            key={label}
            onClick={() => toggle(front)}
            className={`px-6 py-1.5 rounded-full text-sm font-semibold transition-colors ${isFront === front ? 'bg-white text-[#2D2D2D] shadow-sm' : 'text-[#9B8B7A]'}`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );

  // Live preview of the active cover face (display-only; you edit via the tabs).
  const preview = (
    <div className="shrink-0 flex items-start justify-center gap-2 pt-3">
      {isFront
        ? <SpineStrip height={dims.h} spine={spine} />
        : <div style={{ width: SPINE_STRIP_W }} aria-hidden />}
      <div
        className="bg-white shadow-lg relative overflow-hidden"
        style={{ width: dims.w, height: dims.h, cursor: bgIsImage ? 'move' : undefined, touchAction: bgIsImage ? 'none' : undefined }}
        onPointerDown={onPanStart}
        onPointerMove={onPanMove}
        onPointerUp={onPanEnd}
        onPointerCancel={onPanEnd}
      >
        <PageView page={page} photos={uploadedPhotos} singleW={dims.w} H={dims.h} pageIndex={0} coverMode />
      </div>
    </div>
  );

  const tabs: { key: CoverTab; label: string }[] = [
    { key: 'background', label: 'Background' },
    { key: 'text', label: 'Text' },
  ];

  // Compact, icon-free tabs — kept slim so the picture browser + upload box fit
  // on screen without scrolling.
  const tabBar = (
    <div className="shrink-0 grid grid-cols-2 gap-2.5 px-4 pt-3">
      {tabs.map((t) => {
        const open = activeTab === t.key;
        return (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`py-2 px-3 rounded-xl border-2 text-sm font-semibold transition-all active:scale-[0.98] ${
              open
                ? 'bg-[#F4C2A1] text-white border-[#F4C2A1] shadow'
                : 'bg-white text-[#2D2D2D] border-[#F4C2A1]/40 hover:border-[#F4C2A1] hover:bg-[#F4C2A1]/10'
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );

  const controls = (
    <div className="flex-1 overflow-auto min-h-0 px-4 pt-3 pb-4">
      {activeTab === 'background' && (
        <div className="space-y-3">
          {/* Crop controls — only meaningful once a photo is on the cover. */}
          {bgIsImage && (
            <div className="rounded-xl border border-[#E4D8C9] bg-white px-3 py-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-medium text-[#9B8B7A]">Zoom</span>
                <button
                  onClick={() => b.setBackgroundCrop({ focusX: 0.5, focusY: 0.5, zoom: 1 })}
                  className="text-[11px] font-medium text-[#C56B4E] hover:underline"
                >
                  Reset
                </button>
              </div>
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={bgZoom}
                onChange={(e) => b.setBackgroundCrop({ zoom: Number(e.target.value) })}
                className="w-full cursor-pointer accent-[#E8A598]"
              />
              <p className="text-[10px] text-[#B9A992] mt-1">Drag the cover above to reposition the photo.</p>
            </div>
          )}
          <BackgroundDesigner hidePreview compact imageOnly hideOpacity background={page.background} onChange={(bg) => b.setPageBackground(bg)} photos={uploadedPhotos} />
        </div>
      )}

      {activeTab === 'text' && (
        <div className="space-y-3">
          <label className="block">
            <span className="block text-[11px] font-medium text-[#9B8B7A] mb-1">{isFront ? 'Front cover title' : 'Back cover text'}</span>
            <input
              value={title.text}
              onChange={(e) => updateTitle({ text: e.target.value })}
              placeholder={isFront ? 'e.g. The Cruz Family' : 'A note, quote, or thank-you'}
              className="w-full px-3 py-2.5 rounded-xl border border-[#E4D8C9] bg-white text-[15px] text-[#2D2D2D] outline-none focus:border-[#E8A598]"
              style={{ fontFamily: title.fontFamily }}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-[11px] font-medium text-[#9B8B7A] mb-1">Font</span>
              <select
                value={title.fontFamily}
                onChange={(e) => updateTitle({ fontFamily: e.target.value })}
                style={{ fontFamily: title.fontFamily }}
                className="w-full px-3 py-2.5 rounded-xl border border-[#E4D8C9] bg-white text-[14px] outline-none focus:border-[#E8A598]"
              >
                {FONTS.map((f) => <option key={f.name} value={f.family} style={{ fontFamily: f.family }}>{f.name}</option>)}
              </select>
            </label>
            <div>
              <span className="block text-[11px] font-medium text-[#9B8B7A] mb-1">Colour</span>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => updateTitle({ color: c })}
                    className="w-7 h-7 rounded-full border transition-transform hover:scale-110"
                    style={{ background: c, borderColor: title.color === c ? '#E8A598' : 'rgba(0,0,0,0.15)', boxShadow: title.color === c ? '0 0 0 2px #E8A598' : 'none' }}
                    aria-label={c}
                  />
                ))}
              </div>
            </div>
          </div>
          <label className="block">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-medium text-[#9B8B7A]">Size</span>
              <span className="text-[11px] text-[#B9A992] tabular-nums">{title.fontSize}px</span>
            </div>
            <input
              type="range"
              min={16}
              max={96}
              step={1}
              value={title.fontSize}
              onChange={(e) => updateTitle({ fontSize: Number(e.target.value) })}
              className="w-full accent-[#E8A598] cursor-pointer"
            />
          </label>
        </div>
      )}

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

  if (mode === 'step') {
    // Centre the editor in a fixed-width column. Without this it spans the full
    // wizard centre-stage on desktop, which balloons the background swatches.
    return (
      <div className="h-full bg-[#FFF8F0] relative flex justify-center">
        <div className="w-full max-w-[560px] h-full flex flex-col">
          {header}
          {faceToggle}
          {preview}
          {tabBar}
          {controls}
          {footer}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-stretch sm:items-center justify-center sm:p-4">
      <div className="bg-[#FFF8F0] w-full sm:max-w-lg sm:rounded-2xl shadow-2xl flex flex-col max-h-full overflow-hidden relative">
        {header}
        {faceToggle}
        {preview}
        {tabBar}
        {controls}
        {footer}
      </div>
    </div>
  );
}

/** The spine shown beside the front cover — auto-derived from the front page
 *  (title + colour), read-only. Reads bottom→top like the printed spine. */
function SpineStrip({ height, spine }: { height: number; spine: { text: TextStyle; bg: string } }) {
  return (
    <div className="flex flex-col items-center shrink-0">
      <div
        className="shadow-sm"
        style={{ width: SPINE_STRIP_W, height, background: spine.bg, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
      >
        {spine.text.text.trim() && (
          <span
            style={{
              transform: 'rotate(-90deg)', whiteSpace: 'nowrap',
              fontSize: 12, lineHeight: 1, fontFamily: spine.text.fontFamily,
              color: spine.text.color, fontWeight: spine.text.bold ? 700 : 400,
              fontStyle: spine.text.italic ? 'italic' : 'normal',
            }}
          >
            {spine.text.text}
          </span>
        )}
      </div>
      <span className="text-[9px] uppercase tracking-wide text-[#B9A992] mt-1">Spine</span>
    </div>
  );
}
