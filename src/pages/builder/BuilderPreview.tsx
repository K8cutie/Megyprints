import { useState, useRef, useMemo, useEffect } from 'react';

/* ─── Image dimensions cache for slot photo scaling ─── */
interface ImgDim { w: number; h: number }

// ─── Types ───
import type { UploadedPhoto } from '../../components/PhotoUploader';
import type { PhotoOnPage, TextElement, AlbumPage } from './types';

import { PREVIEW_DIMS } from './PreviewSizeConstants';
import { slotShapeStyle } from './slotShapeStyle';
import { getTemplateById, getCanvasDimensions } from '../../constants/pageTemplates';
import BuilderToolbar from './BuilderToolbar';

interface BuilderPreviewProps {
  pages: AlbumPage[];
  currentIndex: number;
  photos: UploadedPhoto[];
  albumSize: string;
  onGoToPage: (index: number) => void;
  onBack: () => void;
  onOrder: () => void;
}

interface SlotPhotoInfo {
  slotIndex: number;
  slot: any;
  photoIndex: number;
  photo: UploadedPhoto;
}

export default function BuilderPreview({
  pages,
  currentIndex,
  photos,
  albumSize,
  onGoToPage,
  onBack,
  onOrder,
}: BuilderPreviewProps) {
  const [spreadView, setSpreadView] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [imgDims, setImgDims] = useState<Record<number, ImgDim>>({});

  const page = pages[currentIndex];
  const { w: singleW, h: H } = PREVIEW_DIMS[albumSize] || { w: 500, h: 625 };

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
  }, [page.templateId, (page.slotFills ?? []).join(','), (page.slotScales ?? []).join(','), (page.slotOffsetsX ?? []).join(','), (page.slotOffsetsY ?? []).join(','), (page.slotGeometries ?? []).map(g => JSON.stringify(g)).join('|'), photos.length]);

  // Clear imgDims when switching pages to avoid stale data
  useEffect(() => {
    setImgDims({});
  }, [currentIndex]);

  // Load image dimensions for slot photos so we can match editor scaling
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
      image.onerror = () => {
        console.log(`[Preview] Failed to load image dims for photo ${photoIndex}`);
      };
      image.src = photo.previewUrl;
    });
  }, [slotPhotos]);

  const freeformPhotos = useMemo(() => page.photos.filter((p) => p.isVisible !== false), [page]);
  const textElements = useMemo(() => page.textElements ?? [], [page]);

  // 🎨 Compute text color for the page
  const textColors = useMemo(() => {
    if (page.textColors && Object.keys(page.textColors).length > 0) {
      return page.textColors;
    }
    // Fallback to default colors
    return {
      heading1: page.heading1Color || page.textColor || '#000000',
      heading2: page.heading2Color || page.textColor || '#000000',
      body: page.textColor || '#000000',
      caption: page.captionColor || page.textColor || '#000000',
      subcaption: page.subcaptionColor || page.textColor || '#000000',
      quote: page.quoteColor || page.textColor || '#000000',
      label: page.labelColor || page.textColor || '#000000',
      pageNumber: page.pageNumberColor || page.textColor || '#000000',
    };
  }, [page]);

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

  return (
    <div className="flex flex-col h-screen w-screen bg-white"
    >
      {/* ─── TOOLBAR ─── */}
      <BuilderToolbar
        currentIndex={currentIndex}
        totalPages={pages.length}
        onGoToPage={onGoToPage}
        onExport={handleExport}
        onBack={onBack}
        backLabel="Edit"
        onOrder={onOrder}
        spreadView={spreadView}
        onToggleSpreadView={() => setSpreadView(!spreadView)}
      />

      {/* ─── PREVIEW CANVAS ─── */}
      <div className="flex-1 flex items-center justify-center p-6 overflow-auto"
      >
        <div
          ref={canvasRef}
          className="relative bg-white shadow-xl"
          style={{
            width: spreadView ? singleW * 2 + 20 : singleW,
            height: H,
            boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
          }}
        >
          {/* ─── SLOT-BASED PHOTOS ─── */}
          {slotPhotos.map(({ slotIndex, slot, photoIndex, photo }) => {
            const rawLeft = (slot.x / 100) * singleW;
            const rawTop = (slot.y / 100) * H;
            const rawWidth = (slot.width / 100) * singleW;
            const rawHeight = (slot.height / 100) * H;
            const rotation = slot.rotation || 0;

            // Compute shape-corrected sizing (circle -> square, etc.)
            const {
              style: shapeStyle,
              width,
              height,
              leftOffset,
              topOffset,
            } = slotShapeStyle(slot, rawWidth, rawHeight);

            // Get transform data from page
            const slotScale = page.slotScales?.[slotIndex] ?? 1;
            const slotOffsetX = page.slotOffsetsX?.[slotIndex] ?? 0;
            const slotOffsetY = page.slotOffsetsY?.[slotIndex] ?? 0;

            const dims = imgDims[photoIndex];
            const hasCustomTransform = slotScale !== 1 || slotOffsetX !== 0 || slotOffsetY !== 0;

            // If we know image dims and user has zoomed/panned,
            // replicate Fabric.js exact positioning.
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
                    overflow: 'hidden',
                    ...shapeStyle,
                  }}
                >
                  <img
                    src={photo.previewUrl}
                    alt=""
                    draggable={false}
                    style={{
                      position: 'absolute',
                      left: imgLeft,
                      top: imgTop,
                      width: imgW,
                      height: imgH,
                    }}
                  />
                </div>
              );
            }

            // Fallback: default centered crop
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
                  overflow: 'hidden',
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
          {freeformPhotos.map((p, i) => {
            const rotation = p.rotation || 0;
            const image = photos[p.photoIndex];
            if (!image) return null;
            return (
              <div
                key={`ff-${i}`}
                className="absolute"
                style={{
                  left: p.x * sx,
                  top: p.y * sy,
                  width: p.width * sx,
                  height: p.height * sy,
                  transform: rotation !== 0 ? `rotate(${rotation}deg)` : undefined,
                  transformOrigin: 'center center',
                  border: p.border
                    ? `${p.border.width || 3}px solid ${p.border.color || '#FFFFFF'}`
                    : undefined,
                  boxSizing: 'border-box',
                  overflow: 'hidden',
                  borderRadius: p.shape === 'circle'
                    ? '50%'
                    : p.shape === 'rounded'
                      ? '16px'
                      : p.shape === 'arch'
                        ? '9999px 9999px 0 0'
                        : undefined,
                }}
              >
                <img
                  src={image.previewUrl}
                  alt=""
                  className="w-full h-full object-cover"
                  draggable={false}
                />
              </div>
            );
          })}

          {/* ─── TEXT ELEMENTS ─── */}
          {textElements.map((t, i) => {
            const rotation = t.rotation || 0;
            // Get the appropriate color for this element type
            const textColor = textColors[t.type as keyof typeof textColors] || textColors.body || '#000000';
            // Get background color
            const bgColor = t.backgroundColor || (t.type === 'label' ? '#000000' : 'transparent');
            const needsPadding = t.type === 'label' || t.backgroundColor;
            return (
              <div
                key={`txt-${i}`}
                className="absolute"
                style={{
                  left: t.x * sx,
                  top: t.y * sy,
                  width: t.width * sx,
                  height: (t.height || 30) * sy,
                  transform: rotation !== 0 ? `rotate(${rotation}deg)` : undefined,
                  transformOrigin: 'center center',
                  fontFamily: t.fontFamily || 'serif',
                  fontSize: (t.fontSize || 14) * sx,
                  fontWeight: t.fontWeight || 'normal',
                  fontStyle: t.fontStyle || 'normal',
                  textDecoration: t.textDecoration || 'none',
                  color: textColor,
                  backgroundColor: bgColor,
                  padding: needsPadding ? `${2 * sx}px ${6 * sx}px` : undefined,
                  borderRadius: t.type === 'label' ? `${2 * sx}px` : undefined,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: t.align || 'center',
                  textAlign: t.align || 'center',
                  whiteSpace: t.wrap !== false ? 'normal' : 'nowrap',
                  wordBreak: 'break-word',
                  overflow: 'hidden',
                  lineHeight: 1.2,
                }}
              >
                {t.text}
              </div>
            );
          })}

          {/* ─── SPREAD VIEW: show next page too ─── */}
          {spreadView && currentIndex + 1 < pages.length && (
            <div
              className="absolute bg-white shadow-lg"
              style={{
                left: singleW + 20,
                top: 0,
                width: singleW,
                height: H,
              }}
            >
              {/* Next page rendered inline — can expand */}
              <div className="absolute inset-0" style={{ left: 0, top: 0 }}
              >
                {/* Simple overlay for next page photos */}
                {(() => {
                  const nextPage = pages[currentIndex + 1];
                  if (!nextPage.templateId) return null;
                  const nextTemplate = getTemplateById(nextPage.templateId);
                  if (!nextTemplate) return null;

                  return nextTemplate.slots.map((slot, idx) => {
                    const photoIdx = nextPage.slotFills?.[idx];
                    if (photoIdx == null) return null;
                    const uploaded = photos[photoIdx];
                    if (!uploaded) return null;

                    const left = (slot.x / 100) * singleW;
                    const top = (slot.y / 100) * H;
                    const slotW = (slot.width / 100) * singleW;
                    const slotH = (slot.height / 100) * H;

                    return (
                      <div
                        key={`next-slot-${idx}`}
                        className="absolute"
                        style={{
                          left,
                          top,
                          width: slotW,
                          height: slotH,
                          overflow: 'hidden',
                          borderRadius: slot.shape === 'circle' ? '50%' : slot.shape === 'rounded' ? '12px' : undefined,
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
                  });
                })()}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
