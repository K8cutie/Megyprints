import { useState, useCallback, useEffect } from 'react';
import type {
  UploadedPhoto,
  AlbumPage,
  BuilderPhase,
  TemplateType,
  CanvasPhoto,
  TextElement,
  PhotoFilters,
  AlbumBackground,
  AlbumSizePreset,
} from './types';
import {
  DEFAULT_FILTERS,
  DEFAULT_BACKGROUND,
  DEFAULT_ALBUM_SIZE,
} from './types';
import { getTemplateById, PAGE_TEMPLATES } from './pageTemplates';
import { generateAlbum, regenerateAlbum } from './generateAlbum';

const STORAGE_KEY = 'megy_builder_state';
const REJECTED_TEMPLATES_KEY = 'megy_rejected_templates';
const STORAGE_VERSION = 'v4'; // bumped — clears textElements from old sessions

/* ── Safe localStorage with validation ── */

function isValidAlbumPage(page: any): page is AlbumPage {
  return (
    page &&
    typeof page.id === 'string' &&
    typeof page.layout === 'string' &&
    page.background &&
    Array.isArray(page.photos) &&
    Array.isArray(page.textElements)
  );
}

/* ── Rejected templates (user-hidden) ── */

function loadRejectedTemplates(): string[] {
  try {
    const raw = localStorage.getItem(REJECTED_TEMPLATES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function saveRejectedTemplates(ids: string[]) {
  try {
    localStorage.setItem(REJECTED_TEMPLATES_KEY, JSON.stringify(ids));
  } catch {
    // silently fail
  }
}

function loadState(): { uploadedPhotos: UploadedPhoto[]; albumPages: AlbumPage[] } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);

    // Version check — invalidate old format data
    if (parsed._version !== STORAGE_VERSION) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    // Validate albumPages — photos, slots, AND textElements wiped (always start fresh)
    const albumPages: AlbumPage[] = Array.isArray(parsed.albumPages)
      ? parsed.albumPages.filter(isValidAlbumPage).map((page: any) => {
          const templateId = page.templateId || PAGE_TEMPLATES[0].id;
          const template = PAGE_TEMPLATES.find((t) => t.id === templateId) || PAGE_TEMPLATES[0];
          return {
            ...page,
            templateId,
            slotFills: template.slots.map(() => null),
            slotScales: template.slots.map(() => 1),
            slotOffsetsX: template.slots.map(() => 0),
            slotOffsetsY: template.slots.map(() => 0),
            photos: [],
            /* BUG FIX: textElements from previous sessions are NOT carried over */
            textElements: [],
            background: page.background || { type: 'solid' as const, solid: '#FFFBF7' },
          };
        })
      : [];

    return { uploadedPhotos: [], albumPages };
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function saveState(state: {
  phase: BuilderPhase;
  selectedTemplate: TemplateType;
  albumPages: AlbumPage[];
  currentPageIndex: number;
  material: string;
  cover: string;
  size: string;
}) {
  try {
    const serializable = {
      ...state,
      _version: STORAGE_VERSION,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
  } catch {
    // Storage full or private mode — silently fail
  }
}

let idCounter = Date.now();
function uid(): string {
  idCounter += 1;
  return `id_${idCounter}`;
}

const defaultPage = (): AlbumPage => {
  const defaultTemplate = PAGE_TEMPLATES[0];
  const slotCount = defaultTemplate.slots.length;
  return {
    id: uid(),
    layout: 'freeform',
    templateId: defaultTemplate.id,
    slotFills: new Array(slotCount).fill(null),
    slotScales: new Array(slotCount).fill(1),
    slotOffsetsX: new Array(slotCount).fill(0),
    slotOffsetsY: new Array(slotCount).fill(0),
    background: { ...DEFAULT_BACKGROUND },
    photos: [],
    textElements: [],
    size: DEFAULT_ALBUM_SIZE,
  };
};

export function useBuilderState() {
  const saved = loadState();

  const [albumType, setAlbumType] = useState<'standard' | 'layflat'>('standard');
  const [albumSize, setAlbumSize] = useState<AlbumSizePreset>(DEFAULT_ALBUM_SIZE);
  const [phase, setPhase] = useState<BuilderPhase>('setup');
  const [uploadedPhotos, setUploadedPhotos] = useState<UploadedPhoto[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>('wedding');
  const [albumPages, setAlbumPages] = useState<AlbumPage[]>(
    saved?.albumPages && saved.albumPages.length > 0 ? saved.albumPages : [defaultPage()]
  );
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [rejectedTemplateIds, setRejectedTemplateIds] = useState<string[]>(loadRejectedTemplates);

  const currentPage = albumPages[currentPageIndex] ?? albumPages[0] ?? defaultPage();

  // ── Persist ──
  useEffect(() => {
    saveState({
      phase, selectedTemplate, albumPages,
      currentPageIndex, material: 'matte', cover: 'softcover', size: '8x10',
    });
  }, [phase, selectedTemplate, albumPages, currentPageIndex]);

  // ── Phase ──
  const goToPhase = useCallback((p: BuilderPhase) => setPhase(p), []);

  // ── Photo Upload ──
  const addPhotos = useCallback((files: FileList | File[]) => {
    const newPhotos: UploadedPhoto[] = Array.from(files).map((file) => ({
      id: uid(),
      file,
      previewUrl: URL.createObjectURL(file),
      name: file.name,
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
          ? { ...p, file, previewUrl: URL.createObjectURL(file), name: file.name }
          : p
      )
    );
  }, []);

  // ── Template ──
  const selectTemplate = useCallback((t: TemplateType) => setSelectedTemplate(t), []);

  // ── Page Management ──
  const addPage = useCallback(() => {
    setAlbumPages((prev) => {
      const current = prev[currentPageIndex];
      const templateId = current?.templateId || PAGE_TEMPLATES[0].id;
      const template = PAGE_TEMPLATES.find((t) => t.id === templateId) || PAGE_TEMPLATES[0];
      const newPage: AlbumPage = {
        id: uid(),
        layout: 'freeform',
        templateId,
        slotFills: template.slots.map(() => null),
        slotScales: template.slots.map(() => 1),
        slotOffsetsX: template.slots.map(() => 0),
        slotOffsetsY: template.slots.map(() => 0),
        background: { ...DEFAULT_BACKGROUND },
        photos: [],
        textElements: [],
        size: albumSize,
      };
      return [...prev, newPage];
    });
    setCurrentPageIndex((prev) => prev + 1);
  }, [currentPageIndex, albumSize]);

  const deletePage = useCallback((index: number) => {
    setAlbumPages((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
    setCurrentPageIndex((_) => Math.min(currentPageIndex, Math.max(0, albumPages.length - 2)));
  }, [currentPageIndex, albumPages.length]);

  const duplicatePage = useCallback((index: number) => {
    setAlbumPages((prev) => {
      const page = prev[index];
      if (!page) return prev;
      const clone: AlbumPage = {
        ...page,
        id: uid(),
        photos: page.photos.map((p) => ({ ...p, id: uid() })),
        textElements: page.textElements.map((t) => ({ ...t, id: uid() })),
      };
      const next = [...prev];
      next.splice(index + 1, 0, clone);
      return next;
    });
  }, []);

  const goToPage = useCallback((index: number) => {
    setCurrentPageIndex(() => Math.max(0, Math.min(index, albumPages.length - 1)));
  }, [albumPages.length]);

  // ── Background ──
  const setPageBackground = useCallback((background: AlbumBackground) => {
    setAlbumPages((prev) => {
      const next = [...prev];
      if (next[currentPageIndex]) {
        next[currentPageIndex] = { ...next[currentPageIndex], background };
      }
      return next;
    });
  }, [currentPageIndex]);

  // ── Template ──
  const setPageTemplate = useCallback((templateId: string) => {
    const template = getTemplateById(templateId);
    if (!template) return;
    setAlbumPages((prev) => {
      const next = [...prev];
      const page = next[currentPageIndex];
      if (page) {
        const newFills = template.slots.map((_, i) => (page.slotFills && i < page.slotFills.length ? page.slotFills[i] : null));
        const newScales = template.slots.map((_, i) => (page.slotScales && i < page.slotScales.length ? page.slotScales[i] : 1));
        const newOffX = template.slots.map((_, i) => (page.slotOffsetsX && i < page.slotOffsetsX.length ? page.slotOffsetsX[i] : 0));
        const newOffY = template.slots.map((_, i) => (page.slotOffsetsY && i < page.slotOffsetsY.length ? page.slotOffsetsY[i] : 0));
        next[currentPageIndex] = { ...page, templateId, slotFills: newFills, slotScales: newScales, slotOffsetsX: newOffX, slotOffsetsY: newOffY };
      }
      return next;
    });
  }, [currentPageIndex]);

  const fillSlot = useCallback((slotIndex: number, photoIndex: number) => {
    setAlbumPages((prev) => {
      const next = [...prev];
      const page = next[currentPageIndex];
      if (!page || !page.slotFills) return prev;
      const newFills = [...page.slotFills];
      newFills[slotIndex] = photoIndex;
      next[currentPageIndex] = { ...page, slotFills: newFills };
      return next;
    });
  }, [currentPageIndex]);

  const clearSlot = useCallback((slotIndex: number) => {
    setAlbumPages((prev) => {
      const next = [...prev];
      const page = next[currentPageIndex];
      if (!page || !page.slotFills) return prev;
      const newFills = [...page.slotFills];
      newFills[slotIndex] = null;
      next[currentPageIndex] = { ...page, slotFills: newFills };
      return next;
    });
  }, [currentPageIndex]);

  const clearAllSlots = useCallback(() => {
    setAlbumPages((prev) => {
      const next = [...prev];
      const page = next[currentPageIndex];
      if (!page || !page.slotFills) return prev;
      next[currentPageIndex] = { ...page, slotFills: page.slotFills.map(() => null) };
      return next;
    });
  }, [currentPageIndex]);

  const setSlotScale = useCallback((slotIndex: number, scale: number) => {
    setAlbumPages((prev) => {
      const next = [...prev];
      const page = next[currentPageIndex];
      if (!page || !page.slotScales) return prev;
      const newScales = [...page.slotScales];
      newScales[slotIndex] = scale;
      next[currentPageIndex] = { ...page, slotScales: newScales };
      return next;
    });
  }, [currentPageIndex]);

  const setSlotOffset = useCallback((slotIndex: number, dx: number, dy: number) => {
    setAlbumPages((prev) => {
      const next = [...prev];
      const page = next[currentPageIndex];
      if (!page) return prev;
      const newX = [...(page.slotOffsetsX ?? [])];
      const newY = [...(page.slotOffsetsY ?? [])];
      newX[slotIndex] = (newX[slotIndex] ?? 0) + dx;
      newY[slotIndex] = (newY[slotIndex] ?? 0) + dy;
      next[currentPageIndex] = { ...page, slotOffsetsX: newX, slotOffsetsY: newY };
      return next;
    });
  }, [currentPageIndex]);

  const updateBackgroundTransform = useCallback((updates: Partial<Pick<AlbumBackground, 'x' | 'y' | 'width' | 'height' | 'rotation'>>) => {
    setAlbumPages((prev) => {
      const next = [...prev];
      const page = next[currentPageIndex];
      if (page) {
        next[currentPageIndex] = { ...page, background: { ...page.background, ...updates } };
      }
      return next;
    });
  }, [currentPageIndex]);

  const updateBackgroundFilters = useCallback((filters: Partial<PhotoFilters>) => {
    setAlbumPages((prev) => {
      const next = [...prev];
      const page = next[currentPageIndex];
      if (page) {
        next[currentPageIndex] = {
          ...page,
          background: { ...page.background, filters: { ...(page.background.filters ?? DEFAULT_FILTERS), ...filters } },
        };
      }
      return next;
    });
  }, [currentPageIndex]);

  // ── Canvas Photo Operations ──
  const updatePhotoTransform = useCallback((photoId: string, updates: Partial<CanvasPhoto>) => {
    setAlbumPages((prev) => {
      const next = [...prev];
      const page = next[currentPageIndex];
      if (page) {
        next[currentPageIndex] = {
          ...page,
          photos: page.photos.map((p) => (p.id === photoId ? { ...p, ...updates } : p)),
        };
      }
      return next;
    });
  }, [currentPageIndex]);

  const updatePhotoFilters = useCallback((photoId: string, filters: Partial<PhotoFilters>) => {
    setAlbumPages((prev) => {
      const next = [...prev];
      const page = next[currentPageIndex];
      if (page) {
        next[currentPageIndex] = {
          ...page,
          photos: page.photos.map((p) =>
            p.id === photoId ? { ...p, filters: { ...p.filters, ...filters } } : p
          ),
        };
      }
      return next;
    });
  }, [currentPageIndex]);

  const deletePhotoFromCanvas = useCallback((photoId: string) => {
    setAlbumPages((prev) => {
      const next = [...prev];
      const page = next[currentPageIndex];
      if (page) {
        next[currentPageIndex] = { ...page, photos: page.photos.filter((p) => p.id !== photoId) };
      }
      return next;
    });
  }, [currentPageIndex]);

  const bringToFront = useCallback((photoId: string) => {
    setAlbumPages((prev) => {
      const next = [...prev];
      const page = next[currentPageIndex];
      if (!page) return prev;
      const maxZ = page.photos.reduce((m, p) => Math.max(m, p.zIndex), 0);
      next[currentPageIndex] = {
        ...page,
        photos: page.photos.map((p) => (p.id === photoId ? { ...p, zIndex: maxZ + 1 } : p)),
      };
      return next;
    });
  }, [currentPageIndex]);

  const sendToBack = useCallback((photoId: string) => {
    setAlbumPages((prev) => {
      const next = [...prev];
      const page = next[currentPageIndex];
      if (!page) return prev;
      const minZ = page.photos.reduce((m, p) => Math.min(m, p.zIndex), 0);
      next[currentPageIndex] = {
        ...page,
        photos: page.photos.map((p) => (p.id === photoId ? { ...p, zIndex: minZ - 1 } : p)),
      };
      return next;
    });
  }, [currentPageIndex]);

  const duplicateCanvasPhoto = useCallback((photoId: string) => {
    setAlbumPages((prev) => {
      const next = [...prev];
      const page = next[currentPageIndex];
      if (!page) return prev;
      const photo = page.photos.find((p) => p.id === photoId);
      if (!photo) return prev;
      const clone: CanvasPhoto = {
        ...photo,
        id: uid(),
        x: photo.x + 20,
        y: photo.y + 20,
        zIndex: page.photos.reduce((m, p) => Math.max(m, p.zIndex), 0) + 1,
      };
      next[currentPageIndex] = { ...page, photos: [...page.photos, clone] };
      return next;
    });
  }, [currentPageIndex]);

  // ── Text Elements ──
  const addTextElement = useCallback((x?: number, y?: number) => {
    const text: TextElement = {
      id: uid(),
      text: 'Double-click to edit',
      x: x ?? 100,
      y: y ?? 100,
      fontSize: 24,
      fontFamily: '"DM Sans", sans-serif',
      color: '#2D2D2D',
      bold: false,
      italic: false,
      underline: false,
      alignment: 'center',
      rotation: 0,
      opacity: 100,
    };
    setAlbumPages((prev) => {
      const next = [...prev];
      const page = next[currentPageIndex];
      if (page) next[currentPageIndex] = { ...page, textElements: [...page.textElements, text] };
      return next;
    });
  }, [currentPageIndex]);

  const updateTextElement = useCallback((textId: string, updates: Partial<TextElement>) => {
    setAlbumPages((prev) => {
      const next = [...prev];
      const page = next[currentPageIndex];
      if (page) {
        next[currentPageIndex] = {
          ...page,
          textElements: page.textElements.map((t) => (t.id === textId ? { ...t, ...updates } : t)),
        };
      }
      return next;
    });
  }, [currentPageIndex]);

  const deleteTextElement = useCallback((textId: string) => {
    setAlbumPages((prev) => {
      const next = [...prev];
      const page = next[currentPageIndex];
      if (page) {
        next[currentPageIndex] = { ...page, textElements: page.textElements.filter((t) => t.id !== textId) };
      }
      return next;
    });
  }, [currentPageIndex]);

  // ── Auto-Fill ──
  const autoFillSlots = useCallback(() => {
    if (uploadedPhotos.length === 0) return;
    setAlbumPages((prev) => {
      const next = [...prev];
      const page = next[currentPageIndex];
      if (!page || !page.templateId || !page.slotFills) return prev;
      const emptySlotIndices = page.slotFills
        .map((fill, idx) => (fill === null ? idx : -1))
        .filter((idx) => idx !== -1);
      if (emptySlotIndices.length === 0) return prev;
      const availablePhotoIndices = Array.from({ length: uploadedPhotos.length }, (_, i) => i);
      for (let i = availablePhotoIndices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [availablePhotoIndices[i], availablePhotoIndices[j]] = [availablePhotoIndices[j], availablePhotoIndices[i]];
      }
      const newFills = [...page.slotFills];
      for (let i = 0; i < Math.min(emptySlotIndices.length, availablePhotoIndices.length); i++) {
        newFills[emptySlotIndices[i]] = availablePhotoIndices[i];
      }
      next[currentPageIndex] = { ...page, slotFills: newFills };
      return next;
    });
  }, [currentPageIndex, uploadedPhotos]);

  // ── Generate Album ──
  const generateAlbumAction = useCallback(() => {
    const newPages = generateAlbum(uploadedPhotos, selectedTemplate, albumSize, rejectedTemplateIds);
    setAlbumPages(newPages);
    setCurrentPageIndex(0);
  }, [uploadedPhotos, selectedTemplate, albumSize, rejectedTemplateIds]);

  const regenerateAlbumAction = useCallback(() => {
    const newPages = regenerateAlbum(uploadedPhotos, selectedTemplate, albumSize, rejectedTemplateIds);
    setAlbumPages(newPages);
    setCurrentPageIndex(0);
  }, [uploadedPhotos, selectedTemplate, albumSize, rejectedTemplateIds]);

  // ── Template Rejection ──
  const hideTemplate = useCallback((templateId: string) => {
    setRejectedTemplateIds((prev) => {
      const next = prev.includes(templateId) ? prev : [...prev, templateId];
      saveRejectedTemplates(next);
      return next;
    });
  }, []);

  const unhideTemplate = useCallback((templateId: string) => {
    setRejectedTemplateIds((prev) => {
      const next = prev.filter((id) => id !== templateId);
      saveRejectedTemplates(next);
      return next;
    });
  }, []);

  const unhideAllTemplates = useCallback(() => {
    setRejectedTemplateIds([]);
    saveRejectedTemplates([]);
  }, []);

  // ── Reset ──
  const reset = useCallback(() => {
    setAlbumType('standard');
    setAlbumSize(DEFAULT_ALBUM_SIZE);
    setPhase('setup');
    setUploadedPhotos([]);
    setSelectedTemplate('wedding');
    setAlbumPages([defaultPage()]);
    setCurrentPageIndex(0);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return {
    phase, albumType, albumSize, uploadedPhotos, selectedTemplate, albumPages,
    currentPageIndex, currentPage,

    setPhase: goToPhase, setAlbumType, setAlbumSize, addPhotos, removePhoto, replacePhoto,
    selectTemplate,

    addPage, deletePage, duplicatePage, goToPage,

    setPageBackground, updateBackgroundTransform, updateBackgroundFilters,
    setPageTemplate, fillSlot, clearSlot, clearAllSlots, autoFillSlots, setSlotScale, setSlotOffset,

    updatePhotoTransform, updatePhotoFilters,
    deletePhotoFromCanvas, bringToFront, sendToBack, duplicateCanvasPhoto,

    addTextElement, updateTextElement, deleteTextElement,

    generateAlbum: generateAlbumAction, regenerateAlbum: regenerateAlbumAction,
    hideTemplate, unhideTemplate, unhideAllTemplates, rejectedTemplateIds,

    reset,
  };
}

export type BuilderActions = ReturnType<typeof useBuilderState>;
