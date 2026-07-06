import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
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
  QrFill,
  OrnamentFill,
  SlotText,
  PageTemplate,
  FrameStyle,
} from './types';
import { PAGE_TEMPLATES, getTemplateById, getTemplatesForAlbum, photoSlotCount, qrBadgeTemplate, qrBadgeCornerOf, qrCornerAwayFromFace, type QrCorner } from './pageTemplates';
import { analyzePhotos, type PhotoRatio } from './photoAnalyzer';
import { freeBandForTemplate, pickQuote } from './themeQuotes';
import { getThemedPhotoBorder, getThemeCornerBase, getThemedBackground, getThemedTitle, THEME_TITLES, THEMES } from './types';
import { getCanvasDimensions } from './layouts';
import { generateAlbum } from './generateAlbum';
// ── Phase 1: Cloud imports ──
import { useAuth } from '../../lib/authContext';
import { useAlbumSync } from '../../lib/useAlbumSync';
import type { AlbumData } from '../../lib/useAlbumSync';
import { useIndexedDBPhotos } from '../../lib/useIndexedDBPhotos';
import { detectFaceCenter, computeFaceOffset, initFaceApi } from './faceDetection';
import { templateTracker } from './varietyTracker';
import { readCaptureTime } from './exif';
import { normalizeStoredPageFields } from './pageNormalize';

/* ══════════════════════════════════════════════════════════════════════════
   useBuilderState — All builder state + localStorage persistence
   + Supabase cloud persistence (Phase 1)
   ══════════════════════════════════════════════════════════════════════════ */

const MIN_PAGES = 40;
const STORAGE_KEY = 'megy-album-v5';

// AlbumType is not exported from types.ts — define locally
type AlbumType = 'standard';

/** Normalize a page object from cloud storage.
    Supabase JSONB may store camelCase as snake_case.
    Shares normalizeStoredPageFields() with printJobRebuild so the two can't
    drift; only templateId's default differs (null here, undefined there). */
function normalizePage(p: any): any {
  if (!p || typeof p !== 'object') return p;
  return {
    ...normalizeStoredPageFields(p),
    templateId: (p.templateId ?? p.template_id) ?? null,
  };
}

/** Re-flow preserved photo fills into a new slot count, SKIPPING any slot index
 *  claimed by a carried-over QR or per-slot text (mutual exclusivity). Used by
 *  the layout-change actions (shuffle/cycle/applyPageLayout) so chooser-placed
 *  QR/text survive a layout change and photos never land on a claimed slot. */
function reflowFills(
  existingFills: number[],
  slotCount: number,
  qrFills?: (unknown | null)[],
  slotTexts?: (unknown | null)[],
  ornamentFills?: (unknown | null)[],
): (number | null)[] {
  const out: (number | null)[] = new Array(slotCount).fill(null);
  let ptr = 0;
  for (let i = 0; i < slotCount && ptr < existingFills.length; i++) {
    if (qrFills?.[i] || slotTexts?.[i] || ornamentFills?.[i]) continue; // slot claimed by QR/text/ornament
    out[i] = existingFills[ptr];
    ptr++;
  }
  return out;
}

/* Re-lay a page onto a new template: carry QR/text (trimmed to the new slot
   count), reflow the existing photos into the new slots, and reset per-slot
   framing. Shared by shuffle / cycle / apply-layout so the "change the layout"
   behavior lives in exactly one place. */
function relayPageOnTemplate(page: AlbumPage, template: PageTemplate): AlbumPage {
  const existingFills = [...new Set(
    (page.slotFills ?? []).filter((f): f is number => f !== null),
  )];
  const slotCount = template.slots.length;
  const carriedQr = (page.qrFills ?? []).slice(0, slotCount);
  const carriedText = (page.slotTexts ?? []).slice(0, slotCount);
  const carriedOrnament = (page.ornamentFills ?? []).slice(0, slotCount);
  // Caption-box content (photo/QR) is keyed to template.textSlots, which the new
  // template also owns — carry through, trimmed to the new textSlots length.
  const textSlotCount = template.textSlots?.length ?? 0;
  const carriedTextSlotFills = (page.textSlotFills ?? []).slice(0, textSlotCount);
  const carriedTextSlotQr = (page.textSlotQr ?? []).slice(0, textSlotCount);
  const carriedTextSlotOrnament = (page.textSlotOrnament ?? []).slice(0, textSlotCount);
  return {
    ...page,
    templateId: template.id,
    qrFills: carriedQr,
    slotTexts: carriedText,
    ornamentFills: carriedOrnament,
    textSlotFills: carriedTextSlotFills,
    textSlotQr: carriedTextSlotQr,
    textSlotOrnament: carriedTextSlotOrnament,
    slotFills: reflowFills(existingFills, slotCount, carriedQr, carriedText, carriedOrnament),
    slotScales: new Array(slotCount).fill(1),
    slotOffsetsX: new Array(slotCount).fill(0),
    slotOffsetsY: new Array(slotCount).fill(0),
  };
}

/* The page's dominant photo ratio (the most common ratio among the photos
   currently placed on it) — used to cycle/pick only ratio-matched templates so
   photos never get cropped into a mismatched slot. */
function dominantPageRatio(
  existingFills: number[],
  assignments: Partial<Record<number, PhotoRatio>>,
): PhotoRatio | undefined {
  const ratios = existingFills
    .map((i) => assignments[i])
    .filter(Boolean) as PhotoRatio[];
  const tally: Partial<Record<PhotoRatio, number>> = {};
  let pageRatio: PhotoRatio | undefined = ratios[0];
  let bestR = 0;
  for (const r of ratios) {
    tally[r] = (tally[r] ?? 0) + 1;
    if ((tally[r] ?? 0) > bestR) { bestR = tally[r]!; pageRatio = r; }
  }
  return pageRatio;
}

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

/* ── Undo snapshot ── */
interface Snapshot {
  albumPages: AlbumPage[];
  uploadedPhotos: UploadedPhoto[];
  currentPageIndex: number;
  albumSize: AlbumSizePreset;
  photosPerPage: number | undefined;
  selectedTemplate: TemplateType;
}

const MAX_UNDO_DEPTH = 20;

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

/** Check if a photo URL is a dead blob: URL (session-only, expires on reload) */
function isDeadBlobUrl(url: string | undefined): boolean {
  if (!url) return true;
  // Blob URLs are session-only — they ALWAYS expire on page reload
  if (url.startsWith('blob:')) return true;
  return false;
}

function isStateCorrupted(state: SerializedState): boolean {
  // Check for common corruption patterns:
  // 1. Pages with broken photo references (photo indices pointing nowhere)
  // 2. All pages are empty but state claims to have photos
  // NOTE: Dead blob URLs are NOT corruption — rehydration effect restores
  // them from IndexedDB on mount. Do NOT purge here.
  if (!state.albumPages || state.albumPages.length === 0) return false; // Clean slate

  const totalPhotos = state.uploadedPhotos?.length ?? 0;

  const hasAnyContent = state.albumPages.some((p) =>
    (p.photos?.length ?? 0) > 0 ||
    (p.slotFills?.some((f) => f !== null) ?? false) ||
    (p.textElements?.length ?? 0) > 0
  );

  // Has photos uploaded but no content anywhere = likely corrupted
  if (totalPhotos > 0 && !hasAnyContent) return true;

  // Check for out-of-bounds photo indices in slot fills
  const maxPhotoIndex = totalPhotos - 1;
  const hasBadRefs = state.albumPages.some((p) =>
    (p.slotFills ?? []).some(
      (f) => f !== null && (typeof f !== 'number' || f < 0 || f > maxPhotoIndex)
    )
  );
  if (hasBadRefs) return true;

  return false;
}

/* NOTE: The former `isStalePhotoSession` helper (which treated "all blob
   URLs dead" as a stale session and wiped storage) was removed — that
   condition is the normal state after any reload, and wiping destroyed
   recoverable photos. Rehydration from IndexedDB now handles returning
   users; intentional fresh starts use the `megy-fresh-start` signal. */

/** Heal STRANDED captions: an unbound text element (free, not a deliberate theme
 *  quote) on a page that has an empty textbox should belong IN that box. Bind it
 *  so it renders fixed + centered instead of floating at the top-left. Only fills
 *  boxes with no caption yet; idempotent (already-bound text is left alone). */
function bindStrandedCaptions(pages: AlbumPage[]): AlbumPage[] {
  return pages.map((page) => {
    if (!page.textElements?.length || !page.templateId) return page;
    const slots = getTemplateById(page.templateId)?.textSlots ?? [];
    if (!slots.length) return page;
    const filled = new Set<number>(
      page.textElements.filter((t) => t.boxIndex != null).map((t) => t.boxIndex as number),
    );
    // A caption box occupied by a photo/QR is FILLED — never bind a stray caption
    // into it (would break mutual exclusivity).
    (page.textSlotFills ?? []).forEach((f, i) => { if (f != null) filled.add(i); });
    (page.textSlotQr ?? []).forEach((q, i) => { if (q) filled.add(i); });
    (page.textSlotOrnament ?? []).forEach((o, i) => { if (o) filled.add(i); });
    let changed = false;
    const textElements = page.textElements.map((t) => {
      if (t.boxIndex != null || t.id.startsWith('theme-quote')) return t;
      let slot = -1;
      for (let i = 0; i < slots.length; i++) { if (!filled.has(i)) { slot = i; break; } }
      if (slot < 0) return t; // no empty box left
      filled.add(slot);
      changed = true;
      return { ...t, boxIndex: slot, x: 0, y: 0 };
    });
    return changed ? { ...page, textElements } : page;
  });
}

/** Remove the auto-placed themed cover title (e.g. "Our Story") from loaded
 *  albums. The builder no longer forces a title onto page 1, but albums
 *  generated before that change still carry the relic — strip it on load.
 *  Only removes `theme-title-*` elements whose text is still an UNTOUCHED
 *  default; a title the user personalised (custom text) is left alone. */
const DEFAULT_THEME_TITLE_SET = new Set<string>(Object.values(THEME_TITLES));
function stripDefaultThemeTitles(pages: AlbumPage[]): AlbumPage[] {
  return pages.map((page) => {
    if (!page.textElements?.length) return page;
    const kept = page.textElements.filter(
      (t) => !(t.id.startsWith('theme-title') && DEFAULT_THEME_TITLE_SET.has(t.text)),
    );
    return kept.length === page.textElements.length ? page : { ...page, textElements: kept };
  });
}

function getInitialState(): SerializedState {
  // ── LEAK FIX #1a: Check for explicit fresh-start signal ──
  // Home.tsx sets this when user clicks "Create New Album"
  const freshStart = sessionStorage.getItem('megy-fresh-start');
  if (freshStart === '1') {
    // Do NOT remove the signal here — the cloud effect also checks it.
    // Removing it here creates a race: cloud effect never sees it → loads old photos.
    console.log('[Megy] Fresh start requested — skipping localStorage restore');
    return {
      albumType: 'standard',
      albumSize: '8x8',
      selectedTemplate: 'classic',
      uploadedPhotos: [],
      albumPages: Array.from({ length: MIN_PAGES }, (_, i) => createEmptyPage(i, '8x8')),
      currentPageIndex: 0,
      rejectedTemplateIds: [],
      photosPerPage: undefined,
    };
  }

  const saved = loadState();
  const defaultSize: AlbumSizePreset = '8x8';

  // ── Full corruption check (structural issues only) ──
  let effectiveSaved = saved;
  if (saved && isStateCorrupted(saved as SerializedState)) {
    console.warn('[Megy] Detected corrupted album state in localStorage. Starting fresh.');
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    effectiveSaved = null;
  }

  // ── Dead blob URLs are NOT a stale session ──
  // Blob URLs never survive a page reload, so "all photos have dead URLs"
  // is the NORMAL state of a legitimate returning user. We keep the saved
  // photo metadata and let the rehydration effect restore real blob URLs
  // from IndexedDB. Intentional "start fresh" is handled explicitly by the
  // `megy-fresh-start` signal (Home → New Album) and by reset().

  return {
    albumType: effectiveSaved?.albumType ?? 'standard',
    albumSize: effectiveSaved?.albumSize ?? defaultSize,
    selectedTemplate: effectiveSaved?.selectedTemplate ?? 'classic',
    uploadedPhotos: effectiveSaved?.uploadedPhotos ?? [],
    albumPages: bindStrandedCaptions(stripDefaultThemeTitles(effectiveSaved?.albumPages ?? Array.from({ length: MIN_PAGES }, (_, i) => createEmptyPage(i, defaultSize)))),
    currentPageIndex: effectiveSaved?.currentPageIndex ?? 0,
    rejectedTemplateIds: effectiveSaved?.rejectedTemplateIds ?? [],
    photosPerPage: effectiveSaved?.photosPerPage ?? undefined,
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
  generateAlbum: (background?: AlbumBackground, options?: { randomize?: boolean }) => void;
  regeneratePage: () => void;
  shuffleLayout: () => void;
  cycleLayout: () => void;
  /** Templates available for the current page (for the layout picker). */
  availableTemplatesForCurrentPage: () => PageTemplate[];
  /** Apply a chosen template to the current page, keeping its photos. */
  applyPageLayout: (templateId: string) => void;
  /** The "Change layout" picker open state — shared by mobile + desktop. */
  layoutPickerOpen: boolean;
  setLayoutPickerOpen: (v: boolean) => void;
  autoFillSlots: () => void;
  clearAllSlots: () => void;

  // Slot management
  fillSlot: (slotIndex: number, photoIndex: number) => void;
  clearSlot: (slotIndex: number) => void;
  setSlotScale: (slotIndex: number, scale: number) => void;
  setSlotOffset: (slotIndex: number, dx: number, dy: number) => void;
  updateSlotGeometry: (slotIndex: number, geometry: SlotGeometryOverride) => void;
  setQrFill: (slotIndex: number, fill: QrFill | null, pageIndex?: number) => void;
  /** True when the current page is a single-photo page a living-memory QR badge
   *  can be applied to. */
  canAddMemoryQr: boolean;
  /** Convert the current single-photo page into a full-bleed QR memory badge,
   *  corner chosen by face-avoidance. Resolves true on success. */
  applyMemoryQr: (fill: QrFill, corner?: QrCorner) => Promise<boolean>;
  /** Move an already-placed QR memory badge to a chosen corner (tl/tr/bl/br).
   *  No-op unless the current page is a QR-badge page. */
  setMemoryQrCorner: (corner: QrCorner) => void;
  /** Set (or clear, with null) the per-slot text fill for slot i. Mirrors
   *  setQrFill; clears any photo/QR at the same slot when content is non-null. */
  setSlotText: (slotIndex: number, content: SlotText | null, pageIndex?: number) => void;
  /** Set (or clear, with null) the ornament fill for slot i. Mirrors setQrFill;
   *  clears any photo/QR/text at the same slot when fill is non-null. */
  setOrnamentFill: (slotIndex: number, fill: OrnamentFill | null, pageIndex?: number) => void;
  /** Place (or clear) a PHOTO in caption box j (template.textSlots[j]). Clears
   *  the box's QR + bound caption (mutual exclusivity). */
  setTextSlotPhoto: (slotIndex: number, photoIndex: number | null, pageIndex?: number) => void;
  /** Set (or clear) a QR in caption box j (template.textSlots[j]). Clears the
   *  box's photo + bound caption (mutual exclusivity). */
  setTextSlotQr: (slotIndex: number, fill: QrFill | null, pageIndex?: number) => void;
  /** Set (or clear) an ORNAMENT in caption box j (template.textSlots[j]). Clears
   *  the box's photo + QR + bound caption (mutual exclusivity). */
  setTextSlotOrnament: (slotIndex: number, fill: OrnamentFill | null, pageIndex?: number) => void;

  // Canvas photos (freeform)
  addPhotoToCanvas: (photoIndex: number, x: number, y: number) => void;
  updatePhotoTransform: (id: string, updates: Partial<CanvasPhoto>) => void;
  updatePhotoFilters: (id: string, filters: Partial<PhotoFilters>) => void;
  deletePhotoFromCanvas: (id: string) => void;
  duplicateCanvasPhoto: (id: string) => void;
  bringToFront: (id: string) => void;
  sendToBack: (id: string) => void;

  // Text
  addTextElement: (x: number, y: number, text?: string) => void;
  /** Place a themed quote in the current page's free space; returns the quote, or null if no room. */
  addThemedQuote: () => string | null;
  updateTextElement: (id: string, updates: Partial<TextElement>) => void;
  deleteTextElement: (id: string) => void;
  /** Set the text for a template text box (textSlots[slotIndex]). Targets the
   *  current page by default, or an explicit pageIndex (the preview spread shows
   *  two pages). Creates/updates the boxed TextElement; empty text clears it. */
  setBoxText: (slotIndex: number, content: Partial<TextElement> & { text: string }, pageIndex?: number) => void;

  // Background
  setPageBackground: (bg: AlbumBackground) => void;
  updateBackgroundTransform: (updates: Partial<Pick<AlbumBackground, 'x' | 'y' | 'width' | 'height' | 'rotation'>>) => void;
  updateBackgroundFilters: (filters: Partial<PhotoFilters>) => void;
  applyBackgroundToAllPages: (bg?: AlbumBackground) => void;
  applyPhotoFrameToAllPages: (border: { color: string; width: number; style?: 'solid' | 'dashed' | 'dotted' }) => void;
  applyFrameToAllPages: (frame: FrameStyle) => void;
  applyCornersToAllPages: (cornerBase?: string) => void;
  restyleThemedTitles: (theme: TemplateType) => void;

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

  // Wizard
  wizardStep: 'welcome' | 'pick_size' | 'pick_background' | 'upload_photos' | 'review_pages' | 'add_text' | 'finalize';
  setWizardStep: (step: 'welcome' | 'pick_size' | 'pick_background' | 'upload_photos' | 'review_pages' | 'add_text' | 'finalize') => void;

  // Undo / Redo
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;

  // Reset
  reset: () => void;

  // ── Phase 1: Cloud persistence ──
  cloudSaveStatus: 'idle' | 'saving' | 'saved' | 'error';
  lastSavedAt: Date | null;
  isLoadingCloud: boolean;
  manualSave: () => Promise<void>;
  /** Synchronous localStorage flush of the current draft (see return note). */
  saveDraftNow: () => void;

  // ── Phase 1: Photo URL resolution ──
  getPhotoUrl: (photoOrId: UploadedPhoto | string) => string;

  // ── Cloud album loading ──
  user: { id: string } | null;
  loadAlbum: (albumId: string) => Promise<void>;

  // ── Selection tracking (for assistant / properties panel) ──
  selectedTextId: string | null;
  selectedPhotoId: string | null;
  selectedSlotIndex: number | null;
  selectedElementId: string | null;
  setSelectedTextId: (id: string | null) => void;
  setSelectedPhotoId: (id: string | null) => void;
  setSelectedSlotIndex: (index: number | null) => void;
  setSelectedElementId: (id: string | null) => void;
}

export function useBuilderState(): BuilderActions {
  // ── Phase 1: Cloud hooks ──
  const { user } = useAuth();
  const albumSync = useAlbumSync();
  const idbPhotos = useIndexedDBPhotos(); // local-only — zero cloud I/O

  // ── Core state ──
  const [albumType, setAlbumTypeState] = useState<AlbumType>(() => getInitialState().albumType);
  const [albumSize, setAlbumSizeState] = useState<AlbumSizePreset>(() => getInitialState().albumSize);
  const [selectedTemplate, setSelectedTemplateState] = useState<TemplateType>(() => getInitialState().selectedTemplate);
  const [uploadedPhotos, setUploadedPhotos] = useState<UploadedPhoto[]>(() => getInitialState().uploadedPhotos);
  // Live mirror of uploadedPhotos so addPhotos can dedup against the current set
  // (and same-tick repeats) without a stale closure.
  const uploadedPhotosRef = useRef<UploadedPhoto[]>(uploadedPhotos);
  uploadedPhotosRef.current = uploadedPhotos;
  const [albumPages, setAlbumPages] = useState<AlbumPage[]>(() => getInitialState().albumPages);
  const [currentPageIndex, setCurrentPageIndex] = useState(() => getInitialState().currentPageIndex);
  const [rejectedTemplateIds, setRejectedTemplateIds] = useState<string[]>(() => getInitialState().rejectedTemplateIds);
  const [photosPerPage, setPhotosPerPage] = useState<number | undefined>(() => getInitialState().photosPerPage);
  // Resume at the working phase, not the setup/size screen, when a restored
  // album already has content (photos / filled slots / text / a QR). Without
  // this, any reload — most visibly the OAuth sign-in round-trip — drops the
  // user back on the "pick a size" step even though their album is intact in
  // localStorage. A genuine fresh start (getInitialState honours the
  // megy-fresh-start signal → empty state) still opens on 'setup'.
  const [phase, setPhase] = useState<string>(() => {
    try {
      const init = getInitialState();
      // Resume at the editor ONLY for a real generated album — pages that carry
      // a templateId AND photos to fill them. That is the safe signal: such an
      // album came from generateAlbum, so every page is fully normalized and the
      // editor can render it. A partial / legacy / hand-seeded album has no
      // templateId → stay on 'setup' rather than risk crashing the editor on a
      // malformed page (the ErrorBoundary's reset would then lose the album).
      const generated = init.uploadedPhotos.length > 0
        && init.albumPages.some((p) => !!p.templateId);
      return generated ? 'edit' : 'setup';
    } catch { return 'setup'; }
  });
  // ── Layout picker (the "Change layout" sheet/modal) — shared so the mobile
  //    review and the desktop panel both open the same picker ──
  const [layoutPickerOpen, setLayoutPickerOpen] = useState(false);
  // ── Wizard step tracking — assistant is the primary controller ──
  const [wizardStep, setWizardStep] = useState<'welcome' | 'pick_size' | 'pick_background' | 'upload_photos' | 'review_pages' | 'add_text' | 'finalize'>('welcome');

  // ── Selection tracking ──
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

  const pageSnapshotsRef = useRef<Record<string, string>>({});

  /* ── Undo / Redo ── */
  const undoStackRef = useRef<Snapshot[]>([]);
  const redoStackRef = useRef<Snapshot[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  /** Capture current state for undo */
  const pushSnapshot = useCallback(() => {
    const snapshot: Snapshot = {
      albumPages,
      uploadedPhotos,
      currentPageIndex,
      albumSize,
      photosPerPage,
      selectedTemplate,
    };
    undoStackRef.current.push(snapshot);
    if (undoStackRef.current.length > MAX_UNDO_DEPTH) {
      undoStackRef.current.shift(); // drop oldest
    }
    redoStackRef.current = []; // clear redo on new action
    setCanUndo(true);
    setCanRedo(false);
  }, [albumPages, uploadedPhotos, currentPageIndex, albumSize, photosPerPage, selectedTemplate]);

  const undo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    const current: Snapshot = {
      albumPages,
      uploadedPhotos,
      currentPageIndex,
      albumSize,
      photosPerPage,
      selectedTemplate,
    };
    const snapshot = undoStackRef.current.pop()!;
    redoStackRef.current.push(current);
    setAlbumPages(snapshot.albumPages);
    setUploadedPhotos(snapshot.uploadedPhotos);
    setCurrentPageIndex(snapshot.currentPageIndex);
    setAlbumSizeState(snapshot.albumSize);
    setPhotosPerPage(snapshot.photosPerPage);
    setSelectedTemplateState(snapshot.selectedTemplate);
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(true);
  }, [albumPages, uploadedPhotos, currentPageIndex, albumSize, photosPerPage, selectedTemplate]);

  const redo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    const current: Snapshot = {
      albumPages,
      uploadedPhotos,
      currentPageIndex,
      albumSize,
      photosPerPage,
      selectedTemplate,
    };
    const snapshot = redoStackRef.current.pop()!;
    undoStackRef.current.push(current);
    setAlbumPages(snapshot.albumPages);
    setUploadedPhotos(snapshot.uploadedPhotos);
    setCurrentPageIndex(snapshot.currentPageIndex);
    setAlbumSizeState(snapshot.albumSize);
    setPhotosPerPage(snapshot.photosPerPage);
    setSelectedTemplateState(snapshot.selectedTemplate);
    setCanUndo(true);
    setCanRedo(redoStackRef.current.length > 0);
  }, [albumPages, uploadedPhotos, currentPageIndex, albumSize, photosPerPage, selectedTemplate]);

  // ── Phase 1: Cloud state ──
  const [cloudSaveStatus, setCloudSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [isLoadingCloud, setIsLoadingCloud] = useState(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cloudAlbumIdRef = useRef<string | undefined>(undefined);
  const skipCloudLoadRef = useRef(false);

  const currentPage = albumPages[currentPageIndex] ?? createEmptyPage(0, albumSize);

  /* ── Phase 1: Serialize album for cloud ── */
  const serializeAlbum = useCallback((): AlbumData => {
    // Only sync lightweight metadata to Supabase DB.
    // Actual photo bytes stay in IndexedDB — zero cloud Storage I/O.
    return {
      id: cloudAlbumIdRef.current,
      title: 'My Album',
      sizePreset: albumSize,
      pages: albumPages as unknown as AlbumData['pages'],
      photos: uploadedPhotos.map((p) => ({
        id: p.id,
        name: p.name,
        // No cloudUrl, no storagePath — all local-only now.
      })),
      coverPhoto: pageSnapshotsRef.current[albumPages[0]?.id] ?? null,
    };
  }, [albumSize, albumPages, uploadedPhotos]);

  /* ── Persistence strategy ──
     • Local (localStorage): debounced ~30s — cheap and client-only.
     • Cloud (Supabase): every 10 minutes, on tab-hide / app exit, on unmount,
       or a manual save. Photo bytes live in IndexedDB, so the cloud copy is
       just a light backup of the layout and doesn't need frequent writes. ── */
  const cloudDirtyRef = useRef(false);
  const persistRef = useRef<{
    local: SerializedState;
    serializeAlbum: () => AlbumData;
    save: typeof albumSync.save;
    userId: string | undefined;
    isLoadingCloud: boolean;
    justLoaded: () => boolean;
  } | null>(null);
  persistRef.current = {
    local: { albumType, albumSize, selectedTemplate, uploadedPhotos, albumPages, currentPageIndex, rejectedTemplateIds, photosPerPage },
    serializeAlbum,
    save: albumSync.save,
    userId: user?.id,
    isLoadingCloud,
    justLoaded: () => Date.now() - cloudLoadCompletedRef.current < 500,
  };

  const flushLocal = useCallback(() => {
    if (persistRef.current) saveState(persistRef.current.local);
  }, []);

  const flushCloud = useCallback(() => {
    const p = persistRef.current;
    if (!p || !p.userId || p.isLoadingCloud || p.justLoaded() || !cloudDirtyRef.current) return;
    cloudDirtyRef.current = false;
    setCloudSaveStatus('saving');
    p.save(p.userId, p.serializeAlbum())
      .then((result) => {
        if (result.success) {
          if (result.albumId) cloudAlbumIdRef.current = result.albumId;
          setCloudSaveStatus('saved');
          setLastSavedAt(new Date());
        } else {
          cloudDirtyRef.current = true; // failed — retry on the next cycle
          setCloudSaveStatus('error');
        }
      })
      .catch(() => { cloudDirtyRef.current = true; setCloudSaveStatus('error'); });
  }, []);

  // Any change → mark cloud dirty + debounce the LOCAL save (~30s).
  useEffect(() => {
    cloudDirtyRef.current = true;
    if (autoSaveTimerRef.current !== null) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(flushLocal, 30000);
    return () => { if (autoSaveTimerRef.current !== null) clearTimeout(autoSaveTimerRef.current); };
  }, [albumType, albumSize, selectedTemplate, uploadedPhotos, albumPages, currentPageIndex, rejectedTemplateIds, photosPerPage, flushLocal]);

  // Cloud backup every 10 minutes (only if something changed).
  useEffect(() => {
    const id = setInterval(flushCloud, 10 * 60 * 1000);
    return () => clearInterval(id);
  }, [flushCloud]);

  // Flush local + push a cloud backup when the tab is hidden / app exits.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        flushLocal();
        flushCloud();
      }
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
    };
  }, [flushLocal, flushCloud]);

  /* ── Phase 1: Face API init + Cloud load on mount / login ── */
  useEffect(() => {
    void initFaceApi(); // preload face detection models
  }, []);

  useEffect(() => {
    if (!user) return;

    // ── LEAK FIX #3: Skip cloud auto-load on fresh start ──
    // If the user just clicked "Create New Album", don't pull old
    // album data from cloud and overwrite the fresh empty state.
    const freshStart = sessionStorage.getItem('megy-fresh-start');
    if (freshStart === '1') {
      sessionStorage.removeItem('megy-fresh-start');
      return;
    }

    let cancelled = false;
    const userId = user.id;

    async function loadFromCloud() {
      setIsLoadingCloud(true);
      try {
        // ── Guard: fresh album requested — skip cloud load ──
        if (skipCloudLoadRef.current) {
          skipCloudLoadRef.current = false;
          setIsLoadingCloud(false);
          return;
        }
        // ── Guard: fresh start with empty state — skip cloud load ──
        // In StrictMode, effects run twice. The first mount consumes
        // the fresh-start signal, but the second mount sees no signal.
        // If photos are empty and pages have no content, this is a
        // fresh start — don't load old cloud data.
        const hasAnyContent = albumPages.some((p) =>
          (p.photos?.length ?? 0) > 0 ||
          (p.slotFills?.some((f) => f !== null) ?? false) ||
          (p.textElements?.length ?? 0) > 0
        );
        if (uploadedPhotos.length === 0 && !hasAnyContent) {
          setIsLoadingCloud(false);
          return;
        }
        // ── Guard: don't overwrite local data with cloud data ──
        // If localStorage has meaningful data (photos, slot fills, text),
        // the user did work locally that hasn't been synced yet.
        // Skip cloud load; local data will auto-save to cloud shortly.
        const hasLocalData = albumPages.some((p) =>
          (p.photos?.length ?? 0) > 0 ||
          (p.slotFills?.some((f) => f !== null) ?? false) ||
          (p.textElements?.length ?? 0) > 0
        );
        if (hasLocalData) {
          setIsLoadingCloud(false);
          return;
        }

        const albumData = await albumSync.load(userId);
        if (cancelled) return;

        if (albumData) {
          if (albumData.sizePreset) {
            setAlbumSizeState(albumData.sizePreset as AlbumSizePreset);
          }
          if (albumData.pages && albumData.pages.length > 0) {
            const restoredPages: AlbumPage[] = (albumData.pages as unknown as AlbumPage[]).map(
              (p: any, idx: number) => {
                const np = normalizePage(p);
                return {
                  ...np,
                  id: np.id ?? `page-${Date.now()}-${idx}`,
                  size: (np.size as AlbumSizePreset) ?? albumSize,
                };
              }
            );
            setAlbumPages(bindStrandedCaptions(stripDefaultThemeTitles(restoredPages)));
          }
          // Rehydrate photo metadata from cloud + restore from IndexedDB
          if (albumData.photos && albumData.photos.length > 0) {
            const restored = await Promise.all(
              albumData.photos.map(async (p) => {
                const stored = await idbPhotos.get(p.id);
                return {
                  id: p.id,
                  name: p.name ?? 'Untitled',
                  previewUrl: stored?.url ?? '',
                  type: stored?.type ?? 'image/jpeg',
                  size: stored?.size ?? 0,
                  width: stored?.width ?? 0,
                  height: stored?.height ?? 0,
                };
              })
            );
            setUploadedPhotos(restored);
          }
          if (albumData.id) {
            cloudAlbumIdRef.current = albumData.id;
          }
        }
      } finally {
        if (!cancelled) {
          setIsLoadingCloud(false);
          cloudLoadCompletedRef.current = Date.now();
        }
      }
    }

    void loadFromCloud();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  /* ── On unmount (e.g. navigating away in-app): flush pending saves ── */
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current !== null) {
        clearTimeout(autoSaveTimerRef.current);
      }
      flushLocal();
      flushCloud();
    };
  }, [flushLocal, flushCloud]);

  /* ── Rehydrate dead blob URLs from IndexedDB on mount ──
     Blob URLs expire on page unload.  When state is loaded from
     localStorage, photos have dead previewUrl values.  This effect
     runs once after mount and restores working blob URLs by reading
     the actual File bytes from IndexedDB.

     ── LEAK FIX #2: Guard against fresh start ──
     If reset() was called or a fresh start was requested, we must
     NOT rehydrate old photos from IndexedDB.  */
  useEffect(() => {
    async function rehydrate() {
      // ── LEAK FIX #2a: Don't rehydrate during a fresh start ──
      const freshStart = sessionStorage.getItem('megy-fresh-start');
      if (freshStart === '1') return;

      // ── LEAK FIX #2b: If reset() just fired, skipCloudLoadRef is true ──
      if (skipCloudLoadRef.current) return;

      const needsRehydration = uploadedPhotos.some(
        (p) => !p.previewUrl || isDeadBlobUrl(p.previewUrl)
      );
      if (!needsRehydration) return;

      // NOTE: We intentionally do NOT wipe IndexedDB when all blob URLs are
      // dead. Dead URLs are the normal post-reload state; wiping here was
      // destroying recoverable photos. We always rehydrate from IndexedDB
      // below. Intentional fresh starts are handled above (megy-fresh-start /
      // skipCloudLoadRef).
      const rehydrated = await Promise.all(
        uploadedPhotos.map(async (photo) => {
          // Skip photos that already have valid blob URLs
          if (photo.previewUrl && !isDeadBlobUrl(photo.previewUrl)) {
            return photo;
          }
          // Restore from IndexedDB
          const stored = await idbPhotos.get(photo.id);
          if (stored?.url) {
            return {
              ...photo,
              previewUrl: stored.url,
              type: stored.type ?? photo.type,
              size: stored.size ?? photo.size,
              width: stored.width ?? photo.width,
              height: stored.height ?? photo.height,
            };
          }
          // IndexedDB miss — keep as-is (broken image, but don't lose metadata)
          return photo;
        })
      );

      setUploadedPhotos(rehydrated);
    }

    void rehydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  /* ── Photo handling (IndexedDB — zero cloud I/O) ── */
  const addPhotos = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);

    // ── Dedup: never add the same photo twice. Skip files already uploaded
    // (same name + size) and repeats within this batch — covers re-selecting
    // the same folder AND a double-fired upload event. ──
    const seen = new Set(uploadedPhotosRef.current.map((p) => `${p.name}__${p.size}`));
    const freshFiles: File[] = [];
    for (const f of fileArray) {
      const key = `${f.name}__${f.size}`;
      if (seen.has(key)) continue;
      seen.add(key);
      freshFiles.push(f);
    }
    if (freshFiles.length === 0) return;

    // Create placeholder metadata with preview URLs
    const newPhotos: UploadedPhoto[] = freshFiles.map((file) => ({
      id: `photo-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: file.name,
      previewUrl: URL.createObjectURL(file),
      type: file.type,
      size: file.size,
      width: 0, // filled in after IndexedDB store
      height: 0,
    }));
    // Optimistically reflect in the ref so a same-tick second call dedups too.
    uploadedPhotosRef.current = [...uploadedPhotosRef.current, ...newPhotos];
    setUploadedPhotos((prev) => [...prev, ...newPhotos]);

    // Store in IndexedDB; backfill real dimensions + EXIF capture time.
    newPhotos.forEach(async (photo) => {
      const file = freshFiles.find((f) => f.name === photo.name && f.size === photo.size);
      if (!file) return;
      const stored = await idbPhotos.store(file, photo.id);
      const capturedAt = await readCaptureTime(file);
      setUploadedPhotos((prev) =>
        prev.map((p) =>
          p.id === photo.id
            ? { ...p, ...(stored ? { width: stored.width, height: stored.height } : {}), capturedAt }
            : p,
        ),
      );
    });
  }, [idbPhotos]);

  const removePhoto = useCallback((id: string) => {
    pushSnapshot();
    // Delete from IndexedDB (local — zero cloud I/O)
    idbPhotos.deletePhoto(id).catch(() => { /* ignore */ });

    setUploadedPhotos((prev) => {
      const photo = prev.find((p) => p.id === id);
      if (photo) URL.revokeObjectURL(photo.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }, [idbPhotos]);

  const replacePhoto = useCallback((id: string, file: File) => {
    pushSnapshot();
    setUploadedPhotos((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, name: file.name, previewUrl: URL.createObjectURL(file), type: file.type, size: file.size }
          : p
      )
    );
    // Store replacement in IndexedDB (local — zero cloud I/O)
    idbPhotos.store(file, id).then((stored) => {
      if (stored) {
        setUploadedPhotos((prev) =>
          prev.map((p) =>
            p.id === id ? { ...p, width: stored.width, height: stored.height } : p
          )
        );
      }
    });
  }, [idbPhotos]);

  /* ── Page navigation ── */
  const goToPage = useCallback((index: number) => {
    setCurrentPageIndex(Math.max(0, Math.min(index, albumPages.length - 1)));
  }, [albumPages.length]);

  const addPage = useCallback(() => {
    pushSnapshot();
    setAlbumPages((prev) => {
      const newPage = createEmptyPage(prev.length, albumSize);
      const insertIndex = currentPageIndex + 1;
      return [...prev.slice(0, insertIndex), newPage, ...prev.slice(insertIndex)];
    });
    setCurrentPageIndex((prev) => prev + 1);
  }, [currentPageIndex, albumSize]);

  const deletePage = useCallback((index: number) => {
    pushSnapshot();
    setAlbumPages((prev) => {
      // Hard block: cannot delete below MIN_PAGES
      if (prev.length <= MIN_PAGES) return prev;
      return prev.filter((_, i) => i !== index);
    });
    setCurrentPageIndex((prev) => Math.min(prev, Math.max(0, albumPages.length - 2)));
  }, [albumPages.length]);

  const duplicatePage = useCallback((index: number) => {
    pushSnapshot();
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
        // Deep-copy the remaining positional fills too, so the duplicate owns its
        // own arrays (the `...page` spread would share the references). qrFills +
        // slotTexts were a pre-existing gap; ornamentFills is new.
        qrFills: [...(page.qrFills ?? [])],
        slotTexts: [...(page.slotTexts ?? [])],
        ornamentFills: [...(page.ornamentFills ?? [])],
        textSlotFills: [...(page.textSlotFills ?? [])],
        textSlotQr: [...(page.textSlotQr ?? [])],
        textSlotOrnament: [...(page.textSlotOrnament ?? [])],
        photos: page.photos.map((p) => ({ ...p, id: `photo-${Date.now()}-${Math.random().toString(36).slice(2)}` })),
        textElements: page.textElements.map((t) => ({ ...t, id: `text-${Date.now()}-${Math.random().toString(36).slice(2)}` })),
      };
      return [...prev.slice(0, index + 1), dup, ...prev.slice(index + 1)];
    });
  }, []);

  /* ── Generation ── */
  // Remember a custom Border/Frame chosen on the Step-2 wizard so it survives album
  // generation (the buttons live on the pre-album step; without this the pick is
  // lost when generateAlbum builds fresh pages). Set by applyPhotoFrameToAllPages /
  // applyFrameToAllPages below, which set_border / set_frame already call.
  const wizardBorderRef = useRef<{ color: string; width: number; style?: 'solid' | 'dashed' | 'dotted' } | null>(null);
  const wizardFrameRef = useRef<FrameStyle | null>(null);

  const generateAlbumAction = useCallback((wizardBackground?: AlbumBackground, options?: { randomize?: boolean }) => {
    pushSnapshot();
    // Bake the active theme's photo frame + corner art onto every generated page.
    // A custom Border picked on the wizard overrides the theme's border here.
    const border: { color: string; width: number; style?: 'solid' | 'dashed' | 'dotted' } =
      wizardBorderRef.current ?? getThemedPhotoBorder(selectedTemplate);
    const cornerBase = getThemeCornerBase(selectedTemplate);
    // Fall back to the theme's own background so image-less palette themes
    // (e.g. baptism) don't generate as plain white when no bg is passed.
    const bg = wizardBackground ?? getThemedBackground(selectedTemplate, 0);
    let newPages = generateAlbum(uploadedPhotos, albumSize, photosPerPage, bg, { ...options, border, cornerBase });
    // createEmptyPage only carries border color/width — also apply the border STYLE
    // and the decorative FRAME (when chosen) onto every freshly generated page.
    const bStyle = border.style;
    const wFrame = wizardFrameRef.current;
    if (bStyle || wFrame) {
      newPages = newPages.map((p) => ({
        ...p,
        ...(bStyle ? { photoBorderStyle: bStyle } : {}),
        ...(wFrame ? { frameStyle: wFrame } : {}),
      }));
    }
    // NOTE: no auto-placed cover title. The builder used to drop a themed title
    // ("Our Story" etc.) onto page 1, but that forced unwanted text over the
    // user's photos — removed. Users add their own title/text if they want one.
    setAlbumPages(newPages);
    setCurrentPageIndex(0);
  }, [uploadedPhotos, albumSize, photosPerPage, selectedTemplate]);

  const regeneratePage = useCallback(() => {
    pushSnapshot();
    setAlbumPages((prev) => {
      const next = [...prev];
      const page = next[currentPageIndex];
      if (!page) return prev;

      // ── 1. Collect existing photos on this page (preserve these). Dedup so a
      //       page that already has duplicates gets cleaned on regenerate. ──
      const existingFills = [...new Set(
        (page.slotFills ?? []).filter((f): f is number => f !== null),
      )];

      // ── 2. Pick a random template different from current (and matched to
      //       THIS album's size, so we don't pull a 9x9 template onto an 8x8). ──
      let pool = getTemplatesForAlbum(albumSize).filter((t) => t.id !== page.templateId);
      if (photosPerPage !== undefined) {
        pool = pool.filter((t) => t.slotCount === photosPerPage);
      }
      if (pool.length === 0) pool = getTemplatesForAlbum(albumSize).filter((t) => t.id !== page.templateId);
      if (pool.length === 0) pool = getTemplatesForAlbum(albumSize);
      const newTemplateId = templateTracker.pick(pool.map(t => t.id), page.templateId) ?? pool[Math.floor(Math.random() * pool.length)].id;
      const template = pool.find(t => t.id === newTemplateId) ?? pool[0];
      const slotCount = template.slots.length;

      // ── 3. Build new page with preserved photos + new template ──
      const newPage: AlbumPage = {
        ...createEmptyPage(Date.now(), albumSize),
        id: page.id,
        templateId: template.id,
        background: page.background,
        photoBorderColor: page.photoBorderColor,
        photoBorderWidth: page.photoBorderWidth,
        cornerBase: page.cornerBase,
        textElements: page.textElements,
        // Carry chooser-placed QR / text / ornament forward so a regenerate doesn't drop them.
        qrFills: (page.qrFills ?? []).slice(0, slotCount),
        slotTexts: (page.slotTexts ?? []).slice(0, slotCount),
        ornamentFills: (page.ornamentFills ?? []).slice(0, slotCount),
        // Caption-box photo/QR belong to template.textSlots, not template.slots —
        // preserve them so a regenerate never drops a claimed caption box.
        textSlotFills: page.textSlotFills,
        textSlotQr: page.textSlotQr,
        textSlotOrnament: page.textSlotOrnament,
        slotFills: new Array(slotCount).fill(null),
        slotScales: new Array(slotCount).fill(1),
        slotOffsetsX: new Array(slotCount).fill(0),
        slotOffsetsY: new Array(slotCount).fill(0),
      };

      // Explicitly initialize slotFills to satisfy TypeScript
      newPage.slotFills = new Array(slotCount).fill(null);

      // ── 4. Preserve existing photos first, skipping any slot now claimed by
      //       a carried-over QR/text (mutual exclusivity). ──
      // Same or more slots: all existing photos stay
      // Fewer slots: excess photos are freed back to pool
      let preserveIdx = 0;
      for (let i = 0; i < slotCount && preserveIdx < existingFills.length; i++) {
        if (newPage.qrFills?.[i] || newPage.slotTexts?.[i] || newPage.ornamentFills?.[i]) continue;
        newPage.slotFills[i] = existingFills[preserveIdx];
        preserveIdx++;
      }

      // ── 5. Fill empty slots from photos used NOWHERE in the album. ──
      // NOTE: do NOT free this page's preserved photos back into the pool —
      // they're already in slots 0..n above, and re-adding them here is exactly
      // what produced duplicate pictures on the same page ([0,1,0,1,…]).
      const usedGlobally = new Set<number>();
      next.forEach((p) => {
        (p.slotFills ?? []).forEach((f) => { if (f !== null) usedGlobally.add(f); });
      });

      // Walk actual empty slots (skipping QR/text-claimed ones) and place unused photos.
      const emptySlots: number[] = [];
      for (let i = 0; i < slotCount; i++) {
        if (newPage.qrFills?.[i] || newPage.slotTexts?.[i] || newPage.ornamentFills?.[i]) continue;
        if (newPage.slotFills[i] === null) emptySlots.push(i);
      }
      let emptyPtr = 0;
      for (let i = 0; i < uploadedPhotos.length && emptyPtr < emptySlots.length; i++) {
        // Belt-and-suspenders: never place a photo that's already on this page.
        if (!usedGlobally.has(i) && !newPage.slotFills.includes(i)) {
          newPage.slotFills[emptySlots[emptyPtr]] = i;
          usedGlobally.add(i);
          emptyPtr++;
        }
      }
      // Remaining empty slots = "no more unused pictures" (left as null)

      next[currentPageIndex] = newPage;
      return next;
    });
  }, [currentPageIndex, albumSize, uploadedPhotos, photosPerPage]);

  const shuffleLayout = useCallback(() => {
    pushSnapshot();
    setAlbumPages((prev) => {
      const next = [...prev];
      const page = next[currentPageIndex];
      if (!page) return prev;

      let pool = getTemplatesForAlbum(albumSize).filter((t) => t.id !== page.templateId);
      if (photosPerPage !== undefined) {
        pool = pool.filter((t) => t.slotCount === photosPerPage);
      }
      if (pool.length === 0) pool = getTemplatesForAlbum(albumSize).filter((t) => t.id !== page.templateId);
      if (pool.length === 0) pool = getTemplatesForAlbum(albumSize);
      const newTemplateId = templateTracker.pick(pool.map(t => t.id), page.templateId) ?? pool[Math.floor(Math.random() * pool.length)].id;
      const template = pool.find(t => t.id === newTemplateId) ?? pool[0];

      // relayPageOnTemplate dedups existing fills, so shuffling never carries a
      // duplicate forward.
      next[currentPageIndex] = relayPageOnTemplate(page, template);

      return next;
    });
  }, [currentPageIndex, photosPerPage, albumSize]);

  /* Cycle the current page through ratio-MATCHED layouts (same photo count AND
     same slot ratio as the photos), in order, looping — powers mobile "Change".
     Re-flows the photos so they never get cropped into a mismatched slot. */
  const cycleLayout = useCallback(() => {
    pushSnapshot();
    const analysis = analyzePhotos(uploadedPhotos);
    setAlbumPages((prev) => {
      const next = [...prev];
      const page = next[currentPageIndex];
      if (!page) return prev;
      const existingFills = [...new Set((page.slotFills ?? []).filter((f): f is number => f !== null))];
      const count = existingFills.length;
      // The page's dominant photo ratio → only cycle templates whose slots match.
      const pageRatio = dominantPageRatio(existingFills, analysis.assignments);
      const allForSize = getTemplatesForAlbum(albumSize);
      let pool = allForSize.filter((t) => t.slotCount === count && (!pageRatio || t.targetRatio === pageRatio));
      if (pool.length === 0) pool = allForSize.filter((t) => t.slotCount === count);
      if (pool.length === 0) pool = allForSize;
      pool = [...pool].sort((a, b) => a.id.localeCompare(b.id));
      if (pool.length === 0) return prev;
      const curIdx = pool.findIndex((t) => t.id === page.templateId);
      const template = pool[(curIdx + 1) % pool.length];
      next[currentPageIndex] = relayPageOnTemplate(page, template);
      return next;
    });
  }, [currentPageIndex, albumSize, uploadedPhotos]);

  /** The templates available for the current page (same pool the cycle uses:
   *  matching the page's photo count + dominant ratio, active only), sorted —
   *  for the layout picker so the user can choose directly. */
  const availableTemplatesForCurrentPage = useCallback((): PageTemplate[] => {
    const page = albumPages[currentPageIndex];
    if (!page) return [];
    const analysis = analyzePhotos(uploadedPhotos);
    const existingFills = [...new Set((page.slotFills ?? []).filter((f): f is number => f !== null))];
    const count = existingFills.length;
    const pageRatio = dominantPageRatio(existingFills, analysis.assignments);
    const allForSize = getTemplatesForAlbum(albumSize);
    // EXPERIMENT: slotCount removed from the qualification — show EVERY layout whose
    // ratio matches the page's photos, regardless of photo count. Strict RATIO match
    // stays (no crop). Note: picking a layout with FEWER slots than photos drops the
    // extra photos from this page; MORE slots leaves empty "+" slots to fill.
    let pool = allForSize.filter((t) => (!pageRatio || t.targetRatio === pageRatio));
    if (pool.length === 0) pool = allForSize;
    // Same photo count first, then nearest counts, then by id.
    return [...pool].sort((a, b) => Math.abs(a.slotCount - count) - Math.abs(b.slotCount - count) || a.id.localeCompare(b.id));
  }, [albumPages, currentPageIndex, uploadedPhotos, albumSize]);

  /** Apply a SPECIFIC template to the current page (the picker's choice), keeping
   *  the existing photos (re-filled into the new slots — unlike setPageTemplate
   *  which clears them). */
  const applyPageLayout = useCallback((templateId: string) => {
    const template = getTemplateById(templateId);
    if (!template) return;
    pushSnapshot();
    setAlbumPages((prev) => {
      const next = [...prev];
      const page = next[currentPageIndex];
      if (!page) return prev;
      next[currentPageIndex] = relayPageOnTemplate(page, template);
      return next;
    });
  }, [currentPageIndex]);

  /* ── Slot management ── */
  const fillSlot = useCallback((slotIndex: number, photoIndex: number) => {
    pushSnapshot();
    updateCurrentPage((page) => {
      const fills = [...(page.slotFills ?? [])];
      // Mutual exclusivity: a photo claims this slot → clear any QR/text/ornament there.
      const qrFills = [...(page.qrFills ?? [])];
      const slotTexts = [...(page.slotTexts ?? [])];
      const ornamentFills = [...(page.ornamentFills ?? [])];
      qrFills[slotIndex] = null;
      slotTexts[slotIndex] = null;
      ornamentFills[slotIndex] = null;
      const other = fills.indexOf(photoIndex);
      if (other !== -1 && other !== slotIndex) {
        // This photo is already on the page → SWAP the two slots (taking their
        // framing along) so we never end up with the same picture twice.
        const scales = [...(page.slotScales ?? [])];
        const offsetsX = [...(page.slotOffsetsX ?? [])];
        const offsetsY = [...(page.slotOffsetsY ?? [])];
        fills[other] = fills[slotIndex] ?? null;
        fills[slotIndex] = photoIndex;
        [scales[other], scales[slotIndex]] = [scales[slotIndex], scales[other]];
        [offsetsX[other], offsetsX[slotIndex]] = [offsetsX[slotIndex], offsetsX[other]];
        [offsetsY[other], offsetsY[slotIndex]] = [offsetsY[slotIndex], offsetsY[other]];
        return { ...page, slotFills: fills, slotScales: scales, slotOffsetsX: offsetsX, slotOffsetsY: offsetsY, qrFills, slotTexts, ornamentFills };
      }
      fills[slotIndex] = photoIndex;
      return { ...page, slotFills: fills, qrFills, slotTexts, ornamentFills };
    });

    // ── Face-centered auto-pan ──
    const photo = uploadedPhotos[photoIndex];
    if (!photo) return;
    const photoUrl = photo.previewUrl;
    if (!photoUrl) return;
    const template = PAGE_TEMPLATES.find((t) => t.id === (albumPages[currentPageIndex]?.templateId ?? ''));
    const slot = template?.slots?.[slotIndex];

    detectFaceCenter(photoUrl).then((faceCenter) => {
      if (!faceCenter || !slot) return;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const photoAspect = img.naturalWidth / img.naturalHeight;
        const slotAspect = slot.width / slot.height;
        const { offsetX, offsetY } = computeFaceOffset(faceCenter, photoAspect, slotAspect);
        updateCurrentPage((p) => {
          const offsetsX = [...(p.slotOffsetsX ?? [])];
          const offsetsY = [...(p.slotOffsetsY ?? [])];
          offsetsX[slotIndex] = offsetX;
          offsetsY[slotIndex] = offsetY;
          return { ...p, slotOffsetsX: offsetsX, slotOffsetsY: offsetsY };
        });
      };
      img.src = photoUrl;
    });
  }, [updateCurrentPage, uploadedPhotos, albumPages, currentPageIndex]);

  const clearSlot = useCallback((slotIndex: number) => {
    pushSnapshot();
    updateCurrentPage((page) => {
      const fills = [...(page.slotFills ?? [])];
      fills[slotIndex] = null;
      return { ...page, slotFills: fills };
    });
  }, [updateCurrentPage]);

  const setSlotScale = useCallback((slotIndex: number, scale: number) => {
    pushSnapshot();
    updateCurrentPage((page) => {
      const scales = [...(page.slotScales ?? [])];
      scales[slotIndex] = scale;
      return { ...page, slotScales: scales };
    });
  }, [updateCurrentPage]);

  const setSlotOffset = useCallback((slotIndex: number, dx: number, dy: number) => {
    pushSnapshot();
    updateCurrentPage((page) => {
      const offsetsX = [...(page.slotOffsetsX ?? [])];
      const offsetsY = [...(page.slotOffsetsY ?? [])];
      offsetsX[slotIndex] = (offsetsX[slotIndex] ?? 0) + dx;
      offsetsY[slotIndex] = (offsetsY[slotIndex] ?? 0) + dy;
      return { ...page, slotOffsetsX: offsetsX, slotOffsetsY: offsetsY };
    });
  }, [updateCurrentPage]);

  const updateSlotGeometry = useCallback((slotIndex: number, geometry: SlotGeometryOverride) => {
    pushSnapshot();
    updateCurrentPage((page) => {
      const geoms = [...(page.slotGeometries ?? [])];
      geoms[slotIndex] = { ...(geoms[slotIndex] ?? {}), ...geometry };
      return { ...page, slotGeometries: geoms };
    });
  }, [updateCurrentPage]);

  /** Set (or clear, with null) the QR living-memory fill for a template QR slot.
   *  pageIndex defaults to the current page; the preview spread passes it explicitly. */
  const setQrFill = useCallback((slotIndex: number, fill: QrFill | null, pageIndex?: number) => {
    pushSnapshot();
    const apply = (page: AlbumPage): AlbumPage => {
      const qrFills = [...(page.qrFills ?? [])];
      qrFills[slotIndex] = fill;
      // Mutual exclusivity: setting a QR clears any photo/text/ornament at this slot.
      if (fill) {
        const fills = [...(page.slotFills ?? [])];
        const slotTexts = [...(page.slotTexts ?? [])];
        const ornamentFills = [...(page.ornamentFills ?? [])];
        fills[slotIndex] = null;
        slotTexts[slotIndex] = null;
        ornamentFills[slotIndex] = null;
        return { ...page, qrFills, slotFills: fills, slotTexts, ornamentFills };
      }
      return { ...page, qrFills };
    };
    if (pageIndex == null) {
      updateCurrentPage(apply);
    } else {
      setAlbumPages((prev) => {
        const next = [...prev];
        if (next[pageIndex]) next[pageIndex] = apply(next[pageIndex]);
        return next;
      });
    }
  }, [updateCurrentPage]);

  // Live snapshot for the async memory-QR action (face detection awaits, so the
  // callback must read the CURRENT page/photos/size, not a stale closure).
  const stateRefForQr = useRef<{ page: AlbumPage | null; photos: UploadedPhoto[]; size: AlbumSizePreset }>({ page: null, photos: [], size: albumSize });
  stateRefForQr.current = { page: currentPage ?? null, photos: uploadedPhotos, size: albumSize };

  /** Is the current page a plain single-photo page that a living-memory QR
   *  badge can be applied to? (Exactly one photo slot, with a photo in it.) */
  const canAddMemoryQr = useMemo(() => {
    const t = currentPage?.templateId ? getTemplateById(currentPage.templateId) : null;
    if (!t) return false;
    const filled = (currentPage?.slotFills ?? []).some((f) => f != null);
    // Gate on an ACTIVE QR (a filled qrFill), not merely a qr SLOT: a badge page
    // whose QR was removed has an empty qr slot but should re-offer the button
    // (otherwise removing a memory strands the page). Exclude caption-bearing
    // pages — the badge template has no textSlots, so a bound caption would be
    // orphaned (invisible) after the swap.
    const hasActiveQr = (currentPage?.qrFills ?? []).some((q) => q != null)
      || (currentPage?.textSlotQr ?? []).some((q) => q != null);
    return photoSlotCount(t) === 1 && filled && !hasActiveQr && !(t.textSlots?.length);
  }, [currentPage]);

  /** Turn the current single-photo page into a full-bleed QR living-memory
   *  badge: keep the photo full-bleed, tuck the scannable QR chip into the
   *  corner farthest from the detected face (fallback bottom-right). `fill` is
   *  the minted QrFill from AddQrModal. Returns false if the page isn't a
   *  single-photo page (the button is gated on canAddMemoryQr, so that's rare). */
  const applyMemoryQr = useCallback(async (fill: QrFill, corner?: QrCorner): Promise<boolean> => {
    const page = stateRefForQr.current.page;
    const photos = stateRefForQr.current.photos;
    const size = stateRefForQr.current.size;
    if (!page) return false;
    const photoIdx = (page.slotFills ?? []).find((f): f is number => f != null);
    if (photoIdx == null) return false;
    const photo = photos[photoIdx];
    // A caller-chosen corner wins; otherwise auto-pick the corner away from the
    // detected face (the smart default). Skipping face detection when the user
    // picked a corner keeps the placement instant + exactly where they asked.
    let chosen: QrCorner;
    if (corner) {
      chosen = corner;
    } else {
      let face: { x: number; y: number } | null = null;
      if (photo?.previewUrl) {
        try { face = await detectFaceCenter(photo.previewUrl); } catch { face = null; }
      }
      chosen = qrCornerAwayFromFace(face);
    }
    const template = qrBadgeTemplate(size, chosen);
    if (!template) return false;
    const qrIdx = template.slots.findIndex((s) => s.kind === 'qr');
    pushSnapshot();
    updateCurrentPage((p) => {
      const slotFills = new Array(template.slots.length).fill(null);
      slotFills[0] = photoIdx;
      const qrFills = new Array(template.slots.length).fill(null);
      qrFills[qrIdx] = fill;
      return {
        ...p,
        templateId: template.id,
        slotFills,
        qrFills,
        slotTexts: new Array(template.slots.length).fill(null),
        // Reset ornaments to the new (badge) slot count so a stale array can't
        // ghost an ornament onto the QR corner (mirrors the slotTexts reset).
        ornamentFills: new Array(template.slots.length).fill(null),
        slotScales: [p.slotScales?.[0] ?? 1, 1],
        slotOffsetsX: [p.slotOffsetsX?.[0] ?? 0, 0],
        slotOffsetsY: [p.slotOffsetsY?.[0] ?? 0, 0],
        // Drop any theme decorative corners — they sit in all four corners and
        // would overlay (and in print obscure) the QR chip.
        cornerBase: undefined,
      };
    });
    return true;
  }, [updateCurrentPage, pushSnapshot]);

  /** Move an EXISTING QR-badge to a different corner. Swaps the badge template to
   *  the same size + new corner, preserving the full-bleed photo (slot 0, with its
   *  pan) and the QR fill. No face detection — the user is choosing explicitly.
   *  No-op unless the current page is already a QR-badge page. */
  const setMemoryQrCorner = useCallback((corner: QrCorner) => {
    const page = stateRefForQr.current.page;
    const size = stateRefForQr.current.size;
    if (!page || !qrBadgeCornerOf(page.templateId)) return;
    const template = qrBadgeTemplate(size, corner);
    if (!template) return;
    const qrIdx = template.slots.findIndex((s) => s.kind === 'qr');
    const photoIdx = (page.slotFills ?? []).find((f): f is number => f != null) ?? null;
    const existingQr = (page.qrFills ?? []).find((q) => q != null) ?? null;
    pushSnapshot();
    updateCurrentPage((p) => {
      const slotFills = new Array(template.slots.length).fill(null);
      slotFills[0] = photoIdx;
      const qrFills = new Array(template.slots.length).fill(null);
      qrFills[qrIdx] = existingQr;
      return {
        ...p,
        templateId: template.id,
        slotFills,
        qrFills,
        slotTexts: new Array(template.slots.length).fill(null),
        ornamentFills: new Array(template.slots.length).fill(null),
        slotScales: [p.slotScales?.[0] ?? 1, 1],
        slotOffsetsX: [p.slotOffsetsX?.[0] ?? 0, 0],
        slotOffsetsY: [p.slotOffsetsY?.[0] ?? 0, 0],
        cornerBase: undefined,
      };
    });
  }, [updateCurrentPage, pushSnapshot]);

  /** Set (or clear, with null) the per-slot text fill for slot `slotIndex`.
   *  Mirrors setQrFill: pageIndex defaults to the current page. Setting a
   *  non-null text clears any photo/QR at the same slot (mutual exclusivity). */
  const setSlotText = useCallback((slotIndex: number, content: SlotText | null, pageIndex?: number) => {
    pushSnapshot();
    const apply = (page: AlbumPage): AlbumPage => {
      const slotTexts = [...(page.slotTexts ?? [])];
      slotTexts[slotIndex] = content;
      if (content) {
        const fills = [...(page.slotFills ?? [])];
        const qrFills = [...(page.qrFills ?? [])];
        const ornamentFills = [...(page.ornamentFills ?? [])];
        fills[slotIndex] = null;
        qrFills[slotIndex] = null;
        ornamentFills[slotIndex] = null;
        return { ...page, slotTexts, slotFills: fills, qrFills, ornamentFills };
      }
      return { ...page, slotTexts };
    };
    if (pageIndex == null) {
      updateCurrentPage(apply);
    } else {
      setAlbumPages((prev) => {
        const next = [...prev];
        if (next[pageIndex]) next[pageIndex] = apply(next[pageIndex]);
        return next;
      });
    }
  }, [updateCurrentPage]);

  /** Set (or clear, with null) the ornament fill for slot `slotIndex`. Mirrors
   *  setQrFill/setSlotText: setting a non-null ornament clears any photo/QR/text
   *  at the same slot (mutual exclusivity). pageIndex defaults to current page. */
  const setOrnamentFill = useCallback((slotIndex: number, fill: OrnamentFill | null, pageIndex?: number) => {
    pushSnapshot();
    const apply = (page: AlbumPage): AlbumPage => {
      const ornamentFills = [...(page.ornamentFills ?? [])];
      ornamentFills[slotIndex] = fill;
      if (fill) {
        const fills = [...(page.slotFills ?? [])];
        const qrFills = [...(page.qrFills ?? [])];
        const slotTexts = [...(page.slotTexts ?? [])];
        fills[slotIndex] = null;
        qrFills[slotIndex] = null;
        slotTexts[slotIndex] = null;
        return { ...page, ornamentFills, slotFills: fills, qrFills, slotTexts };
      }
      return { ...page, ornamentFills };
    };
    if (pageIndex == null) {
      updateCurrentPage(apply);
    } else {
      setAlbumPages((prev) => {
        const next = [...prev];
        if (next[pageIndex]) next[pageIndex] = apply(next[pageIndex]);
        return next;
      });
    }
  }, [updateCurrentPage]);

  /** Place (or clear, with null) a PHOTO into caption box `slotIndex`
   *  (template.textSlots[slotIndex]). Mirrors fillSlot/setQrFill: setting a photo
   *  clears the box's QR (textSlotQr) AND evicts any bound caption TextElement
   *  (boxIndex===slotIndex) — mutual exclusivity. pageIndex defaults to current. */
  const setTextSlotPhoto = useCallback((slotIndex: number, photoIndex: number | null, pageIndex?: number) => {
    pushSnapshot();
    const apply = (page: AlbumPage): AlbumPage => {
      const textSlotFills = [...(page.textSlotFills ?? [])];
      textSlotFills[slotIndex] = photoIndex;
      if (photoIndex != null) {
        const textSlotQr = [...(page.textSlotQr ?? [])];
        const textSlotOrnament = [...(page.textSlotOrnament ?? [])];
        textSlotQr[slotIndex] = null;
        textSlotOrnament[slotIndex] = null;
        return {
          ...page,
          textSlotFills,
          textSlotQr,
          textSlotOrnament,
          textElements: page.textElements.filter((t) => t.boxIndex !== slotIndex),
        };
      }
      return { ...page, textSlotFills };
    };
    if (pageIndex == null) {
      updateCurrentPage(apply);
    } else {
      setAlbumPages((prev) => {
        const next = [...prev];
        if (next[pageIndex]) next[pageIndex] = apply(next[pageIndex]);
        return next;
      });
    }
  }, [updateCurrentPage]);

  /** Set (or clear, with null) a QR into caption box `slotIndex`
   *  (template.textSlots[slotIndex]). Mirrors setQrFill: setting a QR clears the
   *  box's photo (textSlotFills) AND evicts any bound caption TextElement. */
  const setTextSlotQr = useCallback((slotIndex: number, fill: QrFill | null, pageIndex?: number) => {
    pushSnapshot();
    const apply = (page: AlbumPage): AlbumPage => {
      const textSlotQr = [...(page.textSlotQr ?? [])];
      textSlotQr[slotIndex] = fill;
      if (fill) {
        const textSlotFills = [...(page.textSlotFills ?? [])];
        const textSlotOrnament = [...(page.textSlotOrnament ?? [])];
        textSlotFills[slotIndex] = null;
        textSlotOrnament[slotIndex] = null;
        return {
          ...page,
          textSlotQr,
          textSlotFills,
          textSlotOrnament,
          textElements: page.textElements.filter((t) => t.boxIndex !== slotIndex),
        };
      }
      return { ...page, textSlotQr };
    };
    if (pageIndex == null) {
      updateCurrentPage(apply);
    } else {
      setAlbumPages((prev) => {
        const next = [...prev];
        if (next[pageIndex]) next[pageIndex] = apply(next[pageIndex]);
        return next;
      });
    }
  }, [updateCurrentPage]);

  /** Set (or clear, with null) an ORNAMENT into caption box `slotIndex`
   *  (template.textSlots[slotIndex]). Mirrors setTextSlotQr: setting an ornament
   *  clears the box's photo (textSlotFills), QR (textSlotQr) AND any bound caption
   *  TextElement — the combo box holds ONE thing. pageIndex defaults to current. */
  const setTextSlotOrnament = useCallback((slotIndex: number, fill: OrnamentFill | null, pageIndex?: number) => {
    pushSnapshot();
    const apply = (page: AlbumPage): AlbumPage => {
      const textSlotOrnament = [...(page.textSlotOrnament ?? [])];
      textSlotOrnament[slotIndex] = fill;
      if (fill) {
        const textSlotFills = [...(page.textSlotFills ?? [])];
        const textSlotQr = [...(page.textSlotQr ?? [])];
        textSlotFills[slotIndex] = null;
        textSlotQr[slotIndex] = null;
        return {
          ...page,
          textSlotOrnament,
          textSlotFills,
          textSlotQr,
          textElements: page.textElements.filter((t) => t.boxIndex !== slotIndex),
        };
      }
      return { ...page, textSlotOrnament };
    };
    if (pageIndex == null) {
      updateCurrentPage(apply);
    } else {
      setAlbumPages((prev) => {
        const next = [...prev];
        if (next[pageIndex]) next[pageIndex] = apply(next[pageIndex]);
        return next;
      });
    }
  }, [updateCurrentPage]);

  /* ── Auto-fill ── */
  const autoFillSlots = useCallback(() => {
    pushSnapshot();
    updateCurrentPage((page) => {
      const tmplForFill = PAGE_TEMPLATES.find((t) => t.id === page.templateId);
      const slotCount = page.slotFills?.length ?? 0;
      if (slotCount === 0) return page;
      const fills = [...(page.slotFills ?? [])];
      let photoIdx = 0;
      for (let i = 0; i < slotCount; i++) {
        if (tmplForFill?.slots?.[i]?.kind === 'qr') continue; // never auto-place a photo into a QR slot
        if (page.qrFills?.[i] || page.slotTexts?.[i] || page.ornamentFills?.[i]) continue; // slot claimed by QR/text/ornament
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

    // ── Face-centered auto-pan for all filled slots ──
    const page = albumPages[currentPageIndex];
    const template = PAGE_TEMPLATES.find((t) => t.id === (page?.templateId ?? ''));
    if (!template) return;

    (page?.slotFills ?? []).forEach((fill, slotIndex) => {
      if (fill === null) return;
      const photo = uploadedPhotos[fill];
      if (!photo) return;
      const photoUrl = photo.previewUrl;
      if (!photoUrl) return;
      const slot = template.slots?.[slotIndex];
      if (!slot) return;

      detectFaceCenter(photoUrl).then((faceCenter) => {
        if (!faceCenter) return;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const photoAspect = img.naturalWidth / img.naturalHeight;
          const slotAspect = slot.width / slot.height;
          const { offsetX, offsetY } = computeFaceOffset(faceCenter, photoAspect, slotAspect);
          updateCurrentPage((p) => {
            const offsetsX = [...(p.slotOffsetsX ?? [])];
            const offsetsY = [...(p.slotOffsetsY ?? [])];
            offsetsX[slotIndex] = offsetX;
            offsetsY[slotIndex] = offsetY;
            return { ...p, slotOffsetsX: offsetsX, slotOffsetsY: offsetsY };
          });
        };
        img.src = photoUrl;
      });
    });
  }, [updateCurrentPage, uploadedPhotos, albumPages, currentPageIndex]);

  const clearAllSlots = useCallback(() => {
    pushSnapshot();
    updateCurrentPage((page) => {
      const slotCount = page.slotFills?.length ?? 0;
      return { ...page, slotFills: new Array(slotCount).fill(null) };
    });
  }, [updateCurrentPage]);

  /* ── Freeform photos ── */
  const addPhotoToCanvas = useCallback((photoIndex: number, x: number, y: number) => {
    pushSnapshot();
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
    pushSnapshot();
    updateCurrentPage((page) => ({
      ...page,
      photos: page.photos.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    }));
  }, [updateCurrentPage]);

  const updatePhotoFilters = useCallback((id: string, filters: Partial<PhotoFilters>) => {
    pushSnapshot();
    updateCurrentPage((page) => ({
      ...page,
      photos: page.photos.map((p) =>
        p.id === id ? { ...p, filters: { ...p.filters, ...filters } } : p
      ),
    }));
  }, [updateCurrentPage]);

  const deletePhotoFromCanvas = useCallback((id: string) => {
    pushSnapshot();
    updateCurrentPage((page) => ({
      ...page,
      photos: page.photos.filter((p) => p.id !== id),
    }));
  }, [updateCurrentPage]);

  const duplicateCanvasPhoto = useCallback((id: string) => {
    pushSnapshot();
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
    pushSnapshot();
    updateCurrentPage((page) => {
      const maxZ = Math.max(...page.photos.map((p) => p.zIndex), 0);
      return {
        ...page,
        photos: page.photos.map((p) => (p.id === id ? { ...p, zIndex: maxZ + 1 } : p)),
      };
    });
  }, [updateCurrentPage]);

  const sendToBack = useCallback((id: string) => {
    pushSnapshot();
    updateCurrentPage((page) => {
      const minZ = Math.min(...page.photos.map((p) => p.zIndex), 0);
      return {
        ...page,
        photos: page.photos.map((p) => (p.id === id ? { ...p, zIndex: minZ - 1 } : p)),
      };
    });
  }, [updateCurrentPage]);

  /* ── Text ── */
  const addTextElement = useCallback((x: number, y: number, text?: string) => {
    pushSnapshot();
    // New text inherits the active theme's font + color so captions match the
    // occasion. The user can still restyle any text element afterward.
    const theme = THEMES[selectedTemplate];
    const trimmed = text && text.trim() ? text.trim() : '';
    // A page's TEXTBOX owns its caption. If the page has a textbox region with no
    // caption yet, the new text belongs INSIDE it (bound → fixed + centered),
    // never as a free-floating element that strands at the top-left. Only fall
    // back to free text when there's no empty textbox to fill (e.g. a full-bleed
    // photo page or one whose boxes are already captioned).
    const cur = albumPages[currentPageIndex];
    const curTemplate = cur?.templateId ? getTemplateById(cur.templateId) : null;
    const slots = curTemplate?.textSlots ?? [];
    // Skip caption boxes already claimed by a photo/QR so "Add text" never lands
    // on top of one (mutual exclusivity).
    const emptyBox = slots.findIndex((_s, i) =>
      !(cur?.textElements ?? []).some((t) => t.boxIndex === i) &&
      cur?.textSlotFills?.[i] == null &&
      !cur?.textSlotQr?.[i] &&
      !cur?.textSlotOrnament?.[i]);
    updateCurrentPage((page) => {
      if (slots.length > 0 && emptyBox >= 0) {
        const newText: TextElement = {
          id: `box-${emptyBox}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          text: trimmed || 'Double-tap to edit',
          x: 0, y: 0, fontSize: 28,
          fontFamily: theme.fontFamily, color: theme.textColor,
          bold: false, italic: false, underline: false,
          alignment: (slots[emptyBox].align ?? 'center') as TextElement['alignment'],
          rotation: 0, opacity: 100, boxIndex: emptyBox,
        };
        return { ...page, textElements: [...page.textElements, newText] };
      }
      const newText: TextElement = {
        id: `text-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        text: trimmed || 'Double click to edit',
        x, y, fontSize: 32,
        fontFamily: theme.fontFamily, color: theme.textColor,
        bold: false, italic: false, underline: false,
        alignment: 'center', rotation: 0, opacity: 100, width: 200,
      };
      return { ...page, textElements: [...page.textElements, newText] };
    });
  }, [updateCurrentPage, selectedTemplate, albumPages, currentPageIndex]);

  // Drop a themed quote into the current page's largest empty band (so the user
  // doesn't have to type). Returns the quote placed, or null when the page is
  // too full to fit one. Quotes are tagged `theme-quote-*` (editable/removable).
  const addThemedQuote = useCallback((): string | null => {
    const template = currentPage.templateId ? getTemplateById(currentPage.templateId) : null;
    const { height: chForBand } = getCanvasDimensions(albumSize);
    // y-fractions of text already on this page (e.g. the auto-title) so the
    // quote avoids them instead of overlapping.
    const occupiedY = currentPage.textElements.map((t) => t.y / chForBand);
    const band = freeBandForTemplate(template, occupiedY);
    if (!band) return null;
    const used = new Set(
      albumPages.flatMap((p) => p.textElements.filter((t) => t.id.startsWith('theme-quote')).map((t) => t.text)),
    );
    const quote = pickQuote(selectedTemplate, used);
    if (!quote) return null;
    const theme = THEMES[selectedTemplate];
    const { width: cw, height: ch } = getCanvasDimensions(albumSize);
    const width = Math.round(cw * 0.8);
    const fontSize = Math.round(cw * 0.05);
    const yCenter = ((band.yTop + band.yBottom) / 2) * ch;
    pushSnapshot();
    updateCurrentPage((page) => ({
      ...page,
      textElements: [
        ...page.textElements,
        {
          id: `theme-quote-${Date.now()}`,
          text: quote,
          x: Math.round((cw - width) / 2),
          y: Math.round(yCenter - fontSize),
          fontSize,
          fontFamily: theme.fontFamily,
          color: theme.accentColor,
          bold: false,
          italic: true,
          underline: false,
          alignment: 'center',
          rotation: 0,
          opacity: 100,
          width,
        },
      ],
    }));
    return quote;
  }, [currentPage, albumPages, selectedTemplate, albumSize, updateCurrentPage]);

  const updateTextElement = useCallback((id: string, updates: Partial<TextElement>) => {
    pushSnapshot();
    updateCurrentPage((page) => ({
      ...page,
      textElements: page.textElements.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    }));
  }, [updateCurrentPage]);

  const deleteTextElement = useCallback((id: string) => {
    pushSnapshot();
    updateCurrentPage((page) => ({
      ...page,
      textElements: page.textElements.filter((t) => t.id !== id),
    }));
  }, [updateCurrentPage]);

  // Text bound to a template text box (textSlots[slotIndex]). Position/size come
  // from the template's slot at render time, so x/y are unused for boxed text.
  const setBoxText = useCallback((slotIndex: number, content: Partial<TextElement> & { text: string }, pageIndex?: number) => {
    pushSnapshot();
    const theme = THEMES[selectedTemplate];
    const applyToPage = (page: AlbumPage): AlbumPage => {
      const existing = page.textElements.find((t) => t.boxIndex === slotIndex);
      const trimmed = content.text.trim();
      // Empty → clear the box (revert to the "Tap to add text" placeholder).
      if (!trimmed) {
        return existing
          ? { ...page, textElements: page.textElements.filter((t) => t.boxIndex !== slotIndex) }
          : page;
      }
      // Mutual exclusivity (third leg): writing a caption evicts a photo/QR/ornament
      // occupying the same caption box.
      const textSlotFills = [...(page.textSlotFills ?? [])];
      const textSlotQr = [...(page.textSlotQr ?? [])];
      const textSlotOrnament = [...(page.textSlotOrnament ?? [])];
      textSlotFills[slotIndex] = null;
      textSlotQr[slotIndex] = null;
      textSlotOrnament[slotIndex] = null;
      if (existing) {
        return {
          ...page,
          textSlotFills,
          textSlotQr,
          textSlotOrnament,
          textElements: page.textElements.map((t) =>
            t.boxIndex === slotIndex ? { ...t, ...content, text: trimmed } : t),
        };
      }
      const newText: TextElement = {
        id: `box-${slotIndex}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        text: trimmed,
        x: 0,
        y: 0,
        fontSize: content.fontSize ?? 28,
        fontFamily: content.fontFamily ?? theme.fontFamily,
        color: content.color ?? theme.textColor,
        bold: content.bold ?? false,
        italic: content.italic ?? false,
        underline: content.underline ?? false,
        alignment: content.alignment ?? 'center',
        rotation: 0,
        opacity: 100,
        boxIndex: slotIndex,
      };
      return { ...page, textSlotFills, textSlotQr, textSlotOrnament, textElements: [...page.textElements, newText] };
    };
    // Default: the current page. The preview spread passes an explicit pageIndex
    // so it can edit either of the two pages on screen.
    if (pageIndex == null) {
      updateCurrentPage(applyToPage);
    } else {
      setAlbumPages((prev) => {
        const next = [...prev];
        if (next[pageIndex]) next[pageIndex] = applyToPage(next[pageIndex]);
        return next;
      });
    }
  }, [updateCurrentPage, selectedTemplate]);

  /* ── Background ── */
  const setPageBackground = useCallback((bg: AlbumBackground) => {
    pushSnapshot();
    updateCurrentPage((page) => ({ ...page, background: bg }));
  }, [updateCurrentPage]);

  const updateBackgroundTransform = useCallback((updates: Partial<Pick<AlbumBackground, 'x' | 'y' | 'width' | 'height' | 'rotation'>>) => {
    pushSnapshot();
    updateCurrentPage((page) => ({
      ...page,
      background: { ...page.background, ...updates } as AlbumBackground,
    }));
  }, [updateCurrentPage]);

  const updateBackgroundFilters = useCallback((filters: Partial<PhotoFilters>) => {
    pushSnapshot();
    updateCurrentPage((page) => ({
      ...page,
      background: {
        ...page.background,
        filters: { ...((page.background as any).filters ?? {}), ...filters },
      } as AlbumBackground,
    }));
  }, [updateCurrentPage]);

  const applyBackgroundToAllPages = useCallback((bg?: AlbumBackground) => {
    pushSnapshot();
    // Prefer the background passed by the caller; only fall back to the current
    // page's when none is given (avoids a stale-closure overwrite of a just-set bg).
    const target = bg ?? currentPage.background;
    setAlbumPages((prev) => prev.map((p) => ({ ...p, background: target })));
  }, [currentPage.background]);

  // Bake a theme's photo frame onto every existing page (used by apply_theme).
  // `style` is optional and back-compat: omitted = solid border.
  const applyPhotoFrameToAllPages = useCallback((border: { color: string; width: number; style?: 'solid' | 'dashed' | 'dotted' }) => {
    pushSnapshot();
    // Remember the choice so it also survives album (re)generation.
    wizardBorderRef.current = { color: border.color, width: border.width, style: border.style };
    setAlbumPages((prev) => prev.map((p) => ({
      ...p,
      photoBorderColor: border.color,
      photoBorderWidth: border.width,
      photoBorderStyle: border.style ?? 'solid',
    })));
  }, []);

  // Apply a decorative frame style around the photos on every existing page.
  const applyFrameToAllPages = useCallback((frame: FrameStyle) => {
    pushSnapshot();
    wizardFrameRef.current = frame; // remember for (re)generation
    setAlbumPages((prev) => prev.map((p) => ({ ...p, frameStyle: frame })));
  }, []);

  // Bake a theme's decorative corner art onto every existing page (used by
  // apply_theme). Pass undefined to clear corners (themes without art).
  const applyCornersToAllPages = useCallback((cornerBase?: string) => {
    pushSnapshot();
    setAlbumPages((prev) => prev.map((p) => ({ ...p, cornerBase })));
  }, []);

  // Re-theme the auto-placed title (font + accent color) so an existing album
  // stays on-brand when the theme changes. Only touches text tagged
  // `theme-title-*`. The default title text is also swapped (e.g. "Our Wedding"
  // → "Blessed Day") ONLY when it still matches a known theme default — so a
  // caption the user has actually typed is never clobbered.
  const restyleThemedTitles = useCallback((theme: TemplateType) => {
    const { text, fontFamily, color } = getThemedTitle(theme);
    const defaultTitles = Object.values(THEME_TITLES);
    setAlbumPages((prev) => prev.map((p) => ({
      ...p,
      textElements: p.textElements.map((t) => {
        if (!t.id.startsWith('theme-title')) return t;
        // Once the user personalizes the title (types their own words), it's
        // theirs — keep its text, font AND color. Only auto-restyle a title that
        // still shows a theme default, so re-theming never wipes a chosen font.
        if (!defaultTitles.includes(t.text)) return t;
        return { ...t, fontFamily, color, text };
      }),
    })));
  }, []);

  /* ── Template ── */
  const setPageTemplate = useCallback((templateId: string) => {
    pushSnapshot();
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

  /* ── Phase 1: Manual cloud save ── */
  const manualSave = useCallback(async () => {
    if (!user) return;
    setCloudSaveStatus('saving');
    const result = await albumSync.save(user.id, serializeAlbum());
    if (result.success) {
      if (result.albumId) {
        cloudAlbumIdRef.current = result.albumId;
      }
      cloudDirtyRef.current = false;
      setCloudSaveStatus('saved');
      setLastSavedAt(new Date());
    } else {
      setCloudSaveStatus('error');
    }
  }, [user, albumSync, serializeAlbum]);

  /* ── Resolve photo URL (all photos are local — IndexedDB) ── */
  const getPhotoUrl = useCallback((photoOrId: UploadedPhoto | string): string => {
    if (typeof photoOrId === 'string') {
      const photo = uploadedPhotos.find((p) => p.id === photoOrId);
      return photo?.previewUrl ?? '';
    }
    return photoOrId.previewUrl;
  }, [uploadedPhotos]);

  /* ── Reset ── */
  const reset = useCallback(() => {
    // ── LEAK FIX #4: Clear IndexedDB photos ──
    // Without this, old photos from previous sessions survive reset()
    // and leak into new albums via the rehydration effect.
    idbPhotos.clear().catch(() => { /* ignore */ });

    setAlbumTypeState('standard');
    setAlbumSizeState('8x8');
    setSelectedTemplateState('classic');
    setUploadedPhotos([]);
    setAlbumPages(Array.from({ length: MIN_PAGES }, (_, i) => createEmptyPage(i, '8x8')));
    setCurrentPageIndex(0);
    setRejectedTemplateIds([]);
    setPhotosPerPage(undefined);
    pageSnapshotsRef.current = {};
    // ── Phase 1: Clear cloud state ──
    setCloudSaveStatus('idle');
    setLastSavedAt(null);
    cloudAlbumIdRef.current = undefined;
    skipCloudLoadRef.current = true;  // Prevent cloud load from overwriting fresh state
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    // ── Clear wizard state so it restarts from step 1 ──
    try { localStorage.removeItem('megy_wizard_state'); } catch { /* ignore */ }
  }, [idbPhotos]);

  /* ── Load specific album by ID — SAFE: respects local data ── */
  const cloudLoadCompletedRef = useRef<number>(0);

  const loadAlbum = useCallback(async (albumId: string) => {
    if (!user?.id) return;
    // NOTE: loadAlbum ALWAYS loads the requested album from cloud.
    // The hasLocalData guard was removed — when user clicks "Continue"
    // on a specific album, they expect THAT album's data, not stale
    // localStorage. The guard is kept only in loadFromCloud (auto-load).
    setIsLoadingCloud(true);
    try {
      const albumData = await albumSync.load(user.id, albumId);
      if (albumData) {
        if (albumData.sizePreset) {
          setAlbumSizeState(albumData.sizePreset as AlbumSizePreset);
        }
        if (albumData.pages && albumData.pages.length > 0) {
          const restoredPages: AlbumPage[] = (albumData.pages as unknown as AlbumPage[]).map(
            (p: any, idx: number) => {
              const np = normalizePage(p);
              return {
                ...np,
                id: np.id ?? `page-${Date.now()}-${idx}`,
                size: (np.size as AlbumSizePreset) ?? albumSize,
              };
            }
          );
          setAlbumPages(stripDefaultThemeTitles(restoredPages));
        }
        // Restore uploaded photos from cloud
        // Rehydrate photo metadata from cloud + restore actual files from IndexedDB
        if (albumData.photos && albumData.photos.length > 0) {
          const restored = await Promise.all(
            albumData.photos.map(async (p) => {
              // Try to get the actual file from IndexedDB
              const stored = await idbPhotos.get(p.id);
              return {
                id: p.id,
                name: p.name ?? 'Untitled',
                previewUrl: stored?.url ?? p.previewUrl ?? '',
                type: stored?.type ?? 'image/jpeg',
                size: stored?.size ?? 0,
                width: stored?.width ?? 0,
                height: stored?.height ?? 0,
              };
            })
          );
          setUploadedPhotos(restored);
        }
        if (albumData.id) {
          cloudAlbumIdRef.current = albumData.id;
        }
        setPhase('edit');
      }
    } finally {
      setIsLoadingCloud(false);
      cloudLoadCompletedRef.current = Date.now();
    }
  }, [user, albumSync, albumSize, albumPages]);

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
    cycleLayout,
    availableTemplatesForCurrentPage,
    applyPageLayout,
    layoutPickerOpen,
    setLayoutPickerOpen,
    autoFillSlots,
    clearAllSlots,
    fillSlot,
    clearSlot,
    setSlotScale,
    setSlotOffset,
    updateSlotGeometry,
    setQrFill,
    canAddMemoryQr,
    applyMemoryQr,
    setMemoryQrCorner,
    setSlotText,
    setOrnamentFill,
    setTextSlotPhoto,
    setTextSlotQr,
    setTextSlotOrnament,
    addPhotoToCanvas,
    updatePhotoTransform,
    updatePhotoFilters,
    deletePhotoFromCanvas,
    duplicateCanvasPhoto,
    bringToFront,
    sendToBack,
    addTextElement,
    addThemedQuote,
    updateTextElement,
    deleteTextElement,
    setBoxText,
    setPageBackground,
    updateBackgroundTransform,
    updateBackgroundFilters,
    applyBackgroundToAllPages,
    applyPhotoFrameToAllPages,
    applyFrameToAllPages,
    applyCornersToAllPages,
    restyleThemedTitles,
    setPageTemplate,
    hideTemplate,
    unhideAllTemplates,
    photosPerPage,
    setPhotosPerPage,
    setPageSnapshot,
    getPageSnapshot,
    phase,
    setPhase,
    wizardStep,
    setWizardStep,
    undo,
    redo,
    canUndo,
    canRedo,
    reset,
    // ── Phase 1: Cloud ──
    cloudSaveStatus,
    lastSavedAt,
    isLoadingCloud,
    manualSave,
    /** Synchronous localStorage flush of the current draft. Reliable during page
     *  teardown (unlike the async cloud save) — used by the mobile back-button
     *  guard so an accidental Back never loses work in the 30s debounce window. */
    saveDraftNow: flushLocal,
    getPhotoUrl,
    user,
    loadAlbum,
    // ── Selection tracking ──
    selectedTextId,
    selectedPhotoId,
    selectedSlotIndex,
    selectedElementId,
    setSelectedTextId,
    setSelectedPhotoId,
    setSelectedSlotIndex,
    setSelectedElementId,
  };
}
