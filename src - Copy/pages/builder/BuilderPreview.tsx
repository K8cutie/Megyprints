import { useState, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Download, ShoppingCart, Edit3 } from 'lucide-react';
import type { AlbumPage, UploadedPhoto, AlbumSizePreset, TemplateSlot } from './types';
import { getCanvasDimensions } from './layouts';
import { getTemplateById } from './pageTemplates';

interface BuilderPreviewProps {
  pages: AlbumPage[];
  currentIndex: number;
  photos: UploadedPhoto[];
  /** Album size preset — drives preview dimensions */
  albumSize: AlbumSizePreset;
  onGoToPage: (i: number) => void;
  onBack: () => void;
  onOrder: () => void;
}

function filtersToCSS(f: { grayscale: number; sepia: number; brightness: number; contrast: number; saturate: number; blur: number; hueRotate: number; opacity: number }) {
  const parts: string[] = [];
  if (f.grayscale > 0) parts.push(`grayscale(${f.grayscale}%)`);
  if (f.sepia > 0) parts.push(`sepia(${f.sepia}%)`);
  if (f.brightness !== 100) parts.push(`brightness(${f.brightness}%)`);
  if (f.contrast !== 100) parts.push(`contrast(${f.contrast}%)`);
  if (f.saturate !== 100) parts.push(`saturate(${f.saturate}%)`);
  if (f.blur > 0) parts.push(`blur(${f.blur}px)`);
  if (f.hueRotate > 0) parts.push(`hue-rotate(${f.hueRotate}deg)`);
  if (f.opacity < 100) parts.push(`opacity(${f.opacity / 100})`);
  return parts.join(' ') || 'none';
}

function bgToStyle(bg: AlbumPage['background']): React.CSSProperties {
  if (bg.type === 'solid' && bg.solid) return { backgroundColor: bg.solid };
  if (bg.type === 'gradient' && bg.gradient) {
    const { type, angle, stops } = bg.gradient;
    const gradient = type === 'linear'
      ? `linear-gradient(${angle}deg, ${stops.map((s) => `${s.color} ${s.offset * 100}%`).join(', ')})`
      : `radial-gradient(circle, ${stops.map((s) => `${s.color} ${s.offset * 100}%`).join(', ')})`;
    return { background: gradient };
  }
  if (bg.type === 'image' && bg.image) return { backgroundImage: `url(${bg.image})`, backgroundSize: 'cover' };
  return { backgroundColor: '#FFFBF7' };
}

/** Preview dimensions keyed by album size preset */
const PREVIEW_DIMS: Record<string, { w: number; h: number }> = {
  '6x6': { w: 420, h: 420 },
  '8x8': { w: 440, h: 440 },
  '10x10': { w: 480, h: 480 },
  '12x12': { w: 500, h: 500 },
  'a5': { w: 340, h: 480 },
  '8x10': { w: 400, h: 500 },
  '8x11': { w: 360, h: 460 },
  'a4': { w: 380, h: 536 },
  '11x14': { w: 400, h: 510 },
  '10x8': { w: 500, h: 400 },
  '11x8': { w: 460, h: 360 },
  'a4l': { w: 536, h: 380 },
  '14x11': { w: 510, h: 400 },
  'custom': { w: 400, h: 500 },
};

/** Compute CSS shape + sizing for a slot in the preview.
 *  Key fix: circle uses the *smaller* dimension as diameter so it stays
 *  a perfect circle, and is centred inside the slot bounds.  */
function slotShapeStyle(
  slot: TemplateSlot,
  rawWidth: number,
  rawHeight: number,
): {
  style: React.CSSProperties;
  width: number;
  height: number;
  leftOffset: number;
  topOffset: number;
} {
  const shape = slot.shape || 'rectangle';

  // Circle: make it a perfect square using the smaller dimension
  if (shape === 'circle') {
    const diameter = Math.min(rawWidth, rawHeight);
    return {
      style: { borderRadius: '50%', overflow: 'hidden' },
      width: diameter,
      height: diameter,
      leftOffset: (rawWidth - diameter) / 2,
      topOffset: (rawHeight - diameter) / 2,
    };
  }

  // Oval: ellipse (keep raw proportions, borderRadius 50% gives ellipse)
  if (shape === 'oval') {
    return {
      style: { borderRadius: '50%', overflow: 'hidden' },
      width: rawWidth,
      height: rawHeight,
      leftOffset: 0,
      topOffset: 0,
    };
  }

  // Rounded rectangle
  if (shape === 'rounded') {
    return {
      style: {
        borderRadius: slot.borderRadius ? `${slot.borderRadius}px` : '6px',
        overflow: 'hidden',
      },
      width: rawWidth,
      height: rawHeight,
      leftOffset: 0,
      topOffset: 0,
    };
  }

  // Heart
  if (shape === 'heart') {
    const size = Math.min(rawWidth, rawHeight);
    return {
      style: {
        clipPath:
          'path("M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z")',
        overflow: 'hidden',
      },
      width: size,
      height: size,
      leftOffset: (rawWidth - size) / 2,
      topOffset: (rawHeight - size) / 2,
    };
  }

  // Plain rectangle
  return {
    style: { overflow: 'hidden' },
    width: rawWidth,
    height: rawHeight,
    leftOffset: 0,
    topOffset: 0,
  };
}

interface SlotPhotoInfo {
  slotIndex: number;
  slot: TemplateSlot;
  photoIndex: number;
  photo: UploadedPhoto;
}

export default function BuilderPreview({ pages, currentIndex, photos, albumSize, onGoToPage, onBack, onOrder }: BuilderPreviewProps) {
  const [spreadView, setSpreadView] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  const page = pages[currentIndex];
  const { w: singleW, h: H } = PREVIEW_DIMS[albumSize] || { w: 500, h: 625 };

  // Export as image
  const handleExport = async () => {
    if (!canvasRef.current) return;
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(canvasRef.current, { scale: 2, backgroundColor: null });
    const link = document.createElement('a');
    link.download = `megy-prints-page-${currentIndex + 1}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  // Scale factor: preview pixels per canvas pixel
  const canvasDims = getCanvasDimensions(albumSize);
  const sx = singleW / canvasDims.width;
  const sy = H / canvasDims.height;

  // ─── Resolve slot-based photos ───
  const slotPhotos: SlotPhotoInfo[] = useMemo(() => {
    const result: SlotPhotoInfo[] = [];
    if (!page.templateId || !page.slotFills) return result;

    const template = getTemplateById(page.templateId);
    if (!template) return result;

    template.slots.forEach((rawSlot, slotIndex) => {
      const geom = page.slotGeometries?.[slotIndex] ?? {};
      const slot = { ...rawSlot, ...geom };
      const photoIndex = page.slotFills?.[slotIndex];
      if (photoIndex == null) return;
      const uploaded = photos[photoIndex];
      if (!uploaded) return;
      result.push({ slotIndex, slot, photoIndex, photo: uploaded });
    });

    return result;
  }, [page.templateId, page.slotFills, photos]);

  return (
    <div className="flex flex-col h-full bg-[#F5F5F5]">
      {/* Header */}
      <div className="h-14 bg-white border-b border-[#E8E8E8] flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-lg hover:bg-[#F0F0F0] text-[#6B6B6B]">
            <Edit3 size={16} />
          </button>
          <span className="text-sm font-medium text-[#2D2D2D]">
            Page {currentIndex + 1} of {pages.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setSpreadView(!spreadView)} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[#E8E8E8] hover:bg-[#F0F0F0] text-[#6B6B6B]">
            {spreadView ? 'Single' : 'Spread'}
          </button>
          <button onClick={handleExport} className="p-2 rounded-lg hover:bg-[#F0F0F0] text-[#6B6B6B]" title="Export page">
            <Download size={16} />
          </button>
          <button onClick={onOrder} className="px-4 py-2 bg-[#F4C2A1] text-white text-xs font-semibold rounded-lg hover:brightness-105 flex items-center gap-1.5">
            <ShoppingCart size={14} /> Order Now
          </button>
        </div>
      </div>

      {/* Preview Canvas */}
      <div className="flex-1 flex items-center justify-center overflow-auto p-8">
        <div className="flex items-center gap-4">
          <button
            onClick={() => onGoToPage(Math.max(0, currentIndex - 1))}
            disabled={currentIndex === 0}
            className="p-2 rounded-full bg-white shadow-md hover:shadow-lg disabled:opacity-30 transition-all"
          >
            <ChevronLeft size={20} className="text-[#2D2D2D]" />
          </button>

          <motion.div
            key={page.id}
            initial={{ opacity: 0, rotateY: spreadView ? -15 : 0 }}
            animate={{ opacity: 1, rotateY: 0 }}
            transition={{ duration: 0.3 }}
            className="relative shadow-2xl rounded-sm overflow-hidden"
            style={{ width: singleW, height: H, perspective: 1000, ...bgToStyle(page.background) }}
            ref={canvasRef}
          >
            {/* ─── SLOT-BASED PHOTOS ─── */}
            {slotPhotos.map(({ slot, photo }) => {
              // Slot coordinates are percentages (0-100) of the page
              const rawLeft = (slot.x / 100) * singleW;
              const rawTop = (slot.y / 100) * H;
              const rawWidth = (slot.width / 100) * singleW;
              const rawHeight = (slot.height / 100) * H;
              const rotation = slot.rotation || 0;

              // Compute shape-corrected sizing (circle → square, etc.)
              const { style: shapeStyle, width, height, leftOffset, topOffset } =
                slotShapeStyle(slot, rawWidth, rawHeight);

              return (
                <div
                  key={`slot-${slot.id}`}
                  className="absolute"
                  style={{
                    left: rawLeft + leftOffset,
                    top: rawTop + topOffset,
                    width,
                    height,
                    transform: rotation !== 0 ? `rotate(${rotation}deg)` : undefined,
                    transformOrigin: 'center center',
                    border: slot.borderWidth
                      ? `${slot.borderWidth}px solid ${slot.borderColor || '#FFFFFF'}`
                      : undefined,
                    boxSizing: 'border-box',
                    ...shapeStyle,
                  }}
                >
                  <img
                    src={photo.previewUrl}
                    alt=""
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                </div>
              );
            })}

            {/* ─── FREEFORM PHOTOS ─── */}
            {page.photos.map((photo) => {
              const uploaded = photos[photo.photoIndex];
              if (!uploaded) return null;
              return (
                <div
                  key={photo.id}
                  className="absolute overflow-hidden"
                  style={{
                    left: photo.x * sx,
                    top: photo.y * sy,
                    width: photo.width * photo.scaleX * sx,
                    height: photo.height * photo.scaleY * sy,
                    transform: `rotate(${photo.rotation}deg)`,
                    borderWidth: photo.borderWidth,
                    borderColor: photo.borderColor,
                    borderStyle: 'solid',
                    borderRadius: photo.borderRadius,
                    boxShadow: photo.shadowBlur > 0 ? `${photo.shadowOffsetX}px ${photo.shadowOffsetY}px ${photo.shadowBlur}px ${photo.shadowColor}` : 'none',
                    filter: filtersToCSS(photo.filters),
                  }}
                >
                  <img
                    src={uploaded.previewUrl}
                    alt=""
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                </div>
              );
            })}

            {/* ─── TEXT ELEMENTS ─── */}
            {page.textElements.map((text) => {
              const scaleX = text.scaleX ?? 1;
              const scaleY = text.scaleY ?? 1;
              const width = text.width && text.width > 0 ? text.width * sx : undefined;

              return (
                <div
                  key={text.id}
                  className="absolute"
                  style={{
                    left: text.x * sx,
                    top: text.y * sy,
                    fontSize: text.fontSize * sx,
                    fontFamily: text.fontFamily,
                    color: text.color,
                    fontWeight: text.bold ? 'bold' : 'normal',
                    fontStyle: text.italic ? 'italic' : 'normal',
                    textDecoration: text.underline ? 'underline' : 'none',
                    textAlign: text.alignment,
                    transform: `rotate(${text.rotation}deg) scaleX(${scaleX}) scaleY(${scaleY})`,
                    transformOrigin: 'left top',
                    opacity: text.opacity / 100,
                    pointerEvents: 'none',
                    overflow: 'visible',
                    width,
                  }}
                >
                  {text.text}
                </div>
              );
            })}
          </motion.div>

          <button
            onClick={() => onGoToPage(Math.min(pages.length - 1, currentIndex + 1))}
            disabled={currentIndex === pages.length - 1}
            className="p-2 rounded-full bg-white shadow-md hover:shadow-lg disabled:opacity-30 transition-all"
          >
            <ChevronRight size={20} className="text-[#2D2D2D]" />
          </button>
        </div>
      </div>

      {/* Page thumbnails */}
      <div className="h-20 bg-white border-t border-[#E8E8E8] flex items-center gap-2 px-4 overflow-x-auto">
        {pages.map((p, i) => (
          <button
            key={p.id}
            onClick={() => onGoToPage(i)}
            className="flex-shrink-0 w-12 h-14 rounded-md overflow-hidden border transition-all"
            style={{
              borderColor: i === currentIndex ? '#F4C2A1' : '#E8E8E8',
              borderWidth: i === currentIndex ? '2px' : '1px',
              ...bgToStyle(p.background),
            }}
          >
            {p.photos.length === 0 && !p.slotFills?.some((sf) => sf != null) && (
              <span className="text-[6px] text-[#C4C4C4] flex items-center justify-center h-full">Empty</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
