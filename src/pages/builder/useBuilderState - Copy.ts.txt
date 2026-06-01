import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  AlbumSizePreset,
  AlbumPage,
  UploadedPhoto,
  CanvasPhoto,
  TextElement,
  TemplateType,
  AlbumBackground,
  PhotoFilters,
  SlotGeometryOverride,
} from './types';
import { PAGE_TEMPLATES } from './pageTemplates';
import { generateAlbum } from './generateAlbum';

/* ══════════════════════════════════════════════════════════════════════════
   useBuilderState — All builder state + localStorage persistence
   ══════════════════════════════════════════════════════════════════════════ */

const MIN_PAGES = 40;
const STORAGE_KEY = 'megy-album-v5';

// AlbumType is not exported from types.ts — define locally
type AlbumType = 'standard';

function createEmptyPage(index: number, size: AlbumSizePreset): AlbumPage {
  return {
    id: `page-${Date.now()}-${index}`,
    layout: 'freeform',
    size,
    background: { type: 'solid', solid: '#FFFBF7' },
    photos: [],
    textElements: [],
    slotFills: [],
    slotScales: [],
    slotOffsetsX: [],
    slotOffsetsY: [],
    slotGeometries: [],
  };
}

interface SerializedState {
  albumType: AlbumType;
  albumSize: AlbumSizePreset;
  selectedTemplate: TemplateType;
  uploadedPhotos: UploadedPhoto[];
  albumPages: AlbumPage[];
  currentPageIndex: number;
  rejectedTemplateIds: string[];
  photosPerPage: number | undefined;
}

function loadState(): Partial<SerializedState> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SerializedState;
  } catch {
    return null;
  }
}

function saveState(state: SerializedState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full — silently fail
  }
}

/* ── Initial state factory ── */
function getInitialState(): SerializedState {
  const saved = loadState();
  const defaultSize: AlbumSizePreset = '8x8';

  return {
    albumType: saved?.albumType ?? 'standard',
    albumSize: saved?.albumSize ?? defaultSize,
    selectedTemplate: saved?.selectedTemplate ?? 'classic',
    uploadedPhotos: saved?.uploadedPhotos ?? [],
    // Always start with MIN_PAGES empty pages
    albumPages: saved?.albumPages ?? Array.from({ length: MIN_PAGES }, (_, i) => createEmptyPage(i, defaultSize)),
    currentPageIndex: saved?.currentPageIndex ?? 0,
    rejectedTemplateIds: saved?.rejectedTemplateIds ?? [],
    photosPerPage: saved?.photosPerPage ?? undefined,
  };
}

export interface BuilderActions {
  // Album config
  albumType: AlbumType;
  albumSize: AlbumSizePreset;
  selectedTemplate: TemplateType;
  setAlbumSize: (s: AlbumSizePreset) => void;
  setAlbumType: (t: AlbumType) => void;
  setSelectedTemplate: (t: TemplateType) => void;

  // Photos
  uploadedPhotos: UploadedPhoto[];
  addPhotos: (files: FileList | File[]) => void;
  removePhoto: (id: string) => void;
  replacePhoto: (id: string, file: File) => void;

  // Pages
  albumPages: AlbumPage[];
  currentPageIndex: number;
  currentPage: AlbumPage;
  goToPage: (index: number) => void;
  addPage: () => void;
  deletePage: (index: number) => void;
  duplicatePage: (index: number) => void;

  // Generation
  generateAlbum: () => void;
  regeneratePage: () => void;
  shuffleLayout: () => void;
  autoFillSlots: () => void;
  clearAllSlots: () => void;

  // Slot management
  fillSlot: (slotIndex: number, photoIndex: number) => void;
  clearSlot: (slotIndex: number) => void;
  setSlotScale: (slotIndex: number, scale: number) => void;
  setSlotOffset: (slotIndex: number, dx: number, dy: number) => void;
  updateSlotGeometry: (slotIndex: number, geometry: SlotGeometryOverride) => void;

  // Canvas photos (freeform)
  addPhotoToCanvas: (photoIndex: number, x: number, y: number) => void;
  updatePhotoTransform: (id: string, updates: Partial<CanvasPhoto>) => void;
  updatePhotoFilters: (id: string, filters: Partial<PhotoFilters>) => void;
  deletePhotoFromCanvas: (id: string) => void;
  duplicateCanvasPhoto: (id: string) => void;
  bringToFront: (id: string) => void;
  sendToBack: (id: string) => void;

  // Text
  addTextElement: (x: number, y: number) => void;
  updateTextElement: (id: string, updates: Partial<TextElement>) => void;
  deleteTextElement: (id: string) => void;

  // Background
  setPageBackground: (bg: AlbumBackground) => void;
  updateBackgroundTransform: (updates: Partial<Pick<AlbumBackground, 'x' | 'y' | 'width' | 'height' | 'rotation'>>) => void;
  updateBackgroundFilters: (filters: Partial<PhotoFilters>) => void;
  applyBackgroundToAllPages: () => void;

  // Template
  setPageTemplate: (templateId: string) => void;
  hideTemplate: (id: string) => void;
  unhideAllTemplates: () => void;

  // Slot count filter
  photosPerPage: number | undefined;
  setPhotosPerPage: (count: number | undefined) => void;

  // Snapshots
  setPageSnapshot: (pageId: string, dataUrl: string) => void;
  getPageSnapshot: (pageId: string) => string | undefined;

  // Phase
  phase: string;
  setPhase: (phase: string) => void;

  // Reset
  reset: () => void;
}

export function useBuilderState(): BuilderActions {
  const [albumType, setAlbumTypeState] = useState<AlbumType>(() => getInitialState().albumType);
  const [albumSize, setAlbumSizeState] = useState<AlbumSizePreset>(() => getInitialState().albumSize);
  const [selectedTemplate, setSelectedTemplateState] = useState<TemplateType>(() => getInitialState().selectedTemplate);
  const [uploadedPhotos, setUploadedPhotos] = useState<UploadedPhoto[]>(() => getInitialState().uploadedPhotos);
  const [albumPages, setAlbumPages] = useState<AlbumPage[]>(() => getInitialState().albumPages);
  const [currentPageIndex, setCurrentPageIndex] = useState(() => getInitialState().currentPageIndex);
  const [rejectedTemplateIds, setRejectedTemplateIds] = useState<string[]>(() => getInitialState().rejectedTemplateIds);
  const [photosPerPage, setPhotosPerPage] = useState<number | undefined>(() => getInitialState().photosPerPage);
  const [phase, setPhase] = useState('setup');

  const pageSnapshotsRef = useRef<Record<string, string>>({});

  const currentPage = albumPages[currentPageIndex] ?? createEmptyPage(0, albumSize);

  /* ── Persist to localStorage ── */
  useEffect(() => {
    saveState({
      albumType,
      albumSize,
      selectedTemplate,
      uploadedPhotos,
      albumPages,
      currentPageIndex,
      rejectedTemplateIds,
      photosPerPage,
    });
  }, [albumType, albumSize, selectedTemplate, uploadedPhotos, albumPages, currentPageIndex, rejectedTemplateIds, photosPerPage]);

  /* ── Helpers ── */
  const updateCurrentPage = useCallback((updater: (page: AlbumPage) => AlbumPage) => {
    setAlbumPages((prev) => {
      const next = [...prev];
      if (next[currentPageIndex]) {
        next[currentPageIndex] = updater(next[currentPageIndex]);
      }
      return next;
    });
  }, [currentPageIndex]);

  /* ── Photo handling ── */
  const addPhotos = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const newPhotos: UploadedPhoto[] = fileArray.map((file) => ({
      id: `photo-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: file.name,
      previewUrl: URL.createObjectURL(file),
      file,
    }));
    setUploadedPhotos((prev) => [...prev, ...newPhotos]);
  }, []);

  const removePhoto = useCallback((id: string) => {
    setUploadedPhotos((prev) => {
      const photo = prev.find((p) => p.id === id);
      if (photo) URL.revokeObjectURL(photo.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }, []);

  const replacePhoto = useCallback((id: string, file: File) => {
    setUploadedPhotos((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, name: file.name, previewUrl: URL.createObjectURL(file), file }
          : p
      )
    );
  }, []);

  /* ── Page navigation ── */
  const goToPage = useCallback((index: number) => {
    setCurrentPageIndex(Math.max(0, Math.min(index, albumPages.length - 1)));
  }, [albumPages.length]);

  const addPage = useCallback(() => {
    setAlbumPages((prev) => {
      const newPage = createEmptyPage(prev.length, albumSize);
      const insertIndex = currentPageIndex + 1;
      return [...prev.slice(0, insertIndex), newPage, ...prev.slice(insertIndex)];
    });
    setCurrentPageIndex((prev) => prev + 1);
  }, [currentPageIndex, albumSize]);

  const deletePage = useCallback((index: number) => {
    setAlbumPages((prev) => {
      // Hard block: cannot delete below MIN_PAGES
      if (prev.length <= MIN_PAGES) return prev;
      return prev.filter((_, i) => i !== index);
    });
    setCurrentPageIndex((prev) => Math.min(prev, Math.max(0, albumPages.length - 2)));
  }, [albumPages.length]);

  const duplicatePage = useCallback((index: number) => {
    setAlbumPages((prev) => {
      const page = prev[index];
      if (!page) return prev;
      const dup: AlbumPage = {
        ...page,
        id: `page-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        slotFills: [...(page.slotFills ?? [])],
        slotScales: [...(page.slotScales ?? [])],
        slotOffsetsX: [...(page.slotOffsetsX ?? [])],
        slotOffsetsY: [...(page.slotOffsetsY ?? [])],
        photos: page.photos.map((p) => ({ ...p, id: `photo-${Date.now()}-${Math.random().toString(36).slice(2)}` })),
        textElements: page.textElements.map((t) => ({ ...t, id: `text-${Date.now()}-${Math.random().toString(36).slice(2)}` })),
      };
      return [...prev.slice(0, index + 1), dup, ...prev.slice(index + 1)];
    });
  }, []);

  /* ── Generation ── */
  const generateAlbumAction = useCallback(() => {
    const newPages = generateAlbum(uploadedPhotos, albumSize, photosPerPage);
    setAlbumPages(newPages);
    setCurrentPageIndex(0);
  }, [uploadedPhotos, albumSize, photosPerPage]);

  const regeneratePage = useCallback(() => {
    setAlbumPages((prev) => {
      const next = [...prev];
      const page = next[currentPageIndex];
      if (!page) return prev;

      // Collect all used photo indices on other pages (dedup)
      const used = new Set<number>();
      next.forEach((p, i) => {
        if (i !== currentPageIndex) {
          (p.slotFills ?? []).forEach((f) => { if (f !== null) used.add(f); });
        }
      });

      // Pick a random template different from current, respecting slot count filter
      let pool = PAGE_TEMPLATES.filter((t) => t.id !== page.templateId);
      if (photosPerPage !== undefined) {
        pool = pool.filter((t) => t.slotCount === photosPerPage);
      }
      if (pool.length === 0) pool = PAGE_TEMPLATES.filter((t) => t.id !== page.templateId);
      const template = pool[Math.floor(Math.random() * pool.length)];
      const slotCount = template.slots.length;

      const newPage: AlbumPage = {
        ...createEmptyPage(Date.now(), albumSize),
        id: page.id,
        templateId: template.id,
        background: page.background,
        textElements: page.textElements,
        slotFills: new Array(slotCount).fill(null),
        slotScales: new Array(slotCount).fill(1),
        slotOffsetsX: new Array(slotCount).fill(0),
        slotOffsetsY: new Array(slotCount).fill(0),
      };

      // Ensure slotFills is an array
      newPage.slotFills = new Array(slotCount).fill(null);

      // Fill slots, preferring unused photos
      let slotIdx = 0;
      for (let i = 0; i < uploadedPhotos.length && slotIdx < slotCount; i++) {
        if (!used.has(i)) {
          newPage.slotFills[slotIdx] = i;
          used.add(i);
          slotIdx++;
        }
      }
      // If we ran out of unused photos, fill remaining with any photos
      for (let i = 0; i < uploadedPhotos.length && slotIdx < slotCount; i++) {
        if (newPage.slotFills[slotIdx] === null) {
          newPage.slotFills[slotIdx] = i;
          slotIdx++;
        }
      }

      next[currentPageIndex] = newPage;
      return next;
    });
  }, [currentPageIndex, albumSize, uploadedPhotos, photosPerPage]);

  const shuffleLayout = useCallback(() => {
    setAlbumPages((prev) => {
      const next = [...prev];
      const page = next[currentPageIndex];
      if (!page) return prev;

      let pool = PAGE_TEMPLATES.filter((t) => t.id !== page.templateId);
      if (photosPerPage !== undefined) {
        pool = pool.filter((t) => t.slotCount === photosPerPage);
      }
      if (pool.length === 0) pool = PAGE_TEMPLATES.filter((t) => t.id !== page.templateId);
      const template = pool[Math.floor(Math.random() * pool.length)];
      const slotCount = template.slots.length;

      const existingFills = (page.slotFills ?? []).filter((f): f is number => f !== null);

      next[currentPageIndex] = {
        ...page,
        templateId: template.id,
        slotFills: new Array(slotCount).fill(null).map((_, i) => existingFills[i] ?? null),
        slotScales: new Array(slotCount).fill(1),
        slotOffsetsX: new Array(slotCount).fill(0),
        slotOffsetsY: new Array(slotCount).fill(0),
      };
      return next;
    });
  }, [currentPageIndex]);

  /* ── Slot management ── */
  const fillSlot = useCallback((slotIndex: number, photoIndex: number) => {
    updateCurrentPage((page) => {
      const fills = [...(page.slotFills ?? [])];
      fills[slotIndex] = photoIndex;
      return { ...page, slotFills: fills };
    });
  }, [updateCurrentPage]);

  const clearSlot = useCallback((slotIndex: number) => {
    updateCurrentPage((page) => {
      const fills = [...(page.slotFills ?? [])];
      fills[slotIndex] = null;
      return { ...page, slotFills: fills };
    });
  }, [updateCurrentPage]);

  const setSlotScale = useCallback((slotIndex: number, scale: number) => {
    updateCurrentPage((page) => {
      const scales = [...(page.slotScales ?? [])];
      scales[slotIndex] = scale;
      return { ...page, slotScales: scales };
    });
  }, [updateCurrentPage]);

  const setSlotOffset = useCallback((slotIndex: number, dx: number, dy: number) => {
    updateCurrentPage((page) => {
      const offsetsX = [...(page.slotOffsetsX ?? [])];
      const offsetsY = [...(page.slotOffsetsY ?? [])];
      offsetsX[slotIndex] = (offsetsX[slotIndex] ?? 0) + dx;
      offsetsY[slotIndex] = (offsetsY[slotIndex] ?? 0) + dy;
      return { ...page, slotOffsetsX: offsetsX, slotOffsetsY: offsetsY };
    });
  }, [updateCurrentPage]);

  const updateSlotGeometry = useCallback((slotIndex: number, geometry: SlotGeometryOverride) => {
    updateCurrentPage((page) => {
      const geoms = [...(page.slotGeometries ?? [])];
      geoms[slotIndex] = { ...(geoms[slotIndex] ?? {}), ...geometry };
      return { ...page, slotGeometries: geoms };
    });
  }, [updateCurrentPage]);

  /* ── Auto-fill ── */
  const autoFillSlots = useCallback(() => {
    updateCurrentPage((page) => {
      const slotCount = page.slotFills?.length ?? 0;
      if (slotCount === 0) return page;
      const fills = [...(page.slotFills ?? [])];
      let photoIdx = 0;
      for (let i = 0; i < slotCount; i++) {
        if (fills[i] === null && photoIdx < uploadedPhotos.length) {
          while (photoIdx < uploadedPhotos.length && fills.includes(photoIdx)) {
            photoIdx++;
          }
          if (photoIdx < uploadedPhotos.length) {
            fills[i] = photoIdx;
            photoIdx++;
          }
        }
      }
      return { ...page, slotFills: fills };
    });
  }, [updateCurrentPage, uploadedPhotos]);

  const clearAllSlots = useCallback(() => {
    updateCurrentPage((page) => {
      const slotCount = page.slotFills?.length ?? 0;
      return { ...page, slotFills: new Array(slotCount).fill(null) };
    });
  }, [updateCurrentPage]);

  /* ── Freeform photos ── */
  const addPhotoToCanvas = useCallback((photoIndex: number, x: number, y: number) => {
    updateCurrentPage((page) => {
      const newPhoto: CanvasPhoto = {
        id: `canvas-photo-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        photoIndex,
        x: x - 75,
        y: y - 75,
        width: 150,
        height: 150,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        zIndex: (page.photos.length > 0 ? Math.max(...page.photos.map((p) => p.zIndex)) : 0) + 1,
        // Required fields from types.ts
        filters: {
          grayscale: 0, sepia: 0, brightness: 100, contrast: 100,
          saturate: 100, blur: 0, hueRotate: 0, opacity: 100,
          vintage: false, cool: false, warm: false,
          bwHighContrast: false, fade: false, vivid: false,
        },
        offsetX: 0,
        offsetY: 0,
        borderWidth: 0,
        borderColor: '#FFFFFF',
        borderRadius: 0,
        shadowBlur: 0,
        shadowColor: '',
        shadowOffsetX: 0,
        shadowOffsetY: 0,
      };
      return { ...page, photos: [...page.photos, newPhoto] };
    });
  }, [updateCurrentPage]);

  const updatePhotoTransform = useCallback((id: string, updates: Partial<CanvasPhoto>) => {
    updateCurrentPage((page) => ({
      ...page,
      photos: page.photos.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    }));
  }, [updateCurrentPage]);

  const updatePhotoFilters = useCallback((id: string, filters: Partial<PhotoFilters>) => {
    updateCurrentPage((page) => ({
      ...page,
      photos: page.photos.map((p) =>
        p.id === id ? { ...p, filters: { ...p.filters, ...filters } } : p
      ),
    }));
  }, [updateCurrentPage]);

  const deletePhotoFromCanvas = useCallback((id: string) => {
    updateCurrentPage((page) => ({
      ...page,
      photos: page.photos.filter((p) => p.id !== id),
    }));
  }, [updateCurrentPage]);

  const duplicateCanvasPhoto = useCallback((id: string) => {
    updateCurrentPage((page) => {
      const photo = page.photos.find((p) => p.id === id);
      if (!photo) return page;
      const dup: CanvasPhoto = {
        ...photo,
        id: `canvas-photo-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        x: photo.x + 20,
        y: photo.y + 20,
        zIndex: Math.max(...page.photos.map((p) => p.zIndex), 0) + 1,
      };
      return { ...page, photos: [...page.photos, dup] };
    });
  }, [updateCurrentPage]);

  const bringToFront = useCallback((id: string) => {
    updateCurrentPage((page) => {
      const maxZ = Math.max(...page.photos.map((p) => p.zIndex), 0);
      return {
        ...page,
        photos: page.photos.map((p) => (p.id === id ? { ...p, zIndex: maxZ + 1 } : p)),
      };
    });
  }, [updateCurrentPage]);

  const sendToBack = useCallback((id: string) => {
    updateCurrentPage((page) => {
      const minZ = Math.min(...page.photos.map((p) => p.zIndex), 0);
      return {
        ...page,
        photos: page.photos.map((p) => (p.id === id ? { ...p, zIndex: minZ - 1 } : p)),
      };
    });
  }, [updateCurrentPage]);

  /* ── Text ── */
  const addTextElement = useCallback((x: number, y: number) => {
    updateCurrentPage((page) => {
      const newText: TextElement = {
        id: `text-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        text: 'Double click to edit',
        x,
        y,
        fontSize: 24,
        fontFamily: '"DM Sans", sans-serif',
        color: '#2D2D2D',
        bold: false,
        italic: false,
        underline: false,
        alignment: 'center',
        rotation: 0,
        opacity: 100,
        width: 200,
      };
      return { ...page, textElements: [...page.textElements, newText] };
    });
  }, [updateCurrentPage]);

  const updateTextElement = useCallback((id: string, updates: Partial<TextElement>) => {
    updateCurrentPage((page) => ({
      ...page,
      textElements: page.textElements.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    }));
  }, [updateCurrentPage]);

  const deleteTextElement = useCallback((id: string) => {
    updateCurrentPage((page) => ({
      ...page,
      textElements: page.textElements.filter((t) => t.id !== id),
    }));
  }, [updateCurrentPage]);

  /* ── Background ── */
  const setPageBackground = useCallback((bg: AlbumBackground) => {
    updateCurrentPage((page) => ({ ...page, background: bg }));
  }, [updateCurrentPage]);

  const updateBackgroundTransform = useCallback((updates: Partial<Pick<AlbumBackground, 'x' | 'y' | 'width' | 'height' | 'rotation'>>) => {
    updateCurrentPage((page) => ({
      ...page,
      background: { ...page.background, ...updates } as AlbumBackground,
    }));
  }, [updateCurrentPage]);

  const updateBackgroundFilters = useCallback((filters: Partial<PhotoFilters>) => {
    updateCurrentPage((page) => ({
      ...page,
      background: {
        ...page.background,
        filters: { ...((page.background as any).filters ?? {}), ...filters },
      } as AlbumBackground,
    }));
  }, [updateCurrentPage]);

  const applyBackgroundToAllPages = useCallback(() => {
    const bg = currentPage.background;
    setAlbumPages((prev) => prev.map((p) => ({ ...p, background: bg })));
  }, [currentPage.background]);

  /* ── Template ── */
  const setPageTemplate = useCallback((templateId: string) => {
    updateCurrentPage((page) => ({
      ...page,
      templateId,
      slotFills: [],
      slotScales: [],
      slotOffsetsX: [],
      slotOffsetsY: [],
    }));
  }, [updateCurrentPage]);

  const hideTemplate = useCallback((id: string) => {
    setRejectedTemplateIds((prev) => [...prev, id]);
  }, []);

  const unhideAllTemplates = useCallback(() => {
    setRejectedTemplateIds([]);
  }, []);

  /* ── Snapshots ── */
  const setPageSnapshot = useCallback((pageId: string, dataUrl: string) => {
    pageSnapshotsRef.current[pageId] = dataUrl;
  }, []);

  const getPageSnapshot = useCallback((pageId: string) => {
    return pageSnapshotsRef.current[pageId];
  }, []);

  /* ── Reset ── */
  const reset = useCallback(() => {
    setAlbumTypeState('standard');
    setAlbumSizeState('8x8');
    setSelectedTemplateState('classic');
    setUploadedPhotos([]);
    setAlbumPages(Array.from({ length: MIN_PAGES }, (_, i) => createEmptyPage(i, '8x8')));
    setCurrentPageIndex(0);
    setRejectedTemplateIds([]);
    setPhotosPerPage(undefined);
    pageSnapshotsRef.current = {};
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  return {
    albumType,
    albumSize,
    selectedTemplate,
    setAlbumSize: setAlbumSizeState,
    setAlbumType: setAlbumTypeState,
    setSelectedTemplate: setSelectedTemplateState,
    uploadedPhotos,
    addPhotos,
    removePhoto,
    replacePhoto,
    albumPages,
    currentPageIndex,
    currentPage,
    goToPage,
    addPage,
    deletePage,
    duplicatePage,
    generateAlbum: generateAlbumAction,
    regeneratePage,
    shuffleLayout,
    autoFillSlots,
    clearAllSlots,
    fillSlot,
    clearSlot,
    setSlotScale,
    setSlotOffset,
    updateSlotGeometry,
    addPhotoToCanvas,
    updatePhotoTransform,
    updatePhotoFilters,
    deletePhotoFromCanvas,
    duplicateCanvasPhoto,
    bringToFront,
    sendToBack,
    addTextElement,
    updateTextElement,
    deleteTextElement,
    setPageBackground,
    updateBackgroundTransform,
    updateBackgroundFilters,
    applyBackgroundToAllPages,
    setPageTemplate,
    hideTemplate,
    unhideAllTemplates,
    photosPerPage,
    setPhotosPerPage,
    setPageSnapshot,
    getPageSnapshot,
    phase,
    setPhase,
    reset,
  };
}
