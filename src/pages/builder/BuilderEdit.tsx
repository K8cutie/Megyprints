/**
 * BuilderEdit.tsx
 * =============================================================================
 * Refactored presentational component for the album builder's canvas editor.
 * All canvas logic lives in useCanvasEngine.ts — this file only handles:
 *  - JSX layout (sidebar / canvas / properties panel)
 *  - Photo picker modal
 *  - In-place Fabric filter/border/shadow updates (effects)
 *  - Handler delegation to the state management hook
 *  - Selection change reporting via onSelectionChange callback
 */

import { Link } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ZoomIn, ZoomOut, Grid3X3, RotateCcw, Magnet, ChevronLeft, ChevronRight, Sparkles,
  Wand2, Upload, Home, PanelLeftOpen,
} from 'lucide-react';
import { useCanvasEngine } from './useCanvasEngine';
import type { BuilderActions } from './useBuilderState';
import type { CanvasPhoto, TextElement, PhotoFilters } from './types';
import UnifiedPanel from './UnifiedPanel';
import { useBuilderContext } from './BuilderContext';
import { CloudSaveStatus } from '../../components/CloudSaveStatus';
import { useAuth } from '../../lib/authContext';
/* PropertiesPanel is now rendered inside UnifiedPanel */
import { getCanvasDimensions } from './layouts';
import { PAGE_TEMPLATES } from './pageTemplates';
import { templateTracker } from './varietyTracker';
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
  onGenerate?: () => void;
  onGenerateAll?: () => void;
  containerModeRef?: React.MutableRefObject<((enable: boolean) => void) | undefined>;
  onAction?: (action: string, payload?: Record<string, unknown>) => void;
  onSelectionChange?: (ctx: { selectedPhotoId: string | null; selectedSlotIndex: number | null; selectedTextId: string | null }) => void;
}

/* ═══════════════════════════ COMPONENT ═══════════════════════════ */

export default function BuilderEdit({ actions, onRegenerate, onGenerate, onGenerateAll, containerModeRef, onAction: _onAction, onSelectionChange }: BuilderEditProps): React.ReactElement {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  /* ── Local UI state ── */
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [containerMode, setContainerMode] = useState(false);

  /* ── Sidebar hidden by default — Megy Assistant is the primary control ── */
  const [sidebarVisible, setSidebarVisible] = useState(false);

  /* ── Megy is the SOLE orchestrator: hide manual canvas tools (zoom, grid,
     snap, phase nav, generate buttons, legacy panel) from the frontend. The
     user only edits TEXT and REPLACES photos directly; everything else is
     Megy's job. Flip to false to bring the power-user tools back. ── */
  const ORCHESTRATOR_MODE = true;

  /* ── Keyboard shortcut: Ctrl+Shift+S toggles sidebar (power users) ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        setSidebarVisible(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  /* ── Register container mode toggle for Megy (via parent ref) ── */
  useEffect(() => {
    if (containerModeRef) {
      containerModeRef.current = (enable: boolean) => {
        setContainerMode(enable);
      };
    }
    return () => {
      if (containerModeRef) {
        containerModeRef.current = undefined;
      }
    };
  }, [containerModeRef]);

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
    fabricCanvasRef,
  } = useCanvasEngine({
    canvasRef: canvasElRef,
    containerRef,
    currentPage: actions.currentPage,
    uploadedPhotos: actions.uploadedPhotos,
    albumType: actions.albumType,
    albumSize: actions.albumSize,
    onSlotClick: useCallback((slotIndex: number) => {
      if (containerMode) return;
      setSelectedSlotForPicker(slotIndex);
      setShowPhotoPicker(true);
    }, [containerMode]),
    actions,
    containerMode,
    onContainerModified: useCallback((slotIndex: number, geometry: any) => {
      actions.updateSlotGeometry(slotIndex, geometry);
    }, [actions]),
    onRenderComplete: useCallback((canvas: any) => {
      try {
        // Small JPEG thumbnail — the snapshot is only used for the project
        // cover now (Preview renders live). Keeping it tiny avoids writing
        // megabyte-sized base64 to Supabase on every auto-save.
        const dataUrl = canvas.toDataURL({ format: 'jpeg', quality: 0.5, multiplier: 0.35 });
        actions.setPageSnapshot(actions.currentPage.id, dataUrl);
      } catch {
        // silently fail if canvas isn't ready for export
      }
    }, [actions]),
  });

  const [selectedSlotForPicker, setSelectedSlotForPicker] = useState<number | null>(null);

  /* ── Photo picker only offers UNUSED photos, so the same photo is never
     placed twice. When everything's used, the picker asks for more. ── */
  const usedPhotoIndices = useMemo(() => {
    const used = new Set<number>();
    actions.albumPages.forEach((p) => (p.slotFills ?? []).forEach((f) => { if (f != null) used.add(f); }));
    return used;
  }, [actions.albumPages]);

  const availablePhotos = useMemo(
    () => actions.uploadedPhotos
      .map((photo, idx) => ({ photo, idx }))
      .filter(({ idx }) => !usedPhotoIndices.has(idx)),
    [actions.uploadedPhotos, usedPhotoIndices],
  );

  /* ── Report selection changes upward to Builder.tsx ── */
  useEffect(() => {
    onSelectionChange?.({ selectedPhotoId, selectedSlotIndex, selectedTextId });
  }, [selectedPhotoId, selectedSlotIndex, selectedTextId, onSelectionChange]);

  /* ── Sync canvas selections to builder context (for assistant access) ── */
  useEffect(() => {
    actions.setSelectedPhotoId(selectedPhotoId);
  }, [selectedPhotoId, actions]);
  useEffect(() => {
    actions.setSelectedSlotIndex(selectedSlotIndex);
  }, [selectedSlotIndex, actions]);
  useEffect(() => {
    actions.setSelectedTextId(selectedTextId);
  }, [selectedTextId, actions]);

  /* ── Derived selections ── */
  const currentPage = actions.currentPage;

  /* ── Empty state detection ── */
  const isPageEmpty = useMemo(() => {
    const hasSlotFills = currentPage.slotFills?.some((f) => f !== null) ?? false;
    const hasFreeformPhotos = currentPage.photos.length > 0;
    const hasText = currentPage.textElements.length > 0;
    return !hasSlotFills && !hasFreeformPhotos && !hasText;
  }, [currentPage.slotFills, currentPage.photos.length, currentPage.textElements.length]);

  const hasTemplateButEmpty = useMemo(() => {
    return (currentPage.slotFills?.length ?? 0) > 0 && !(currentPage.slotFills?.some((f) => f !== null) ?? false);
  }, [currentPage.slotFills]);

  const selectedPhoto: CanvasPhoto | null = useMemo(
    () => (selectedPhotoId ? currentPage.photos.find((p) => p.id === selectedPhotoId) ?? null : null),
    [selectedPhotoId, currentPage.photos],
  );

  const selectedText: TextElement | null = useMemo(
    () => (selectedTextId ? currentPage.textElements.find((t) => t.id === selectedTextId) ?? null : null),
    [selectedTextId, currentPage.textElements],
  );

  /* Megy owns every mutation — background writes go through dispatch, not the store. */
  const { dispatch } = useBuilderContext();

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
    (bg: typeof background) => { void dispatch({ type: 'set_background', payload: { background: bg }, rawMessage: 'set background' }); },
    [dispatch],
  );

  const handleApplyBackgroundToAll = useCallback(
    () => { void dispatch({ type: 'set_background', payload: { background, applyAll: true }, rawMessage: 'apply background to all pages' }); },
    [dispatch, background],
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

  /* Shuffle layout: pick a random template matching photosPerPage and auto-fill */
  const handleShuffleLayout = useCallback(() => {
    const targetSlotCount = actions.photosPerPage ?? (
      currentPage.templateId
        ? PAGE_TEMPLATES.find((t) => t.id === currentPage.templateId)?.slotCount ?? 1
        : 1
    );
    const matches = PAGE_TEMPLATES.filter(
      (t) => t.slotCount === targetSlotCount && t.id !== currentPage.templateId,
    );
    if (matches.length > 0) {
      const randomId = templateTracker.pick(matches.map(t => t.id), currentPage.templateId) ?? matches[Math.floor(Math.random() * matches.length)].id;
      void dispatch({ type: 'change_template', payload: { templateId: randomId }, rawMessage: 'change template' });
      void dispatch({ type: 'auto_fill', rawMessage: 'auto fill' });
    }
  }, [actions, currentPage.templateId, actions.photosPerPage]);

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
              ) : availablePhotos.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-[#6B6B6B] font-medium mb-1">
                    All your photos are already in the album.
                  </p>
                  <p className="text-xs text-[#9B9B9B] mb-4">
                    Add more photos to swap in something new.
                  </p>
                  <button
                    onClick={() => { setShowPhotoPicker(false); _onAction?.('trigger-upload'); }}
                    className="px-5 py-2 bg-[#F4C2A1] text-white text-sm font-semibold rounded-lg hover:brightness-105 inline-flex items-center gap-2"
                  >
                    <Upload size={14} /> Add Photos
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
                  {availablePhotos.map(({ photo, idx }) => (
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
        {/* ── Unified Panel (LEFT side) — hidden by default ── */}
        {sidebarVisible && (
          <UnifiedPanel
            uploadedPhotos={actions.uploadedPhotos}
            onAddPhotos={(files) => { void dispatch({ type: 'add_photos', payload: { files }, rawMessage: 'add photos' }); }}
            albumPages={actions.albumPages}
            currentPageIndex={actions.currentPageIndex}
            selectedPhotoId={selectedPhotoId}
            selectedTextId={selectedTextId}
            onGoToPage={actions.goToPage}
            onAddPage={() => { void dispatch({ type: 'add_page', rawMessage: 'add page' }); }}
            onDeletePage={(idx) => { void dispatch({ type: 'delete_page', payload: { pageIndex: idx }, rawMessage: 'delete page' }); }}
            onDuplicatePage={(idx) => { void dispatch({ type: 'duplicate_page', payload: { pageIndex: idx }, rawMessage: 'duplicate page' }); }}
            onAddText={handleAddText}
            currentTemplateId={currentPage.templateId}
            onSetTemplate={(id) => { void dispatch({ type: 'change_template', payload: { templateId: id }, rawMessage: 'change template' }); }}
            onAutoFill={() => { void dispatch({ type: 'auto_fill', rawMessage: 'auto fill' }); }}
            onClearAllSlots={() => { void dispatch({ type: 'clear_slots', rawMessage: 'clear slots' }); }}
            photosPerPage={actions.photosPerPage}
            onSetPhotosPerPage={(count) => { void dispatch({ type: 'set_photos_per_page', payload: { count }, rawMessage: 'set photos per page' }); }}
            onShuffleLayout={handleShuffleLayout}
            selectedPhoto={selectedPhoto}
            selectedText={selectedText}
            selectedBackground={selectedBg ? (background as any) : null}
            background={background}
            selectedSlotIndex={selectedSlotIndex}
            slotFills={slotFills}
            slotScales={slotScales}
            slotOffsetsX={slotOffsetsX}
            slotOffsetsY={slotOffsetsY}
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
            onApplyBackgroundToAll={handleApplyBackgroundToAll}
            onClearSlot={handleClearSlot}
            onSetSlotScale={handleSetSlotScale}
            onSetSlotOffset={handleSetSlotOffset}
            onReplaceSlotPhoto={handleReplaceSlotPhoto}
            getPageSnapshot={actions.getPageSnapshot}
          />
        )}

        {/* ── Canvas Area ── */}
        <div className="flex-1 flex flex-col relative overflow-hidden">
          {/* Sidebar toggle — hidden in orchestrator mode (Ctrl+Shift+S still works) */}
          {!ORCHESTRATOR_MODE && !sidebarVisible && (
            <button
              onClick={() => setSidebarVisible(true)}
              className="absolute top-3 left-3 z-40 flex items-center gap-1.5 px-3 py-2 bg-white rounded-xl shadow-md border border-[#E8E8E8] text-xs font-medium text-[#6B6B6B] hover:text-[#F4C2A1] hover:border-[#F4C2A1]/30 transition-all"
              title="Show sidebar (Ctrl+Shift+S)"
            >
              <PanelLeftOpen size={14} />
              <span className="hidden sm:inline">Panels</span>
            </button>
          )}

          {/* Toolbar */}
          <div className="h-10 bg-white border-b border-[#E8E8E8] flex items-center justify-between px-3 shrink-0">
            <div className="flex items-center gap-1">
              {/* Home → Homepage */}
              <Link
                to="/"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[#6B6B6B] hover:bg-[#F0F0F0] hover:text-[#F4C2A1] transition-all mr-1"
                title="Go to homepage"
              >
                <Home size={16} />
                <span className="text-xs font-semibold">Home</span>
              </Link>

              {!ORCHESTRATOR_MODE && (
              <>
              <div className="w-px h-5 bg-[#E8E8E8] mx-1" />

              <button
                onClick={() => actions.setPhase('setup')}
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
                onClick={() => setShowGrid((v: boolean) => !v)}
                className={`p-1.5 rounded-md text-[#6B6B6B] transition-colors ${showGrid ? 'bg-[#FDE8E4] text-[#E8A598]' : 'hover:bg-[#F0F0F0]'}`}
                title="Toggle grid"
              >
                <Grid3X3 size={14} />
              </button>

              {/* Snap */}
              <button
                onClick={() => setSnapEnabled((v: boolean) => !v)}
                className={`p-1.5 rounded-md text-[#6B6B6B] transition-colors ${snapEnabled ? 'bg-[#FDE8E4] text-[#E8A598]' : 'hover:bg-[#F0F0F0]'}`}
                title="Toggle snap to grid"
              >
                <Magnet size={14} />
              </button>
              </>
              )}

            </div>

            <div className="flex items-center gap-2">
              <CloudSaveStatus
                status={actions.cloudSaveStatus}
                lastSavedAt={actions.lastSavedAt}
                isLoggedIn={!!user}
                onManualSave={actions.manualSave}
              />
              <div className="w-px h-5 bg-[#E8E8E8] mx-1" />
              <span className="text-xs text-[#9B9B9B]">
                Page {actions.currentPageIndex + 1} of {actions.albumPages.length}
              </span>

              {/* Generate / Regenerate / Generate All — hidden in orchestrator mode (use Megy) */}
              {ORCHESTRATOR_MODE ? null : isPageEmpty ? (
                <>
                  {onGenerate && (
                    <button
                      onClick={onGenerate}
                      title="Generate layout for this page"
                      className="px-3 py-1.5 bg-[#B8A9D9] text-white text-xs font-semibold rounded-lg hover:brightness-105 flex items-center gap-1 transition-all"
                    >
                      <Wand2 size={12} /> Generate
                    </button>
                  )}
                  {onGenerateAll && (
                    <button
                      onClick={onGenerateAll}
                      title="Generate all pages from uploaded photos"
                      className="px-3 py-1.5 bg-white border border-[#B8A9D9] text-[#B8A9D9] text-xs font-semibold rounded-lg hover:bg-[#B8A9D9] hover:text-white flex items-center gap-1 transition-all"
                    >
                      <Sparkles size={12} /> Generate All
                    </button>
                  )}
                </>
              ) : (
                <>
                  {onRegenerate && (
                    <button
                      onClick={onRegenerate}
                      title="Regenerate album with new random layouts"
                      className="px-3 py-1.5 bg-white border border-[#B8A9D9] text-[#B8A9D9] text-xs font-semibold rounded-lg hover:bg-[#B8A9D9] hover:text-white flex items-center gap-1 transition-all"
                    >
                      <Sparkles size={12} /> Regenerate
                    </button>
                  )}
                  {onGenerateAll && (
                    <button
                      onClick={onGenerateAll}
                      title="Generate all pages from uploaded photos"
                      className="px-3 py-1.5 bg-white border border-[#B8A9D9] text-[#B8A9D9] text-xs font-semibold rounded-lg hover:bg-[#B8A9D9] hover:text-white flex items-center gap-1 transition-all"
                    >
                      <Sparkles size={12} /> Generate All
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Canvas */}
          <div
            ref={containerRef}
            className="flex-1 overflow-auto flex p-4 pb-24 md:p-8"
            title="Scroll to navigate pages. Ctrl+Scroll to zoom."
          >
            <div className="flex flex-col items-center gap-2 m-auto">
              {/* Page number above the page */}
              <span className="text-xs font-medium text-[#6B6B6B] tabular-nums">
                Page {actions.currentPageIndex + 1} of {actions.albumPages.length}
              </span>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="shadow-xl relative"
              style={{ boxShadow: '0 8px 32px rgba(45,45,45,0.15)' }}
            >
              {/* Fabric owns the canvas display size (CSS) via the fit routine —
                  no inline width/height here, or it would clobber the fit. */}
              <canvas ref={canvasElRef} />

              {/* Empty State Overlay */}
              <AnimatePresence>
                {isPageEmpty && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="absolute inset-0 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm rounded-sm z-10"
                  >
                    <div className="text-center px-6">
                      <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-[#FDE8E4] flex items-center justify-center">
                        <Wand2 size={24} className="text-[#E8A598]" />
                      </div>
                      <h3 className="font-display text-base font-semibold text-[#2D2D2D] mb-2">
                        This page is empty
                      </h3>
                      <p className="text-sm text-[#9B9B9B] mb-6 max-w-[260px] mx-auto">
                        {actions.uploadedPhotos.length === 0
                          ? 'Upload photos to get started with your album.'
                          : hasTemplateButEmpty
                            ? 'Your template is ready. Fill the slots with your photos or generate a layout automatically.'
                            : 'Generate a layout to fill this page with your photos.'}
                      </p>
                      <div className="flex flex-col gap-2 items-center">
                        {actions.uploadedPhotos.length > 0 && onGenerate && (
                          <button
                            onClick={onGenerate}
                            className="px-5 py-2 bg-[#B8A9D9] text-white text-sm font-semibold rounded-lg hover:brightness-105 flex items-center gap-2 transition-all"
                          >
                            <Wand2 size={14} /> Generate Layout
                          </button>
                        )}
                        {actions.uploadedPhotos.length === 0 && (
                          <button
                            onClick={() => _onAction?.('trigger-upload')}
                            className="px-5 py-2 bg-[#F4C2A1] text-white text-sm font-semibold rounded-lg hover:brightness-105 flex items-center gap-2 transition-all"
                          >
                            <Upload size={14} /> Upload Photos
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

              {/* Page navigation — prev / next arrows below the page */}
              {actions.albumPages.length > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => actions.goToPage(actions.currentPageIndex - 1)}
                    disabled={actions.currentPageIndex === 0}
                    title="Previous page"
                    aria-label="Previous page"
                    className="w-9 h-9 flex items-center justify-center rounded-full bg-white border border-[#E8E8E8] text-[#6B6B6B] hover:bg-[#FDE8E4] hover:text-[#E8A598] hover:border-[#F4C2A1] disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <div className="w-px h-5 bg-[#E8E8E8]" />
                  <button
                    onClick={() => actions.goToPage(actions.currentPageIndex + 1)}
                    disabled={actions.currentPageIndex >= actions.albumPages.length - 1}
                    title="Next page"
                    aria-label="Next page"
                    className="w-9 h-9 flex items-center justify-center rounded-full bg-white border border-[#E8E8E8] text-[#6B6B6B] hover:bg-[#FDE8E4] hover:text-[#E8A598] hover:border-[#F4C2A1] disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              )}
            </div>
          </div>
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
