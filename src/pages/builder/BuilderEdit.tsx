import { useEffect, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ZoomIn, ZoomOut, Grid3X3, RotateCcw, Loader2, Magnet, Image as ImageIcon } from 'lucide-react';
import type { AlbumPage, TextElement, PhotoFilters, AlbumBackground } from './types';
import { DEFAULT_BG_FILTERS } from './types';
import EditSidebar from './EditSidebar';
import PropertiesPanel from './PropertiesPanel';
import type { BuilderActions } from './useBuilderState';
import fabric from './fabric-loader';
import { getCanvasDimensions } from './layouts';
import { getTemplateById, PAGE_TEMPLATES } from './pageTemplates';
import type { PageTemplate } from './types';

interface BuilderEditProps { actions: BuilderActions; }

/* ── Build Fabric image filters ── */
function buildFabricFilters(fab: any, filters: PhotoFilters): any[] {
  const result: any[] = [];
  if (filters.grayscale > 0) result.push(new fab.Image.filters.Grayscale());
  if (filters.sepia > 0) result.push(new fab.Image.filters.Sepia());
  if (filters.brightness !== 100) result.push(new fab.Image.filters.Brightness({ brightness: (filters.brightness - 100) / 100 }));
  if (filters.contrast !== 100) result.push(new fab.Image.filters.Contrast({ contrast: (filters.contrast - 100) / 100 }));
  if (filters.saturate !== 100) result.push(new fab.Image.filters.Saturation({ saturation: (filters.saturate - 100) / 100 }));
  if (filters.blur > 0) result.push(new fab.Image.filters.Blur({ blur: filters.blur / 10 }));
  if (filters.hueRotate > 0) result.push(new fab.Image.filters.HueRotation({ rotation: filters.hueRotate }));
  return result;
}

const BG_ID = 'page-background';

/* ── Build background object as an editable Fabric object ── */
function createBackgroundObject(
  fab: any,
  canvas: any,
  bg: AlbumBackground,
  W: number,
  H: number,
  onReady?: () => void
) {
  // Remove any existing background objects
  canvas.getObjects().filter((o: any) => o.bgId === BG_ID).forEach((o: any) => canvas.remove(o));

  const filters = bg.filters ?? DEFAULT_BG_FILTERS;
  const opacity = bg.opacity ?? 100;
  const rotation = bg.rotation ?? 0;
  const x = bg.x ?? 0;
  const y = bg.y ?? 0;
  const w = bg.width ?? W;
  const h = bg.height ?? H;

  // Base props for all bg objects (NO width/height here — set per-type)
  const baseProps = {
    left: x, top: y,
    angle: rotation,
    opacity: opacity / 100,
    selectable: true, evented: true,
    hasControls: true, hasBorders: true,
    cornerColor: '#F4C2A1', cornerStrokeColor: '#E8A598',
    cornerSize: 8, transparentCorners: false,
    borderColor: '#F4C2A1', borderDashArray: [4, 2],
    lockMovementX: false, lockMovementY: false,
    lockScalingX: false, lockScalingY: false, lockRotation: false,
  };

  /** Helper: add object as bg and force to index 0 (behind everything) */
  function addBg(obj: any) {
    obj.bgId = BG_ID;
    canvas.add(obj);
    canvas.moveTo(obj, 0);
    canvas.requestRenderAll();
    if (onReady) onReady();
  }

  if (bg.type === 'image' && bg.image) {
    const htmlImg = new Image();
    htmlImg.crossOrigin = 'anonymous';
    htmlImg.onload = () => {
      const fabImg = new fab.Image(htmlImg);
      // For images: use scaleX/Y ONLY (no width/height — those are intrinsic to the image)
      const scaleX = w / (htmlImg.width || w);
      const scaleY = h / (htmlImg.height || h);
      fabImg.set({ ...baseProps, scaleX, scaleY });
      const fabricFilters = buildFabricFilters(fab, filters);
      if (fabricFilters.length > 0) { fabImg.filters = fabricFilters; fabImg.applyFilters(); }
      addBg(fabImg);
    };
    htmlImg.onerror = () => {
      // Fallback to solid color rect on load failure
      const rect = new fab.Rect({ ...baseProps, width: w, height: h, fill: bg.solid || '#FFFBF7' });
      addBg(rect);
    };
    htmlImg.src = bg.image;
  } else if (bg.type === 'gradient' && bg.gradient) {
    const { type, angle, stops } = bg.gradient;
    const fabricStops = stops.reduce((acc: Record<number, string>, s: { offset: number; color: string }) => {
      acc[s.offset] = s.color; return acc;
    }, {});

    let gradFill;
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
    const fill = bg.type === 'pattern' && bg.pattern ? bg.pattern : (bg.solid || '#FFFBF7');
    addBg(new fab.Rect({ ...baseProps, width: w, height: h, fill }));
  }
}

/* ── Render template slots ── */
function renderTemplateSlots(
  fab: any,
  canvas: any,
  template: PageTemplate,
  slotFills: (number | null)[],
  uploadedPhotos: any[],
  canvasW: number,
  canvasH: number,
  onSlotClick: (slotIndex: number) => void,
) {
  const SLOT_ID = 'template-slot';

  // Remove old slot visuals
  canvas.getObjects().filter((o: any) => o.slotId?.startsWith(SLOT_ID)).forEach((o: any) => canvas.remove(o));

  template.slots.forEach((slot, i) => {
    const photoIndex = slotFills[i];
    const sx = (slot.x / 100) * canvasW;
    const sy = (slot.y / 100) * canvasH;
    const sw = (slot.width / 100) * canvasW;
    const sh = (slot.height / 100) * canvasH;

    if (photoIndex !== null && uploadedPhotos[photoIndex]) {
      // ── Filled slot: render photo ──
      fab.Image.fromURL(uploadedPhotos[photoIndex].previewUrl, (img: any) => {
        const imgW = img.width || sw;
        const imgH = img.height || sh;
        // Cover-crop: uniform scale
        const scale = Math.max(sw / imgW, sh / imgH);
        img.set({
          left: sx + sw / 2, top: sy + sh / 2,
          originX: 'center', originY: 'center',
          scaleX: scale, scaleY: scale,
          angle: slot.rotation ?? 0,
          selectable: true, evented: true,
          cornerColor: '#F4C2A1', cornerSize: 6,
          transparentCorners: false, borderColor: '#F4C2A1',
        });
        img.slotId = `${SLOT_ID}-photo-${i}`;
        img.photoIndex = photoIndex;
        img.slotIndex = i;
        img.photoId = `slot-photo-${i}`; // ← for selection system compatibility

        // Apply shape clipPath
        if (slot.shape === 'circle') {
          img.set('clipPath', new fab.Circle({ radius: Math.min(sw, sh) / 2, originX: 'center', originY: 'center' }));
        } else if (slot.shape === 'rounded' && slot.borderRadius) {
          const r = Math.min(slot.borderRadius, Math.min(sw, sh) / 2);
          img.set('clipPath', new fab.Rect({ width: sw, height: sh, rx: r, ry: r, originX: 'center', originY: 'center' }));
        } else if (slot.shape === 'oval') {
          img.set('clipPath', new fab.Ellipse({ rx: sw / 2, ry: sh / 2, originX: 'center', originY: 'center' }));
        } else if (slot.shape === 'heart') {
          // Heart via custom path clip
          const hr = Math.min(sw, sh) / 2;
          const heartPath = `M 0 ${-hr * 0.3} C ${-hr} ${-hr * 1.2} ${-hr * 1.5} ${hr * 0.3} 0 ${hr} C ${hr * 1.5} ${hr * 0.3} ${hr} ${-hr * 1.2} 0 ${-hr * 0.3} Z`;
          img.set('clipPath', new fab.Path(heartPath, { originX: 'center', originY: 'center' }));
        }

        canvas.add(img);
        canvas.bringToFront(img);
        canvas.requestRenderAll();
      });
    } else {
      // ── Empty slot: show dashed rect with + ──
      let slotRect;
      if (slot.shape === 'circle') {
        const r = Math.min(sw, sh) / 2;
        slotRect = new fab.Circle({
          left: sx + sw / 2, top: sy + sh / 2, radius: r,
          originX: 'center', originY: 'center',
          fill: 'rgba(244,194,161,0.08)', stroke: '#F4C2A1', strokeWidth: 2, strokeDashArray: [8, 4],
          selectable: false, evented: true, hoverCursor: 'pointer',
        });
      } else if (slot.shape === 'rounded' && slot.borderRadius) {
        const r = Math.min(slot.borderRadius, Math.min(sw, sh) / 2);
        slotRect = new fab.Rect({
          left: sx, top: sy, width: sw, height: sh, rx: r, ry: r,
          fill: 'rgba(244,194,161,0.08)', stroke: '#F4C2A1', strokeWidth: 2, strokeDashArray: [8, 4],
          selectable: false, evented: true, hoverCursor: 'pointer',
        });
      } else if (slot.shape === 'oval') {
        slotRect = new fab.Ellipse({
          left: sx + sw / 2, top: sy + sh / 2, rx: sw / 2, ry: sh / 2,
          originX: 'center', originY: 'center',
          fill: 'rgba(244,194,161,0.08)', stroke: '#F4C2A1', strokeWidth: 2, strokeDashArray: [8, 4],
          selectable: false, evented: true, hoverCursor: 'pointer',
        });
      } else if (slot.shape === 'heart') {
        const hr = Math.min(sw, sh) / 2;
        const heartPath = `M 0 ${-hr * 0.3} C ${-hr} ${-hr * 1.2} ${-hr * 1.5} ${hr * 0.3} 0 ${hr} C ${hr * 1.5} ${hr * 0.3} ${hr} ${-hr * 1.2} 0 ${-hr * 0.3} Z`;
        slotRect = new fab.Path(heartPath, {
          left: sx + sw / 2, top: sy + sh / 2,
          originX: 'center', originY: 'center',
          fill: 'rgba(244,194,161,0.08)', stroke: '#F4C2A1', strokeWidth: 2, strokeDashArray: [8, 4],
          selectable: false, evented: true, hoverCursor: 'pointer',
        });
      } else {
        slotRect = new fab.Rect({
          left: sx, top: sy, width: sw, height: sh,
          fill: 'rgba(244,194,161,0.06)', stroke: '#F4C2A1', strokeWidth: 2, strokeDashArray: [8, 4],
          selectable: false, evented: true, hoverCursor: 'pointer',
        });
      }

      slotRect.slotId = `${SLOT_ID}-empty-${i}`;
      slotRect.slotIndex = i;
      canvas.add(slotRect);

      // Add + icon text
      const plusText = new fab.Text('+', {
        left: sx + sw / 2, top: sy + sh / 2,
        originX: 'center', originY: 'center',
        fontSize: Math.max(24, Math.min(sw, sh) * 0.3),
        fontFamily: '"DM Sans", sans-serif',
        fontWeight: 'bold',
        fill: '#E8A598', selectable: false, evented: false,
      });
      plusText.slotId = `${SLOT_ID}-plus-${i}`;
      canvas.add(plusText);

      // Click handler for the slot
      slotRect.on('mousedown', () => onSlotClick(i));
    }
  });
}

/* ── Snap helpers ── */
const GRID_SIZE = 30;
const SNAP_THRESHOLD = 12;

function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

function getSnapLines(canvasW: number, canvasH: number, margin: number) {
  const centerX = canvasW / 2;
  const centerY = canvasH / 2;
  return {
    vertical: [margin, centerX, canvasW - margin],
    horizontal: [margin, centerY, canvasH - margin],
  };
}

/* ── Structural fingerprint ── */
function pageFingerprint(pageIndex: number, page: AlbumPage): string {
  const bg = page.background;
  const bgTransform = `${bg.x ?? 0},${bg.y ?? 0},${bg.width ?? 0},${bg.height ?? 0},${bg.rotation ?? 0},${bg.opacity ?? 100}`;
  const slotFills = page.slotFills ? page.slotFills.join(',') : '';
  return `${pageIndex}|${page.textElements.map(t => t.id).join(',')}|${JSON.stringify(page.background)}|${bgTransform}|${page.templateId ?? ''}|${slotFills}`;
}

/* ── Render scene ── */
function renderScene(
  fab: any, canvas: any, page: AlbumPage, uploadedPhotos: any[],
  albumType: 'standard' | 'layflat',
  canvasW: number, canvasH: number,
  onSlotClick: (slotIndex: number) => void,
) {
  // ── 1. Remove all old objects ──
  const toRemove = canvas.getObjects().filter((obj: any) =>
    obj.photoId || obj.textId || obj.isGuide || obj.bgId === BG_ID || obj.slotId
  );
  toRemove.forEach((obj: any) => canvas.remove(obj));

  // ── 2. Create background FIRST so it sits behind everything ──
  createBackgroundObject(fab, canvas, page.background, canvasW, canvasH);

  // ── 3. Render template slots ONLY ──
  const templateId = page.templateId ?? PAGE_TEMPLATES[0].id;
  const template = getTemplateById(templateId);
  const slotFills = page.slotFills ?? template?.slots.map(() => null) ?? [];
  if (template) {
    renderTemplateSlots(fab, canvas, template, slotFills, uploadedPhotos, canvasW, canvasH, onSlotClick);
  }

  // ── 4. Add text on top ──
  page.textElements.forEach((text: TextElement) => {
    const fabricText = new fab.Textbox(text.text, {
      left: text.x, top: text.y, fontSize: text.fontSize, fontFamily: text.fontFamily,
      fill: text.color, fontWeight: text.bold ? 'bold' : 'normal',
      fontStyle: text.italic ? 'italic' : 'normal', underline: text.underline,
      textAlign: text.alignment, angle: text.rotation, opacity: text.opacity / 100,
      selectable: true, evented: true, cornerColor: '#F4C2A1', cornerSize: 8,
      transparentCorners: false, borderColor: '#F4C2A1',
    });
    fabricText.textId = text.id;
    canvas.add(fabricText);
    canvas.bringToFront(fabricText);
  });

  // ── 5. Layflat crease guide ──
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

export default function BuilderEdit({ actions }: BuilderEditProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<any>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  const dims = getCanvasDimensions(actions.albumSize || '8x10');
  const CANVAS_W = dims.width;
  const CANVAS_H = dims.height;
  const MARGIN = Math.max(24, Math.min(40, Math.round(Math.min(CANVAS_W, CANVAS_H) * 0.05)));

  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [selectedBg, setSelectedBg] = useState(false);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null);
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'photos' | 'pages' | 'layers' | 'templates'>('photos');
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const snapGuidesRef = useRef<any[]>([]);

  const currentPage = actions.currentPage;
  const uploadedPhotos = actions.uploadedPhotos;
  const fab = fabric as any;
  const fabricValid = fab && (fab.Canvas || fab.fabric);

  /* ── Clear snap guide lines ── */
  const clearSnapGuides = useCallback((canvas: any) => {
    snapGuidesRef.current.forEach((g) => canvas.remove(g));
    snapGuidesRef.current = [];
  }, []);

  /* ── Draw a snap guide line ── */
  const showSnapGuide = useCallback((canvas: any, x1: number, y1: number, x2: number, y2: number) => {
    const line = new fab.Line([x1, y1, x2, y2], {
      stroke: '#E8A598', strokeWidth: 1, selectable: false, evented: false,
    });
    snapGuidesRef.current.push(line);
    canvas.add(line);
    canvas.renderAll();
  }, []);

  /* ── Init canvas (runs once) ── */
  useEffect(() => {
    if (!canvasRef.current || fabricRef.current || !fabricValid) return;

    const canvas = new fab.Canvas(canvasRef.current, {
      width: CANVAS_W, height: CANVAS_H, backgroundColor: '#FFFBF7',
      preserveObjectStacking: true, selection: true, uniScaleTransform: false,
    });

    // Selection events
    canvas.on('selection:created', (e: any) => {
      const obj = e.selected?.[0];
      if (obj) {
        if (obj.photoId) { setSelectedPhotoId(obj.photoId); setSelectedTextId(null); setSelectedBg(false); setSelectedSlotIndex(obj.slotIndex ?? null); }
        if (obj.textId) { setSelectedTextId(obj.textId); setSelectedPhotoId(null); setSelectedBg(false); setSelectedSlotIndex(null); }
        if (obj.bgId === BG_ID) { setSelectedBg(true); setSelectedPhotoId(null); setSelectedTextId(null); setSelectedSlotIndex(null); }
      }
    });
    canvas.on('selection:updated', (e: any) => {
      const obj = e.selected?.[0];
      if (obj) {
        if (obj.photoId) { setSelectedPhotoId(obj.photoId); setSelectedTextId(null); setSelectedBg(false); setSelectedSlotIndex(obj.slotIndex ?? null); }
        if (obj.textId) { setSelectedTextId(obj.textId); setSelectedPhotoId(null); setSelectedBg(false); setSelectedSlotIndex(null); }
        if (obj.bgId === BG_ID) { setSelectedBg(true); setSelectedPhotoId(null); setSelectedTextId(null); setSelectedSlotIndex(null); }
      }
    });
    canvas.on('selection:cleared', () => { setSelectedPhotoId(null); setSelectedTextId(null); setSelectedBg(false); setSelectedSlotIndex(null); });

    // ── Click on empty canvas area → select background ──
    canvas.on('mouse:down', (e: any) => {
      // If user clicked on empty space (not on any object), select the background
      if (!e.target && !e.subTargets?.length) {
        const bgObj = canvas.getObjects().find((o: any) => o.bgId === BG_ID);
        if (bgObj) {
          canvas.setActiveObject(bgObj);
          canvas.requestRenderAll();
          setSelectedBg(true); setSelectedPhotoId(null); setSelectedTextId(null);
        }
      }
    });

    // ── SNAP-TO-GRID & ALIGNMENT during drag ──
    canvas.on('object:moving', (e: any) => {
      const obj = e.target;
      if (!obj || !snapEnabled) return;

      clearSnapGuides(canvas);

      const objW = obj.getScaledWidth();
      const objH = obj.getScaledHeight();
      const left = obj.left ?? 0;
      const top = obj.top ?? 0;
      const right = left + objW;
      const bottom = top + objH;
      const centerX = left + objW / 2;
      const centerY = top + objH / 2;

      // Snap points to check
      const snapPointsX = [left, centerX, right];
      const snapPointsY = [top, centerY, bottom];

      let snappedX = false;
      let snappedY = false;

      // ── 1. Snap to grid ──
      if (showGrid) {
        for (const pt of snapPointsX) {
          const gridLine = snapToGrid(pt, GRID_SIZE);
          if (Math.abs(pt - gridLine) < SNAP_THRESHOLD) {
            const offset = gridLine - pt;
            obj.set('left', left + offset);
            showSnapGuide(canvas, gridLine, 0, gridLine, CANVAS_H);
            snappedX = true;
            break;
          }
        }
        for (const pt of snapPointsY) {
          const gridLine = snapToGrid(pt, GRID_SIZE);
          if (Math.abs(pt - gridLine) < SNAP_THRESHOLD) {
            const offset = gridLine - pt;
            obj.set('top', top + offset);
            showSnapGuide(canvas, 0, gridLine, CANVAS_W, gridLine);
            snappedY = true;
            break;
          }
        }
      }

      // ── 2. Snap to center & edges ──
      if (!snappedX) {
        const snapLines = getSnapLines(CANVAS_W, CANVAS_H, MARGIN);
        for (const lineX of snapLines.vertical) {
          for (const pt of snapPointsX) {
            if (Math.abs(pt - lineX) < SNAP_THRESHOLD) {
              const offset = lineX - pt;
              obj.set('left', (obj.left ?? 0) + offset);
              showSnapGuide(canvas, lineX, 0, lineX, CANVAS_H);
              snappedX = true;
              break;
            }
          }
          if (snappedX) break;
        }
      }

      if (!snappedY) {
        const snapLines = getSnapLines(CANVAS_W, CANVAS_H, MARGIN);
        for (const lineY of snapLines.horizontal) {
          for (const pt of snapPointsY) {
            if (Math.abs(pt - lineY) < SNAP_THRESHOLD) {
              const offset = lineY - pt;
              obj.set('top', (obj.top ?? 0) + offset);
              showSnapGuide(canvas, 0, lineY, CANVAS_W, lineY);
              snappedY = true;
              break;
            }
          }
          if (snappedY) break;
        }
      }

      // ── 3. Snap to other objects (alignment) ──
      const otherObjects = canvas.getObjects().filter((o: any) =>
        o !== obj && (o.photoId || o.textId) && !o.isGuide && o.bgId !== BG_ID
      );

      for (const other of otherObjects) {
        const oW = other.getScaledWidth?.() || other.width || 0;
        const oH = other.getScaledHeight?.() || other.height || 0;
        const oLeft = other.left ?? 0;
        const oTop = other.top ?? 0;
        const oRight = oLeft + oW;
        const oBottom = oTop + oH;
        const oCenterX = oLeft + oW / 2;
        const oCenterY = oTop + oH / 2;

        const otherX = [oLeft, oCenterX, oRight];
        const otherY = [oTop, oCenterY, oBottom];

        if (!snappedX) {
          for (const pt of snapPointsX) {
            for (const opt of otherX) {
              if (Math.abs(pt - opt) < SNAP_THRESHOLD) {
                const offset = opt - pt;
                obj.set('left', (obj.left ?? 0) + offset);
                showSnapGuide(canvas, opt, 0, opt, CANVAS_H);
                snappedX = true;
                break;
              }
            }
            if (snappedX) break;
          }
        }

        if (!snappedY) {
          for (const pt of snapPointsY) {
            for (const opt of otherY) {
              if (Math.abs(pt - opt) < SNAP_THRESHOLD) {
                const offset = opt - pt;
                obj.set('top', (obj.top ?? 0) + offset);
                showSnapGuide(canvas, 0, opt, CANVAS_W, opt);
                snappedY = true;
                break;
              }
            }
            if (snappedY) break;
          }
        }
      }
    });

    // Clear snap guides when drag ends
    canvas.on('object:modified', (e: any) => {
      clearSnapGuides(canvas);
      const obj = e.target;
      if (!obj) return;
      if (obj.photoId) {
        actions.updatePhotoTransform(obj.photoId, {
          x: obj.left ?? 0, y: obj.top ?? 0,
          width: obj.getScaledWidth(), height: obj.getScaledHeight(),
          rotation: obj.angle ?? 0, scaleX: 1, scaleY: 1,
        });
      }
      if (obj.textId) {
        actions.updateTextElement(obj.textId, {
          x: obj.left ?? 0, y: obj.top ?? 0, rotation: obj.angle ?? 0,
        });
      }
      if (obj.bgId === BG_ID) {
        actions.updateBackgroundTransform({
          x: obj.left ?? 0, y: obj.top ?? 0,
          width: obj.getScaledWidth(), height: obj.getScaledHeight(),
          rotation: obj.angle ?? 0,
        });
      }
    });

    fabricRef.current = canvas;
    createBackgroundObject(fab, canvas, currentPage.background, CANVAS_W, CANVAS_H);
    canvas.renderAll();

    return () => {
      if (fabricRef.current) { fabricRef.current.dispose(); fabricRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Resize canvas when album size changes ── */
  useEffect(() => {
    if (!fabricRef.current || !fabricValid) return;
    const canvas = fabricRef.current;
    canvas.setWidth(CANVAS_W);
    canvas.setHeight(CANVAS_H);
    canvas.renderAll();
  }, [CANVAS_W, CANVAS_H, fabricValid]);

  /* ── Render scene ONLY on structural changes ── */
  const lastStructuralRef = useRef<string>('');
  useEffect(() => {
    if (!fabricRef.current || !fabricValid) return;
    const fingerprint = pageFingerprint(actions.currentPageIndex, currentPage);
    if (lastStructuralRef.current === fingerprint) return;
    lastStructuralRef.current = fingerprint;

    const canvas = fabricRef.current;
    const active = canvas.getActiveObject?.();
    const savedPhotoId = active?.photoId ?? null;
    const savedTextId = active?.textId ?? null;

    renderScene(fab, canvas, currentPage, uploadedPhotos, actions.albumType, CANVAS_W, CANVAS_H, (slotIndex) => {
      setSelectedSlotIndex(slotIndex);
      setShowPhotoPicker(true);
    });

    if (savedPhotoId || savedTextId) {
      setTimeout(() => {
        const obj = canvas.getObjects().find((o: any) =>
          (savedPhotoId && o.photoId === savedPhotoId) ||
          (savedTextId && o.textId === savedTextId)
        );
        if (obj) { canvas.setActiveObject(obj); canvas.requestRenderAll(); }
      }, 120);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fabricValid, actions.currentPageIndex, currentPage.textElements.map((t) => t.id).join(','), JSON.stringify(currentPage.background), uploadedPhotos, actions.albumType, CANVAS_W, CANVAS_H, currentPage.templateId, currentPage.slotFills?.join(',')]);

  /* ── Update filter in-place ── */
  useEffect(() => {
    if (!fabricRef.current || !selectedPhotoId || !fabricValid) return;
    const photo = currentPage.photos.find((p) => p.id === selectedPhotoId);
    if (!photo) return;
    const obj = fabricRef.current.getObjects().find((o: any) => o.photoId === selectedPhotoId);
    if (!obj) return;
    if (typeof obj.applyFilters === 'function') {
      obj.filters = buildFabricFilters(fab, photo.filters);
      obj.applyFilters();
    }
    obj.set('opacity', photo.filters.opacity / 100);
    fabricRef.current.renderAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPhotoId, currentPage.photos.find((p) => p.id === selectedPhotoId)?.filters]);

  /* ── Update border/shadow in-place ── */
  useEffect(() => {
    if (!fabricRef.current || !selectedPhotoId || !fabricValid) return;
    const photo = currentPage.photos.find((p) => p.id === selectedPhotoId);
    if (!photo) return;
    const obj = fabricRef.current.getObjects().find((o: any) => o.photoId === selectedPhotoId);
    if (!obj) return;
    if (photo.borderWidth > 0) { obj.set('stroke', photo.borderColor); obj.set('strokeWidth', photo.borderWidth); }
    else { obj.set('stroke', undefined); obj.set('strokeWidth', 0); }
    if (photo.shadowBlur > 0) {
      obj.set('shadow', new fab.Shadow({ color: photo.shadowColor, blur: photo.shadowBlur, offsetX: photo.shadowOffsetX, offsetY: photo.shadowOffsetY }));
    } else { obj.set('shadow', undefined); }
    fabricRef.current.renderAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPhotoId, currentPage.photos.find((p) => p.id === selectedPhotoId)?.borderWidth, currentPage.photos.find((p) => p.id === selectedPhotoId)?.shadowBlur]);

  /* ── Update background filters in-place ── */
  useEffect(() => {
    if (!fabricRef.current || !selectedBg || !fabricValid) return;
    const bg = currentPage.background;
    const obj = fabricRef.current.getObjects().find((o: any) => o.bgId === BG_ID);
    if (!obj) return;
    const filters = bg.filters ?? DEFAULT_BG_FILTERS;
    if (typeof obj.applyFilters === 'function') {
      obj.filters = buildFabricFilters(fab, filters);
      obj.applyFilters();
    }
    obj.set('opacity', (bg.opacity ?? 100) / 100);
    fabricRef.current.renderAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBg, JSON.stringify(currentPage.background.filters), currentPage.background.opacity]);

  /* ── Auto-clear selection if deleted ── */
  useEffect(() => {
    if (selectedPhotoId && !currentPage.photos.find((p) => p.id === selectedPhotoId)) {
      setSelectedPhotoId(null);
      if (fabricRef.current) { fabricRef.current.discardActiveObject(); fabricRef.current.requestRenderAll(); }
    }
    if (selectedTextId && !currentPage.textElements.find((t) => t.id === selectedTextId)) {
      setSelectedTextId(null);
      if (fabricRef.current) { fabricRef.current.discardActiveObject(); fabricRef.current.requestRenderAll(); }
    }
    if (selectedBg) {
      // Background always exists, but deselect if page changes
      const bgObj = fabricRef.current?.getObjects().find((o: any) => o.bgId === BG_ID);
      if (!bgObj || !bgObj.active) {
        setSelectedBg(false);
      }
    }
  }, [currentPage.photos, currentPage.textElements, selectedPhotoId, selectedTextId, selectedBg]);

  /* ── Keyboard Delete ── */
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (selectedSlotIndex !== null) { actions.clearSlot(selectedSlotIndex); setSelectedSlotIndex(null); fabricRef.current?.discardActiveObject(); fabricRef.current?.requestRenderAll(); }
        else if (selectedPhotoId) { actions.deletePhotoFromCanvas(selectedPhotoId); }
        else if (selectedTextId) { actions.deleteTextElement(selectedTextId); }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedPhotoId, selectedTextId, selectedSlotIndex, actions]);

  /* ── Mouse wheel page navigation ── */
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [data-no-scroll]')) return;
      if (e.deltaY > 30) {
        e.preventDefault();
        const nextIndex = Math.min(actions.currentPageIndex + 1, actions.albumPages.length - 1);
        if (nextIndex !== actions.currentPageIndex) actions.goToPage(nextIndex);
      } else if (e.deltaY < -30) {
        e.preventDefault();
        const prevIndex = Math.max(actions.currentPageIndex - 1, 0);
        if (prevIndex !== actions.currentPageIndex) actions.goToPage(prevIndex);
      }
    };
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [actions.currentPageIndex, actions.albumPages.length, actions]);

  /* ── Grid overlay ── */
  useEffect(() => {
    if (!fabricRef.current || !fabricValid) return;
    const canvas = fabricRef.current;
    canvas.getObjects().filter((obj: any) => obj.isGrid).forEach((obj: any) => canvas.remove(obj));
    if (showGrid) {
      const gridSize = GRID_SIZE;
      for (let x = 0; x < CANVAS_W; x += gridSize) {
        const line = new fab.Line([x, 0, x, CANVAS_H], { stroke: '#E8E8E8', strokeWidth: 0.5, selectable: false, evented: false });
        line.isGrid = true; canvas.add(line); canvas.sendToBack(line);
      }
      for (let y = 0; y < CANVAS_H; y += gridSize) {
        const line = new fab.Line([0, y, CANVAS_W, y], { stroke: '#E8E8E8', strokeWidth: 0.5, selectable: false, evented: false });
        line.isGrid = true; canvas.add(line); canvas.sendToBack(line);
      }
    }
    createBackgroundObject(fab, canvas, currentPage.background, CANVAS_W, CANVAS_H);
    canvas.renderAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showGrid, CANVAS_W, CANVAS_H]);

  const handleZoom = useCallback((delta: number) => {
    setZoom((z) => {
      const newZ = Math.max(0.3, Math.min(3, z + delta));
      const canvas = fabricRef.current;
      if (canvas) { canvas.setZoom(newZ); canvas.renderAll(); }
      return newZ;
    });
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(1);
    const canvas = fabricRef.current;
    if (canvas) { canvas.setZoom(1); canvas.renderAll(); }
  }, []);

  const selectedPhoto = selectedPhotoId ? (currentPage.photos.find((p) => p.id === selectedPhotoId) ?? null) : null;
  const selectedText = selectedTextId ? (currentPage.textElements.find((t) => t.id === selectedTextId) ?? null) : null;
  const bgFilters = currentPage.background.filters ?? DEFAULT_BG_FILTERS;
  const bgForPanel = selectedBg ? {
    ...currentPage.background,
    x: currentPage.background.x ?? 0,
    y: currentPage.background.y ?? 0,
    width: currentPage.background.width ?? CANVAS_W,
    height: currentPage.background.height ?? CANVAS_H,
    rotation: currentPage.background.rotation ?? 0,
    filters: bgFilters,
    opacity: currentPage.background.opacity ?? 100,
  } : null;

  if (!fabricValid) {
    return (
      <div className="flex h-full bg-[#F5F5F5] items-center justify-center">
        <div className="text-center">
          <p className="text-[#E8A598] font-medium mb-2">Editor engine failed to load</p>
          <p className="text-sm text-[#6B6B6B]">Please refresh the page and try again.</p>
          <button onClick={() => window.location.reload()} className="mt-4 px-6 py-2 bg-[#F4C2A1] text-white rounded-lg font-medium hover:brightness-105">Refresh Page</button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ── Photo Picker Modal ── */}
      {showPhotoPicker && selectedSlotIndex !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowPhotoPicker(false)}>
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-xl shadow-2xl p-4 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-[#2D2D2D]">Choose a Photo for Slot {selectedSlotIndex + 1}</h3>
              <button onClick={() => setShowPhotoPicker(false)} className="text-[#9B9B9B] hover:text-[#2D2D2D]">✕</button>
            </div>
            {uploadedPhotos.length === 0 ? (
              <p className="text-xs text-[#9B9B9B] text-center py-4">No photos uploaded yet.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {uploadedPhotos.map((photo, idx) => (
                  <button key={photo.id} onClick={() => { actions.fillSlot(selectedSlotIndex, idx); setShowPhotoPicker(false); }}
                    className="aspect-square rounded-lg overflow-hidden border-2 border-transparent hover:border-[#F4C2A1] transition-colors">
                    <img src={photo.previewUrl} alt={photo.name} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      )}

    <div className="flex h-full bg-[#F5F5F5]">
      <EditSidebar activeTab={sidebarTab} onTabChange={setSidebarTab} uploadedPhotos={uploadedPhotos} albumPages={actions.albumPages} currentPageIndex={actions.currentPageIndex} photos={currentPage.photos} textElements={currentPage.textElements} selectedPhotoId={selectedPhotoId} selectedTextId={selectedTextId} onSelectPhoto={setSelectedPhotoId} onSelectText={setSelectedTextId} onGoToPage={actions.goToPage} onAddPage={actions.addPage} onDeletePage={actions.deletePage} onDuplicatePage={actions.duplicatePage} onAddText={actions.addTextElement} currentTemplateId={currentPage.templateId} onSetTemplate={actions.setPageTemplate} onAutoFill={actions.autoFillSlots} onClearAllSlots={actions.clearAllSlots} onAddPhotos={actions.addPhotos} />

      <div className="flex-1 flex flex-col relative overflow-hidden">
        {/* Toolbar */}
        <div className="h-10 bg-white border-b border-[#E8E8E8] flex items-center justify-between px-3">
          <div className="flex items-center gap-1">
            <span className="text-xs font-medium text-[#2D2D2D] mr-2">Page {actions.currentPageIndex + 1} of {actions.albumPages.length}</span>
            <div className="w-px h-5 bg-[#E8E8E8] mx-1" />
            <button onClick={() => handleZoom(0.1)} className="p-1.5 rounded hover:bg-[#F0F0F0] text-[#6B6B6B]"><ZoomIn size={14} /></button>
            <span className="text-[11px] text-[#9B9B9B] w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => handleZoom(-0.1)} className="p-1.5 rounded hover:bg-[#F0F0F0] text-[#6B6B6B]"><ZoomOut size={14} /></button>
            <button onClick={resetZoom} className="p-1.5 rounded hover:bg-[#F0F0F0] text-[#6B6B6B]"><RotateCcw size={14} /></button>
            <div className="w-px h-5 bg-[#E8E8E8] mx-1" />
            <button onClick={() => setShowGrid(!showGrid)} className="p-1.5 rounded text-[#6B6B6B] transition-colors" style={{ backgroundColor: showGrid ? '#FDE8E4' : 'transparent', color: showGrid ? '#E8A598' : '#6B6B6B' }} title="Toggle grid"><Grid3X3 size={14} /></button>
            <button onClick={() => setSnapEnabled(!snapEnabled)} className="p-1.5 rounded text-[#6B6B6B] transition-colors ml-1" style={{ backgroundColor: snapEnabled ? '#FDE8E4' : 'transparent', color: snapEnabled ? '#E8A598' : '#6B6B6B' }} title="Toggle snap"><Magnet size={14} /></button>
            <div className="w-px h-5 bg-[#E8E8E8] mx-1" />
            <button onClick={() => {
              const canvas = fabricRef.current;
              if (!canvas) return;
              let bgObj = canvas.getObjects().find((o: any) => o.bgId === BG_ID);
              // If bg object doesn't exist yet (async loading), create it now
              if (!bgObj) {
                createBackgroundObject(fab, canvas, currentPage.background, CANVAS_W, CANVAS_H);
                bgObj = canvas.getObjects().find((o: any) => o.bgId === BG_ID);
              }
              if (bgObj) {
                canvas.discardActiveObject();
                canvas.setActiveObject(bgObj);
                canvas.requestRenderAll();
                setSelectedBg(true); setSelectedPhotoId(null); setSelectedTextId(null);
              }
            }} className="p-1.5 rounded text-[#6B6B6B] transition-colors" style={{ backgroundColor: selectedBg ? '#FDE8E4' : 'transparent', color: selectedBg ? '#E8A598' : '#6B6B6B' }} title="Select background"><ImageIcon size={14} /></button>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => actions.setPhase('template')} className="px-3 py-1 text-xs font-medium text-[#6B6B6B] hover:text-[#2D2D2D]">Back</button>
            <button onClick={() => actions.setPhase('preview')} className="px-4 py-1.5 bg-[#F4C2A1] text-white text-xs font-medium rounded-lg hover:brightness-105">Preview</button>
          </div>
        </div>

        <div ref={canvasContainerRef} className="flex-1 overflow-auto flex items-center justify-center p-8" title="Scroll up/down to navigate between pages">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }} className="shadow-xl relative">
            <canvas ref={canvasRef} style={{ width: CANVAS_W * zoom, height: CANVAS_H * zoom }} />
            {!fabricRef.current && (
              <div className="absolute inset-0 bg-[#FFFBF7] flex flex-col items-center justify-center z-10">
                <Loader2 size={32} className="text-[#F4C2A1] animate-spin mb-3" />
                <p className="text-sm text-[#6B6B6B] font-medium">Loading editor...</p>
              </div>
            )}
          </motion.div>
        </div>
      </div>

      <div className="w-64 bg-white border-l border-[#E8E8E8] overflow-hidden">
        <PropertiesPanel
          selectedPhoto={selectedPhoto}
          selectedText={selectedText}
          selectedBackground={bgForPanel}
          background={currentPage.background}
          onUpdatePhoto={actions.updatePhotoTransform}
          onUpdateFilters={actions.updatePhotoFilters}
          onUpdateText={actions.updateTextElement}
          onDeletePhoto={actions.deletePhotoFromCanvas}
          onDeleteText={actions.deleteTextElement}
          onDuplicatePhoto={actions.duplicateCanvasPhoto}
          onBringToFront={actions.bringToFront}
          onSendToBack={actions.sendToBack}
          onUpdateBackground={actions.setPageBackground}
          onUpdateBackgroundTransform={actions.updateBackgroundTransform}
          onUpdateBackgroundFilters={actions.updateBackgroundFilters}
        />
      </div>
    </div>
    </>
  );
}
