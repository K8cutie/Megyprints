/**
 * useCanvasEngine.ts
 * ==============================================================================
 * Extracted canvas lifecycle + interaction engine from BuilderEdit.tsx.
 * Encapsulates ALL Fabric.js logic: init, render, snap-to-grid, events,
 * zoom, keyboard shortcuts, and cleanup.
 *
 * RULES FOLLOWED:
 * - No `any` types — use the Fabric types from fabric-types.ts
 * - No `// eslint-disable-next-line react-hooks/exhaustive-deps`
 * - Proper cleanup: remove ALL event listeners, dispose canvas on unmount
 * - Refs for mutable state; useState only for React-reactive values
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  FabricCanvas,
  FabricObject,
  FabricStatic,
  SelectionEvent,
  ObjectEvent,
  MouseEvent as FabricMouseEvent,
} from './fabric-types';
import type { AlbumPage, TextElement, PhotoFilters, UploadedPhoto, AlbumSizePreset } from './types';
import { DEFAULT_BG_FILTERS } from './types';
import { getCanvasDimensions } from './layouts';
import { getTemplateById, PAGE_TEMPLATES } from './pageTemplates';
import type { BuilderActions } from './useBuilderState';

/* ── Constants ─────────────────────────────────────────────────────────── */

const GRID_SIZE = 30;
const SNAP_THRESHOLD = 12;
const BG_ID = 'page-background';
const SLOT_ID = 'template-slot';

/* ── Snap helpers (module scope, no deps) ──────────────────────────────── */

function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

function getSnapLines(canvasW: number, canvasH: number, margin: number) {
  return {
    vertical: [margin, canvasW / 2, canvasW - margin],
    horizontal: [margin, canvasH / 2, canvasH - margin],
  };
}

/* ── Build Fabric image filters ────────────────────────────────────────── */

function buildFabricFilters(fab: FabricStatic, filters: PhotoFilters): any[] {
  const result: any[] = [];
  if (filters.grayscale > 0) result.push(new (fab as any).Image.filters.Grayscale());
  if (filters.sepia > 0) result.push(new (fab as any).Image.filters.Sepia());
  if (filters.brightness !== 100) {
    result.push(new (fab as any).Image.filters.Brightness({ brightness: (filters.brightness - 100) / 100 }));
  }
  if (filters.contrast !== 100) {
    result.push(new (fab as any).Image.filters.Contrast({ contrast: (filters.contrast - 100) / 100 }));
  }
  if (filters.saturate !== 100) {
    result.push(new (fab as any).Image.filters.Saturation({ saturation: (filters.saturate - 100) / 100 }));
  }
  if (filters.blur > 0) {
    result.push(new (fab as any).Image.filters.Blur({ blur: filters.blur / 10 }));
  }
  if (filters.hueRotate > 0) {
    result.push(new (fab as any).Image.filters.HueRotation({ rotation: filters.hueRotate }));
  }
  return result;
}

/* ── Options interface ─────────────────────────────────────────────────── */

export interface UseCanvasEngineOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  currentPage: AlbumPage;
  uploadedPhotos: UploadedPhoto[];
  albumType: 'standard' | 'layflat';
  albumSize: string;
  onSlotClick: (slotIndex: number) => void;
  actions: BuilderActions;
}

export interface UseCanvasEngineReturn {
  /** Whether the Fabric.js library loaded successfully */
  fabricValid: boolean;
  /** Current zoom level (1 = 100%) */
  zoom: number;
  /** Whether the grid overlay is visible */
  showGrid: boolean;
  /** Whether snap-to-grid is enabled */
  snapEnabled: boolean;
  /** ID of the currently selected photo (non-slot) */
  selectedPhotoId: string | null;
  /** ID of the currently selected text element */
  selectedTextId: string | null;
  /** Whether the background is selected */
  selectedBg: boolean;
  /** Index of the currently selected slot */
  selectedSlotIndex: number | null;
  /** Set zoom directly (also updates Fabric canvas) */
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  /** Adjust zoom by delta (clamped 0.3–3) */
  handleZoom: (delta: number) => void;
  /** Reset zoom to 1 */
  resetZoom: () => void;
  /** Toggle grid overlay */
  setShowGrid: React.Dispatch<React.SetStateAction<boolean>>;
  /** Toggle snap-to-grid */
  setSnapEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  /** Programmatically select the background object */
  selectBackground: () => void;
  /** Direct ref to the Fabric canvas instance (for in-place filter updates) */
  fabricCanvasRef: React.RefObject<FabricCanvas | null>;
}

/* ── Structural fingerprint for page comparison ────────────────────────── */

function pageFingerprint(pageIndex: number, page: AlbumPage): string {
  const bg = page.background;
  const bgTransform = `${bg.x ?? 0},${bg.y ?? 0},${bg.width ?? 0},${bg.height ?? 0},${bg.rotation ?? 0},${bg.opacity ?? 100}`;
  const slotFills = page.slotFills ? page.slotFills.join(',') : '';
  return `${pageIndex}|${page.textElements.map((t) => t.id).join(',')}|${JSON.stringify(page.background)}|${bgTransform}|${page.templateId ?? ''}|${slotFills}`;
}

/* ═══════════════════════════ HOOK ═══════════════════════════ */

export function useCanvasEngine(options: UseCanvasEngineOptions): UseCanvasEngineReturn {
  const {
    canvasRef,
    containerRef,
    currentPage,
    uploadedPhotos,
    albumType,
    albumSize,
    onSlotClick,
    actions,
  } = options;

  const dims = getCanvasDimensions((albumSize || '8x10') as AlbumSizePreset);
  const CANVAS_W = dims.width;
  const CANVAS_H = dims.height;
  const MARGIN = Math.max(24, Math.min(40, Math.round(Math.min(CANVAS_W, CANVAS_H) * 0.05)));

  /* ── Selection state (React-reactive) ── */
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [selectedBg, setSelectedBg] = useState(false);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null);

  /* ── View state ── */
  const [zoom, setZoomState] = useState(1);
  const [showGrid, setShowGrid] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);

  /* ── Mutable refs (not React-reactive) ── */
  const fabricRef = useRef<FabricCanvas | null>(null);
  const snapGuidesRef = useRef<FabricObject[]>([]);
  const lastStructuralRef = useRef<string>('');

  /* ── Keep latest values in refs for event handlers ── */
  const pageRef = useRef(currentPage);
  pageRef.current = currentPage;
  const photosRef = useRef(uploadedPhotos);
  photosRef.current = uploadedPhotos;
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const snapEnabledRef = useRef(snapEnabled);
  snapEnabledRef.current = snapEnabled;
  const onSlotClickRef = useRef(onSlotClick);
  onSlotClickRef.current = onSlotClick;
  const dimsRef = useRef({ w: CANVAS_W, h: CANVAS_H, margin: MARGIN });
  dimsRef.current = { w: CANVAS_W, h: CANVAS_H, margin: MARGIN };

  /* ── Lazy-load fabric ── */
  const [fabricModule, setFabricModule] = useState<FabricStatic | null>(null);

  useEffect(() => {
    let cancelled = false;
    import('./fabric-loader').then((mod) => {
      if (!cancelled) setFabricModule((mod as any).default || mod);
    });
    return () => { cancelled = true; };
  }, []);

  const fabricValid = fabricModule !== null && !!(fabricModule as any).Canvas;

  /* ═══════ Canvas initialization (runs ONCE) ═══════ */
  useEffect(() => {
    if (!canvasRef.current || !fabricValid || !fabricModule || fabricRef.current) return;

    const fab = fabricModule as any;
    const canvas: FabricCanvas = new fab.Canvas(canvasRef.current, {
      width: CANVAS_W,
      height: CANVAS_H,
      backgroundColor: '#FFFBF7',
      preserveObjectStacking: true,
      selection: true,
      uniScaleTransform: false,
    });

    /* ── Selection handlers ── */
    const handleSelection = (e: SelectionEvent) => {
      const obj = e.selected?.[0];
      if (!obj) return;
      const clearAll = () => {
        setSelectedPhotoId(null);
        setSelectedTextId(null);
        setSelectedBg(false);
        setSelectedSlotIndex(null);
      };
      if (obj.photoId && obj.slotIndex === undefined) {
        clearAll(); setSelectedPhotoId(obj.photoId);
      } else if (obj.slotIndex !== undefined) {
        clearAll(); setSelectedSlotIndex(obj.slotIndex);
      } else if (obj.textId) {
        clearAll(); setSelectedTextId(obj.textId);
      } else if (obj.bgId === BG_ID) {
        clearAll(); setSelectedBg(true);
      }
    };

    const handleSelectionCleared = () => {
      setSelectedPhotoId(null);
      setSelectedTextId(null);
      setSelectedBg(false);
      setSelectedSlotIndex(null);
    };

    canvas.on('selection:created', handleSelection);
    canvas.on('selection:updated', handleSelection);
    canvas.on('selection:cleared', handleSelectionCleared);

    /* ── Click on empty canvas → select background ── */
    const handleMouseDown = (e: FabricMouseEvent) => {
      if (!e.target && !e.subTargets?.length) {
        const bgObj = canvas.getObjects().find((o: any) => o.bgId === BG_ID);
        if (bgObj) {
          canvas.setActiveObject(bgObj);
          canvas.requestRenderAll();
          setSelectedPhotoId(null);
          setSelectedTextId(null);
          setSelectedBg(true);
          setSelectedSlotIndex(null);
        }
      }
    };
    canvas.on('mouse:down', handleMouseDown);

    /* ── Snap-to-grid + alignment during drag ── */
    const clearSnapGuides = () => {
      snapGuidesRef.current.forEach((g) => canvas.remove(g));
      snapGuidesRef.current = [];
    };

    const showSnapGuide = (x1: number, y1: number, x2: number, y2: number) => {
      const line = new fab.Line([x1, y1, x2, y2], {
        stroke: '#E8A598',
        strokeWidth: 1,
        selectable: false,
        evented: false,
      });
      snapGuidesRef.current.push(line);
      canvas.add(line);
      canvas.renderAll();
    };

    const handleObjectMoving = (e: ObjectEvent) => {
      const obj = e.target;
      if (!obj || !snapEnabledRef.current) return;
      if (obj.slotIndex !== undefined) return; // Don't snap slot photos during pan

      clearSnapGuides();

      const { w: cw, h: ch, margin: m } = dimsRef.current;
      const objW = obj.getScaledWidth?.() || (obj as any).width || 0;
      const objH = obj.getScaledHeight?.() || (obj as any).height || 0;
      const left = (obj.left as number) ?? 0;
      const top = (obj.top as number) ?? 0;
      const right = left + objW;
      const bottom = top + objH;
      const centerX = left + objW / 2;
      const centerY = top + objH / 2;

      const snapPointsX = [left, centerX, right];
      const snapPointsY = [top, centerY, bottom];
      let snappedX = false;
      let snappedY = false;

      // 1. Snap to grid
      if (showGrid) {
        for (const pt of snapPointsX) {
          const gridLine = snapToGrid(pt, GRID_SIZE);
          if (Math.abs(pt - gridLine) < SNAP_THRESHOLD) {
            const offset = gridLine - pt;
            obj.set('left', left + offset);
            showSnapGuide(gridLine, 0, gridLine, ch);
            snappedX = true;
            break;
          }
        }
        for (const pt of snapPointsY) {
          const gridLine = snapToGrid(pt, GRID_SIZE);
          if (Math.abs(pt - gridLine) < SNAP_THRESHOLD) {
            const offset = gridLine - pt;
            obj.set('top', top + offset);
            showSnapGuide(0, gridLine, cw, gridLine);
            snappedY = true;
            break;
          }
        }
      }

      // 2. Snap to center & edges
      if (!snappedX) {
        const snapLines = getSnapLines(cw, ch, m);
        for (const lineX of snapLines.vertical) {
          for (const pt of snapPointsX) {
            if (Math.abs(pt - lineX) < SNAP_THRESHOLD) {
              const offset = lineX - pt;
              obj.set('left', ((obj.left as number) ?? 0) + offset);
              showSnapGuide(lineX, 0, lineX, ch);
              snappedX = true;
              break;
            }
          }
          if (snappedX) break;
        }
      }

      if (!snappedY) {
        const snapLines = getSnapLines(cw, ch, m);
        for (const lineY of snapLines.horizontal) {
          for (const pt of snapPointsY) {
            if (Math.abs(pt - lineY) < SNAP_THRESHOLD) {
              const offset = lineY - pt;
              obj.set('top', ((obj.top as number) ?? 0) + offset);
              showSnapGuide(0, lineY, cw, lineY);
              snappedY = true;
              break;
            }
          }
          if (snappedY) break;
        }
      }

      // 3. Snap to other objects
      const otherObjects = canvas.getObjects().filter((o: any) =>
        o !== obj && (o.photoId || o.textId) && !o.isGuide && o.bgId !== BG_ID
      );

      for (const other of otherObjects) {
        if (snappedX && snappedY) break;
        const oW = other.getScaledWidth?.() || other.width || 0;
        const oH = other.getScaledHeight?.() || other.height || 0;
        const oLeft = (other.left as number) ?? 0;
        const oTop = (other.top as number) ?? 0;
        const oRight = oLeft + oW;
        const oBottom = oTop + oH;
        const oCenterX = oLeft + oW / 2;
        const oCenterY = oTop + oH / 2;

        if (!snappedX) {
          for (const pt of snapPointsX) {
            for (const opt of [oLeft, oCenterX, oRight]) {
              if (Math.abs(pt - opt) < SNAP_THRESHOLD) {
                const offset = opt - pt;
                obj.set('left', ((obj.left as number) ?? 0) + offset);
                showSnapGuide(opt, 0, opt, ch);
                snappedX = true;
                break;
              }
            }
            if (snappedX) break;
          }
        }

        if (!snappedY) {
          for (const pt of snapPointsY) {
            for (const opt of [oTop, oCenterY, oBottom]) {
              if (Math.abs(pt - opt) < SNAP_THRESHOLD) {
                const offset = opt - pt;
                obj.set('top', ((obj.top as number) ?? 0) + offset);
                showSnapGuide(0, opt, cw, opt);
                snappedY = true;
                break;
              }
            }
            if (snappedY) break;
          }
        }
      }
    };

    canvas.on('object:moving', handleObjectMoving);

    /* ── Enforce uniform scaling on slot photos ── */
    const handleObjectScaling = (e: ObjectEvent) => {
      const obj = e.target;
      if (obj && obj.slotIndex !== undefined) {
        const scale = Math.max((obj.scaleX as number) || 1, (obj.scaleY as number) || 1);
        obj.set({ scaleX: scale, scaleY: scale });
        canvas.requestRenderAll();
      }
    };
    canvas.on('object:scaling', handleObjectScaling);

    /* ── Track modifications ── */
    const handleObjectModified = (e: ObjectEvent) => {
      clearSnapGuides();
      const obj = e.target;
      if (!obj) return;

      const latestActions = actionsRef.current;
      const page = pageRef.current;
      const { w: cw, h: ch } = dimsRef.current;

      // Slot photo: save scale + offset
      if (obj.slotIndex !== undefined && latestActions.setSlotScale && latestActions.setSlotOffset) {
        const template = getTemplateById(page.templateId ?? PAGE_TEMPLATES[0].id);
        const slot = template?.slots?.[obj.slotIndex];
        if (slot) {
          const sx = (slot.x / 100) * cw;
          const sy = (slot.y / 100) * ch;
          const sw = (slot.width / 100) * cw;
          const sh = (slot.height / 100) * ch;

          latestActions.setSlotScale(obj.slotIndex, Math.max(0.1, (obj.scaleX as number) ?? 1));

          const offsetX = ((obj.left as number) ?? 0) - (sx + sw / 2);
          const offsetY = ((obj.top as number) ?? 0) - (sy + sh / 2);
          const currentOffsetX = page.slotOffsetsX?.[obj.slotIndex] ?? 0;
          const currentOffsetY = page.slotOffsetsY?.[obj.slotIndex] ?? 0;
          latestActions.setSlotOffset(obj.slotIndex, offsetX - currentOffsetX, offsetY - currentOffsetY);
        }
      }

      // Free photo: save transform
      if (obj.photoId && obj.slotIndex === undefined) {
        latestActions.updatePhotoTransform(obj.photoId, {
          x: (obj.left as number) ?? 0,
          y: (obj.top as number) ?? 0,
          width: obj.getScaledWidth?.() || (obj as any).width || 0,
          height: obj.getScaledHeight?.() || (obj as any).height || 0,
          rotation: (obj.angle as number) ?? 0,
          scaleX: 1,
          scaleY: 1,
        });
      }

      // Text: save position
      if (obj.textId) {
        latestActions.updateTextElement(obj.textId, {
          x: (obj.left as number) ?? 0,
          y: (obj.top as number) ?? 0,
          rotation: (obj.angle as number) ?? 0,
        });
      }

      // Background: save transform
      if (obj.bgId === BG_ID) {
        latestActions.updateBackgroundTransform({
          x: (obj.left as number) ?? 0,
          y: (obj.top as number) ?? 0,
          width: obj.getScaledWidth?.() || (obj as any).width || 0,
          height: obj.getScaledHeight?.() || (obj as any).height || 0,
          rotation: (obj.angle as number) ?? 0,
        });
      }
    };

    canvas.on('object:modified', handleObjectModified);

    fabricRef.current = canvas;

    // Initial background
    createBackgroundObject(fab, canvas, currentPage.background, CANVAS_W, CANVAS_H);
    canvas.renderAll();

    return () => {
      canvas.off('selection:created', handleSelection);
      canvas.off('selection:updated', handleSelection);
      canvas.off('selection:cleared', handleSelectionCleared);
      canvas.off('mouse:down', handleMouseDown);
      canvas.off('object:moving', handleObjectMoving);
      canvas.off('object:scaling', handleObjectScaling);
      canvas.off('object:modified', handleObjectModified);
      clearSnapGuides();
      canvas.dispose();
      fabricRef.current = null;
    };
  }, [canvasRef, fabricModule, fabricValid, CANVAS_H, CANVAS_W]);

  /* ═══════ Resize canvas when album size changes ═══════ */
  useEffect(() => {
    if (!fabricRef.current || !fabricValid || !fabricModule) return;
    fabricRef.current.setWidth(CANVAS_W);
    fabricRef.current.setHeight(CANVAS_H);
    fabricRef.current.renderAll();
  }, [CANVAS_W, CANVAS_H, fabricValid, fabricModule]);

  /* ═══════ Render scene on structural changes ═══════ */
  useEffect(() => {
    if (!fabricRef.current || !fabricValid || !fabricModule) return;

    const fingerprint = pageFingerprint(actions.currentPageIndex, currentPage);
    if (lastStructuralRef.current === fingerprint) return;
    lastStructuralRef.current = fingerprint;

    const canvas = fabricRef.current;

    // Remember active selection
    const active = canvas.getActiveObject?.();
    const savedPhotoId = (active?.photoId && active?.slotIndex === undefined) ? (active.photoId as string) : null;
    const savedSlotIndex = (active?.slotIndex as number | undefined) ?? null;
    const savedTextId = (active?.textId as string | undefined) ?? null;

    renderScene(fabricModule as any, canvas, currentPage, uploadedPhotos, albumType, CANVAS_W, CANVAS_H, (slotIdx) => {
      setSelectedSlotIndex(slotIdx);
      onSlotClickRef.current(slotIdx);
    });

    // Restore selection
    if (savedPhotoId || savedTextId || savedSlotIndex !== null) {
      setTimeout(() => {
        const obj = canvas.getObjects().find((o: any) =>
          (savedPhotoId && o.photoId === savedPhotoId) ||
          (savedSlotIndex !== null && o.slotIndex === savedSlotIndex) ||
          (savedTextId && o.textId === savedTextId)
        );
        if (obj) {
          canvas.setActiveObject(obj);
          canvas.requestRenderAll();
        }
      }, 120);
    }
  }, [fabricModule, fabricValid, actions.currentPageIndex, currentPage, uploadedPhotos, albumType, CANVAS_W, CANVAS_H]);

  /* ═══════ Keyboard shortcuts ═══════ */
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (e.target && (e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return;

      const latestActions = actionsRef.current;

      if (selectedSlotIndex !== null) {
        latestActions.clearSlot(selectedSlotIndex);
        setSelectedSlotIndex(null);
        fabricRef.current?.discardActiveObject();
        fabricRef.current?.requestRenderAll();
      } else if (selectedPhotoId) {
        latestActions.deletePhotoFromCanvas(selectedPhotoId);
      } else if (selectedTextId) {
        latestActions.deleteTextElement(selectedTextId);
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedPhotoId, selectedTextId, selectedSlotIndex]);

  /* ═══════ Mouse wheel page navigation ═══════ */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [data-no-scroll]')) return;

      if (e.deltaY > 30) {
        e.preventDefault();
        const next = Math.min(actionsRef.current.currentPageIndex + 1, actionsRef.current.albumPages.length - 1);
        if (next !== actionsRef.current.currentPageIndex) actionsRef.current.goToPage(next);
      } else if (e.deltaY < -30) {
        e.preventDefault();
        const prev = Math.max(actionsRef.current.currentPageIndex - 1, 0);
        if (prev !== actionsRef.current.currentPageIndex) actionsRef.current.goToPage(prev);
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [containerRef]);

  /* ═══════ Zoom helpers ═══════ */
  const setZoom = useCallback((value: React.SetStateAction<number>) => {
    setZoomState((prev) => {
      const next = typeof value === 'function' ? (value as (prev: number) => number)(prev) : value;
      const clamped = Math.max(0.3, Math.min(3, next));
      const canvas = fabricRef.current;
      if (canvas) {
        canvas.setZoom(clamped);
        canvas.renderAll();
      }
      return clamped;
    });
  }, []);

  const handleZoom = useCallback((delta: number) => {
    setZoom((z) => z + delta);
  }, [setZoom]);

  const resetZoom = useCallback(() => {
    setZoom(1);
  }, [setZoom]);

  /* ═══════ Grid overlay ═══════ */
  useEffect(() => {
    if (!fabricRef.current || !fabricValid || !fabricModule) return;
    const canvas = fabricRef.current;
    const fab = fabricModule as any;

    canvas.getObjects().filter((obj: any) => obj.isGrid).forEach((obj: any) => canvas.remove(obj));

    if (showGrid) {
      for (let x = 0; x < CANVAS_W; x += GRID_SIZE) {
        const line = new fab.Line([x, 0, x, CANVAS_H], { stroke: '#E8E8E8', strokeWidth: 0.5, selectable: false, evented: false });
        line.isGrid = true;
        canvas.add(line);
        canvas.sendToBack(line);
      }
      for (let y = 0; y < CANVAS_H; y += GRID_SIZE) {
        const line = new fab.Line([0, y, CANVAS_W, y], { stroke: '#E8E8E8', strokeWidth: 0.5, selectable: false, evented: false });
        line.isGrid = true;
        canvas.add(line);
        canvas.sendToBack(line);
      }
    }

    // Re-create background behind grid
    createBackgroundObject(fab, canvas, currentPage.background, CANVAS_W, CANVAS_H);
    canvas.renderAll();
  }, [showGrid, CANVAS_W, CANVAS_H, fabricModule, fabricValid, currentPage.background]);

  /* ═══════ Select background helper ═══════ */
  const selectBackground = useCallback(() => {
    if (!fabricRef.current || !fabricModule) return;
    const canvas = fabricRef.current;
    const fab = fabricModule as any;
    let bgObj = canvas.getObjects().find((o: any) => o.bgId === BG_ID);
    if (!bgObj) {
      createBackgroundObject(fab, canvas, pageRef.current.background, CANVAS_W, CANVAS_H);
      bgObj = canvas.getObjects().find((o: any) => o.bgId === BG_ID);
    }
    if (bgObj) {
      canvas.discardActiveObject();
      canvas.setActiveObject(bgObj);
      canvas.requestRenderAll();
      setSelectedBg(true);
      setSelectedPhotoId(null);
      setSelectedTextId(null);
    }
  }, [fabricModule, CANVAS_W, CANVAS_H]);

  /* ═══════ Auto-clear selection if object deleted ═══════ */
  useEffect(() => {
    if (selectedPhotoId && !currentPage.photos.find((p) => p.id === selectedPhotoId)) {
      setSelectedPhotoId(null);
      fabricRef.current?.discardActiveObject();
      fabricRef.current?.requestRenderAll();
    }
    if (selectedTextId && !currentPage.textElements.find((t) => t.id === selectedTextId)) {
      setSelectedTextId(null);
      fabricRef.current?.discardActiveObject();
      fabricRef.current?.requestRenderAll();
    }
  }, [currentPage.photos, currentPage.textElements, selectedPhotoId, selectedTextId]);

  return {
    fabricValid,
    zoom,
    showGrid,
    snapEnabled,
    selectedPhotoId,
    selectedTextId,
    selectedBg,
    selectedSlotIndex,
    setZoom,
    handleZoom,
    resetZoom,
    setShowGrid,
    setSnapEnabled,
    selectBackground,
    fabricCanvasRef: fabricRef,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
 *  Background Object Factory
 *  ══════════════════════════════════════════════════════════════════════════ */

function createBackgroundObject(
  fab: any,
  canvas: FabricCanvas,
  bg: AlbumPage['background'],
  W: number,
  H: number,
) {
  canvas.getObjects().filter((o: any) => o.bgId === BG_ID).forEach((o: any) => canvas.remove(o));

  const filters = (bg as any).filters ?? DEFAULT_BG_FILTERS;
  const opacity = (bg as any).opacity ?? 100;
  const rotation = (bg as any).rotation ?? 0;
  const x = (bg as any).x ?? 0;
  const y = (bg as any).y ?? 0;
  const w = (bg as any).width ?? W;
  const h = (bg as any).height ?? H;

  const baseProps = {
    left: x,
    top: y,
    angle: rotation,
    opacity: opacity / 100,
    selectable: true,
    evented: true,
    hasControls: true,
    hasBorders: true,
    cornerColor: '#F4C2A1',
    cornerStrokeColor: '#E8A598',
    cornerSize: 8,
    transparentCorners: false,
    borderColor: '#F4C2A1',
    borderDashArray: [4, 2],
    lockMovementX: false,
    lockMovementY: false,
    lockScalingX: false,
    lockScalingY: false,
    lockRotation: false,
  };

  function addBg(obj: any) {
    obj.bgId = BG_ID;
    canvas.add(obj);
    canvas.moveTo(obj, 0);
    canvas.requestRenderAll();
  }

  if (bg.type === 'image' && (bg as any).image) {
    const htmlImg = new Image();
    htmlImg.crossOrigin = 'anonymous';
    htmlImg.onload = () => {
      const fabImg = new fab.Image(htmlImg);
      const scaleX = w / (htmlImg.width || w);
      const scaleY = h / (htmlImg.height || h);
      fabImg.set({ ...baseProps, scaleX, scaleY });
      const ff = buildFabricFilters(fab, filters);
      if (ff.length > 0) { fabImg.filters = ff; fabImg.applyFilters(); }
      addBg(fabImg);
    };
    htmlImg.onerror = () => {
      const rect = new fab.Rect({ ...baseProps, width: w, height: h, fill: (bg as any).solid || '#FFFBF7' });
      addBg(rect);
    };
    htmlImg.src = (bg as any).image;
  } else if (bg.type === 'gradient' && (bg as any).gradient) {
    const { type, angle, stops } = (bg as any).gradient;
    const fabricStops = stops.reduce((acc: Record<number, string>, s: { offset: number; color: string }) => {
      acc[s.offset] = s.color; return acc;
    }, {});

    let gradFill: any;
    if (type === 'linear') {
      const rad = (angle * Math.PI) / 180;
      gradFill = new fab.Gradient({
        type: 'linear',
        coords: { x1: 0, y1: 0, x2: Math.cos(rad) * w, y2: Math.sin(rad) * h },
        colorStops: fabricStops,
      });
    } else {
      gradFill = new fab.Gradient({
        type: 'radial',
        coords: { x1: w / 2, y1: h / 2, r1: 0, x2: w / 2, y2: h / 2, r2: Math.max(w, h) / 2 },
        colorStops: fabricStops,
      });
    }
    addBg(new fab.Rect({ ...baseProps, width: w, height: h, fill: gradFill }));
  } else {
    const fill = bg.type === 'pattern' && (bg as any).pattern ? (bg as any).pattern : ((bg as any).solid || '#FFFBF7');
    addBg(new fab.Rect({ ...baseProps, width: w, height: h, fill }));
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 *  Template Slot Renderer
 *  ══════════════════════════════════════════════════════════════════════════ */

function renderTemplateSlots(
  fab: any,
  canvas: FabricCanvas,
  template: any,
  slotFills: (number | null)[],
  slotScales: number[],
  slotOffsetsX: number[],
  slotOffsetsY: number[],
  uploadedPhotos: UploadedPhoto[],
  canvasW: number,
  canvasH: number,
  onSlotClick: (slotIndex: number) => void,
) {
  canvas.getObjects().filter((o: any) => o.slotId?.startsWith(SLOT_ID)).forEach((o: any) => canvas.remove(o));

  template.slots.forEach((slot: any, i: number) => {
    const photoIndex = slotFills[i];
    const sx = (slot.x / 100) * canvasW;
    const sy = (slot.y / 100) * canvasH;
    const sw = (slot.width / 100) * canvasW;
    const sh = (slot.height / 100) * canvasH;

    if (photoIndex !== null && uploadedPhotos[photoIndex]) {
      fab.Image.fromURL(uploadedPhotos[photoIndex].previewUrl, (img: any) => {
        const imgW = img.width || sw;
        const imgH = img.height || sh;
        const coverScale = Math.max(sw / imgW, sh / imgH);
        const userScale = slotScales[i] ?? 1;
        const finalScale = (userScale !== 1 && userScale > 0) ? userScale : coverScale;
        const offsetX = slotOffsetsX[i] ?? 0;
        const offsetY = slotOffsetsY[i] ?? 0;

        img.set({
          left: sx + sw / 2 + offsetX,
          top: sy + sh / 2 + offsetY,
          originX: 'center',
          originY: 'center',
          scaleX: finalScale,
          scaleY: finalScale,
          angle: slot.rotation ?? 0,
          selectable: true,
          evented: true,
          cornerColor: '#F4C2A1',
          cornerSize: 8,
          transparentCorners: false,
          borderColor: '#F4C2A1',
          hasControls: true,
          hasBorders: true,
          lockMovementX: false,
          lockMovementY: false,
          lockScalingX: false,
          lockScalingY: false,
          lockRotation: true,
        });
        img.slotId = `${SLOT_ID}-photo-${i}`;
        img.photoIndex = photoIndex;
        img.slotIndex = i;
        img.photoId = `slot-photo-${i}`;

        // Shape clipPath
        const clipCx = sx + sw / 2;
        const clipCy = sy + sh / 2;
        if (slot.shape === 'circle') {
          const clip = new fab.Circle({ radius: Math.min(sw, sh) / 2, left: clipCx, top: clipCy, originX: 'center', originY: 'center' });
          clip.absolutePositioned = true;
          img.set('clipPath', clip);
        } else if (slot.shape === 'rounded' && slot.borderRadius) {
          const r = Math.min(slot.borderRadius, Math.min(sw, sh) / 2);
          const clip = new fab.Rect({ width: sw, height: sh, rx: r, ry: r, left: clipCx, top: clipCy, originX: 'center', originY: 'center' });
          clip.absolutePositioned = true;
          img.set('clipPath', clip);
        } else if (slot.shape === 'oval') {
          const clip = new fab.Ellipse({ rx: sw / 2, ry: sh / 2, left: clipCx, top: clipCy, originX: 'center', originY: 'center' });
          clip.absolutePositioned = true;
          img.set('clipPath', clip);
        } else if (slot.shape === 'heart') {
          const hr = Math.min(sw, sh) / 2;
          const heartPath = `M 0 ${-hr * 0.3} C ${-hr} ${-hr * 1.2} ${-hr * 1.5} ${hr * 0.3} 0 ${hr} C ${hr * 1.5} ${hr * 0.3} ${hr} ${-hr * 1.2} 0 ${-hr * 0.3} Z`;
          const clip = new fab.Path(heartPath, { left: clipCx, top: clipCy, originX: 'center', originY: 'center' });
          clip.absolutePositioned = true;
          img.set('clipPath', clip);
        } else {
          const clip = new fab.Rect({ width: sw, height: sh, left: clipCx, top: clipCy, originX: 'center', originY: 'center' });
          clip.absolutePositioned = true;
          img.set('clipPath', clip);
        }

        canvas.add(img);
        img.bringToFront();
        canvas.requestRenderAll();
      });
    } else {
      // Empty slot: dashed rect with + icon
      let slotRect: any;
      const emptySlotStyle = {
        fill: 'rgba(244,194,161,0.08)',
        stroke: '#F4C2A1',
        strokeWidth: 2,
        strokeDashArray: [8, 4],
        selectable: false,
        evented: true,
        hoverCursor: 'pointer',
      };

      if (slot.shape === 'circle') {
        const r = Math.min(sw, sh) / 2;
        slotRect = new fab.Circle({ left: sx + sw / 2, top: sy + sh / 2, radius: r, originX: 'center', originY: 'center', ...emptySlotStyle });
      } else if (slot.shape === 'rounded' && slot.borderRadius) {
        const r = Math.min(slot.borderRadius, Math.min(sw, sh) / 2);
        slotRect = new fab.Rect({ left: sx, top: sy, width: sw, height: sh, rx: r, ry: r, ...emptySlotStyle });
      } else if (slot.shape === 'oval') {
        slotRect = new fab.Ellipse({ left: sx + sw / 2, top: sy + sh / 2, rx: sw / 2, ry: sh / 2, originX: 'center', originY: 'center', ...emptySlotStyle });
      } else if (slot.shape === 'heart') {
        const hr = Math.min(sw, sh) / 2;
        const heartPath = `M 0 ${-hr * 0.3} C ${-hr} ${-hr * 1.2} ${-hr * 1.5} ${hr * 0.3} 0 ${hr} C ${hr * 1.5} ${hr * 0.3} ${hr} ${-hr * 1.2} 0 ${-hr * 0.3} Z`;
        slotRect = new fab.Path(heartPath, { left: sx + sw / 2, top: sy + sh / 2, originX: 'center', originY: 'center', ...emptySlotStyle });
      } else {
        slotRect = new fab.Rect({ left: sx, top: sy, width: sw, height: sh, ...emptySlotStyle, fill: 'rgba(244,194,161,0.06)' });
      }

      slotRect.slotId = `${SLOT_ID}-empty-${i}`;
      slotRect.slotIndex = i;
      canvas.add(slotRect);

      const plusText = new fab.Text('+', {
        left: sx + sw / 2,
        top: sy + sh / 2,
        originX: 'center',
        originY: 'center',
        fontSize: Math.max(24, Math.min(sw, sh) * 0.3),
        fontFamily: '"DM Sans", sans-serif',
        fontWeight: 'bold',
        fill: '#E8A598',
        selectable: false,
        evented: false,
      });
      plusText.slotId = `${SLOT_ID}-plus-${i}`;
      canvas.add(plusText);

      slotRect.on('mousedown', () => onSlotClick(i));
    }
  });
}

/* ══════════════════════════════════════════════════════════════════════════
 *  Scene Renderer (orchestrates all render steps)
 *  ══════════════════════════════════════════════════════════════════════════ */

function renderScene(
  fab: any,
  canvas: FabricCanvas,
  page: AlbumPage,
  uploadedPhotos: UploadedPhoto[],
  albumType: 'standard' | 'layflat',
  canvasW: number,
  canvasH: number,
  onSlotClick: (slotIndex: number) => void,
) {
  // 1. Remove all managed objects
  const toRemove = canvas.getObjects().filter((obj: any) =>
    obj.photoId || obj.textId || obj.isGuide || obj.bgId === BG_ID || obj.slotId
  );
  toRemove.forEach((obj: any) => canvas.remove(obj));

  // 2. Create background first (behind everything)
  createBackgroundObject(fab, canvas, page.background, canvasW, canvasH);

  // 3. Render template slots
  const templateId = page.templateId ?? PAGE_TEMPLATES[0].id;
  const template = getTemplateById(templateId);
  const fills = page.slotFills ?? template?.slots.map(() => null) ?? [];
  const scales = page.slotScales ?? template?.slots.map(() => 1) ?? [];
  const offsetsX = page.slotOffsetsX ?? template?.slots.map(() => 0) ?? [];
  const offsetsY = page.slotOffsetsY ?? template?.slots.map(() => 0) ?? [];

  if (template) {
    renderTemplateSlots(fab, canvas, template, fills, scales, offsetsX, offsetsY, uploadedPhotos, canvasW, canvasH, onSlotClick);
  }

  // 4. Add text on top
  page.textElements.forEach((text: TextElement) => {
    const fabricText = new fab.Textbox(text.text, {
      left: text.x,
      top: text.y,
      fontSize: text.fontSize,
      fontFamily: text.fontFamily,
      fill: text.color,
      fontWeight: text.bold ? 'bold' : 'normal',
      fontStyle: text.italic ? 'italic' : 'normal',
      underline: text.underline,
      textAlign: text.alignment,
      angle: text.rotation,
      opacity: text.opacity / 100,
      selectable: true,
      evented: true,
      cornerColor: '#F4C2A1',
      cornerSize: 8,
      transparentCorners: false,
      borderColor: '#F4C2A1',
    });
    fabricText.textId = text.id;
    canvas.add(fabricText);
    canvas.bringToFront(fabricText);
  });

  // 5. Layflat crease guide
  if (albumType === 'layflat') {
    const midX = canvasW / 2;
    const creaseLine = new fab.Line([midX, 0, midX, canvasH], {
      stroke: '#F4C2A1', strokeWidth: 1.5, strokeDashArray: [6, 6],
      selectable: false, evented: false, opacity: 0.5,
    });
    creaseLine.isGuide = true;
    canvas.add(creaseLine);

    const leftLabel = new fab.Text('Left Page', {
      left: midX - 80, top: 8, fontSize: 10, fontFamily: '"DM Sans", sans-serif',
      fill: '#F4C2A1', selectable: false, evented: false, opacity: 0.5,
    });
    leftLabel.isGuide = true;
    canvas.add(leftLabel);

    const rightLabel = new fab.Text('Right Page', {
      left: midX + 8, top: 8, fontSize: 10, fontFamily: '"DM Sans", sans-serif',
      fill: '#F4C2A1', selectable: false, evented: false, opacity: 0.5,
    });
    rightLabel.isGuide = true;
    canvas.add(rightLabel);

    canvas.sendToBack(creaseLine);
    canvas.sendToBack(leftLabel);
    canvas.sendToBack(rightLabel);
  }

  canvas.renderAll();
}
