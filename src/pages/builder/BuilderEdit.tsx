/**
 * BuilderEdit.tsx
 * ==============================================================================
 * Refactored presentational component for the album builder's canvas editor.
 * All canvas logic lives in useCanvasEngine.ts — this file only handles:
 *  - JSX layout (sidebar / canvas / properties panel)
 *  - Photo picker modal
 *  - In-place Fabric filter/border/shadow updates (effects)
 *  - Handler delegation to the state management hook
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ZoomIn, ZoomOut, Grid3X3, RotateCcw, Magnet, ChevronLeft, Eye, Sparkles, BoxSelect,
} from 'lucide-react';
import { useCanvasEngine } from './useCanvasEngine';
import type { BuilderActions } from './useBuilderState';
import type { CanvasPhoto, TextElement, PhotoFilters } from './types';
import EditSidebar from './EditSidebar';
import PropertiesPanel from './PropertiesPanel';
import { getCanvasDimensions } from './layouts';
import fabric from './fabric-loader';

/* ── Local helper types for in-place filter effects ─────────────────────── */

interface FilterValues {
  brightness?: number;
  contrast?: number;
  saturate?: number;
  blur?: number;
}

interface BorderShadowValues {
  borderWidth?: number;
  borderColor?: string;
  borderRadius?: number;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
}

/* ── Props ──────────────────────────────────────────────────────────────── */

interface BuilderEditProps {
  actions: BuilderActions;
  onRegenerate?: () => void;
}

/* ═══════════════════════════ COMPONENT ═══════════════════════════ */

export default function BuilderEdit({ actions, onRegenerate }: BuilderEditProps): React.ReactElement {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  /* ── Local UI state ── */
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'photos' | 'pages' | 'layers' | 'templates'>('photos');
  const [containerMode, setContainerMode] = useState(false);

  /* ── Canvas dimensions ── */
  const { width: CANVAS_W, height: CANVAS_H } = useMemo(
    () => getCanvasDimensions(actions.albumSize),
    [actions.albumSize],
  );

  /* ── Canvas engine (all Fabric logic) ── */
  const {
    fabricValid,
    zoom,
    showGrid,
    snapEnabled,
    selectedPhotoId,
    selectedTextId,
    selectedBg,
    selectedSlotIndex,
    handleZoom,
    resetZoom,
    setShowGrid,
    setSnapEnabled,
    selectBackground,
    fabricCanvasRef,
  } = useCanvasEngine({
    canvasRef: canvasElRef,
    containerRef,
    currentPage: actions.currentPage,
    uploadedPhotos: actions.uploadedPhotos,
    albumType: actions.albumType,
    albumSize: actions.albumSize,
    onSlotClick: (slotIndex) => {
      if (containerMode) return; // In container mode, slot click fills photo
      setSelectedSlotForPicker(slotIndex);
      setShowPhotoPicker(true);
    },
    actions,
    containerMode,
    onContainerModified: (slotIndex, geometry) => {
      actions.updateSlotGeometry(slotIndex, geometry);
    },
  });

  const [selectedSlotForPicker, setSelectedSlotForPicker] = useState<number | null>(null);

  /* ── Derived selections ── */
  const currentPage = actions.currentPage;

  const selectedPhoto: CanvasPhoto | null = useMemo(
    () => (selectedPhotoId ? currentPage.photos.find((p) => p.id === selectedPhotoId) ?? null : null),
    [selectedPhotoId, currentPage.photos],
  );

  const selectedText: TextElement | null = useMemo(
    () => (selectedTextId ? currentPage.textElements.find((t) => t.id === selectedTextId) ?? null : null),
    [selectedTextId, currentPage.textElements],
  );

  const background = currentPage.background;

  /* ── Safe slot array defaults (fix TS2740: '{}' not assignable to array) ── */
  const templateSlotCount = currentPage.slotFills?.length ?? 0;
  const slotFills = useMemo(
    () => (currentPage.slotFills?.length ? currentPage.slotFills : []),
    [currentPage.slotFills, templateSlotCount],
  );
  const slotScales = useMemo(
    () => (currentPage.slotScales?.length ? currentPage.slotScales : []),
    [currentPage.slotScales, templateSlotCount],
  );
  const slotOffsetsX = useMemo(
    () => (currentPage.slotOffsetsX?.length ? currentPage.slotOffsetsX : []),
    [currentPage.slotOffsetsX, templateSlotCount],
  );
  const slotOffsetsY = useMemo(
    () => (currentPage.slotOffsetsY?.length ? currentPage.slotOffsetsY : []),
    [currentPage.slotOffsetsY, templateSlotCount],
  );

  /* ── In-place filter / border / shadow effects ── */
  const prevPhotoFilters = useRef<Record<string, FilterValues>>({});
  const prevPhotoBorder = useRef<Record<string, BorderShadowValues>>({});
  const prevBgFilters = useRef<FilterValues | null>(null);

  /* photo filters */
  useEffect(() => {
    if (!selectedPhoto || !fabricCanvasRef.current) return;
    const canvas = fabricCanvasRef.current;
    const obj = canvas.getObjects().find((o: any) => o.photoId === selectedPhoto.id);
    if (!obj) return;

    const f = selectedPhoto.filters;
    const currentFilters: FilterValues = {
      brightness: f?.brightness ?? 100,
      contrast: f?.contrast ?? 100,
      saturate: f?.saturate ?? 100,
      blur: f?.blur ?? 0,
    };

    const prev = prevPhotoFilters.current[selectedPhoto.id];
    if (
      !prev ||
      prev.brightness !== currentFilters.brightness ||
      prev.contrast !== currentFilters.contrast ||
      prev.saturate !== currentFilters.saturate ||
      prev.blur !== currentFilters.blur
    ) {
      applyImageFilters(obj, currentFilters);
      canvas.requestRenderAll();
      prevPhotoFilters.current[selectedPhoto.id] = { ...currentFilters };
    }
    // Only run when filter values change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedPhoto?.filters?.brightness,
    selectedPhoto?.filters?.contrast,
    selectedPhoto?.filters?.saturate,
    selectedPhoto?.filters?.blur,
    selectedPhotoId,
  ]);

  /* photo border / shadow */
  useEffect(() => {
    if (!selectedPhoto || !fabricCanvasRef.current) return;
    const canvas = fabricCanvasRef.current;
    const obj = canvas.getObjects().find((o: any) => o.photoId === selectedPhoto.id);
    if (!obj) return;

    const currentBorder: BorderShadowValues = {
      borderWidth: selectedPhoto.borderWidth ?? 0,
      borderColor: selectedPhoto.borderColor ?? '#FFFFFF',
      shadowColor: selectedPhoto.shadowColor,
      shadowBlur: selectedPhoto.shadowBlur ?? 0,
      shadowOffsetX: selectedPhoto.shadowOffsetX ?? 0,
      shadowOffsetY: selectedPhoto.shadowOffsetY ?? 0,
    };

    const prev = prevPhotoBorder.current[selectedPhoto.id];
    if (
      !prev ||
      prev.borderWidth !== currentBorder.borderWidth ||
      prev.borderColor !== currentBorder.borderColor ||
      prev.shadowColor !== currentBorder.shadowColor ||
      prev.shadowBlur !== currentBorder.shadowBlur ||
      prev.shadowOffsetX !== currentBorder.shadowOffsetX ||
      prev.shadowOffsetY !== currentBorder.shadowOffsetY
    ) {
      applyBorderShadow(obj, currentBorder);
      canvas.requestRenderAll();
      prevPhotoBorder.current[selectedPhoto.id] = { ...currentBorder };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedPhoto?.borderWidth,
    selectedPhoto?.borderColor,
    selectedPhoto?.shadowColor,
    selectedPhoto?.shadowBlur,
    selectedPhoto?.shadowOffsetX,
    selectedPhoto?.shadowOffsetY,
    selectedPhotoId,
  ]);

  /* background filters */
  useEffect(() => {
    if (!selectedBg || !background || !fabricCanvasRef.current) return;
    const canvas = fabricCanvasRef.current;
    const obj = canvas.getObjects().find((o: any) => o.bgId === 'page-background');
    if (!obj) return;

    const f = (background as any).filters;
    const currentFilters: FilterValues = {
      brightness: f?.brightness ?? 100,
      contrast: f?.contrast ?? 100,
      saturate: f?.saturate ?? 100,
      blur: f?.blur ?? 0,
    };

    const prev = prevBgFilters.current;
    if (
      !prev ||
      prev.brightness !== currentFilters.brightness ||
      prev.contrast !== currentFilters.contrast ||
      prev.saturate !== currentFilters.saturate ||
      prev.blur !== currentFilters.blur
    ) {
      applyImageFilters(obj, currentFilters);
      canvas.requestRenderAll();
      prevBgFilters.current = { ...currentFilters };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    (background as any)?.filters?.brightness,
    (background as any)?.filters?.contrast,
    (background as any)?.filters?.saturate,
    (background as any)?.filters?.blur,
    selectedBg,
  ]);

  /* ── TEXT: immediate in-place update when panel changes properties ──
     renderScene recreates text from scratch (correct but slow). This effect
     provides instant visual feedback for panel edits by updating the Fabric
     object directly. Both paths converge on the same state — no fighting. */
  useEffect(() => {
    if (!selectedText || !fabricCanvasRef.current) return;
    const canvas = fabricCanvasRef.current;
    // Always find fresh — renderScene may have recreated the object
    const fabObj = canvas.getObjects().find((o: any) => o.textId === selectedText.id) as any;
    if (!fabObj) return;

    const t = selectedText;
    const isEditing = fabObj.isEditing ?? false;
    /* During inline editing, the canvas text:changed event handles text sync.
       Setting fabObj.text here would kick the user out of edit mode. */
    if (!isEditing && fabObj.text !== t.text) fabObj.set('text', t.text);
    if (fabObj.fontFamily !== t.fontFamily) fabObj.set('fontFamily', t.fontFamily);
    if (fabObj.fontSize !== t.fontSize) fabObj.set('fontSize', t.fontSize);
    if (fabObj.fill !== t.color) fabObj.set('fill', t.color);
    if (fabObj.fontWeight !== (t.bold ? 'bold' : 'normal')) fabObj.set('fontWeight', t.bold ? 'bold' : 'normal');
    if (fabObj.fontStyle !== (t.italic ? 'italic' : 'normal')) fabObj.set('fontStyle', t.italic ? 'italic' : 'normal');
    if (fabObj.underline !== t.underline) fabObj.set('underline', t.underline);
    if (fabObj.textAlign !== t.alignment) fabObj.set('textAlign', t.alignment);
    if (fabObj.angle !== t.rotation) fabObj.set('angle', t.rotation);
    if (fabObj.opacity !== t.opacity / 100) fabObj.set('opacity', t.opacity / 100);
    if (fabObj.left !== t.x) fabObj.set('left', t.x);
    if (fabObj.top !== t.y) fabObj.set('top', t.y);
    if (fabObj.width !== (t.width ?? Math.max(t.text.length * t.fontSize * 0.6, 100))) {
      fabObj.set('width', t.width ?? Math.max(t.text.length * t.fontSize * 0.6, 100));
    }
    if (fabObj.scaleX !== (t.scaleX ?? 1)) fabObj.set('scaleX', t.scaleX ?? 1);
    if (fabObj.scaleY !== (t.scaleY ?? 1)) fabObj.set('scaleY', t.scaleY ?? 1);

    fabObj.setCoords();
    canvas.requestRenderAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedText?.text, selectedText?.fontFamily, selectedText?.fontSize,
    selectedText?.color, selectedText?.bold, selectedText?.italic,
    selectedText?.underline, selectedText?.alignment, selectedText?.rotation,
    selectedText?.opacity, selectedText?.x, selectedText?.y,
    selectedText?.width, selectedText?.scaleX, selectedText?.scaleY,
    selectedTextId,
  ]);

  /* ── Handler callbacks ── */

  const handleSelectPhoto = useCallback((id: string | null) => {
    // Selection is managed by the canvas engine; this syncs sidebar click → canvas
    if (id && fabricCanvasRef.current) {
      const obj = fabricCanvasRef.current.getObjects().find((o: any) => o.photoId === id);
      if (obj) {
        fabricCanvasRef.current.setActiveObject(obj);
        fabricCanvasRef.current.requestRenderAll();
      }
    }
  }, [fabricCanvasRef]);

  const handleSelectText = useCallback((id: string | null) => {
    if (id && fabricCanvasRef.current) {
      const obj = fabricCanvasRef.current.getObjects().find((o: any) => o.textId === id);
      if (obj) {
        fabricCanvasRef.current.setActiveObject(obj);
        fabricCanvasRef.current.requestRenderAll();
      }
    }
  }, [fabricCanvasRef]);

  const handleUpdatePhoto = useCallback(
    (id: string, updates: Partial<CanvasPhoto>) => actions.updatePhotoTransform(id, updates),
    [actions],
  );

  const handleUpdateFilters = useCallback(
    (id: string, filters: Parameters<typeof actions.updatePhotoFilters>[1]) =>
      actions.updatePhotoFilters(id, filters),
    [actions],
  );

  const handleUpdateText = useCallback(
    (id: string, updates: Partial<TextElement>) => actions.updateTextElement(id, updates),
    [actions],
  );

  const handleDeletePhoto = useCallback(
    (id: string) => actions.deletePhotoFromCanvas(id),
    [actions],
  );

  const handleDeleteText = useCallback(
    (id: string) => actions.deleteTextElement(id),
    [actions],
  );

  const handleDuplicatePhoto = useCallback(
    (id: string) => actions.duplicateCanvasPhoto(id),
    [actions],
  );

  const handleBringToFront = useCallback(
    (id: string) => actions.bringToFront(id),
    [actions],
  );

  const handleSendToBack = useCallback(
    (id: string) => actions.sendToBack(id),
    [actions],
  );

  const handleUpdateBackground = useCallback(
    (bg: typeof background) => actions.setPageBackground(bg),
    [actions],
  );

  const handleUpdateBackgroundTransform = useCallback(
    (updates: Parameters<typeof actions.updateBackgroundTransform>[0]) =>
      actions.updateBackgroundTransform(updates),
    [actions],
  );

  const handleUpdateBackgroundFilters = useCallback(
    (filters: Partial<PhotoFilters>) => actions.updateBackgroundFilters(filters),
    [actions],
  );

  const handleClearSlot = useCallback(
    (slotIndex: number) => actions.clearSlot(slotIndex),
    [actions],
  );

  const handleSetSlotScale = useCallback(
    (slotIndex: number, scale: number) => actions.setSlotScale(slotIndex, scale),
    [actions],
  );

  const handleSetSlotOffset = useCallback(
    (slotIndex: number, dx: number, dy: number) => actions.setSlotOffset(slotIndex, dx, dy),
    [actions],
  );

  const handleReplaceSlotPhoto = useCallback(
    () => {
      // PropertiesPanel signals "replace photo for the currently selected slot"
      if (selectedSlotIndex !== null) {
        setShowPhotoPicker(true);
      }
    },
    [selectedSlotIndex],
  );

  const handleAddText = useCallback(() => {
    actions.addTextElement(CANVAS_W / 2, CANVAS_H / 2);
  }, [actions, CANVAS_W, CANVAS_H]);

  /* ── Fabric not loaded — show error ── */
  if (!fabricValid) {
    return (
      <div className="flex h-full bg-[#F5F5F5] items-center justify-center">
        <div className="text-center">
          <p className="text-[#E8A598] font-medium mb-2">Editor engine failed to load</p>
          <p className="text-sm text-[#6B6B6B]">Please refresh the page and try again.</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-6 py-2 bg-[#F4C2A1] text-white rounded-lg font-medium hover:brightness-105"
          >
            Refresh Page
          </button>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════ RENDER ═══════════════════════════ */

  return (
    <>
      {/* ── Photo Picker Modal ── */}
      <AnimatePresence>
        {showPhotoPicker && selectedSlotForPicker !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={() => setShowPhotoPicker(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white rounded-2xl shadow-2xl p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-display text-lg font-semibold text-[#2D2D2D] mb-4">
                Choose a photo for slot {selectedSlotForPicker + 1}
              </h3>
              {actions.uploadedPhotos.length === 0 ? (
                <p className="text-sm text-[#9B9B9B] text-center py-8">
                  No photos uploaded yet. Go to the Photos tab to upload.
                </p>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
                  {actions.uploadedPhotos.map((photo, idx) => (
                    <button
                      key={photo.id}
                      onClick={() => {
                        actions.fillSlot(selectedSlotForPicker, idx);
                        setShowPhotoPicker(false);
                      }}
                      className="aspect-square rounded-lg overflow-hidden border-2 border-transparent hover:border-[#F4C2A1] transition-all"
                    >
                      <img
                        src={photo.previewUrl}
                        alt={photo.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => setShowPhotoPicker(false)}
                  className="px-4 py-2 text-sm text-[#6B6B6B] hover:text-[#2D2D2D]"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex h-full bg-[#F5F5F5]">
        {/* ── Sidebar ── */}
        <EditSidebar
          activeTab={sidebarTab}
          onTabChange={setSidebarTab}
          uploadedPhotos={actions.uploadedPhotos}
          albumPages={actions.albumPages}
          currentPageIndex={actions.currentPageIndex}
          photos={currentPage.photos}
          textElements={currentPage.textElements}
          selectedPhotoId={selectedPhotoId}
          selectedTextId={selectedTextId}
          onSelectPhoto={handleSelectPhoto}
          onSelectText={handleSelectText}
          onGoToPage={actions.goToPage}
          onAddPage={actions.addPage}
          onDeletePage={actions.deletePage}
          onDuplicatePage={actions.duplicatePage}
          onAddText={handleAddText}
          currentTemplateId={currentPage.templateId}
          onSetTemplate={actions.setPageTemplate}
          onAutoFill={actions.autoFillSlots}
          onClearAllSlots={actions.clearAllSlots}
          onAddPhotos={actions.addPhotos}
        />

        {/* ── Canvas Area ── */}
        <div className="flex-1 flex flex-col relative overflow-hidden">
          {/* Toolbar */}
          <div className="h-10 bg-white border-b border-[#E8E8E8] flex items-center justify-between px-3 shrink-0">
            <div className="flex items-center gap-1">
              <button
                onClick={() => actions.setPhase('template')}
                className="p-1.5 rounded-md hover:bg-[#F0F0F0] text-[#6B6B6B]"
                title="Back to template"
              >
                <ChevronLeft size={16} />
              </button>

              <div className="w-px h-5 bg-[#E8E8E8] mx-1" />

              {/* Zoom */}
              <button onClick={() => handleZoom(-0.1)} className="p-1.5 rounded-md hover:bg-[#F0F0F0] text-[#6B6B6B]" title="Zoom out">
                <ZoomOut size={14} />
              </button>
              <span className="text-xs text-[#6B6B6B] w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
              <button onClick={() => handleZoom(0.1)} className="p-1.5 rounded-md hover:bg-[#F0F0F0] text-[#6B6B6B]" title="Zoom in">
                <ZoomIn size={14} />
              </button>
              <button onClick={resetZoom} className="p-1.5 rounded-md hover:bg-[#F0F0F0] text-[#6B6B6B]" title="Reset zoom">
                <RotateCcw size={12} />
              </button>

              <div className="w-px h-5 bg-[#E8E8E8] mx-1" />

              {/* Grid */}
              <button
                onClick={() => setShowGrid((v) => !v)}
                className={`p-1.5 rounded-md text-[#6B6B6B] transition-colors ${showGrid ? 'bg-[#FDE8E4] text-[#E8A598]' : 'hover:bg-[#F0F0F0]'}`}
                title="Toggle grid"
              >
                <Grid3X3 size={14} />
              </button>

              {/* Snap */}
              <button
                onClick={() => setSnapEnabled((v) => !v)}
                className={`p-1.5 rounded-md text-[#6B6B6B] transition-colors ${snapEnabled ? 'bg-[#FDE8E4] text-[#E8A598]' : 'hover:bg-[#F0F0F0]'}`}
                title="Toggle snap to grid"
              >
                <Magnet size={14} />
              </button>

              <div className="w-px h-5 bg-[#E8E8E8] mx-1" />

              <button
                onClick={selectBackground}
                className="px-2 py-1 text-xs rounded-md hover:bg-[#F0F0F0] text-[#6B6B6B]"
              >
                Background
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-[#9B9B9B]">
                Page {actions.currentPageIndex + 1} of {actions.albumPages.length}
              </span>
              {/* Container Mode Toggle */}
              <button
                onClick={() => setContainerMode((prev) => !prev)}
                title={containerMode ? 'Exit container editing mode' : 'Edit slot containers (resize & move boxes)'}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1 transition-all"
                style={{
                  backgroundColor: containerMode ? '#3B82F6' : '#FFFFFF',
                  color: containerMode ? '#FFFFFF' : '#3B82F6',
                  border: containerMode ? '1px solid #3B82F6' : '1px solid #93C5FD',
                }}
              >
                <BoxSelect size={12} /> {containerMode ? 'Container On' : 'Containers'}
              </button>

              {onRegenerate && (
                <button
                  onClick={onRegenerate}
                  title="Regenerate album with new random layouts"
                  className="px-3 py-1.5 bg-white border border-[#B8A9D9] text-[#B8A9D9] text-xs font-semibold rounded-lg hover:bg-[#B8A9D9] hover:text-white flex items-center gap-1 transition-all"
                >
                  <Sparkles size={12} /> Regenerate
                </button>
              )}
              <button
                onClick={() => actions.setPhase('preview')}
                className="px-3 py-1.5 bg-[#F4C2A1] text-white text-xs font-semibold rounded-lg hover:brightness-105 flex items-center gap-1"
              >
                <Eye size={12} /> Preview
              </button>
            </div>
          </div>

          {/* Canvas */}
          <div
            ref={containerRef}
            className="flex-1 overflow-auto flex items-center justify-center p-8"
            title="Scroll up/down to navigate between pages"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="shadow-xl relative"
              style={{ boxShadow: '0 8px 32px rgba(45,45,45,0.15)' }}
            >
              <canvas
                ref={canvasElRef}
                style={{ width: CANVAS_W * zoom, height: CANVAS_H * zoom }}
              />
            </motion.div>
          </div>
        </div>

        {/* ── Properties Panel ── */}
        <div className="w-64 bg-white border-l border-[#E8E8E8] overflow-hidden">
          <PropertiesPanel
            selectedPhoto={selectedPhoto}
            selectedText={selectedText}
            selectedBackground={selectedBg ? (background as any) : null}
            background={background}
            selectedSlotIndex={selectedSlotIndex}
            slotFills={slotFills}
            slotScales={slotScales}
            slotOffsetsX={slotOffsetsX}
            slotOffsetsY={slotOffsetsY}
            uploadedPhotos={actions.uploadedPhotos}
            onUpdatePhoto={handleUpdatePhoto}
            onUpdateFilters={handleUpdateFilters}
            onUpdateText={handleUpdateText}
            onDeletePhoto={handleDeletePhoto}
            onDeleteText={handleDeleteText}
            onDuplicatePhoto={handleDuplicatePhoto}
            onBringToFront={handleBringToFront}
            onSendToBack={handleSendToBack}
            onUpdateBackground={handleUpdateBackground}
            onUpdateBackgroundTransform={handleUpdateBackgroundTransform}
            onUpdateBackgroundFilters={handleUpdateBackgroundFilters}
            onClearSlot={handleClearSlot}
            onSetSlotScale={handleSetSlotScale}
            onSetSlotOffset={handleSetSlotOffset}
            onReplaceSlotPhoto={handleReplaceSlotPhoto}
          />
        </div>
      </div>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
 *  Pure helpers — no hooks, no component state
 *  ══════════════════════════════════════════════════════════════════════════ */

function applyImageFilters(fabricObject: any, filters: FilterValues): void {
  if (fabricObject.type !== 'image') return;
  const img = fabricObject;
  const fabricFilters: any[] = [];
  const fab = fabric as any;

  if (filters.brightness !== undefined && filters.brightness !== 0) {
    fabricFilters.push(new fab.Image.filters.Brightness({ brightness: (filters.brightness - 100) / 100 }));
  }
  if (filters.contrast !== undefined && filters.contrast !== 0) {
    fabricFilters.push(new fab.Image.filters.Contrast({ contrast: (filters.contrast - 100) / 100 }));
  }
  if (filters.saturate !== undefined && filters.saturate !== 0) {
    fabricFilters.push(new fab.Image.filters.Saturation({ saturation: (filters.saturate - 100) / 100 }));
  }
  if (filters.blur !== undefined && filters.blur > 0) {
    fabricFilters.push(new fab.Image.filters.Blur({ blur: filters.blur / 10 }));
  }

  img.filters = fabricFilters;
  img.applyFilters();
}

function applyBorderShadow(fabricObject: any, values: BorderShadowValues): void {
  if (values.borderWidth !== undefined) fabricObject.strokeWidth = values.borderWidth;
  if (values.borderColor !== undefined) fabricObject.stroke = values.borderColor;

  if (values.shadowColor || values.shadowBlur) {
    fabricObject.shadow = new (fabric as any).Shadow({
      color: values.shadowColor || 'rgba(0,0,0,0.3)',
      blur: values.shadowBlur ?? 0,
      offsetX: values.shadowOffsetX ?? 0,
      offsetY: values.shadowOffsetY ?? 0,
    });
  } else {
    fabricObject.shadow = undefined;
  }
}
