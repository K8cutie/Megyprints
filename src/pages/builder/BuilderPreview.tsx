import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ShoppingCart, Download } from 'lucide-react';
import type { UploadedPhoto, AlbumPage, AlbumSizePreset } from './types';
import { CORNER_POSITIONS, cornerImageUrl } from './types';
import { dedupeSlotFills } from './slotUtils';
import { downloadAlbumPdf } from './generateAlbumPdf';
import { getCanvasDimensions } from './layouts';
import { getTemplateById } from './pageTemplates';
import { slotShapeStyle } from './slotShapeStyle';
import { PREVIEW_DIMS } from './PreviewSizeConstants';
import { bindingMarginFraction, bindingEdge, applyBindingMargin } from './binding';

/* ══════════════════════════════════════════════════════════════════════════
   BuilderPreview — Spread-only view with side arrows
   ══════════════════════════════════════════════════════════════════════════ */

interface BuilderPreviewProps {
  pages: AlbumPage[];
  currentIndex: number;
  photos: UploadedPhoto[];
  albumSize: AlbumSizePreset;
  getPageSnapshot: (pageId: string) => string | undefined;
  onGoToPage: (index: number) => void;
  onBack: () => void;
  onOrder: () => void;
}

function backgroundToCss(bg: any): React.CSSProperties {
  if (!bg) return {};
  switch (bg.type) {
    case 'solid': return { backgroundColor: bg.solid || '#FFFBF7' };
    case 'gradient': {
      const g = bg.gradient;
      if (!g) return { backgroundColor: '#FFFBF7' };
      // Handle both formats:
      // Sidebar: { colors: [{ color, position }], direction: 'radial' | 'to bottom' }
      // Wizard:  { type: 'linear', angle: 135, stops: [{ offset, color }] }
      if (g.stops) {
        // Wizard format — honor radial vs linear
        const stops = g.stops.map((s: any) => `${s.color} ${(s.offset ?? 0) * 100}%`).join(', ');
        return { background: g.type === 'radial' ? `radial-gradient(circle, ${stops})` : `linear-gradient(${g.angle ?? 135}deg, ${stops})` };
      }
      if (g.colors) {
        // Sidebar format
        const dir = g.direction === 'radial' ? 'circle' : g.direction || 'to bottom';
        const stops = g.colors.map((c: any) => `${c.color} ${c.position}%`).join(', ');
        return { background: g.direction === 'radial' ? `radial-gradient(${stops})` : `linear-gradient(${dir}, ${stops})` };
      }
      return { backgroundColor: '#FFFBF7' };
    }
    case 'image': {
      // BackgroundDesigner stores the value in `bg.image` (a blob URL for
      // uploads, or a CSS gradient string for the built-in presets).
      const img = bg.image ?? bg.customImage ?? bg.preset;
      if (!img) return { backgroundColor: '#FFFBF7' };
      return String(img).includes('gradient(')
        ? { background: img }
        : { backgroundImage: `url(${img})`, backgroundSize: 'cover', backgroundPosition: 'center' };
    }
    case 'pattern': {
      // pattern is a name string ('dots', etc.); SVG patterns aren't rendered
      // in the DOM preview yet — show a light tint so the page isn't blank.
      return { backgroundColor: '#F1EFEC' };
    }
    default: return { backgroundColor: '#FFFBF7' };
  }
}

/** Page renderer — always renders from LIVE page data so Preview matches the
 *  real pages. (Cached canvas snapshots were unreliable: only captured for
 *  pages the user had visited, saved via a delayed callback that could attach
 *  to the wrong page during navigation, and kept stale across regeneration —
 *  which made two different pages show the same image.) */
function PageView({ page, photos, singleW, H, pageIndex }: {
  page: AlbumPage; photos: UploadedPhoto[]; singleW: number; H: number; pageIndex: number;
}) {
  const sx = singleW / (getCanvasDimensions(page.size as any).width || singleW);
  const sy = H / (getCanvasDimensions(page.size as any).height || H);

  const template = page.templateId ? getTemplateById(page.templateId) : null;
  const baseMargin = template?.margin ?? { top: 0.04, bottom: 0.04, left: 0.04, right: 0.04 };
  // Reserve the binding keep-out on the inner edge so slots match the editor.
  const margin = applyBindingMargin(baseMargin, page.size, pageIndex);
  const safeX = margin.left * singleW;
  const safeY = margin.top * H;
  const safeW = singleW * (1 - margin.left - margin.right);
  const safeH = H * (1 - margin.top - margin.bottom);

  return (
    <>
      <div className="absolute inset-0" style={{ ...backgroundToCss(page.background), opacity: ((page.background as any)?.opacity ?? 100) / 100 }} />
      {template && dedupeSlotFills(page.slotFills).map((photoIdx, idx) => {
        if (photoIdx == null) return null;
        const uploaded = photos[photoIdx];
        if (!uploaded) return null;
        const slot = template.slots[idx];
        const { style: shapeStyle, width, height, leftOffset, topOffset } =
          slotShapeStyle(slot, slot.width * safeW, slot.height * safeH);
        const left = safeX + slot.x * safeW + leftOffset;
        const top = safeY + slot.y * safeH + topOffset;
        const slotScale = page.slotScales?.[idx] ?? 1;
        const slotOffsetX = page.slotOffsetsX?.[idx] ?? 0;
        const slotOffsetY = page.slotOffsetsY?.[idx] ?? 0;
        const imgW = width * slotScale;
        const imgH = height * slotScale;
        const imgLeft = (width - imgW) / 2 + slotOffsetX * sx;
        const imgTop = (height - imgH) / 2 + slotOffsetY * sy;
        // Theme-baked frame overrides the per-slot template border when present.
        const frameWidth = page.photoBorderWidth ?? slot.borderWidth;
        const frameColor = page.photoBorderColor ?? slot.borderColor ?? '#FFFFFF';

        return (
          <div key={`slot-${idx}`} className="absolute" style={{
            zIndex: 1, left, top, width, height,
            transform: slot.rotation ? `rotate(${slot.rotation}deg)` : undefined,
            transformOrigin: 'center center',
            border: frameWidth ? `${frameWidth}px solid ${frameColor}` : undefined,
            boxSizing: 'border-box', overflow: 'hidden', ...shapeStyle,
          }}>
            <img src={uploaded.previewUrl} alt="" draggable={false}
              className="absolute object-cover"
              style={{ left: imgLeft, top: imgTop, width: imgW, height: imgH }} />
          </div>
        );
      })}
      {page.textElements?.map((t, i) => (
        <div key={`txt-${i}`} className="absolute pointer-events-none" style={{
          zIndex: 2, left: t.x * sx, top: t.y * sy,
          width: (t.width || t.text.length * (t.fontSize || 24) * 0.6) * sx,
          transform: `rotate(${t.rotation || 0}deg) scale(${t.scaleX ?? 1}, ${t.scaleY ?? 1})`,
          transformOrigin: 'top left', fontFamily: t.fontFamily || 'serif',
          fontSize: (t.fontSize || 24) * sx, fontWeight: t.bold ? 'bold' : 'normal',
          fontStyle: t.italic ? 'italic' : 'normal', color: t.color || '#2D2D2D',
          display: 'flex', alignItems: 'center', justifyContent: t.alignment || 'center',
          textAlign: (t.alignment || 'center') as any, opacity: (t.opacity ?? 100) / 100,
        }}>{t.text}</div>
      ))}
      {/* Theme decorative corners — one set, all four corners, on top of photos */}
      {page.cornerBase && CORNER_POSITIONS.map((pos) => {
        const size = Math.min(singleW, H) * 0.25;
        const isTop = pos === 'tl' || pos === 'tr';
        const isLeft = pos === 'tl' || pos === 'bl';
        return (
          <img key={`corner-${pos}`} src={cornerImageUrl(page.cornerBase!, pos)} alt="" draggable={false}
            className="absolute pointer-events-none" style={{
              zIndex: 4, width: size, height: size, objectFit: 'contain',
              top: isTop ? 0 : undefined, bottom: isTop ? undefined : 0,
              left: isLeft ? 0 : undefined, right: isLeft ? undefined : 0,
            }} />
        );
      })}
      {/* Binding (gutter) keep-out guide — 0.5" reserve on the inner edge */}
      {(() => {
        const frac = bindingMarginFraction(page.size);
        const onLeft = bindingEdge(pageIndex) === 'left';
        return (
          <div className="absolute top-0 bottom-0 pointer-events-none" style={{
            zIndex: 3,
            left: onLeft ? 0 : singleW * (1 - frac),
            width: singleW * frac,
            background: 'rgba(232,165,152,0.10)',
            borderRight: onLeft ? '1.5px dashed #E8A598' : undefined,
            borderLeft: onLeft ? undefined : '1.5px dashed #E8A598',
          }} />
        );
      })()}
    </>
  );
}

export default function BuilderPreview({ pages, currentIndex, photos, albumSize, onGoToPage, onBack, onOrder }: BuilderPreviewProps) {
  const total = pages.length;

  // Compile the album into a single print-ready PDF and download it.
  const [pdfBusy, setPdfBusy] = useState(false);
  const handleDownloadPdf = async () => {
    setPdfBusy(true);
    try {
      await downloadAlbumPdf(pages, photos, albumSize, 'megyprints-album.pdf');
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('Sorry — could not generate the PDF. Please try again.');
    } finally {
      setPdfBusy(false);
    }
  };

  // Spread pairs: 0-1, 2-3, 4-5, etc.
  const spreadLeftIndex = Math.floor(currentIndex / 2) * 2;
  const spreadLeftPage = pages[spreadLeftIndex];
  const spreadRightPage = pages[spreadLeftIndex + 1];

  // Responsive sizing: the spread (two pages side by side) scales DOWN to fit the
  // available stage, so it shrinks with the window instead of overflowing or
  // hiding behind the Megy panel. Capped at 1x (never bigger than the design size).
  const base = PREVIEW_DIMS[albumSize] || { w: 500, h: 625 };
  const stageRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(1);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const compute = () => {
      // The builder root already reserves the Megy panel's width, so the stage
      // measures only the space available beside it.
      const chromeW = 2 * 56 + 48 + 48;            // nav arrows + gaps + horizontal padding
      const chromeH = 48 + 34;                     // vertical padding + page-number labels
      const availW = el.clientWidth - chromeW;
      const availH = el.clientHeight - chromeH;
      const fit = Math.min(availW / (base.w * 2), availH / base.h);
      setFitScale(Math.max(0.15, Math.min(1, fit)));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    window.addEventListener('resize', compute);
    return () => { ro.disconnect(); window.removeEventListener('resize', compute); };
  }, [base.w, base.h]);
  const singleW = Math.round(base.w * fitScale);
  const H = Math.round(base.h * fitScale);

  // Navigate by 2 pages (one spread) at a time
  const navPrev = () => onGoToPage(Math.max(0, currentIndex - 2));
  const navNext = () => onGoToPage(Math.min(total - 1, currentIndex + 2));

  const hasPrev = spreadLeftIndex > 0;
  const hasNext = spreadLeftIndex + 2 < total;

  // Forced order CTA — auto-shows once they reach the last spread of the preview.
  const [showOrderCta, setShowOrderCta] = useState(false);
  useEffect(() => {
    if (!hasNext && total > 0) setShowOrderCta(true);
  }, [hasNext, total]);

  return (
    <div className="flex flex-col h-full bg-[#F5F5F5] relative">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-[#E8E4E0] bg-white">
        <span className="text-xs text-[#6B6B6B] font-medium tabular-nums">
          {spreadLeftIndex + 1}-{Math.min(spreadLeftIndex + 2, total)} / {total}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadPdf}
            disabled={pdfBusy}
            className="px-4 py-2 bg-white border border-[#E8A598] text-[#C98A5E] text-xs font-semibold rounded-lg hover:bg-[#FFF5F0] flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-wait"
          >
            <Download size={14} /> {pdfBusy ? 'Preparing…' : 'Print PDF'}
          </button>
          <button
            onClick={onOrder}
            className="px-4 py-2 bg-[#E8A598] text-white text-xs font-semibold rounded-lg hover:brightness-105 flex items-center gap-1.5"
          >
            <ShoppingCart size={14} /> Order
          </button>
        </div>
      </div>

      {/* Page display with side arrows */}
      <div ref={stageRef} className="flex-1 flex items-center justify-center p-6 overflow-auto">
        <div className="flex items-center gap-6">
          {/* Prev Arrow — left side */}
          <button
            onClick={navPrev}
            disabled={!hasPrev}
            className="flex items-center justify-center rounded-full hover:bg-[#E8A598]/15 disabled:opacity-20 disabled:hover:bg-transparent transition-colors"
            style={{ width: 56, height: 56 }}
          >
            <ChevronLeft size={40} className="text-[#E8A598]" />
          </button>

          {/* Pages */}
          <div className="flex flex-col items-center gap-2">
            {/* Page number labels */}
            <div className="flex items-center" style={{ width: singleW * 2 }}>
              <span className="text-xs font-medium text-[#6B6B6B]" style={{ width: singleW, textAlign: 'center' }}>
                Page {spreadLeftIndex + 1}
              </span>
              {spreadRightPage && (
                <span className="text-xs font-medium text-[#6B6B6B]" style={{ width: singleW, textAlign: 'center' }}>
                  Page {spreadLeftIndex + 2}
                </span>
              )}
            </div>

            {/* Spread container */}
            <div
              className="relative bg-white shadow-xl"
              style={{
                width: singleW * 2,
                height: H,
                boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
              }}
            >
              {/* Left Page */}
              <div className="absolute overflow-hidden" style={{ left: 0, top: 0, width: singleW, height: H }}>
                <PageView key={spreadLeftPage?.id} page={spreadLeftPage} photos={photos} singleW={singleW} H={H} pageIndex={spreadLeftIndex} />
              </div>

              {/* Right Page — flush against the left page (no center gap/spine;
                  the dashed binding guides already mark the gutter). */}
              {spreadRightPage && (
                <div className="absolute overflow-hidden" style={{ left: singleW, top: 0, width: singleW, height: H }}>
                  <PageView key={spreadRightPage?.id} page={spreadRightPage} photos={photos} singleW={singleW} H={H} pageIndex={spreadLeftIndex + 1} />
                </div>
              )}
            </div>
          </div>

          {/* Next Arrow — right side */}
          <button
            onClick={navNext}
            disabled={!hasNext}
            className="flex items-center justify-center rounded-full hover:bg-[#E8A598]/15 disabled:opacity-20 disabled:hover:bg-transparent transition-colors"
            style={{ width: 56, height: 56 }}
          >
            <ChevronRight size={40} className="text-[#E8A598]" />
          </button>
        </div>
      </div>

      {/* Forced order CTA — auto-shows on the last spread; no dismiss (must choose). */}
      {showOrderCta && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-6">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-7 text-center">
            <div className="text-4xl mb-2">📦</div>
            <h3 className="font-display text-2xl font-semibold text-[#2D2D2D] mb-1">You've reached the end</h3>
            <p className="text-sm text-[#6B6B6B] mb-6">Your album looks beautiful. Make it real.</p>
            <button
              onClick={onOrder}
              className="w-full py-4 bg-[#E8A598] text-white text-lg font-bold tracking-wide rounded-xl hover:brightness-105 active:scale-[0.98] transition-all shadow-md"
            >
              ORDER ALBUM
            </button>
            <button
              onClick={onBack}
              className="mt-4 text-xs text-[#9B9B9B] hover:text-[#6B6B6B] transition-colors"
            >
              …or do you want to change anything?
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
