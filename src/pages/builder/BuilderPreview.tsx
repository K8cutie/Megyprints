import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Download, ShoppingCart, Edit3 } from 'lucide-react';
import type { AlbumPage, UploadedPhoto } from './types';

interface BuilderPreviewProps {
  pages: AlbumPage[];
  currentIndex: number;
  photos: UploadedPhoto[];
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
  if (f.opacity < 100) parts.push(`opacity(${f.opacity}%)`);
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

export default function BuilderPreview({ pages, currentIndex, photos, onGoToPage, onBack, onOrder }: BuilderPreviewProps) {
  const [spreadView, setSpreadView] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  const page = pages[currentIndex];

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

  const W = 500;
  const H = 625;

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
            style={{ width: W, height: H, perspective: 1000, ...bgToStyle(page.background) }}
            ref={canvasRef}
          >
            {/* Render photos */}
            {page.photos.map((photo) => {
              const uploaded = photos[photo.photoIndex];
              if (!uploaded) return null;
              return (
                <div
                  key={photo.id}
                  className="absolute overflow-hidden"
                  style={{
                    left: photo.x,
                    top: photo.y,
                    width: photo.width * photo.scaleX,
                    height: photo.height * photo.scaleY,
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

            {/* Render text */}
            {page.textElements.map((text) => (
              <div
                key={text.id}
                className="absolute whitespace-nowrap"
                style={{
                  left: text.x,
                  top: text.y,
                  fontSize: text.fontSize,
                  fontFamily: text.fontFamily,
                  color: text.color,
                  fontWeight: text.bold ? 'bold' : 'normal',
                  fontStyle: text.italic ? 'italic' : 'normal',
                  textDecoration: text.underline ? 'underline' : 'none',
                  textAlign: text.alignment,
                  transform: `rotate(${text.rotation}deg)`,
                  opacity: text.opacity / 100,
                }}
              >
                {text.text}
              </div>
            ))}
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
            {p.photos.length === 0 && (
              <span className="text-[6px] text-[#C4C4C4] flex items-center justify-center h-full">Empty</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
