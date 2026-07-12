/**
 * useCanvasEngine.ts
 * ==============================================================================
 * Extracted canvas lifecycle + interaction engine from BuilderEdit.tsx.
 * Encapsulates ALL Fabric.js logic: init, render, snap-to-grid, events,
 * zoom, keyboard shortcuts, and cleanup.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { qrRect } from '../../lib/qrMemory';
import { ornamentFit } from './ornaments';
import { WORDART_SHADOW } from './wordArt';
import type { QrFill, OrnamentFill } from './types';
import type {
  FabricCanvas,
  FabricObject,
  FabricStatic,
  SelectionEvent,
  ObjectEvent,
  MouseEvent as FabricMouseEvent,
} from './fabric-types';
import type { AlbumPage, TextElement, PhotoFilters, UploadedPhoto, AlbumSizePreset, FrameStyle, SlotText } from './types';
import { DEFAULT_BG_FILTERS, CORNER_POSITIONS, cornerImageUrl, resolveBgImageSrc } from './types';
import { dedupeSlotFills } from './slotUtils';
import { textureDataUri } from './textures';
import { getCanvasDimensions } from './layouts';
import { getTemplateById, PAGE_TEMPLATES, adaptTemplateToOrientation } from './pageTemplates';
import { bindingMarginFraction, bindingEdge, marginForTemplate } from './binding';
import type { BuilderActions } from './useBuilderState';

/* ── Constants ─────────────────────────────────────────────────────────── */

const GRID_SIZE = 30;
const SNAP_THRESHOLD = 12;
const BG_ID = 'page-background';
const SLOT_ID = 'template-slot';

/** Shared Fabric config for a placed slot/caption-box PHOTO: selectable (so it
 *  can be deleted/replaced via Megy) but fully locked — never manually moved,
 *  scaled, or rotated — with the red selection border and pixel-accurate hit
 *  testing. ONE definition so the photo-slot and caption-box renderers can't
 *  drift (previously copy-pasted, which the duplication gate flagged). */
const SLOT_IMAGE_LOCK = {
  selectable: true,
  evented: true,
  hasControls: false,
  hasBorders: true,
  borderColor: '#EF4444',
  borderScaleFactor: 2,
  lockMovementX: true,
  lockMovementY: true,
  lockScalingX: true,
  lockScalingY: true,
  lockRotation: true,
  hoverCursor: 'pointer',
  /* Only register clicks on visible (clipped) pixels — prevents bounding-box
     overlap from blocking adjacent slots. */
  perPixelTargetFind: true,
} as const;

/** Monotonic render ID — increments on every renderScene call.
 *  Used to cancel stale async image callbacks from previous renders. */
let currentRenderId = 0;

/* ── Snap helpers ──────────────────────────────────────────────────────── */

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
  const f = fab as any;
  if (filters.grayscale > 0) result.push(new f.Image.filters.Grayscale());
  if (filters.sepia > 0) result.push(new f.Image.filters.Sepia());
  if (filters.brightness !== 100) {
    result.push(new f.Image.filters.Brightness({ brightness: (filters.brightness - 100) / 100 }));
  }
  if (filters.contrast !== 100) {
    result.push(new f.Image.filters.Contrast({ contrast: (filters.contrast - 100) / 100 }));
  }
  if (filters.saturate !== 100) {
    result.push(new f.Image.filters.Saturation({ saturation: (filters.saturate - 100) / 100 }));
  }
  if (filters.blur > 0) {
    result.push(new f.Image.filters.Blur({ blur: filters.blur / 10 }));
  }
  if (filters.hueRotate > 0) {
    result.push(new f.Image.filters.HueRotation({ rotation: filters.hueRotate }));
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
  /** Click on a template textbox region (empty placeholder or bound caption) →
   *  open the shared text editor for that slot. */
  onTextSlotClick?: (slotIndex: number) => void;
  /** Click on a QR living-memory slot (empty → add; filled → edit/relink). */
  onQrSlotClick?: (slotIndex: number) => void;
  /** Click on a filled ornament slot → re-open the ornament picker. */
  onOrnamentSlotClick?: (slotIndex: number) => void;
  /** Click on a filled per-slot TEXT → re-open the shared text editor for it. */
  onSlotTextClick?: (slotIndex: number) => void;
  /** Click on an EMPTY caption box → open the 3-way content chooser. */
  onTextSlotEmptyClick?: (slotIndex: number) => void;
  /** Click on a caption box FILLED with a photo → re-open the photo picker. */
  onTextSlotPhotoClick?: (slotIndex: number) => void;
  /** Click on a caption box FILLED with a QR → re-open the QR editor. */
  onTextSlotQrClick?: (slotIndex: number) => void;
  /** Click on a caption box FILLED with an ornament → re-open the ornament picker. */
  onTextSlotOrnamentClick?: (slotIndex: number) => void;
  onTextSlotOrnamentModified?: (slotIndex: number, geom: import('./types').OrnamentTransform) => void;
  actions: BuilderActions;
  /** When true, slot containers become selectable and resizable */
  containerMode?: boolean;
  /** Called when a container is resized or moved */
  onContainerModified?: (slotIndex: number, geometry: import('./types').SlotGeometryOverride) => void;
  /** Called after renderScene completes — for canvas snapshot capture */
  onRenderComplete?: (canvas: FabricCanvas) => void;
}

export interface UseCanvasEngineReturn {
  fabricValid: boolean;
  zoom: number;
  showGrid: boolean;
  snapEnabled: boolean;
  selectedPhotoId: string | null;
  selectedTextId: string | null;
  selectedBg: boolean;
  selectedSlotIndex: number | null;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  handleZoom: (delta: number) => void;
  resetZoom: () => void;
  setShowGrid: React.Dispatch<React.SetStateAction<boolean>>;
  setSnapEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  selectBackground: () => void;
  fabricCanvasRef: React.RefObject<FabricCanvas | null>;
}

/* ── Structural fingerprint for page comparison ────────────────────────── */

function pageFingerprint(pageIndex: number, page: AlbumPage): string {
  const bg = page.background;
  const bgTransform = `${bg.x ?? 0},${bg.y ?? 0},${bg.width ?? 0},${bg.height ?? 0},${bg.rotation ?? 0},${bg.opacity ?? 100}`;
  const slotFills = page.slotFills ? page.slotFills.join(',') : '';
  /* Include FULL text data — content, geometry AND formatting — so ANY edit
     changes the fingerprint and repaints. Formatting fields (font, color, style,
     alignment, opacity, scale) were previously omitted, so RE-EDITING an existing
     caption's format didn't repaint the canvas until a page-nav changed the
     fingerprint. Add worked because a new element changes the id list below. */
  const textData = page.textElements.map((t) =>
    `${t.id}:${t.text.slice(0,20)}:${t.fontSize}:${Math.round(t.x)}:${Math.round(t.y)}:${t.rotation}` +
    `:${t.fontFamily ?? ''}:${t.color ?? ''}:${t.bold ? 1 : 0}:${t.italic ? 1 : 0}:${t.underline ? 1 : 0}:${t.alignment ?? ''}:${t.opacity ?? 100}:${t.backgroundColor ?? ''}` +
    `:${t.width ?? ''}:${t.scaleX ?? ''}:${t.scaleY ?? ''}:${t.outlineColor ?? ''}:${t.outlineWidth ?? ''}:${t.shadow ? 1 : 0}`
  ).join('|');
  const slotGeoms = page.slotGeometries ? page.slotGeometries.map((g) => `${g?.x ?? ''}:${g?.y ?? ''}:${g?.width ?? ''}:${g?.height ?? ''}`).join('|') : '';
  // QR fills — so adding/relinking/removing a QR memory repaints the canvas.
  const qrData = page.qrFills ? page.qrFills.map((q) => q ? `${q.code}:${q.destination}` : '').join('|') : '';
  // Per-slot caption text (page.slotTexts) — so ADD/EDIT of a slot caption
  // changes the fingerprint and repaints the Fabric editor. Slot fills stay
  // null for a text-only slot, so without this the fingerprint was identical
  // and the editor desynced from PageView/print until a page-nav.
  const slotTextData = page.slotTexts
    ? page.slotTexts.map((s) => s
        ? `${s.text.slice(0,20)}:${s.fontSize}:${s.fontFamily ?? ''}:${s.color ?? ''}:${s.bold ? 1 : 0}:${s.italic ? 1 : 0}:${s.underline ? 1 : 0}:${s.alignment ?? ''}:${s.outlineColor ?? ''}:${s.outlineWidth ?? ''}:${s.shadow ? 1 : 0}`
        : '').join('|')
    : '';
  // Caption-box photo/QR content (page.textSlotFills / textSlotQr) — so placing
  // or removing a photo/QR in a caption box repaints the Fabric editor without a
  // page-nav (same desync class as slotTextData above).
  const textSlotFillData = page.textSlotFills ? page.textSlotFills.join(',') : '';
  const textSlotQrData = page.textSlotQr ? page.textSlotQr.map((q) => q ? `${q.code}:${q.destination}` : '').join('|') : '';
  const textSlotOrnamentData = page.textSlotOrnament ? page.textSlotOrnament.map((o) => o ? `${o.pack}:${o.id}` : '').join('|') : '';
  // Caption-box graphic TRANSFORMS — so a drag/resize/rotate (persisted geom)
  // repaints the object at its new place (mirrors slotGeoms for photo slots).
  const textSlotOrnamentGeomData = page.textSlotOrnamentGeom ? page.textSlotOrnamentGeom.map((g) => g ? `${g.cx.toFixed(3)},${g.cy.toFixed(3)},${g.w.toFixed(3)},${g.h.toFixed(3)},${Math.round(g.rot)}` : '').join('|') : '';
  // Ornament fills — so adding/changing/removing an ornament repaints the Fabric
  // editor without a page-nav (same desync class as slotTextData/qrData above).
  const ornamentData = page.ornamentFills ? page.ornamentFills.map((o) => o ? `${o.pack}:${o.id}` : '').join('|') : '';
  return `${pageIndex}|${page.textElements.map((t) => t.id).join(',')}|${textData}|${JSON.stringify(page.background)}|${bgTransform}|${page.templateId ?? ''}|${slotFills}|${slotGeoms}|${qrData}|${slotTextData}|${textSlotFillData}|${textSlotQrData}|${ornamentData}|${textSlotOrnamentData}|${textSlotOrnamentGeomData}`;
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
    onTextSlotClick,
    onQrSlotClick,
    onOrnamentSlotClick,
    onSlotTextClick,
    onTextSlotEmptyClick,
    onTextSlotPhotoClick,
    onTextSlotQrClick,
    onTextSlotOrnamentClick,
    onTextSlotOrnamentModified,
    actions,
    containerMode = false,
    onContainerModified,
    onRenderComplete,
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
  const savedSelectionRef = useRef<{ type: 'photo' | 'text' | 'slot' | 'bg' | null; id: string | null; slotIndex: number | null }>({ type: null, id: null, slotIndex: null });
  const isEditingTextRef = useRef(false);
  const lastPageIndexRef = useRef(actions.currentPageIndex);

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
  const onTextSlotClickRef = useRef<(slotIndex: number) => void>(() => {});
  onTextSlotClickRef.current = onTextSlotClick ?? (() => {});
  const onQrSlotClickRef = useRef<(slotIndex: number) => void>(() => {});
  onQrSlotClickRef.current = onQrSlotClick ?? (() => {});
  const onOrnamentSlotClickRef = useRef<(slotIndex: number) => void>(() => {});
  onOrnamentSlotClickRef.current = onOrnamentSlotClick ?? (() => {});
  const onSlotTextClickRef = useRef<(slotIndex: number) => void>(() => {});
  onSlotTextClickRef.current = onSlotTextClick ?? (() => {});
  const onTextSlotEmptyClickRef = useRef<(slotIndex: number) => void>(() => {});
  onTextSlotEmptyClickRef.current = onTextSlotEmptyClick ?? (() => {});
  const onTextSlotPhotoClickRef = useRef<(slotIndex: number) => void>(() => {});
  onTextSlotPhotoClickRef.current = onTextSlotPhotoClick ?? (() => {});
  const onTextSlotQrClickRef = useRef<(slotIndex: number) => void>(() => {});
  onTextSlotQrClickRef.current = onTextSlotQrClick ?? (() => {});
  const onTextSlotOrnamentClickRef = useRef<(slotIndex: number) => void>(() => {});
  onTextSlotOrnamentClickRef.current = onTextSlotOrnamentClick ?? (() => {});
  const onTextSlotOrnamentModifiedRef = useRef<(slotIndex: number, geom: import('./types').OrnamentTransform) => void>(() => {});
  onTextSlotOrnamentModifiedRef.current = onTextSlotOrnamentModified ?? (() => {});
  const containerModeRef = useRef(containerMode);
  containerModeRef.current = containerMode;
  const onContainerModifiedRef = useRef(onContainerModified);
  onContainerModifiedRef.current = onContainerModified;
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

  /* ═══════ Canvas initialization ═══════ */
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
        savedSelectionRef.current = { type: 'photo', id: obj.photoId as string, slotIndex: null };
      } else if (obj.slotIndex !== undefined) {
        clearAll(); setSelectedSlotIndex(obj.slotIndex);
        savedSelectionRef.current = { type: 'slot', id: null, slotIndex: obj.slotIndex as number };
      } else if (obj.textId) {
        clearAll(); setSelectedTextId(obj.textId);
        savedSelectionRef.current = { type: 'text', id: obj.textId as string, slotIndex: null };
      } else if (obj.bgId === BG_ID) {
        clearAll(); setSelectedBg(true);
        savedSelectionRef.current = { type: 'bg', id: BG_ID, slotIndex: null };
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
    canvas.on('mouse:down', (e: FabricMouseEvent) => {
      if (!e.target && !e.subTargets?.length) {
        const bgObj = canvas.getObjects().find((o: any) => o.bgId === BG_ID);
        if (bgObj) {
          canvas.setActiveObject(bgObj);
          canvas.requestRenderAll();
          setSelectedPhotoId(null);
          setSelectedTextId(null);
          setSelectedBg(true);
          setSelectedSlotIndex(null);
          savedSelectionRef.current = { type: 'bg', id: BG_ID, slotIndex: null };
        }
      }
    });

    /* ── Text editing: double-click to enter edit mode ── */
    canvas.on('mouse:dblclick', (e: any) => {
      const obj = e.target;
      if (obj && obj.textId && typeof obj.enterEditing === 'function') {
        savedSelectionRef.current = { type: 'text', id: obj.textId as string, slotIndex: null };
        obj.enterEditing();
        isEditingTextRef.current = true;
        canvas.setActiveObject(obj);
        canvas.requestRenderAll();
      }
    });

    /* ── Track text editing state ── */
    canvas.on('editing:entered', () => { isEditingTextRef.current = true; });
    canvas.on('editing:exited', () => { isEditingTextRef.current = false; });

    /* ── Sync edited text back to React state ── */
    canvas.on('text:changed', (e: any) => {
      const obj = e.target;
      if (obj && obj.textId) {
        actionsRef.current.updateTextElement(obj.textId, { text: obj.text ?? '' });
      }
    });

    /* ── Snap-to-grid + alignment during drag ── */
    const clearSnapGuides = () => {
      snapGuidesRef.current.forEach((g) => canvas.remove(g));
      snapGuidesRef.current = [];
    };

    const showSnapGuide = (x1: number, y1: number, x2: number, y2: number) => {
      const line = new fab.Line([x1, y1, x2, y2], {
        stroke: '#E8A598', strokeWidth: 1, selectable: false, evented: false,
      });
      snapGuidesRef.current.push(line);
      canvas.add(line);
      canvas.renderAll();
    };

    const handleObjectMoving = (e: ObjectEvent) => {
      const obj = e.target;
      if (!obj || !snapEnabledRef.current) return;
      if (obj.slotIndex !== undefined) return;

      clearSnapGuides();

      const { w: cw, h: ch, margin: m } = dimsRef.current;
      const objW = obj.getScaledWidth() || (obj as any).width || 0;
      const objH = obj.getScaledHeight() || (obj as any).height || 0;
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

      if (showGrid) {
        for (const pt of snapPointsX) {
          const gridLine = snapToGrid(pt, GRID_SIZE);
          if (Math.abs(pt - gridLine) < SNAP_THRESHOLD) {
            obj.set('left', left + (gridLine - pt));
            showSnapGuide(gridLine, 0, gridLine, ch);
            snappedX = true; break;
          }
        }
        for (const pt of snapPointsY) {
          const gridLine = snapToGrid(pt, GRID_SIZE);
          if (Math.abs(pt - gridLine) < SNAP_THRESHOLD) {
            obj.set('top', top + (gridLine - pt));
            showSnapGuide(0, gridLine, cw, gridLine);
            snappedY = true; break;
          }
        }
      }

      if (!snappedX) {
        const lines = getSnapLines(cw, ch, m);
        for (const lineX of lines.vertical) {
          for (const pt of snapPointsX) {
            if (Math.abs(pt - lineX) < SNAP_THRESHOLD) {
              obj.set('left', ((obj.left as number) ?? 0) + (lineX - pt));
              showSnapGuide(lineX, 0, lineX, ch);
              snappedX = true; break;
            }
          }
          if (snappedX) break;
        }
      }

      if (!snappedY) {
        const lines = getSnapLines(cw, ch, m);
        for (const lineY of lines.horizontal) {
          for (const pt of snapPointsY) {
            if (Math.abs(pt - lineY) < SNAP_THRESHOLD) {
              obj.set('top', ((obj.top as number) ?? 0) + (lineY - pt));
              showSnapGuide(0, lineY, cw, lineY);
              snappedY = true; break;
            }
          }
          if (snappedY) break;
        }
      }
    };

    canvas.on('object:moving', handleObjectMoving);

    /* ── Enforce uniform scaling on slot photos ── */
    canvas.on('object:scaling', (e: ObjectEvent) => {
      const obj = e.target;
      if (obj && obj.slotIndex !== undefined) {
        const scale = Math.max((obj.scaleX as number) || 1, (obj.scaleY as number) || 1);
        obj.set({ scaleX: scale, scaleY: scale });
        canvas.requestRenderAll();
      }
    });

    /* ── Track modifications ── BUG FIX: save ALL text properties ── */
    const handleObjectModified = (e: ObjectEvent) => {
      clearSnapGuides();
      const obj = e.target;
      if (!obj) return;

      const latestActions = actionsRef.current;
      const page = pageRef.current;
      const { w: cw, h: ch } = dimsRef.current;

      // Slot photo
      if (obj.slotIndex !== undefined && latestActions.setSlotScale && latestActions.setSlotOffset) {
        const template = getTemplateById(page.templateId ?? PAGE_TEMPLATES[0].id);
        if (template) {
          const adapted = adaptTemplateToOrientation(template, cw, ch);
          const slot = adapted.slots[obj.slotIndex];
          if (slot) {
            // Two-phase: safe area → slot pixels
            const safeX = cw * adapted.margin.left;
            const safeY = ch * adapted.margin.top;
            const safeW = cw * (1 - adapted.margin.left - adapted.margin.right);
            const safeH = ch * (1 - adapted.margin.top - adapted.margin.bottom);
            const sx = safeX + slot.x * safeW;
            const sy = safeY + slot.y * safeH;
            const sw = slot.width * safeW;
            const sh = slot.height * safeH;
            latestActions.setSlotScale(obj.slotIndex, Math.max(0.1, (obj.scaleX as number) ?? 1));
            const offsetX = ((obj.left as number) ?? 0) - (sx + sw / 2);
            const offsetY = ((obj.top as number) ?? 0) - (sy + sh / 2);
            const currentOffsetX = page.slotOffsetsX?.[obj.slotIndex] ?? 0;
            const currentOffsetY = page.slotOffsetsY?.[obj.slotIndex] ?? 0;
            latestActions.setSlotOffset(obj.slotIndex, offsetX - currentOffsetX, offsetY - currentOffsetY);
            // Save rotation if changed
            const newAngle = Math.round((obj.angle as number) ?? 0);
            if (newAngle !== (slot.rotation ?? 0) && latestActions.updateSlotGeometry) {
              latestActions.updateSlotGeometry(obj.slotIndex, { rotation: newAngle });
            }
          }
        }
      }

      // Free photo
      if (obj.photoId && obj.slotIndex === undefined) {
        latestActions.updatePhotoTransform(obj.photoId, {
          x: (obj.left as number) ?? 0,
          y: (obj.top as number) ?? 0,
          width: obj.getScaledWidth() || (obj as any).width || 0,
          height: obj.getScaledHeight() || (obj as any).height || 0,
          rotation: (obj.angle as number) ?? 0,
          scaleX: 1,
          scaleY: 1,
        });
      }

      // Text: save ALL properties including width/scale from stretch
      if (obj.textId) {
        latestActions.updateTextElement(obj.textId, {
          x: (obj.left as number) ?? 0,
          y: (obj.top as number) ?? 0,
          rotation: (obj.angle as number) ?? 0,
          text: (obj as any).text ?? '',
          fontSize: (obj as any).fontSize ?? 24,
          fontFamily: (obj as any).fontFamily ?? '"DM Sans", sans-serif',
          color: (obj as any).fill ?? '#2D2D2D',
          bold: (obj as any).fontWeight === 'bold',
          italic: (obj as any).fontStyle === 'italic',
          underline: (obj as any).underline ?? false,
          alignment: (obj as any).textAlign ?? 'center',
          opacity: Math.round(((obj as any).opacity ?? 1) * 100),
          width: (obj as any).width ?? undefined,
          scaleX: (obj as any).scaleX ?? undefined,
          scaleY: (obj as any).scaleY ?? undefined,
        });
      }

      // Background
      if (obj.bgId === BG_ID) {
        latestActions.updateBackgroundTransform({
          x: (obj.left as number) ?? 0,
          y: (obj.top as number) ?? 0,
          width: obj.getScaledWidth() || (obj as any).width || 0,
          height: obj.getScaledHeight() || (obj as any).height || 0,
          rotation: (obj.angle as number) ?? 0,
        });
      }
    };

    canvas.on('object:modified', handleObjectModified);

    fabricRef.current = canvas;

    /* ── CRITICAL BUG FIX: render full scene on init, not just background ── */
    lastStructuralRef.current = '';
    renderScene(fab, canvas, currentPage, uploadedPhotos, albumType, CANVAS_W, CANVAS_H, onSlotClickRef.current, containerModeRef.current, albumSize, actions.currentPageIndex, onContainerModifiedRef.current, onTextSlotClickRef.current, onQrSlotClickRef.current, onSlotTextClickRef.current, onTextSlotEmptyClickRef.current, onTextSlotPhotoClickRef.current, onTextSlotQrClickRef.current, onOrnamentSlotClickRef.current, onTextSlotOrnamentClickRef.current, onTextSlotOrnamentModifiedRef.current);
    // Capture preview snapshot after async images settle
    setTimeout(() => onRenderComplete?.(canvas), 200);

    return () => {
      canvas.off('selection:created', handleSelection);
      canvas.off('selection:updated', handleSelection);
      canvas.off('selection:cleared', handleSelectionCleared);
      canvas.off('mouse:down');
      canvas.off('mouse:dblclick');
      canvas.off('text:changed');
      canvas.off('editing:entered');
      canvas.off('editing:exited');
      canvas.off('object:moving', handleObjectMoving);
      canvas.off('object:scaling');
      canvas.off('object:modified', handleObjectModified);
      clearSnapGuides();
      canvas.dispose();
      fabricRef.current = null;
      lastStructuralRef.current = '';
    };
  }, [canvasRef, fabricModule, fabricValid, CANVAS_H, CANVAS_W]);

  /* ═══════ Fit the canvas to its container width (mobile) ═══════
     Scales only the CSS DISPLAY size via setDimensions({cssOnly:true}); the
     internal backstore stays CANVAS_W×CANVAS_H, so text/slot coordinates (which
     are absolute canvas px) are untouched. Capped at 1× so desktop never grows. */
  const fitCanvasToContainer = useCallback(() => {
    const c = fabricRef.current as any;
    if (!c || !c.wrapperEl) return;
    // Fabric nests the canvas in a shadow wrapper that hugs the canvas, so walk
    // up to the scrollable viewport (the real width constraint), not that wrapper.
    let host: HTMLElement | null = c.wrapperEl.parentElement;
    let hops = 0;
    while (host && hops < 6) {
      const s = getComputedStyle(host);
      if (['auto', 'scroll'].includes(s.overflowX) || ['auto', 'scroll'].includes(s.overflowY)) break;
      host = host.parentElement;
      hops++;
    }
    if (!host) return;
    // Fit the page to the available WIDTH only (never upscale past 100%) and let
    // its height overflow the scroll container — so a tall page can be SCROLLED
    // through with the mouse wheel. Fitting to height as well made every page fit
    // the viewport exactly, leaving nothing to scroll (the "lost my scroll wheel"
    // regression). Zoom still folds in via zoomRef; Ctrl/Cmd+wheel zoom and the
    // ‹ › nav arrows are unaffected.
    const availW = host.clientWidth - 32;
    if (availW <= 0) return;
    const baseFit = Math.max(0.2, Math.min(1, availW / CANVAS_W));
    const scale = baseFit * zoomRef.current;
    // NOTE: fabric 5.x setDimensions(cssOnly) does NOT append units, so the CSS
    // values MUST be passed as 'px' strings or the browser ignores them.
    c.setDimensions(
      { width: Math.round(CANVAS_W * scale) + 'px', height: Math.round(CANVAS_H * scale) + 'px' },
      { cssOnly: true },
    );
  }, [CANVAS_W, CANVAS_H]);

  /* ═══════ Resize canvas when album size changes ═══════ */
  useEffect(() => {
    if (!fabricRef.current || !fabricValid || !fabricModule) return;
    fabricRef.current.setWidth(CANVAS_W);
    fabricRef.current.setHeight(CANVAS_H);
    fabricRef.current.renderAll();
    fitCanvasToContainer();
  }, [CANVAS_W, CANVAS_H, fabricValid, fabricModule, fitCanvasToContainer]);

  /* Re-fit after the flex layout settles + on any container/viewport resize
     (orientation, breakpoints). A bare mount-time fit runs too early — the
     scroll container is briefly canvas-width before flexbox constrains it. */
  useEffect(() => {
    if (!fabricValid) return;
    let ro: ResizeObserver | null = null;
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => {
      fitCanvasToContainer();
      const c = fabricRef.current as any;
      let host: HTMLElement | null = c?.wrapperEl?.parentElement ?? null;
      let hops = 0;
      while (host && hops < 6) {
        const s = getComputedStyle(host);
        if (['auto', 'scroll'].includes(s.overflowX) || ['auto', 'scroll'].includes(s.overflowY)) break;
        host = host.parentElement;
        hops++;
      }
      if (host && typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(() => fitCanvasToContainer());
        ro.observe(host);
      }
    }));
    window.addEventListener('resize', fitCanvasToContainer);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', fitCanvasToContainer);
      ro?.disconnect();
    };
  }, [fabricValid, fitCanvasToContainer]);

  /* Re-fit when the user zooms — zoom folds into the fit scale. */
  useEffect(() => {
    if (!fabricValid) return;
    fitCanvasToContainer();
  }, [zoom, fabricValid, fitCanvasToContainer]);

  /* ═══════ Render scene on structural changes ═══════ */
  useEffect(() => {
    if (!fabricRef.current || !fabricValid || !fabricModule) return;

    /* If user switched pages while editing, force exit edit mode and render.
       Otherwise editing would block renderScene forever on the new page. */
    const pageChanged = actions.currentPageIndex !== lastPageIndexRef.current;
    lastPageIndexRef.current = actions.currentPageIndex;
    if (isEditingTextRef.current && pageChanged) {
      isEditingTextRef.current = false;
    } else if (isEditingTextRef.current) {
      return; /* Same page, still editing — skip render */
    }

    const fingerprint = pageFingerprint(actions.currentPageIndex, currentPage) + '|cm:' + (containerModeRef.current ? '1' : '0');
    if (lastStructuralRef.current === fingerprint) return;
    lastStructuralRef.current = fingerprint;

    const canvas = fabricRef.current;

    // Remember current selection so we can restore it after re-render
    const active = canvas.getActiveObject?.();
    if (active) {
      if (active.photoId && active.slotIndex === undefined) {
        savedSelectionRef.current = { type: 'photo', id: active.photoId as string, slotIndex: null };
      } else if (active.slotIndex !== undefined) {
        savedSelectionRef.current = { type: 'slot', id: null, slotIndex: active.slotIndex as number };
      } else if (active.textId) {
        savedSelectionRef.current = { type: 'text', id: active.textId as string, slotIndex: null };
      } else if (active.bgId === BG_ID) {
        savedSelectionRef.current = { type: 'bg', id: BG_ID, slotIndex: null };
      }
    }
    const savedSel = savedSelectionRef.current;

    renderScene(fabricModule as any, canvas, currentPage, uploadedPhotos, albumType, CANVAS_W, CANVAS_H, onSlotClickRef.current, containerModeRef.current, albumSize, actions.currentPageIndex, onContainerModifiedRef.current, onTextSlotClickRef.current, onQrSlotClickRef.current, onSlotTextClickRef.current, onTextSlotEmptyClickRef.current, onTextSlotPhotoClickRef.current, onTextSlotQrClickRef.current, onOrnamentSlotClickRef.current, onTextSlotOrnamentClickRef.current, onTextSlotOrnamentModifiedRef.current);

    // Capture preview snapshot after async images settle
    setTimeout(() => onRenderComplete?.(canvas), 200);

    // Restore selection after re-render (deferred for async slot images)
    const restoreSelection = () => {
      if (savedSel.type && savedSel.id !== null) {
        let obj: any;
        if (savedSel.type === 'photo') {
          obj = canvas.getObjects().find((o: any) => o.photoId === savedSel.id && o.slotIndex === undefined);
          if (obj) { canvas.setActiveObject(obj); setSelectedPhotoId(savedSel.id); }
        } else if (savedSel.type === 'text') {
          obj = canvas.getObjects().find((o: any) => o.textId === savedSel.id);
          if (obj) { canvas.setActiveObject(obj); setSelectedTextId(savedSel.id); }
        } else if (savedSel.type === 'bg') {
          obj = canvas.getObjects().find((o: any) => o.bgId === BG_ID);
          if (obj) { canvas.setActiveObject(obj); setSelectedBg(true); }
        }
        if (obj) canvas.requestRenderAll();
      } else if (savedSel.type === 'slot' && savedSel.slotIndex !== null) {
        const obj = canvas.getObjects().find((o: any) => o.slotIndex === savedSel.slotIndex && o.photoId);
        if (obj) {
          canvas.setActiveObject(obj);
          setSelectedSlotIndex(savedSel.slotIndex);
          canvas.requestRenderAll();
        }
      }
    };
    restoreSelection();
    setTimeout(restoreSelection, 100);
    setTimeout(restoreSelection, 250);
  }, [fabricModule, fabricValid, actions.currentPageIndex, currentPage, uploadedPhotos, actions.albumType, CANVAS_W, CANVAS_H, containerMode]);

  /* ═══════ Keyboard shortcuts ═══════ */
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (e.target && (e.target as HTMLElement).closest('input, textarea, select, [contenteditable], .fabric-container')) return;

      const latestActions = actionsRef.current;

      if (selectedSlotIndex !== null) {
        latestActions.clearSlot(selectedSlotIndex);
        setSelectedSlotIndex(null);
        fabricRef.current?.discardActiveObject();
        fabricRef.current?.requestRenderAll();
      } else if (selectedPhotoId) {
        // A caption-box photo is a locked slot object tagged `text-slot-photo-<i>`,
        // not a free canvas photo — route its delete to setTextSlotPhoto (else
        // deletePhotoFromCanvas is a dead no-op + a phantom undo snapshot).
        const capMatch = /^text-slot-photo-(\d+)$/.exec(selectedPhotoId);
        if (capMatch) {
          latestActions.setTextSlotPhoto(Number(capMatch[1]), null);
          setSelectedPhotoId(null);
          fabricRef.current?.discardActiveObject();
          fabricRef.current?.requestRenderAll();
        } else {
          latestActions.deletePhotoFromCanvas(selectedPhotoId);
        }
      } else if (selectedTextId) {
        latestActions.deleteTextElement(selectedTextId);
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedPhotoId, selectedTextId, selectedSlotIndex]);

  /* ═══════ Mouse wheel: attached to canvas container div ═══════
     The container has overflow-auto which captures wheel events before
     they bubble to window. We must attach directly to the container. */
  useEffect(() => {
    const attach = () => {
      const container = containerRef.current;
      if (!container) return null;

      const handleWheel = (e: WheelEvent) => {
        // Never interfere with inputs or the unified panel
        const target = e.target as HTMLElement;
        if (target.closest('input, textarea, select, .w-80')) return;

        // Ctrl/Cmd + scroll → ZOOM
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const delta = e.deltaY > 0 ? -0.08 : 0.08;
          const newZoom = Math.max(0.2, Math.min(4.0, zoomRef.current + delta));
          if (newZoom !== zoomRef.current) {
            const c = canvasRef.current as any;
            if (c?.setZoom) { c.setZoom(newZoom); c.requestRenderAll(); }
            setZoomState(newZoom);
          }
          return;
        }

        // Plain wheel → let the browser scroll normally. (Hijacking the wheel to
        // flip album pages stole normal scrolling everywhere the cursor sat over
        // the canvas; page navigation is via the ‹ › arrows / Previous-Next.)
      };

      container.addEventListener('wheel', handleWheel, { passive: false });
      return () => container.removeEventListener('wheel', handleWheel);
    };

    // Delay to ensure DOM is ready. Keep the detach handle so the wheel listener
    // is actually removed on unmount (previously attach()'s cleanup was swallowed
    // by setTimeout and the listener leaked).
    let detach: (() => void) | null = null;
    const timer = setTimeout(() => { detach = attach(); }, 100);
    return () => { clearTimeout(timer); detach?.(); };
  }, []);

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

    createBackgroundObject(fab, canvas, currentPage.background, CANVAS_W, CANVAS_H, uploadedPhotos);
    canvas.renderAll();
    // uploadedPhotos in deps: a photo-background resolves its id → live URL from
    // the photos, which rehydrate after the album loads — re-run when they arrive.
  }, [showGrid, CANVAS_W, CANVAS_H, fabricModule, fabricValid, currentPage.background, uploadedPhotos]);

  /* ═══════ Select background helper ═══════ */
  const selectBackground = useCallback(() => {
    if (!fabricRef.current || !fabricModule) return;
    const canvas = fabricRef.current;
    const fab = fabricModule as any;
    let bgObj = canvas.getObjects().find((o: any) => o.bgId === BG_ID);
    if (!bgObj) {
      createBackgroundObject(fab, canvas, pageRef.current.background, CANVAS_W, CANVAS_H, photosRef.current);
      bgObj = canvas.getObjects().find((o: any) => o.bgId === BG_ID);
    }
    if (bgObj) {
      canvas.discardActiveObject();
      canvas.setActiveObject(bgObj);
      canvas.requestRenderAll();
      setSelectedBg(true);
      setSelectedPhotoId(null);
      setSelectedTextId(null);
      savedSelectionRef.current = { type: 'bg', id: BG_ID, slotIndex: null };
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
  photos: UploadedPhoto[] = [],
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
    /* Megy is the sole orchestrator. The background is a preference set
       through Megy's Background panel — never manipulated on the canvas. */
    selectable: false,
    evented: false,
    hasControls: false,
    hasBorders: false,
    lockMovementX: true,
    lockMovementY: true,
    lockScalingX: true,
    lockScalingY: true,
    lockRotation: true,
  };

  function addBg(obj: any) {
    obj.bgId = BG_ID;
    canvas.add(obj);
    canvas.moveTo(obj, 0);
    canvas.requestRenderAll();
  }

  const imgSrc = resolveBgImageSrc(bg, photos);
  if (bg.type === 'image' && imgSrc) {
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
    htmlImg.src = imgSrc;
  } else if (bg.type === 'gradient' && (bg as any).gradient) {
    const { type, angle, stops } = (bg as any).gradient;
    const fabricStops = stops.map((s: { offset: number; color: string }) => ({
      offset: s.offset,
      color: s.color,
    }));

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
  } else if (bg.type === 'texture') {
    // Material texture — load the procedural SVG data URI (a native 80x80 tile)
    // and TILE it across the canvas via a repeating Fabric Pattern fill, exactly
    // like PageView (backgroundRepeat 'repeat', backgroundSize 80px) and the
    // print path (ctx.createPattern(off, 'repeat')). We must NOT stretch a single
    // tile to fill the page — that magnifies one 80px tile ~5.75x and the material
    // reads completely differently in the editor than in preview/print, breaking
    // 3-renderer parity. baseProps.opacity (= opacity/100) applies to the Rect →
    // opacity parity preserved. onerror falls back to a neutral rect so a
    // malformed tile never blanks the page.
    const htmlImg = new Image();
    htmlImg.onload = () => {
      addBg(new fab.Rect({
        ...baseProps,
        width: w,
        height: h,
        fill: new fab.Pattern({ source: htmlImg, repeat: 'repeat' }),
      }));
    };
    htmlImg.onerror = () => {
      addBg(new fab.Rect({ ...baseProps, width: w, height: h, fill: '#FFFBF7' }));
    };
    htmlImg.src = textureDataUri((bg as any).texture, (bg as any).textureColor);
  } else {
    const fill = (bg as any).solid || '#FFFBF7';
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
  slotGeometries: import('./types').SlotGeometryOverride[] | undefined,
  uploadedPhotos: UploadedPhoto[],
  canvasW: number,
  canvasH: number,
  onSlotClick: (slotIndex: number) => void,
  renderId: number,
  containerMode: boolean,
  albumSize: string,
  pageIndex: number,
  onContainerModified?: (slotIndex: number, geometry: import('./types').SlotGeometryOverride) => void,
  frameColor?: string,
  frameWidth?: number,
  borderStyle?: 'solid' | 'dashed' | 'dotted',
  frameStyle?: FrameStyle,
  qrFills?: (QrFill | null)[],
  onQrSlotClick: (slotIndex: number) => void = () => {},
  slotTexts?: (SlotText | null)[],
  onSlotTextClick: (slotIndex: number) => void = () => {},
  ornamentFills?: (OrnamentFill | null)[],
  onOrnamentSlotClick: (slotIndex: number) => void = () => {},
) {
  canvas.getObjects().filter((o: any) => o.slotId?.startsWith(SLOT_ID)).forEach((o: any) => canvas.remove(o));

  // Adapt template to canvas orientation (rotate 90° if needed)
  const adaptedTemplate = adaptTemplateToOrientation(template, canvasW, canvasH);

  // Phase 1: compute safe area from template margins — with the binding keep-out
  // added to the inner (spine) edge so slots never land in the gutter.
  const m = marginForTemplate(adaptedTemplate, adaptedTemplate.margin, albumSize, pageIndex);
  const safeX = canvasW * m.left;
  const safeY = canvasH * m.top;
  const safeW = canvasW * (1 - m.left - m.right);
  const safeH = canvasH * (1 - m.top - m.bottom);

  adaptedTemplate.slots.forEach((rawSlot: any, i: number) => {
    // Merge template slot with user geometry overrides
    const geom = slotGeometries?.[i] ?? {};
    const slot = { ...rawSlot, ...geom };
    const photoIndex = slotFills[i];
    // Phase 2: map slot proportions (0–1 of safe area) → pixels
    const sx = safeX + slot.x * safeW;
    const sy = safeY + slot.y * safeH;
    const sw = slot.width * safeW;
    const sh = slot.height * safeH;

    // Content precedence is DRIVEN BY page data (not slot.kind):
    //   qrFills[i] → QR, slotTexts[i] → text, slotFills[i] → photo, else empty "+".
    // QR is handled first so it never falls into the empty-photo branch, and the
    // empty state is owned by the chooser "+" (no auto-empty QR placeholder).
    const qr = qrFills?.[i] ?? null;
    if (qr) {
      const { dx, dy, side } = qrRect(sx, sy, sw, sh);
      const backing = new fab.Rect({ left: dx, top: dy, width: side, height: side, fill: '#ffffff', selectable: false, evented: false });
      backing.slotId = `${SLOT_ID}-qrbg-${i}`;
      canvas.add(backing);
      fab.Image.fromURL(qr.qrPngDataUrl, (img: any) => {
        if (renderId !== currentRenderId) return;
        img.set({ left: dx, top: dy, selectable: false, evented: true, hoverCursor: 'pointer' });
        img.scaleToWidth(side);
        img.slotId = `${SLOT_ID}-qr-${i}`;
        img.slotIndex = i;
        img.on('mousedown', () => onQrSlotClick(i));
        canvas.add(img);
        canvas.renderAll();
      });
      return;
    }

    // Ornament — a themed vector PNG contained (with padding) in the cell. No
    // white backing (transparent accent). Tap re-opens the picker. Mirrors QR.
    const ornament = ornamentFills?.[i] ?? null;
    if (ornament) {
      const { dx, dy, side } = ornamentFit(sx, sy, sw, sh);
      fab.Image.fromURL(ornament.pngDataUrl, (img: any) => {
        if (renderId !== currentRenderId) return;
        img.set({ left: dx, top: dy, selectable: false, evented: true, hoverCursor: 'pointer' });
        img.scaleToWidth(side);
        img.slotId = `${SLOT_ID}-ornament-${i}`;
        img.slotIndex = i;
        img.on('mousedown', () => onOrnamentSlotClick(i));
        canvas.add(img);
        canvas.renderAll();
      });
      return;
    }

    // Per-slot TEXT — a centered, locked Textbox mirroring the bound-caption
    // Textbox below (originY center, tap re-opens the editor via onSlotTextClick).
    const st = slotTexts?.[i] ?? null;
    if (st) {
      const stText = new fab.Textbox(st.text, {
        left: sx,
        top: sy + sh / 2,
        originY: 'center',
        width: sw,
        fontSize: st.fontSize,
        fontFamily: st.fontFamily,
        fill: st.color,
        fontWeight: st.bold ? 'bold' : 'normal',
        fontStyle: st.italic ? 'italic' : 'normal',
        underline: st.underline,
        textAlign: st.alignment,
        stroke: st.outlineWidth && st.outlineColor ? st.outlineColor : undefined,
        strokeWidth: st.outlineWidth && st.outlineColor ? st.outlineWidth : 0,
        paintFirst: 'stroke',
        shadow: st.shadow ? new fab.Shadow({ color: WORDART_SHADOW.color, blur: WORDART_SHADOW.blur, offsetX: WORDART_SHADOW.offsetX, offsetY: WORDART_SHADOW.offsetY }) : undefined,
        selectable: false,
        evented: true,
        editable: false,
        hoverCursor: 'pointer',
      });
      stText.slotId = `${SLOT_ID}-slottext-${i}`;
      stText.slotIndex = i;
      stText.on('mousedown', () => onSlotTextClick(i));
      canvas.add(stText);
      return;
    }

    if (photoIndex !== null && uploadedPhotos[photoIndex]) {
      const photoUrl = uploadedPhotos[photoIndex].previewUrl;
      fab.Image.fromURL(photoUrl, (img: any) => {
        /* Skip if a newer render has started — prevents stale images
           from appearing when switching pages rapidly */
        if (renderId !== currentRenderId) return;
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
          /* Megy is the sole orchestrator. The canvas is a RENDERER: a slot
             photo can be selected (to delete/replace via Megy) but never
             manually moved, scaled, or rotated. See SLOT_IMAGE_LOCK. */
          ...SLOT_IMAGE_LOCK,
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

        // Fake shadow — dark semi-transparent rect behind photo.
        // NOT using Fabric.js shadow (unreliable with clipPath).
        // This is a plain visible shape that looks like a drop shadow.
        const shadowOff = 4;
        const shadowBlur = 8;
        const fakeShadow = new fab.Rect({
          left: sx + shadowOff - shadowBlur / 2,
          top: sy + shadowOff - shadowBlur / 2,
          width: sw + shadowBlur,
          height: sh + shadowBlur,
          rx: slot.shape === 'rounded' && slot.borderRadius ? Math.min(slot.borderRadius + 2, Math.min(sw, sh) / 2) : 0,
          ry: slot.shape === 'rounded' && slot.borderRadius ? Math.min(slot.borderRadius + 2, Math.min(sw, sh) / 2) : 0,
          fill: 'rgba(0,0,0,0.10)',
          stroke: 'transparent',
          strokeWidth: 0,
          selectable: false,
          evented: false,
          hasControls: false,
          hasBorders: false,
        });
        fakeShadow.slotId = `${SLOT_ID}-shadow-${i}`;
        canvas.add(fakeShadow);
        fakeShadow.sendToBack();

        // Slot border frame — THE CONTAINER. White outline normally,
        // becomes thick blue+selectable in container mode for resize/move.
        const borderStroke = containerMode ? '#3B82F6' : (frameColor ?? '#FFFFFF');
        // Full-bleed (single-photo, no-textbox) pages draw no frame — but keep the
        // blue container outline in edit mode so the slot is still selectable.
        const effFrameWidth = adaptedTemplate.fullBleed ? 0 : frameWidth;
        const borderWidth = containerMode ? 3 : (effFrameWidth ?? 2);
        // Dashed/dotted border style — only on the real (non-container) outline,
        // and only when the slot actually draws a border. Mirrors the DOM
        // (border-style) + print (ctx.setLineDash) renderers.
        const effBorderStyle = borderStyle ?? 'solid';
        let borderDashArray: number[] | undefined;
        if (!containerMode && borderWidth > 0) {
          if (effBorderStyle === 'dashed') borderDashArray = [borderWidth * 2, borderWidth * 2];
          else if (effBorderStyle === 'dotted') borderDashArray = [1, borderWidth * 2];
        }
        const borderBase = {
          fill: 'transparent' as const,
          stroke: borderStroke,
          strokeWidth: borderWidth,
          strokeDashArray: borderDashArray,
          strokeLineCap: effBorderStyle === 'dotted' ? ('round' as const) : ('butt' as const),
          selectable: containerMode,
          evented: containerMode,
          hasControls: containerMode,
          hasBorders: containerMode,
          cornerColor: containerMode ? '#3B82F6' : undefined,
          cornerSize: containerMode ? 10 : undefined,
          transparentCorners: false,
          lockRotation: false,
          hoverCursor: containerMode ? 'move' : 'default',
        };
        let borderObj: any;
        if (slot.shape === 'circle') {
          const r = Math.min(sw, sh) / 2;
          borderObj = new fab.Circle({ left: sx + sw / 2, top: sy + sh / 2, radius: r, originX: 'center', originY: 'center', ...borderBase });
        } else if (slot.shape === 'rounded' && slot.borderRadius) {
          const r = Math.min(slot.borderRadius, Math.min(sw, sh) / 2);
          borderObj = new fab.Rect({ left: sx, top: sy, width: sw, height: sh, ...borderBase, rx: r, ry: r });
        } else if (slot.shape === 'oval') {
          borderObj = new fab.Ellipse({ left: sx + sw / 2, top: sy + sh / 2, rx: sw / 2, ry: sh / 2, originX: 'center', originY: 'center', ...borderBase });
        } else if (slot.shape === 'heart') {
          const hr = Math.min(sw, sh) / 2;
          const heartPath = `M 0 ${-hr * 0.3} C ${-hr} ${-hr * 1.2} ${-hr * 1.5} ${hr * 0.3} 0 ${hr} C ${hr * 1.5} ${hr * 0.3} ${hr} ${-hr * 1.2} 0 ${-hr * 0.3} Z`;
          borderObj = new fab.Path(heartPath, { left: sx + sw / 2, top: sy + sh / 2, originX: 'center', originY: 'center', ...borderBase });
        } else {
          borderObj = new fab.Rect({ left: sx, top: sy, width: sw, height: sh, ...borderBase });
        }
        borderObj.slotId = `${SLOT_ID}-border-${i}`;
        canvas.add(borderObj);
        borderObj.bringToFront();

        // ── Decorative FRAME layer ─────────────────────────────────────────
        // Drawn AROUND each slot, keyed off the shared FRAME_STYLES registry so
        // the Fabric / DOM / print renderers stay in lockstep. Frame objects are
        // tagged `${SLOT_ID}-frame-${i}` so the cleanup pass (filters on
        // SLOT_ID) removes them on every rerender. Suppressed for full-bleed
        // pages (no border ⇒ no decorative frame) and in container mode (the
        // blue resize outline owns the slot then).
        const effFrameStyle: FrameStyle = frameStyle ?? 'none';
        if (
          !containerMode &&
          !adaptedTemplate.fullBleed &&
          effFrameStyle !== 'none' &&
          slot.shape !== 'heart'
        ) {
          const frameTag = `${SLOT_ID}-frame-${i}`;
          const matFill = '#FFFFFF';
          const isRect = slot.shape !== 'circle' && slot.shape !== 'oval';
          // A passive (non-interactive) primitive shared by every frame piece.
          const passive = {
            selectable: false,
            evented: false,
            hasControls: false,
            hasBorders: false,
          };

          if (effFrameStyle === 'rounded' && isRect) {
            // Soft rounded corners + a 3px accent border on the slot border rect.
            const rr = Math.min(sw, sh) * 0.1;
            borderObj.set({ rx: rr, ry: rr, strokeWidth: Math.max(borderWidth, 3) });
          } else if (effFrameStyle === 'shadowbox') {
            // Floating photo: keep the 1px border + cast an outer drop shadow.
            borderObj.set('shadow', new fab.Shadow({ color: 'rgba(0,0,0,0.25)', blur: 14, offsetX: 0, offsetY: 4 }));
          } else if (effFrameStyle === 'double') {
            // Second concentric line inset 3px inside the slot border.
            const inset = 3;
            const dbl = isRect
              ? new fab.Rect({ left: sx + inset, top: sy + inset, width: sw - inset * 2, height: sh - inset * 2, fill: 'transparent', stroke: frameColor ?? '#FFFFFF', strokeWidth: 1, ...passive })
              : new fab.Ellipse({ left: sx + sw / 2, top: sy + sh / 2, rx: sw / 2 - inset, ry: sh / 2 - inset, originX: 'center', originY: 'center', fill: 'transparent', stroke: frameColor ?? '#FFFFFF', strokeWidth: 1, ...passive });
            dbl.slotId = frameTag;
            canvas.add(dbl);
            dbl.bringToFront();
          } else if (effFrameStyle === 'thin') {
            // Single 1px inset hairline just inside the slot edge.
            const inset = 1;
            const hair = isRect
              ? new fab.Rect({ left: sx + inset, top: sy + inset, width: sw - inset * 2, height: sh - inset * 2, fill: 'transparent', stroke: frameColor ?? '#FFFFFF', strokeWidth: 1, ...passive })
              : new fab.Ellipse({ left: sx + sw / 2, top: sy + sh / 2, rx: sw / 2 - inset, ry: sh / 2 - inset, originX: 'center', originY: 'center', fill: 'transparent', stroke: frameColor ?? '#FFFFFF', strokeWidth: 1, ...passive });
            hair.slotId = frameTag;
            canvas.add(hair);
            hair.bringToFront();
          } else if (effFrameStyle === 'matte' || effFrameStyle === 'polaroid') {
            // White mat behind the photo. Polaroid is weighted at the bottom and
            // casts a soft drop shadow; matte is an even mount.
            const pad = 8;
            const bottomPad = effFrameStyle === 'polaroid' ? 28 : pad;
            const matShadow = effFrameStyle === 'polaroid'
              ? new fab.Shadow({ color: 'rgba(0,0,0,0.22)', blur: 16, offsetX: 0, offsetY: 6 })
              : new fab.Shadow({ color: 'rgba(0,0,0,0.18)', blur: 6, offsetX: 0, offsetY: 0 });
            const mat = isRect
              ? new fab.Rect({
                  left: sx - pad,
                  top: sy - pad,
                  width: sw + pad * 2,
                  height: sh + pad + bottomPad,
                  fill: matFill,
                  shadow: matShadow,
                  ...passive,
                })
              : new fab.Ellipse({
                  left: sx + sw / 2,
                  top: sy + sh / 2 + (bottomPad - pad) / 2,
                  rx: sw / 2 + pad,
                  ry: sh / 2 + (pad + bottomPad) / 2,
                  originX: 'center',
                  originY: 'center',
                  fill: matFill,
                  shadow: matShadow,
                  ...passive,
                });
            mat.slotId = frameTag;
            canvas.add(mat);
            // Mat must sit UNDER the photo but ABOVE the page background. The
            // photo + its border were already added, so drop the mat just below
            // them by re-raising the photo and border back to the front.
            img.bringToFront();
            borderObj.bringToFront();
          }
        }

        // Container mode: save geometry when border is moved/resized
        if (containerMode && onContainerModified) {
          borderObj.on('modified', () => {
            // Compute new geometry from border position/size
            const newLeft = borderObj.left ?? sx;
            const newTop = borderObj.top ?? sy;
            let newW: number;
            let newH: number;
            if (borderObj.getScaledWidth) {
              newW = borderObj.getScaledWidth();
              newH = borderObj.getScaledHeight();
            } else {
              newW = (borderObj.width || sw) * (borderObj.scaleX || 1);
              newH = (borderObj.height || sh) * (borderObj.scaleY || 1);
            }
            // For circle/oval/heart centered objects, adjust left/top
            const isCentered = slot.shape === 'circle' || slot.shape === 'oval' || slot.shape === 'heart';
            const finalLeft = isCentered ? newLeft - newW / 2 : newLeft;
            const finalTop = isCentered ? newTop - newH / 2 : newTop;
            onContainerModified(i, {
              x: Math.round((finalLeft / canvasW) * 100 * 10) / 10,
              y: Math.round((finalTop / canvasH) * 100 * 10) / 10,
              width: Math.round((newW / canvasW) * 100 * 10) / 10,
              height: Math.round((newH / canvasH) * 100 * 10) / 10,
              rotation: Math.round((borderObj.angle as number) ?? 0),
            });
          });

          // Moving: sync photo position to follow container
          borderObj.on('moving', () => {
            const dx = (borderObj.left ?? sx) - sx;
            const dy = (borderObj.top ?? sy) - sy;
            // For centered shapes, left/top is center — adjust
            const isCentered = slot.shape === 'circle' || slot.shape === 'oval' || slot.shape === 'heart';
            const offsetX = isCentered ? dx : dx;
            const offsetY = isCentered ? dy : dy;
            // Move the image to follow the border
            img.set({
              left: (sx + sw / 2) + offsetX + (slotOffsetsX[i] ?? 0),
              top: (sy + sh / 2) + offsetY + (slotOffsetsY[i] ?? 0),
            });
            canvas.requestRenderAll();
          });
        }

        canvas.requestRenderAll();
      });
    } else {
      // Empty slot
      const emptySlotStyle = {
        fill: 'rgba(244,194,161,0.08)',
        stroke: '#F4C2A1',
        strokeWidth: 2,
        strokeDashArray: [6, 3],
        selectable: false,
        evented: true,
        hoverCursor: 'pointer',
      };

      let slotRect: any;
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

      // Spell out what an empty photo slot can hold (chooser: Photo/Text/Ornament)
      // when the slot is big enough; fall back to a bare "+" in tight cells.
      const cell = Math.min(sw, sh);
      const hint = cell >= 120
        ? new fab.Text('Click to add:\n•  Photo\n•  Text\n•  Ornament', {
            left: sx + sw / 2, top: sy + sh / 2, originX: 'center', originY: 'center',
            fontSize: Math.max(13, Math.min(30, cell * 0.13)),
            fontFamily: '"DM Sans", sans-serif', fontWeight: '700', fill: '#A0562F',
            textAlign: 'center', lineHeight: 1.4, selectable: false, evented: false,
          })
        : new fab.Text('+', {
            left: sx + sw / 2, top: sy + sh / 2, originX: 'center', originY: 'center',
            fontSize: Math.max(24, cell * 0.3),
            fontFamily: '"DM Sans", sans-serif', fontWeight: 'bold', fill: '#E8A598',
            selectable: false, evented: false,
          });
      hint.slotId = `${SLOT_ID}-plus-${i}`;
      canvas.add(hint);

      slotRect.on('mousedown', () => onSlotClick(i));
    }

  });
}

/* ══════════════════════════════════════════════════════════════════════════
 *  Scene Renderer
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
  containerMode: boolean = false,
  albumSize: string = '8x8',
  pageIndex: number = 0,
  onContainerModified?: (slotIndex: number, geometry: import('./types').SlotGeometryOverride) => void,
  onTextSlotClick: (slotIndex: number) => void = () => {},
  onQrSlotClick: (slotIndex: number) => void = () => {},
  onSlotTextClick: (slotIndex: number) => void = () => {},
  onTextSlotEmptyClick: (slotIndex: number) => void = () => {},
  onTextSlotPhotoClick: (slotIndex: number) => void = () => {},
  onTextSlotQrClick: (slotIndex: number) => void = () => {},
  onOrnamentSlotClick: (slotIndex: number) => void = () => {},
  onTextSlotOrnamentClick: (slotIndex: number) => void = () => {},
  onTextSlotOrnamentModified: (slotIndex: number, geom: import('./types').OrnamentTransform) => void = () => {},
) {
  // Increment render ID — cancels stale async image callbacks
  currentRenderId += 1;
  const thisRenderId = currentRenderId;

  // 1. Remove all managed objects
  const toRemove = canvas.getObjects().filter((obj: any) =>
    obj.photoId || obj.textId || obj.isGuide || obj.bgId === BG_ID || obj.slotId
  );
  toRemove.forEach((obj: any) => canvas.remove(obj));

  // 2. Create background
  createBackgroundObject(fab, canvas, page.background, canvasW, canvasH, uploadedPhotos);

  // 3. Render template slots
  const templateId = page.templateId ?? PAGE_TEMPLATES[0].id;
  const template = getTemplateById(templateId);
  const fills = dedupeSlotFills(page.slotFills ?? template?.slots.map(() => null) ?? []);
  const scales = page.slotScales ?? template?.slots.map(() => 1) ?? [];
  const offsetsX = page.slotOffsetsX ?? template?.slots.map(() => 0) ?? [];
  const offsetsY = page.slotOffsetsY ?? template?.slots.map(() => 0) ?? [];

  const geoms = page.slotGeometries;
  if (template) {
    renderTemplateSlots(fab, canvas, template, fills, scales, offsetsX, offsetsY, geoms, uploadedPhotos, canvasW, canvasH, onSlotClick, thisRenderId, containerMode, albumSize, pageIndex, onContainerModified, page.photoBorderColor, page.photoBorderWidth, page.photoBorderStyle, page.frameStyle, page.qrFills, onQrSlotClick, page.slotTexts, onSlotTextClick, page.ornamentFills, onOrnamentSlotClick);
  }

  // 3b. Decorative theme corners (one set, all four corners), locked + on top.
  // Tagged with SLOT_ID so renderTemplateSlots' cleanup clears them next render.
  if (page.cornerBase) {
    const cornerSize = Math.min(canvasW, canvasH) * 0.25;
    const cornerBase = page.cornerBase;
    CORNER_POSITIONS.forEach((pos) => {
      fab.Image.fromURL(cornerImageUrl(cornerBase, pos), (cimg: any) => {
        if (thisRenderId !== currentRenderId) return;
        const isTop = pos === 'tl' || pos === 'tr';
        const isLeft = pos === 'tl' || pos === 'bl';
        const scale = cornerSize / Math.max(cimg.width || cornerSize, cimg.height || cornerSize);
        const dw = (cimg.width || cornerSize) * scale;
        const dh = (cimg.height || cornerSize) * scale;
        cimg.set({
          left: isLeft ? 0 : canvasW - dw,
          top: isTop ? 0 : canvasH - dh,
          scaleX: scale, scaleY: scale,
          selectable: false, evented: false, hasControls: false, hasBorders: false,
        });
        cimg.slotId = `${SLOT_ID}-corner-${pos}`;
        canvas.add(cimg);
        cimg.bringToFront();
        canvas.requestRenderAll();
      });
    });
  }

  // ── Template textbox regions (textSlots) ──────────────────────────────────
  // Match PageView (mobile review + preview): bound captions live INSIDE their
  // textbox region, and empty regions show a "Tap to add text" placeholder. The
  // canvas used to draw bound captions at their raw x/y — which is (0,0) for
  // box-bound text → the top-left corner — and never drew empty placeholders, so
  // the desktop editor lost the textbox (or showed it displaced in the corner).
  const tMargin = template ? marginForTemplate(template, template.margin, albumSize, pageIndex) : null;
  const tSafe = tMargin ? {
    x: canvasW * tMargin.left, y: canvasH * tMargin.top,
    w: canvasW * (1 - tMargin.left - tMargin.right), h: canvasH * (1 - tMargin.top - tMargin.bottom),
  } : null;
  const textSlotRect = (i: number) => {
    const ts = template?.textSlots?.[i];
    if (!ts || !tSafe) return null;
    return { left: tSafe.x + ts.x * tSafe.w, top: tSafe.y + ts.y * tSafe.h, width: ts.width * tSafe.w, height: ts.height * tSafe.h, placeholder: ts.placeholder };
  };

  // ── Caption-box CONTENT (photo / QR) — mirrors the photo-slot precedence.
  // A caption box holds QR → text → photo → empty (mutually exclusive). TEXT is
  // drawn by the text-elements loop below; QR + photo are drawn here. Precedence
  // is enforced so a box never shows two kinds even if state somehow set both.
  (template?.textSlots ?? []).forEach((_ts, i) => {
    const r = textSlotRect(i);
    if (!r) return;
    // (1) QR — white backing + qr image at qrRect(box), mirrors the photo-slot QR.
    const tqr = page.textSlotQr?.[i] ?? null;
    if (tqr) {
      const { dx, dy, side } = qrRect(r.left, r.top, r.width, r.height);
      const backing = new fab.Rect({ left: dx, top: dy, width: side, height: side, fill: '#ffffff', selectable: false, evented: false });
      backing.slotId = `${SLOT_ID}-textqrbg-${i}`;
      canvas.add(backing);
      fab.Image.fromURL(tqr.qrPngDataUrl, (img: any) => {
        if (thisRenderId !== currentRenderId) return;
        img.set({ left: dx, top: dy, selectable: false, evented: true, hoverCursor: 'pointer' });
        img.scaleToWidth(side);
        img.slotId = `${SLOT_ID}-textqr-${i}`;
        img.on('mousedown', () => onTextSlotQrClick(i));
        canvas.add(img);
        canvas.renderAll();
      });
      return;
    }
    // (1b) ORNAMENT — a themed graphic. Unlike a caption (locked to its box), a
    //      graphic is a FREE object: drag to move, corner handles to resize/rotate.
    //      Its transform persists via textSlotOrnamentGeom (center-based page
    //      fractions) so the DOM preview + print place it identically. Single tap
    //      selects/moves; double-click re-opens the picker to swap/remove it.
    const torn = page.textSlotOrnament?.[i] ?? null;
    if (torn) {
      const tgeom = page.textSlotOrnamentGeom?.[i] ?? null;
      fab.Image.fromURL(torn.pngDataUrl, (img: any) => {
        if (thisRenderId !== currentRenderId) return;
        const iw = img.width || 1;
        const ih = img.height || 1;
        if (tgeom) {
          // Persisted transform: center-based page fractions → canvas px.
          img.set({
            originX: 'center', originY: 'center',
            left: tgeom.cx * canvasW, top: tgeom.cy * canvasH,
            scaleX: (tgeom.w * canvasW) / iw, scaleY: (tgeom.h * canvasH) / ih,
            angle: tgeom.rot || 0,
          });
        } else {
          // First placement: contained/padded in the box (as before), centred so a
          // later drag/rotate pivots from the middle.
          const { side } = ornamentFit(r.left, r.top, r.width, r.height);
          img.set({
            originX: 'center', originY: 'center',
            left: r.left + r.width / 2, top: r.top + r.height / 2,
            scaleX: side / iw, scaleY: side / ih, angle: 0,
          });
        }
        img.set({
          selectable: true, evented: true, hasControls: true, hasBorders: true,
          lockUniScaling: true, // keep the vector proportional on a corner drag
          cornerColor: '#F4C2A1', cornerSize: 10, transparentCorners: false,
          borderColor: '#F4C2A1', hoverCursor: 'move',
        });
        img.slotId = `${SLOT_ID}-textornament-${i}`;
        img.on('modified', () => {
          onTextSlotOrnamentModified(i, {
            cx: img.left / canvasW,
            cy: img.top / canvasH,
            w: img.getScaledWidth() / canvasW,
            h: img.getScaledHeight() / canvasH,
            rot: img.angle || 0,
          });
        });
        img.on('mousedblclick', () => onTextSlotOrnamentClick(i));
        canvas.add(img);
        img.setCoords?.();
        canvas.renderAll();
      });
      return;
    }
    // Text wins over photo: skip drawing a caption-box photo if a caption exists.
    if (page.textElements.some((t) => t.boxIndex === i)) return;
    // (3) PHOTO — simplified cover-fit clipped to the box rect (no frame/shape).
    const tPhotoIdx = page.textSlotFills?.[i] ?? null;
    if (tPhotoIdx != null && uploadedPhotos[tPhotoIdx]) {
      const photoUrl = uploadedPhotos[tPhotoIdx].previewUrl;
      fab.Image.fromURL(photoUrl, (img: any) => {
        if (thisRenderId !== currentRenderId) return;
        const imgW = img.width || r.width;
        const imgH = img.height || r.height;
        const coverScale = Math.max(r.width / imgW, r.height / imgH);
        img.set({
          left: r.left + r.width / 2,
          top: r.top + r.height / 2,
          originX: 'center',
          originY: 'center',
          scaleX: coverScale,
          scaleY: coverScale,
          ...SLOT_IMAGE_LOCK,
        });
        const clip = new fab.Rect({ width: r.width, height: r.height, left: r.left + r.width / 2, top: r.top + r.height / 2, originX: 'center', originY: 'center' });
        clip.absolutePositioned = true;
        img.set('clipPath', clip);
        img.slotId = `${SLOT_ID}-textphoto-${i}`;
        img.photoId = `text-slot-photo-${i}`;
        img.on('mousedown', () => onTextSlotPhotoClick(i));
        canvas.add(img);
        canvas.renderAll();
      });
    }
  });

  // 4. Add text elements — use saved width/scale if available
  // Text is collected first, added to canvas, then brought to front.
  // Slot images load async via fab.Image.fromURL — they may be added
  // AFTER text, covering it. We re-bring text to front after a delay.
  const textObjects: any[] = [];
  page.textElements.forEach((text: TextElement) => {
    const slotRect = text.boxIndex != null ? textSlotRect(text.boxIndex) : null;
    const autoWidth = Math.max(text.text.length * text.fontSize * 0.6, 100);
    const fabricText = new fab.Textbox(text.text, {
      left: slotRect ? slotRect.left : text.x,
      // Bound captions sit VERTICALLY CENTERED in their box (origin = center),
      // matching the preview + mobile review. Free text keeps top-left origin.
      top: slotRect ? (slotRect.top + slotRect.height / 2) : text.y,
      originY: slotRect ? 'center' : 'top',
      fontSize: text.fontSize,
      fontFamily: text.fontFamily,
      fill: text.color,
      fontWeight: text.bold ? 'bold' : 'normal',
      fontStyle: text.italic ? 'italic' : 'normal',
      underline: text.underline,
      textAlign: text.alignment,
      stroke: text.outlineWidth && text.outlineColor ? text.outlineColor : undefined,
      strokeWidth: text.outlineWidth && text.outlineColor ? text.outlineWidth : 0,
      paintFirst: 'stroke',
      shadow: text.shadow ? new fab.Shadow({ color: WORDART_SHADOW.color, blur: WORDART_SHADOW.blur, offsetX: WORDART_SHADOW.offsetX, offsetY: WORDART_SHADOW.offsetY }) : undefined,
      angle: text.rotation,
      opacity: text.opacity / 100,
      /* Free text (a title/quote) stays fully movable + inline-editable. A caption
         BOUND to a template textbox is LOCKED to its region and opens the shared
         text editor on click — same as the mobile review + preview — so editing is
         identical in every view (no drifting, no inline quirks). */
      selectable: slotRect ? false : true,
      evented: true,
      editable: slotRect ? false : true,
      hoverCursor: slotRect ? 'pointer' : undefined,
      editingBorderColor: '#F4C2A1',
      cornerColor: '#F4C2A1',
      cornerSize: 8,
      transparentCorners: false,
      borderColor: '#F4C2A1',
      width: slotRect ? slotRect.width : (text.width ?? autoWidth),
      scaleX: text.scaleX ?? 1,
      scaleY: text.scaleY ?? 1,
    });
    fabricText.textId = text.id;
    if (slotRect && text.boxIndex != null) {
      const bi = text.boxIndex;
      fabricText.on('mousedown', () => onTextSlotClick(bi));
    }
    canvas.add(fabricText);
    textObjects.push(fabricText);
  });

  // 4b. Empty textbox placeholders — a tappable "Tap to add text" region in-slot,
  // identical to the mobile review + preview. Clicking opens the shared text
  // editor (via onTextSlotClick) and the typed caption binds to this slot. Skip
  // any slot that already has a caption.
  (template?.textSlots ?? []).forEach((_ts, i) => {
    if (page.textElements.some((t) => t.boxIndex === i)) return;
    // Skip boxes occupied by a caption-box photo/QR/ornament (drawn above).
    if (page.textSlotFills?.[i] != null || page.textSlotQr?.[i] || page.textSlotOrnament?.[i]) return;
    const r = textSlotRect(i);
    if (!r) return;
    const box = new fab.Rect({
      left: r.left, top: r.top, width: r.width, height: r.height,
      fill: 'rgba(253,232,228,0.45)', stroke: 'rgba(232,165,152,0.85)',
      strokeDashArray: [6, 4], strokeWidth: 1.5, rx: 6, ry: 6,
      selectable: false, evented: true, hoverCursor: 'pointer',
    });
    box.slotId = `${SLOT_ID}-textbox-${i}`;
    // Empty combo/caption box is for text (ornaments retired) — tapping opens the
    // caption editor directly.
    const label = new fab.Text('Tap to add text', {
      left: r.left + r.width / 2, top: r.top + r.height / 2, originX: 'center', originY: 'center',
      fontSize: Math.max(12, Math.min(24, Math.min(r.width, r.height) * 0.12)),
      fill: '#A0562F', fontFamily: '"DM Sans", sans-serif', fontWeight: '700', textAlign: 'center',
      selectable: false, evented: false,
    });
    label.slotId = `${SLOT_ID}-textbox-label-${i}`;
    canvas.add(box);
    canvas.add(label);
    box.on('mousedown', () => onTextSlotEmptyClick(i));
  });

  // Ensure text AND the QR chip AND ornaments stay on top even when slot images
  // load async. (A full-bleed photo slot can otherwise resolve after the QR/
  // ornament and paint over it, hiding it in the editor until the next re-render
  // — which would desync the Fabric editor from the DOM preview + print, where
  // QR/ornament always render on top.)
  const bringOverlaysToFront = () => {
    canvas.getObjects().forEach((o: any) => {
      if (typeof o.slotId === 'string' && (o.slotId.includes('-qr-') || o.slotId.includes('-qrbg-') || o.slotId.includes('-ornament-'))) {
        canvas.bringToFront(o);
      }
    });
    textObjects.forEach((t) => { if (canvas.contains(t)) canvas.bringToFront(t); });
    // Free-transform caption-box GRAPHICS sit ON TOP — they can be dragged over a
    // caption, so they must stay visible. (`-ornament-` above doesn't match the
    // `-textornament-` id, so bring them last, above the text objects.)
    canvas.getObjects().forEach((o: any) => {
      if (typeof o.slotId === 'string' && o.slotId.includes('-textornament-')) {
        canvas.bringToFront(o);
      }
    });
  };
  bringOverlaysToFront();
  setTimeout(bringOverlaysToFront, 50);
  setTimeout(bringOverlaysToFront, 150);

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

  // ── Binding (gutter) keep-out guide — the 0.5" spine reserve on the inner edge ──
  {
    const bFrac = bindingMarginFraction(albumSize);
    const onLeft = bindingEdge(pageIndex) === 'left';
    const zoneX = onLeft ? 0 : canvasW * (1 - bFrac);
    const lineX = onLeft ? canvasW * bFrac : canvasW * (1 - bFrac);

    const zone = new fab.Rect({
      left: zoneX, top: 0, width: canvasW * bFrac, height: canvasH,
      fill: 'rgba(232,165,152,0.10)', stroke: 'transparent',
      selectable: false, evented: false, hasControls: false, hasBorders: false,
    });
    zone.isGuide = true;
    canvas.add(zone);

    const bindLine = new fab.Line([lineX, 0, lineX, canvasH], {
      stroke: '#E8A598', strokeWidth: 1.5, strokeDashArray: [8, 5],
      selectable: false, evented: false, opacity: 0.7,
    });
    bindLine.isGuide = true;
    canvas.add(bindLine);
  }

  canvas.renderAll();
}
