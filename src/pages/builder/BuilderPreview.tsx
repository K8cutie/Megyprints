import { ChevronLeft, ChevronRight, ShoppingCart } from 'lucide-react';
import type { UploadedPhoto, AlbumPage, AlbumSizePreset } from './types';
import { getCanvasDimensions } from './layouts';
import { getTemplateById } from './pageTemplates';
import { slotShapeStyle } from './slotShapeStyle';
import { PREVIEW_DIMS } from './PreviewSizeConstants';

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
      const dir = g.direction === 'radial' ? 'circle' : g.direction || 'to bottom';
      const stops = g.colors.map((c: any) => `${c.color} ${c.position}%`).join(', ');
      return { background: g.direction === 'radial' ? `radial-gradient(${stops})` : `linear-gradient(${dir}, ${stops})` };
    }
    case 'image': {
      if (bg.customImage) return { backgroundImage: `url(${bg.customImage})`, backgroundSize: 'cover', backgroundPosition: 'center' };
      const preset = bg.preset;
      if (preset?.includes('url')) return { backgroundImage: preset, backgroundSize: 'cover', backgroundPosition: 'center' };
      return { backgroundImage: preset, backgroundSize: 'cover' };
    }
    case 'pattern': {
      const p = bg.pattern;
      if (!p) return { backgroundColor: '#FFFBF7' };
      return { backgroundImage: p.svg, backgroundSize: `${p.size || 20}px ${p.size || 20}px`, backgroundColor: p.color || '#FFFBF7' };
    }
    default: return { backgroundColor: '#FFFBF7' };
  }
}

/** Page renderer — snapshot when available, else DOM fallback */
function PageView({ page, photos, singleW, H, getPageSnapshot }: {
  page: AlbumPage; photos: UploadedPhoto[]; singleW: number; H: number;
  getPageSnapshot: (pageId: string) => string | undefined;
}) {
  const snapshot = getPageSnapshot?.(page.id);
  const sx = singleW / (getCanvasDimensions(page.size as any).width || singleW);
  const sy = H / (getCanvasDimensions(page.size as any).height || H);

  if (snapshot) {
    return (
      <img src={snapshot} alt="" className="absolute inset-0 w-full h-full object-contain" />
    );
  }

  const template = page.templateId ? getTemplateById(page.templateId) : null;
  const margin = template?.margin ?? { top: 0.04, bottom: 0.04, left: 0.04, right: 0.04 };
  const safeX = margin.left * singleW;
  const safeY = margin.top * H;
  const safeW = singleW * (1 - margin.left - margin.right);
  const safeH = H * (1 - margin.top - margin.bottom);

  return (
    <>
      <div className="absolute inset-0" style={backgroundToCss(page.background)} />
      {template && page.slotFills?.map((photoIdx, idx) => {
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

        return (
          <div key={`slot-${idx}`} className="absolute" style={{
            zIndex: 1, left, top, width, height,
            transform: slot.rotation ? `rotate(${slot.rotation}deg)` : undefined,
            transformOrigin: 'center center',
            border: slot.borderWidth ? `${slot.borderWidth}px solid ${slot.borderColor || '#FFFFFF'}` : undefined,
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
    </>
  );
}

export default function BuilderPreview({ pages, currentIndex, photos, albumSize, getPageSnapshot, onGoToPage, onBack: _onBack, onOrder }: BuilderPreviewProps) {
  const total = pages.length;

  // Spread pairs: 0-1, 2-3, 4-5, etc.
  const spreadLeftIndex = Math.floor(currentIndex / 2) * 2;
  const spreadLeftPage = pages[spreadLeftIndex];
  const spreadRightPage = pages[spreadLeftIndex + 1];

  const { w: singleW, h: H } = PREVIEW_DIMS[albumSize] || { w: 500, h: 625 };

  // Navigate by 2 pages (one spread) at a time
  const navPrev = () => onGoToPage(Math.max(0, currentIndex - 2));
  const navNext = () => onGoToPage(Math.min(total - 1, currentIndex + 2));

  const hasPrev = spreadLeftIndex > 0;
  const hasNext = spreadLeftIndex + 2 < total;

  return (
    <div className="flex flex-col h-full bg-[#F5F5F5]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-[#E8E4E0] bg-white">
        <span className="text-xs text-[#6B6B6B] font-medium tabular-nums">
          {spreadLeftIndex + 1}-{Math.min(spreadLeftIndex + 2, total)} / {total}
        </span>
        <button
          onClick={onOrder}
          className="px-4 py-2 bg-[#E8A598] text-white text-xs font-semibold rounded-lg hover:brightness-105 flex items-center gap-1.5"
        >
          <ShoppingCart size={14} /> Order
        </button>
      </div>

      {/* Page display with side arrows */}
      <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
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
            <div className="flex items-center gap-5" style={{ width: singleW * 2 + 20 }}>
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
                width: singleW * 2 + 20,
                height: H,
                boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
              }}
            >
              {/* Left Page */}
              <div className="absolute overflow-hidden" style={{ left: 0, top: 0, width: singleW, height: H }}>
                <PageView key={spreadLeftPage?.id} page={spreadLeftPage} photos={photos} singleW={singleW} H={H} getPageSnapshot={getPageSnapshot} />
              </div>

              {/* Spine */}
              {spreadRightPage && (
                <div className="absolute top-0 bottom-0 w-[2px] z-20"
                  style={{ left: singleW, background: 'linear-gradient(180deg, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.15) 50%, rgba(0,0,0,0.08) 100%)' }} />
              )}

              {/* Right Page */}
              {spreadRightPage && (
                <div className="absolute overflow-hidden" style={{ left: singleW + 20, top: 0, width: singleW, height: H }}>
                  <PageView key={spreadRightPage?.id} page={spreadRightPage} photos={photos} singleW={singleW} H={H} getPageSnapshot={getPageSnapshot} />
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
    </div>
  );
}
