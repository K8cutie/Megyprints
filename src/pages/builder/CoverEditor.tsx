/* ══════════════════════════════════════════════════════════════════════════
   CoverEditor — Step-3-style cover editor.

   Same format as the "Style Your Album" step: a live PREVIEW panel + inline
   category TABS (Background / Text) + controls right below — no tap-a-box,
   no bottom sheet, no separate modal. Only the FRONT cover is customer-editable:
   the spine auto-follows the front title, and the BACK is reserved for the
   Megy Prints mark (coverLayout.deriveBrandedBack) — no Back face here.

   • Background — reuses the Step-3 picker in photo-only mode. Setting an
     Image here IS how you put a photo on the cover.
   • Text — the cover title, typed inline (+ font / colour).
   ══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, AlignLeft, AlignCenter, AlignRight, Bold, Italic } from 'lucide-react';
import { useBuilderContext } from './BuilderContext';
import { PageView } from './BuilderPreview';
import BackgroundDesigner from './BackgroundDesigner';
import { getCanvasDimensions } from './layouts';
import { getTemplateById } from './pageTemplates';
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
  const { setEditScope, coverFront, albumSize, albumPages, uploadedPhotos } = b;

  // Own the cover scope for the editor's lifetime; always restore 'interior' on
  // unmount so a stale cover scope can't corrupt the next interior edit.
  useEffect(() => {
    setEditScope('coverFront');
    return () => setEditScope('interior');
  }, [setEditScope]);

  const page: AlbumPage = coverFront;

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
    offsetX: titleEl?.offsetX ?? 0,
    offsetY: titleEl?.offsetY ?? 0,
  };
  // setBoxText MERGES into the existing caption, so send only the patch (plus the
  // current text, which it needs — empty text clears the box). Spreading the whole
  // `title` snapshot here would make two edits fired before a re-render clobber
  // each other (last write wins), e.g. Bold then Italic in quick succession.
  const updateTitle = (patch: Partial<typeof title>) => b.setBoxText(0, { text: title.text, ...patch });

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

  // ── Movable cover text: a transparent handle over the title box. Dragging it
  //    nudges the caption (panel fractions, so print matches); the drag is stopped
  //    from bubbling so it doesn't also pan the photo underneath. ──
  const coverTmpl = page.templateId ? getTemplateById(page.templateId) : null;
  const titleSlot = coverTmpl?.textSlots?.[0];
  const tm = coverTmpl?.fullBleed
    ? { top: 0, bottom: 0, left: 0, right: 0 }
    : (coverTmpl?.margin ?? { top: 0.04, bottom: 0.04, left: 0.04, right: 0.04 });
  const titleRect = titleSlot
    ? {
        left: tm.left * dims.w + titleSlot.x * (dims.w * (1 - tm.left - tm.right)) + title.offsetX * dims.w,
        top: tm.top * dims.h + titleSlot.y * (dims.h * (1 - tm.top - tm.bottom)) + title.offsetY * dims.h,
        width: titleSlot.width * (dims.w * (1 - tm.left - tm.right)),
        height: titleSlot.height * (dims.h * (1 - tm.top - tm.bottom)),
      }
    : null;

  // Offset limits derived from the box's OWN base rect (all panel fractions), so
  // the box can be dragged to every edge of the cover but never off it. A fixed
  // ±0.5 clamp was wrong both ways: the title box starts at y≈0.62, so -0.5 could
  // never reach the top, while +0.5 would have pushed it off the bottom.
  const baseFx = tm.left + (titleSlot?.x ?? 0) * (1 - tm.left - tm.right);
  const baseFy = tm.top + (titleSlot?.y ?? 0) * (1 - tm.top - tm.bottom);
  const boxFw = (titleSlot?.width ?? 0) * (1 - tm.left - tm.right);
  const boxFh = (titleSlot?.height ?? 0) * (1 - tm.top - tm.bottom);
  const clampRange = (v: number, lo: number, hi: number) =>
    Math.max(Math.min(lo, hi), Math.min(Math.max(lo, hi), v)); // tolerate a box wider/taller than the panel
  const clampOx = (v: number) => clampRange(v, -baseFx, 1 - boxFw - baseFx);
  const clampOy = (v: number) => clampRange(v, -baseFy, 1 - boxFh - baseFy);

  const textDragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const onTextDragStart = (e: React.PointerEvent) => {
    e.stopPropagation();
    try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* best-effort */ }
    textDragRef.current = { x: e.clientX, y: e.clientY, ox: title.offsetX, oy: title.offsetY };
  };
  const onTextDragMove = (e: React.PointerEvent) => {
    const d = textDragRef.current;
    if (!d) return;
    e.stopPropagation();
    b.setBoxTextOffset(0,
      clampOx(d.ox + (e.clientX - d.x) / Math.max(1, dims.w)),
      clampOy(d.oy + (e.clientY - d.y) / Math.max(1, dims.h)),
    );
  };
  const onTextDragEnd = (e: React.PointerEvent) => { e.stopPropagation(); textDragRef.current = null; };

  const header = (
    <div className="flex items-center justify-between px-5 h-14 border-b border-[#EADFD3] shrink-0">
      <div>
        <h2 className="font-display text-lg font-semibold text-[#2D2D2D]">Design your cover</h2>
        <p className="text-[11px] text-[#9B8B7A] -mt-0.5">Style the front — the spine follows your title</p>
      </div>
      {mode === 'modal' && (
        <button onClick={onClose} className="p-2 rounded-full hover:bg-black/5 text-[#6B6B6B]"><X size={20} /></button>
      )}
    </div>
  );

  // Live preview of the front cover (display-only; you edit via the tabs).
  const preview = (
    <div className="shrink-0 flex items-start justify-center gap-2 pt-3">
      <SpineStrip height={dims.h} spine={spine} />
      <div
        className="bg-white shadow-lg relative overflow-hidden"
        style={{ width: dims.w, height: dims.h, cursor: bgIsImage ? 'move' : undefined, touchAction: bgIsImage ? 'none' : undefined }}
        onPointerDown={onPanStart}
        onPointerMove={onPanMove}
        onPointerUp={onPanEnd}
        onPointerCancel={onPanEnd}
      >
        <PageView page={page} photos={uploadedPhotos} singleW={dims.w} H={dims.h} pageIndex={0} coverMode />
        {/* Drag handle over the title — only once there's text to move. */}
        {title.text.trim() && titleRect && (
          <div
            onPointerDown={onTextDragStart}
            onPointerMove={onTextDragMove}
            onPointerUp={onTextDragEnd}
            onPointerCancel={onTextDragEnd}
            title="Drag to move the cover text"
            style={{
              position: 'absolute',
              left: titleRect.left, top: titleRect.top, width: titleRect.width, height: titleRect.height,
              zIndex: 10, cursor: 'move', touchAction: 'none',
              border: '1px dashed rgba(232,165,152,0.85)', borderRadius: 4,
              background: 'rgba(255,255,255,0.04)',
            }}
          />
        )}
      </div>
    </div>
  );

  // The back face isn't editable — say so once, right under the preview, so
  // nobody hunts for a Back toggle that no longer exists.
  const reservedNote = (
    <p className="shrink-0 text-center text-[10px] text-[#B9A992] pt-1.5 px-6">
      The back cover carries the Megy Prints mark in your cover colour.
    </p>
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
            <span className="block text-[11px] font-medium text-[#9B8B7A] mb-1">Cover title</span>
            <input
              value={title.text}
              onChange={(e) => updateTitle({ text: e.target.value })}
              placeholder="e.g. The Cruz Family"
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
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <span className="block text-[11px] font-medium text-[#9B8B7A] mb-1">Alignment</span>
              <div className="inline-flex rounded-xl border border-[#E4D8C9] bg-white overflow-hidden">
                {(['left', 'center', 'right'] as const).map((a) => {
                  const Icon = a === 'left' ? AlignLeft : a === 'center' ? AlignCenter : AlignRight;
                  return (
                    <button
                      key={a}
                      onClick={() => updateTitle({ alignment: a })}
                      title={`Align ${a}`}
                      className={`px-3 py-2 transition-colors ${title.alignment === a ? 'bg-[#F4C2A1] text-white' : 'text-[#8B7E7A] hover:bg-[#FBF3EA]'}`}
                    >
                      <Icon size={16} />
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <span className="block text-[11px] font-medium text-[#9B8B7A] mb-1">Style</span>
              <div className="inline-flex rounded-xl border border-[#E4D8C9] bg-white overflow-hidden">
                {/* Bold + italic only: canvas printing goes through drawWordArtText,
                    which has no underline, so an Underline control would preview
                    underlined and print plain. */}
                {([
                  { key: 'bold' as const, Icon: Bold, label: 'Bold', on: title.bold },
                  { key: 'italic' as const, Icon: Italic, label: 'Italic', on: title.italic },
                ]).map(({ key, Icon, label, on }) => (
                  <button
                    key={key}
                    onClick={() => updateTitle({ [key]: !on } as Partial<typeof title>)}
                    title={label}
                    className={`px-3 py-2 transition-colors ${on ? 'bg-[#F4C2A1] text-white' : 'text-[#8B7E7A] hover:bg-[#FBF3EA]'}`}
                  >
                    <Icon size={16} />
                  </button>
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
          {preview}
          {reservedNote}
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
        {preview}
        {reservedNote}
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
