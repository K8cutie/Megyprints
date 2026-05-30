import { useState, useRef, useMemo, useEffect } from 'react';

/* ─── Types ─── */
import type { UploadedPhoto, AlbumPage, AlbumBackground } from './types';

/* ─── Helpers ─── */
import { PREVIEW_DIMS } from './PreviewSizeConstants';
import { slotShapeStyle } from './slotShapeStyle';
import { getTemplateById } from './pageTemplates';
import { getCanvasDimensions } from './layouts';
import BuilderToolbar from './BuilderToolbar';

/* ─── Interfaces ─── */
interface BuilderPreviewProps {
  pages: AlbumPage[];
  currentIndex: number;
  photos: UploadedPhoto[];
  albumSize: string;
  onGoToPage: (index: number) => void;
  onBack: () => void;
  onOrder: () => void;
  getPageSnapshot?: (pageId: string) => string | undefined;
}

interface SlotPhotoInfo {
  slotIndex: number;
  slot: any;
  photoIndex: number;
  photo: UploadedPhoto;
}

interface ImgDim { w: number; h: number }

export default function BuilderPreview({
  pages,
  currentIndex,
  photos,
  albumSize,
  onGoToPage,
  onBack,
  onOrder,
  getPageSnapshot,
}: BuilderPreviewProps) {
  const [spreadView, setSpreadView] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [imgDims, setImgDims] = useState<Record<number, ImgDim>>({});

  const page = pages[currentIndex];
  const { w: singleW, h: H } = PREVIEW_DIMS[albumSize] || { w: 500, h: 625 };

  // Scale factor: preview pixels per canvas pixel
  const canvasDims = getCanvasDimensions(albumSize as any);
  const sx = singleW / canvasDims.width;
  const sy = H / canvasDims.height;

  // ─── Resolve slot-based photos ───
  const slotPhotos: SlotPhotoInfo[] = useMemo(() => {
    const result: SlotPhotoInfo[] = [];
    if (!page?.templateId || !page.slotFills) return result;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page?.templateId, (page?.slotFills ?? []).join(','), photos.length]);

  // Clear imgDims when switching pages
  useEffect(() => { setImgDims({}); }, [currentIndex]);

  // Load image dimensions for slot photos
  useEffect(() => {
    slotPhotos.forEach(({ photoIndex, photo }) => {
      if (imgDims[photoIndex]) return;
      const image = new Image();
      image.onload = () => {
        setImgDims(prev => {
          if (prev[photoIndex]) return prev;
          return { ...prev, [photoIndex]: { w: image.naturalWidth, h: image.naturalHeight } };
        });
      };
      image.onerror = () => {};
      image.src = photo.previewUrl;
    });
  }, [slotPhotos, imgDims]);

  const textElements = useMemo(() => page?.textElements ?? [], [page]);

  if (!page) {
    return (
      <div className="flex flex-col h-screen w-screen bg-white items-center justify-center">
        <p className="text-[#9B9B9B]">No pages to preview</p>
        <button onClick={onBack} className="mt-4 px-4 py-2 bg-[#F4C2A1] text-white rounded-lg">Go Back</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-white">
      <BuilderToolbar
        currentIndex={currentIndex}
        totalPages={pages.length}
        onGoToPage={onGoToPage}
        onBack={onBack}
        backLabel="Edit"
        onOrder={onOrder}
        spreadView={spreadView}
        onToggleSpreadView={() => setSpreadView(!spreadView)}
      />

      <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
        <div
          ref={canvasRef}
          className="relative bg-white shadow-xl"
          style={{
            width: spreadView ? singleW * 2 + 20 : singleW,
            height: H,
            boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
          }}
        >
          {/* ─── CANVAS SNAPSHOT (pixel-perfect from Design) ─── */}
          {(() => {
            const snapshot = getPageSnapshot?.(page.id);
            if (snapshot) {
              return (
                <img
                  src={snapshot}
                  alt=""
                  className="absolute inset-0 w-full h-full object-contain"
                />
              );
            }
            /* ─── FALLBACK: DOM render ─── */
            return (
              <>
                <PageBackground bg={page?.background} width={singleW} height={H} />

                {slotPhotos.map(({ slotIndex, slot, photoIndex, photo }) => {
                  const rawLeft = (slot.x / 100) * singleW;
                  const rawTop = (slot.y / 100) * H;
                  const rawWidth = (slot.width / 100) * singleW;
                  const rawHeight = (slot.height / 100) * H;
                  const rotation = slot.rotation || 0;
                  const { style: shapeStyle, width, height, leftOffset, topOffset } =
                    slotShapeStyle(slot, rawWidth, rawHeight);
                  const slotScale = page.slotScales?.[slotIndex] ?? 1;
                  const slotOffsetX = page.slotOffsetsX?.[slotIndex] ?? 0;
                  const slotOffsetY = page.slotOffsetsY?.[slotIndex] ?? 0;
                  const dims = imgDims[photoIndex];
                  const hasCustomTransform = slotScale !== 1 || slotOffsetX !== 0 || slotOffsetY !== 0;

                  if (dims && hasCustomTransform) {
                    const slotCanvasW = (slot.width / 100) * canvasDims.width;
                    const slotCanvasH = (slot.height / 100) * canvasDims.height;
                    const coverScale = Math.max(slotCanvasW / dims.w, slotCanvasH / dims.h);
                    const finalScale = slotScale !== 1 ? slotScale : coverScale;
                    const imgW = dims.w * finalScale * sx;
                    const imgH = dims.h * finalScale * sy;
                    const imgLeft = width / 2 + slotOffsetX * sx - imgW / 2;
                    const imgTop = height / 2 + slotOffsetY * sy - imgH / 2;
                    return (
                      <div
                        key={`slot-${slot.id}`}
                        className="absolute"
                        style={{
                          zIndex: 1, left: rawLeft + leftOffset, top: rawTop + topOffset,
                          width, height,
                          transform: rotation !== 0 ? `rotate(${rotation}deg)` : undefined,
                          transformOrigin: 'center center',
                          border: slot.borderWidth ? `${slot.borderWidth}px solid ${slot.borderColor || '#FFFFFF'}` : undefined,
                          boxSizing: 'border-box', overflow: 'hidden', ...shapeStyle,
                        }}
                      >
                        <img src={photo.previewUrl} alt="" draggable={false}
                          style={{ position: 'absolute', left: imgLeft, top: imgTop, width: imgW, height: imgH }} />
                      </div>
                    );
                  }

                  return (
                    <div
                      key={`slot-${slot.id}`}
                      className="absolute"
                      style={{
                        zIndex: 1, left: rawLeft + leftOffset, top: rawTop + topOffset,
                        width, height,
                        transform: rotation !== 0 ? `rotate(${rotation}deg)` : undefined,
                        transformOrigin: 'center center',
                        border: slot.borderWidth ? `${slot.borderWidth}px solid ${slot.borderColor || '#FFFFFF'}` : undefined,
                        boxSizing: 'border-box', overflow: 'hidden', ...shapeStyle,
                      }}
                    >
                      <img src={photo.previewUrl} alt="" className="w-full h-full object-cover" draggable={false} />
                    </div>
                  );
                })}

                {textElements.map((t, i) => (
                  <div
                    key={`txt-${i}`}
                    className="absolute pointer-events-none"
                    style={{
                      zIndex: 2,
                      left: t.x * sx, top: t.y * sy,
                      width: (t.width || t.text.length * (t.fontSize || 24) * 0.6) * sx,
                      transform: `rotate(${t.rotation || 0}deg) scale(${t.scaleX ?? 1}, ${t.scaleY ?? 1})`,
                      transformOrigin: 'top left',
                      fontFamily: t.fontFamily || 'serif',
                      fontSize: (t.fontSize || 24) * sx,
                      fontWeight: t.bold ? 'bold' : 'normal',
                      fontStyle: t.italic ? 'italic' : 'normal',
                      textDecoration: t.underline ? 'underline' : 'none',
                      color: t.color || '#2D2D2D',
                      backgroundColor: t.backgroundColor || 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: t.alignment || 'center',
                      textAlign: (t.alignment || 'center') as any,
                      whiteSpace: 'normal', wordBreak: 'break-word',
                      overflow: 'visible', lineHeight: 1.2,
                      opacity: (t.opacity ?? 100) / 100,
                    }}
                  >
                    {t.text}
                  </div>
                ))}
              </>
            );
          })()}

          {/* ─── SPREAD VIEW: show next page ─── */}
          {spreadView && currentIndex + 1 < pages.length && (
            <>
              <div className="absolute left-0 top-0 bottom-0 w-[2px] z-20"
                style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.15) 50%, rgba(0,0,0,0.08) 100%)' }} />
              <SpreadPage page={pages[currentIndex + 1]} photos={photos} singleW={singleW} H={H} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════
   PAGE BACKGROUND
   ═════════════════════════════════════════════════════════════════ */

function PageBackground({ bg, width, height }: { bg: AlbumBackground | undefined; width: number; height: number }) {
  const css = backgroundToCss(bg);
  return (
    <div className="absolute inset-0" style={{ width, height, ...css, zIndex: 0 }} />
  );
}

function backgroundToCss(bg: AlbumBackground | undefined): React.CSSProperties {
  if (!bg) return { backgroundColor: '#FFFBF7' };

  switch (bg.type) {
    case 'solid':
      return { backgroundColor: bg.solid || '#FFFBF7' };
    case 'gradient': {
      const grad = bg.gradient;
      if (!grad) return { backgroundColor: '#FFFBF7' };
      const angle = grad.angle ?? 135;
      const stops = grad.stops.map((s) => `${s.color} ${s.offset * 100}%`).join(', ');
      if (grad.type === 'radial') return { background: `radial-gradient(circle, ${stops})` };
      return { background: `linear-gradient(${angle}deg, ${stops})` };
    }
    case 'image':
      return bg.image ? { backgroundImage: `url(${bg.image})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {};
    default:
      return { backgroundColor: '#FFFBF7' };
  }
}

/* ═════════════════════════════════════════════════════════════════
   SPREAD VIEW: Second page rendering
   ═════════════════════════════════════════════════════════════════ */

function SpreadPage({ page, photos, singleW, H }: { page: AlbumPage; photos: UploadedPhoto[]; singleW: number; H: number }) {
  const template = page.templateId ? getTemplateById(page.templateId) : null;

  return (
    <div className="absolute bg-white shadow-lg" style={{ left: singleW + 20, top: 0, width: singleW, height: H }}>
      {/* Background */}
      <div className="absolute inset-0" style={backgroundToCss(page.background)} />

      {/* Slot Photos */}
      {template && page.slotFills?.map((photoIdx, idx) => {
        if (photoIdx == null) return null;
        const uploaded = photos[photoIdx];
        if (!uploaded) return null;
        const slot = template.slots[idx];
        return (
          <div
            key={`spread-slot-${idx}`}
            className="absolute"
            style={{
              left: (slot.x / 100) * singleW,
              top: (slot.y / 100) * H,
              width: (slot.width / 100) * singleW,
              height: (slot.height / 100) * H,
              overflow: 'hidden',
              borderRadius: slot.shape === 'circle' ? '50%' : slot.shape === 'rounded' ? '12px' : undefined,
            }}
          >
            <img src={uploaded.previewUrl} alt="" className="w-full h-full object-cover" draggable={false} />
          </div>
        );
      })}

      {/* Text */}
      {page.textElements?.map((t, i) => (
        <div
          key={`spread-txt-${i}`}
          className="absolute pointer-events-none"
          style={{
            left: t.x * (singleW / 576),
            top: t.y * (singleW / 576),
            fontFamily: t.fontFamily || 'serif',
            fontSize: (t.fontSize || 24) * (singleW / 576),
            color: t.color || '#2D2D2D',
            fontWeight: t.bold ? 'bold' : 'normal',
            fontStyle: t.italic ? 'italic' : 'normal',
            transform: t.rotation ? `rotate(${t.rotation}deg)` : undefined,
          }}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
