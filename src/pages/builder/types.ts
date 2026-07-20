import type { CSSProperties } from 'react';

export type BuilderPhase = 'setup' | 'upload' | 'template' | 'edit' | 'cover' | 'preview';

export type TemplateType =
  | 'wedding' | 'baby' | 'birthday' | 'family' | 'graduation'
  | 'travel' | 'minimalist' | 'kids' | 'vintage' | 'classic' | 'baptism';

export type LayoutStyle =
  | 'fullBleed' | 'duoPortrait' | 'duoLandscape' | 'fourGrid'
  | 'heroSupporting' | 'portraitSingle' | 'collage' | 'collage3'
  | 'trio' | 'asymDuo' | 'panorama' | 'freeform';

export type SlotShape = 'rectangle' | 'rounded' | 'circle' | 'oval' | 'heart' | 'star';

/** Slot purpose. Absent/'photo' = normal photo slot (default; back-compat).
 *  'qr' = QR living-memory slot — filled by page.qrFills[idx], not slotFills.
 *  'ornament' = themed vector SVG, filled by page.ornamentFills[idx]. Dispatch is
 *  content-driven (which fills array is set), NOT this tag — kept for semantics. */
export type SlotKind = 'photo' | 'qr' | 'ornament';

/** Template margin definition — expressed as 0–1 proportions of page dimensions.
 *  e.g. { top: 0.04, bottom: 0.04, left: 0.04, right: 0.04 } = 4% margin on all sides */
export interface TemplateMargin {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** A single photo slot within a template.
 *  x, y, width, height are 0–1 proportions of the SAFE AREA (not the full page).
 *  The safe area = page dimensions minus template margins.
 *  Example: { x: 0, y: 0, width: 0.5, height: 1.0 } fills the left half of the safe area. */
export interface TemplateSlot {
  id: string;
  x: number;        // 0 = left edge of safe area, 1 = right edge
  y: number;        // 0 = top edge of safe area, 1 = bottom edge
  width: number;    // 1.0 = full safe area width
  height: number;   // 1.0 = full safe area height
  /** This slot's photo ratio. Lets ONE template mix ratios (e.g. 1:1 + 3:2 + 2:3).
   *  Falls back to the template's targetRatio when absent (legacy templates). */
  ratio?: PhotoRatio;
  rotation?: number;
  shape?: SlotShape;
  borderRadius?: number;
  /** Border width in px for overlapping templates */
  borderWidth?: number;
  /** Border color for overlapping templates */
  borderColor?: string;
  /** Slot purpose. Absent/'photo' = normal photo slot. 'qr' = QR living-memory
   *  slot, filled by page.qrFills[idx] (positional, parallel to slotFills). */
  kind?: SlotKind;
}

/** A text box region within a template (proportions of the SAFE AREA, like photo
 *  slots). The user taps it to add/edit text; the text is clipped to this box. */
export interface TextSlot {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  align?: 'left' | 'center' | 'right';
  placeholder?: string;
}

/** Page template definition.
 *  Templates are orientation-aware and margin-aware.
 *  Slot coordinates are proportions of the safe area (0–1), making templates
 *  automatically responsive to any page size without distortion. */
export type PhotoRatio = '4:3' | '3:4' | '3:2' | '2:3' | '1:1' | '16:9' | '9:16';

export interface PageTemplate {
  id: string;
  name: string;
  category: 'single' | 'duo' | 'trio' | 'quad' | 'quint' | 'sextet';
  slotCount: number;
  /** Margins around the page edge — expressed as 0–1 proportions of page dimensions.
   *  Photos will NEVER render in margin zones. */
  margin: TemplateMargin;
  /** Preferred orientation for this template layout */
  orientation: 'landscape' | 'portrait' | 'square';
  /** Target photo aspect ratio for all slots in this template */
  targetRatio: PhotoRatio;
  /** Which album sizes this template is designed for */
  albumSizes: AlbumSizePreset[];
  slots: TemplateSlot[];
  /** Optional text-box regions (captions/titles). Empty until the user fills them. */
  textSlots?: TextSlot[];
  /** True full-bleed: the photo runs to ALL four page edges — no safe margin and
   *  no binding gutter. Use only for single-photo full-page layouts. */
  fullBleed?: boolean;
}

export interface FilledSlot {
  slotId: string;
  photoIndex: number | null;
}

export type BackgroundType = 'solid' | 'gradient' | 'texture' | 'image';

export type AlbumSizePreset =
  | '6x6' | '8x8' | '9x9' | '6x4' | '11.5x8' | '8.5x11';

export type MaterialType = 'matte' | 'glossy' | 'semigloss' | 'pearl' | 'linen';
export type CoverType = 'softcover' | 'hardboundLeather' | 'hardboundLinen' | 'premiumVelvet' | 'acrylicLayflat';

export interface PhotoFilters {
  grayscale: number;
  sepia: number;
  brightness: number;
  contrast: number;
  saturate: number;
  blur: number;
  hueRotate: number;
  opacity: number;
  vintage: boolean;
  cool: boolean;
  warm: boolean;
  bwHighContrast: boolean;
  fade: boolean;
  vivid: boolean;
}

export const DEFAULT_FILTERS: PhotoFilters = {
  grayscale: 0, sepia: 0, brightness: 100, contrast: 100,
  saturate: 100, blur: 0, hueRotate: 0, opacity: 100,
  vintage: false, cool: false, warm: false,
  bwHighContrast: false, fade: false, vivid: false,
};

export interface CropData {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AlbumBackground {
  type: BackgroundType;
  solid?: string;
  gradient?: {
    type: 'linear' | 'radial';
    angle: number;
    stops: { offset: number; color: string }[];
  };
  texture?: string;
  /** Optional tint applied to the texture (a hex from TEXTURE_COLORS). Falls
   *  back to the material's natural colour when absent. */
  textureColor?: string;
  image?: string;
  /** When the background image comes from one of the user's uploaded album
   *  photos, we store its photo id. The blob URL in `image` is transient (it's
   *  revoked / dies after a reload), but the id re-resolves to a fresh URL from
   *  IndexedDB — so a photo-background survives a reload. */
  photoId?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  filters?: PhotoFilters;
  opacity?: number;
  /** COVER-ONLY crop controls for an image background. A cover is one fixed-aspect
   *  panel, so a photo can't be ratio-matched to it the way interior slots are —
   *  these let the user choose which part shows.
   *  focusX/focusY: 0–1 (0.5 = centred) — same semantics as CSS
   *  `background-position: X% Y%`. zoom: 1 = exactly cover-fit, >1 zooms in.
   *  Applied ONLY when a renderer is in coverMode; interior pages ignore them. */
  focusX?: number;
  focusY?: number;
  zoom?: number;
}

/** Cover-fit an image into a panel with a focal point + zoom — the ONE place this
 *  math lives, so the cover preview and the cover print agree exactly.
 *
 *  Returns the image's draw rect in panel px. This is deliberately equivalent to
 *  CSS `background-size: cover` + `background-position: fx*100% fy*100%`, which
 *  offsets by `(panel - drawn) * fraction` — so the DOM preview (which uses the
 *  CSS form, since it can't know the intrinsic size) and the canvas print (which
 *  uses this) produce identical crops. */
export function bgCoverFit(
  imgW: number,
  imgH: number,
  W: number,
  H: number,
  zoom = 1,
  focusX = 0.5,
  focusY = 0.5,
): { x: number; y: number; width: number; height: number } {
  const iw = imgW || 1;
  const ih = imgH || 1;
  const scale = Math.max(W / iw, H / ih) * Math.max(1, zoom || 1);
  const width = iw * scale;
  const height = ih * scale;
  const clamp01 = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0.5));
  return { x: (W - width) * clamp01(focusX), y: (H - height) * clamp01(focusY), width, height };
}

export const DEFAULT_BACKGROUND: AlbumBackground = {
  type: 'solid', solid: '#FFFBF7',
};

/** Resolve the displayable image URL for an image background. If it references an
 *  uploaded photo by id, return that photo's LIVE previewUrl (the URL stored in
 *  `image` may be a dead blob after a reload); otherwise fall back to `image`.
 *  Shared by every renderer (preview DOM, Fabric canvas, print) so a photo
 *  background resolves identically everywhere. */
export function resolveBgImageSrc(
  bg: { image?: string; photoId?: string; customImage?: string; preset?: string } | undefined | null,
  photos: { id: string; previewUrl: string }[] = [],
): string | undefined {
  if (!bg) return undefined;
  if (bg.photoId) {
    const p = photos.find((ph) => ph.id === bg.photoId);
    if (p?.previewUrl) return p.previewUrl;
  }
  return bg.image ?? bg.customImage ?? bg.preset;
}

export const DEFAULT_BG_FILTERS: PhotoFilters = {
  ...DEFAULT_FILTERS,
  opacity: 100,
};

export interface CanvasPhoto {
  id: string;
  photoIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  filters: PhotoFilters;
  crop?: CropData;
  offsetX: number;
  offsetY: number;
  zIndex: number;
  borderWidth: number;
  borderColor: string;
  borderRadius: number;
  shadowBlur: number;
  shadowColor: string;
  shadowOffsetX: number;
  shadowOffsetY: number;
}

export interface PhotoSlot {
  id: string;
  photoIndex: number | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}

/** Shared text-styling fields used by both free/caption text (TextElement) and
 *  per-slot injected text (SlotText). Kept as ONE definition so the two carriers
 *  can't drift; each extends it with its own positioning/extra fields. */
export interface TextStyle {
  text: string;
  fontSize: number;
  fontFamily: string;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  alignment: 'left' | 'center' | 'right';
  /** WordArt-style text effects (all optional, back-compat: absent = plain).
   *  outline draws a contrasting stroke around the glyphs; shadow adds a soft
   *  drop shadow. Rendered identically by all three renderers via lib/wordArt. */
  outlineColor?: string;
  /** Outline stroke width in DESIGN px (each renderer scales it like fontSize).
   *  0/undefined = no outline. */
  outlineWidth?: number;
  shadow?: boolean;
}

export interface TextElement extends TextStyle {
  id: string;
  x: number;
  y: number;
  rotation: number;
  opacity: number;
  backgroundColor?: string;
  width?: number;
  scaleX?: number;
  scaleY?: number;
  /** If set, this text fills template.textSlots[boxIndex] instead of free x/y. */
  boxIndex?: number;
  /** COVER-ONLY: nudge a BOX-BOUND caption off its template slot, as a fraction
   *  of the panel (0.1 = 10% of the width / height, positive = right / down).
   *  Deliberately FRACTIONAL rather than reusing the free-text x/y: free text is
   *  authored in the 750px design space but printed against a 576px one, so it
   *  drifts ~1.3x, whereas fractions are applied identically by the DOM cover
   *  preview and the cover print. Ignored on interior pages (coverMode only). */
  offsetX?: number;
  offsetY?: number;
}

/** Per-slot geometry overrides for container editing mode.
 *  Each index corresponds to template.slots[index].
 *  Only stores modified values — undefined = use template default. */
export interface SlotGeometryOverride {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
}

/** Free-transform for a caption-box GRAPHIC (textSlotOrnament). Center-based and
 *  in FULL-PAGE fractions so all three renderers (Fabric editor, DOM preview,
 *  print) place it identically: draw a (w×h) box centred at (cx,cy), rotated by
 *  `rot`. All fractions are 0–1 of the page's width/height; rot is degrees CW.
 *  This lets a placed graphic be dragged, resized, and rotated anywhere on the
 *  page — unlike text captions, which stay boxed. */
export interface OrnamentTransform {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rot: number;
}

/** Smallest side we will PRINT a QR at. The corner-badge flow uses 1.2" as
 *  "comfortably scannable at arm's length" (see QR_BADGE_IN); 0.8" is the floor
 *  below which a phone camera starts to struggle on paper. A free-transformed
 *  QR is clamped to this — an unscannable code on a printed album is a defect
 *  the customer only discovers after paying. */
export const QR_MIN_PRINT_IN = 0.8;

/** Normalise a free-transformed QR: keep it SQUARE on the printed page, keep it
 *  scannable, and keep it on the page.
 *
 *  `w`/`h` are fractions of page WIDTH and HEIGHT respectively, so on a
 *  non-square album equal fractions are NOT a square — the printed side is
 *  w·pageWidthInches by h·pageHeightInches. We take the larger printed side
 *  (never shrink what the user just dragged), floor it at QR_MIN_PRINT_IN, and
 *  convert back to per-axis fractions. */
export function clampQrGeom(g: OrnamentTransform, albumSize: AlbumSizePreset): OrnamentTransform {
  const cfg = ALBUM_SIZES.find((s) => s.preset === albumSize);
  // 300 DPI px → inches. Fall back to a square page rather than throwing.
  const inW = (cfg?.width ?? 2400) / 300;
  const inH = (cfg?.height ?? 2400) / 300;

  // ONE printed side, derived once and bounded at BOTH ends before it is split
  // into per-axis fractions. Capping w and h independently at 1 would silently
  // break squareness: on a 6×4, a 5" code gives w=min(1,5/6)=0.833 (5.0") but
  // h=min(1,5/4)=1 (4.0") — a stored 5×4" RECTANGLE that no scanner will read.
  const wantedIn = Math.max(Number.isFinite(g.w) ? g.w * inW : 0, Number.isFinite(g.h) ? g.h * inH : 0);
  const sideIn = Math.min(Math.max(QR_MIN_PRINT_IN, wantedIn), inW, inH);
  const w = sideIn / inW;
  const h = sideIn / inH;

  // Keep the whole CODE on the page, not just its centre — a QR sliced by the
  // trim loses a finder pattern and stops decoding entirely. Half-extents are
  // the ROTATED bounding box, so a tilted code is bounded by what actually
  // prints. If the code is wider than the page on an axis, centre it there.
  const rot = Number.isFinite(g.rot) ? g.rot : 0;
  const rad = (rot * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  const hx = (w * c + h * s) / 2;
  const hy = (w * s + h * c) / 2;
  const bound = (v: number, half: number) => {
    if (!Number.isFinite(v)) return 0.5;
    if (half >= 0.5) return 0.5;
    return Math.max(half, Math.min(1 - half, v));
  };

  return { cx: bound(g.cx, hx), cy: bound(g.cy, hy), w, h, rot };
}

/** The default transform for a QR newly placed in a caption box: a scannable
 *  square centred on the box.
 *
 *  Every caption-box QR gets one at placement time, which buys three things:
 *  the code is never smaller than QR_MIN_PRINT_IN (the untransformed in-box fit
 *  could print well under it on a short caption band), all three renderers take
 *  the SAME transformed path so there is no fit-mode divergence to keep in
 *  sync, and a box that previously held a dragged QR cannot leak its old
 *  transform onto a new one. */
export function defaultQrGeom(
  albumSize: AlbumSizePreset,
  box: { x: number; y: number; width: number; height: number },
  margin: TemplateMargin,
): OrnamentTransform {
  // Box fractions are of the SAFE area; the transform is of the WHOLE page.
  const safeX = margin.left, safeY = margin.top;
  const safeW = 1 - margin.left - margin.right;
  const safeH = 1 - margin.top - margin.bottom;
  const cx = safeX + (box.x + box.width / 2) * safeW;
  const cy = safeY + (box.y + box.height / 2) * safeH;

  // FIT INSIDE the box: the code is square, so it is bounded by the box's
  // SHORTER printed side — a caption band is wide and shallow, and sizing off
  // the wide side would put a page-tall QR on the page. Pass the already-square
  // size through as equal printed sides so clampQrGeom's max() is a no-op and
  // only its floor / page-fit rules apply.
  const cfg = ALBUM_SIZES.find((s) => s.preset === albumSize);
  const inW = (cfg?.width ?? 2400) / 300;
  const inH = (cfg?.height ?? 2400) / 300;
  const sideIn = Math.min(box.width * safeW * inW, box.height * safeH * inH) * 0.82;
  return clampQrGeom({ cx, cy, w: sideIn / inW, h: sideIn / inH, rot: 0 }, albumSize);
}

/** Fill data for a QR ('kind: qr') slot. Positional: qrFills[i] pairs with
 *  template.slots[i] exactly like slotFills[i]. Null = empty QR slot.
 *  The printed QR ALWAYS encodes `${MEMORY_BASE}/m/${code}` — never the raw
 *  destination — so re-pointing the memory never requires a reprint. */
export interface QrFill {
  /** Stable short code, minted client-side. Primary key in qr_memories. */
  code: string;
  /** Current destination URL (echo of the DB row; DB is source of truth). */
  destination: string;
  /** Print-crisp QR raster (PNG data-URL, ≥2× target px). Encodes /m/:code.
   *  PNG (not SVG): an SVG drawn via new Image()→drawImage does NOT rasterize
   *  at canvas resolution and prints blurry/unscannable. */
  qrPngDataUrl: string;
  /** The exact minted memory URL, frozen at add-time so a later MEMORY_BASE
   *  change can't desync the management thumbnail from the physical print. */
  memoryUrl: string;
  createdAt: number;
}

/** Fill data for an ORNAMENT slot — a themed vector SVG placed into a combo-box
 *  slot via the content chooser. Positional: ornamentFills[i] pairs with
 *  template.slots[i] exactly like slotFills[i]/qrFills[i]. Null = no ornament.
 *  `pack`+`id` reference the asset in ornaments.ts (for re-edit + versioning).
 *  `pngDataUrl` is the SVG rasterized to a crisp square PNG at pick-time — we
 *  store the PNG (not the SVG string) because an SVG drawn via new Image()→
 *  drawImage does NOT rasterize at canvas resolution and prints blurry (the same
 *  reason QrFill stores a PNG). ONE PNG is drawn identically by all 3 renderers. */
export interface OrnamentFill {
  pack: string;
  id: string;
  pngDataUrl: string;
  appliedAt: number;
}

/** Per-slot text content injected into a PHOTO slot via the content chooser.
 *  Positional, parallel to template.slots — index i pairs with slots[i] exactly
 *  like slotFills[i]/qrFills[i]. Null = no text at that slot. DISTINCT from the
 *  template.textSlots caption system; carries the same styling fields as the
 *  MobileTextEditor's exported content (BoxTextContent). */
export type SlotText = TextStyle;

/** A designed album COVER — front · spine · back — printed as ONE physical wrap
 *  that folds around the book block (geometry in coverGeometry.ts). This is the
 *  ARTWORK; it is DISTINCT from `CoverType` (the binding material/price factor).
 *
 *  • Text reuses TextStyle, so a cover title renders through the SAME wordArt
 *    helpers as page text — no third text path to keep in sync.
 *  • Photos are referenced by uploaded-photo id (like AlbumBackground.photoId),
 *    so a hero photo re-resolves from IndexedDB after a reload (the blob URL dies
 *    but the id doesn't). Resolve with resolveBgImageSrc({ photoId }).
 *  • Every field is optional — an untouched cover renders as a clean branded
 *    default (see DEFAULT_COVER_DESIGN). */
export interface CoverPanelDesign {
  /** Hero/background photo for the panel, by uploaded-photo id. object-cover fit. */
  photoId?: string;
  /** Solid colour behind/around the photo (and the whole panel when no photo). */
  background?: string;
}

export interface CoverDesign {
  front: CoverPanelDesign & {
    /** Big album title. */
    title?: TextStyle;
    /** Secondary line — date / names / occasion. */
    subtitle?: TextStyle;
  };
  spine: {
    /** Spine text. Reads bottom→top on the book; the renderer rotates it 90°. */
    text?: TextStyle;
  };
  back: CoverPanelDesign & {
    /** Optional closing text on the back panel. */
    blurb?: TextStyle;
    /** Show the Megyprints mark + scan-to-reorder QR on the back. Opt-in
     *  (default off) until the brand-mark treatment is confirmed. */
    brandMark?: boolean;
  };
}

export const DEFAULT_COVER_DESIGN: CoverDesign = {
  front: { background: '#FFFBF7' },
  spine: {},
  back: { background: '#FFFBF7', brandMark: false },
};

export interface AlbumPage {
  id: string;
  layout: LayoutStyle;
  templateId?: string;
  slotFills?: (number | null)[];
  slotScales?: number[];
  slotOffsetsX?: number[];
  slotOffsetsY?: number[];
  /** User-modified slot container geometries */
  slotGeometries?: SlotGeometryOverride[];
  /** QR living-memory fills. Positional, parallel to template.slots — index i
   *  is used only when slots[i].kind === 'qr'. Serializes as-is (local, cloud,
   *  order snapshot). */
  qrFills?: (QrFill | null)[];
  /** Per-slot text fills. Positional, parallel to template.slots — index i is
   *  rendered when neither qrFills[i] nor slotFills[i] claims the slot.
   *  Serializes as-is (local, cloud, order snapshot). */
  slotTexts?: (SlotText | null)[];
  /** Per-slot ornament fills. Positional, parallel to template.slots — index i
   *  is rendered when none of qrFills[i]/slotTexts[i]/slotFills[i] claims the
   *  slot. Mutually exclusive with them (enforced by the state setters).
   *  Serializes as-is (local, cloud, order snapshot). */
  ornamentFills?: (OrnamentFill | null)[];
  /** Per-CAPTION-BOX photo fills. Positional, parallel to template.textSlots[j]
   *  (NOT template.slots) — mirrors slotFills but for the caption/text boxes.
   *  Null = no photo in caption box j. A caption box holds PHOTO/TEXT/QR mutually
   *  exclusively: TEXT stays on TextElement.boxIndex (unchanged), photo lives here,
   *  QR in textSlotQr. Renderer precedence: qr → text → photo → empty. */
  textSlotFills?: (number | null)[];
  /** Per-CAPTION-BOX QR fills. Positional, parallel to template.textSlots[j]
   *  (mirrors qrFills for the caption boxes). Mutually exclusive with the box's
   *  TextElement.boxIndex caption and textSlotFills[j]. */
  textSlotQr?: (QrFill | null)[];
  /** Per-CAPTION-BOX ornament fills. Positional, parallel to template.textSlots[j]
   *  (mirrors textSlotQr). The combo/caption box holds a caption TextElement OR a
   *  themed ornament — mutually exclusive with the bound caption, textSlotFills[j]
   *  and textSlotQr[j]. Serializes as-is (local, cloud, order snapshot). */
  textSlotOrnament?: (OrnamentFill | null)[];
  /** Free-transform override for a caption-box graphic (textSlotOrnament[j]).
   *  When present, the graphic is drawn at this center-based, full-page-fraction
   *  transform instead of contained in the box — so a placed graphic can be
   *  dragged/resized/rotated freely. Only applied when textSlotOrnament[j] exists
   *  (a stale entry is ignored). Positional, parallel to template.textSlots[j]. */
  textSlotOrnamentGeom?: (OrnamentTransform | null)[];
  /** Free-transform override for a caption-box QR (textSlotQr[j]) — the exact
   *  mirror of textSlotOrnamentGeom, so a placed code can be dragged/resized/
   *  rotated instead of sitting fixed in its box. Two differences from a
   *  graphic, both because a QR is a SCANNABLE artifact rather than decoration:
   *  it is kept SQUARE on the printed page, and it cannot be shrunk below
   *  QR_MIN_PRINT_IN. Both are enforced by clampQrGeom at the state setter, so
   *  every writer gets them. Rotation is free — QR finder patterns make the code
   *  rotation-invariant. Positional, parallel to template.textSlots[j]. */
  textSlotQrGeom?: (OrnamentTransform | null)[];
  background: AlbumBackground;
  photos: CanvasPhoto[];
  textElements: TextElement[];
  size: AlbumSizePreset;
  customWidth?: number;
  customHeight?: number;
  /** Theme-baked photo-frame styling. When set, the editor/preview/print
   *  render every slot with this frame; falls back to per-slot template
   *  borders when undefined (older albums). Frozen into the order snapshot. */
  photoBorderColor?: string;
  photoBorderWidth?: number;
  /** Border line style for the slot border. Defaults to 'solid' when absent
   *  (back-compat with older albums). Shared across all three renderers. */
  photoBorderStyle?: 'solid' | 'dashed' | 'dotted';
  /** Decorative frame treatment drawn around each photo slot (museum mat,
   *  polaroid, shadow-box, …). 'none'/undefined = plain border only. */
  frameStyle?: FrameStyle;
  /** Theme-baked decorative corner-art base path, e.g.
   *  "/themes/wedding/pages/wedding1". Renderers append "_tl.png"/"_tr.png"/
   *  "_bl.png"/"_br.png". Undefined = no corner decorations. */
  cornerBase?: string;
}

/** The two cover PAGES — front & back covers edited with the SAME per-page
 *  editor as interior pages (see the cover-as-pages rework). Each is a normal
 *  AlbumPage sized to the album trim; the spine between them is DERIVED from the
 *  front page (coverLayout.deriveSpine), never edited. Held in dedicated state
 *  (coverFront/coverBack) OUTSIDE albumPages so page-count pricing, spine
 *  thickness, and spread pairing stay driven purely by interior pages. */
export interface CoverPages {
  front: AlbumPage;
  back: AlbumPage;
}

/** UploadedPhoto — photo stored locally in IndexedDB.  Only metadata
    travels to Supabase.  The actual File bytes stay in the browser. */
export interface UploadedPhoto {
  id: string;
  previewUrl: string; // transient blob URL (revoked on cleanup)
  name: string;
  type: string;
  size: number;
  width: number;
  height: number;
  capturedAt?: number | null; // EXIF DateTimeOriginal (ms) — drives moment grouping
}

export interface ThemeConfig {
  type: TemplateType;
  name: string;
  description: string;
  coverImage: string;
  backgroundImage?: string;
  /** Selectable background designs for this theme (3 per theme). The first is
   *  the default applied when the theme is chosen; the user can switch among
   *  them. Falls back to [backgroundImage] when not provided. */
  backgroundVariants?: string[];
  backgroundPalette: string[];
  accentColor: string;
  photoBorderColor: string;
  photoBorderWidth: number;
  fontFamily: string;
  textColor: string;
  layoutPreferences: LayoutStyle[];
}

export interface BuilderState {
  phase: BuilderPhase;
  uploadedPhotos: UploadedPhoto[];
  selectedTemplate: TemplateType;
  albumPages: AlbumPage[];
  currentPageIndex: number;
  material: MaterialType;
  cover: CoverType;
  /** Designed front·spine·back cover artwork (separate from `cover`, the
   *  binding material). See CoverDesign. */
  coverDesign: CoverDesign;
  size: AlbumSizePreset;
  customWidth?: number;
  customHeight?: number;
}

export interface AlbumSizeConfig {
  preset: AlbumSizePreset;
  name: string;
  width: number;
  height: number;
  category: 'square' | 'portrait' | 'landscape';
}

export const ALBUM_SIZES: AlbumSizeConfig[] = [
  { preset: '6x6', name: '6×6" Square', width: 1800, height: 1800, category: 'square' },
  { preset: '8x8', name: '8×8" Square', width: 2400, height: 2400, category: 'square' },
  { preset: '9x9', name: '9×9" Square', width: 2700, height: 2700, category: 'square' },
  { preset: '6x4', name: '6×4" Landscape', width: 1800, height: 1200, category: 'landscape' },
  { preset: '11.5x8', name: '11.5×8" Landscape', width: 3450, height: 2400, category: 'landscape' },
  { preset: '8.5x11', name: '8.5×11" Portrait', width: 2550, height: 3300, category: 'portrait' },
];

export const MATERIALS: { type: MaterialType; name: string; description: string; priceFactor: number }[] = [
  { type: 'matte', name: 'Matte', description: 'Soft, non-reflective finish. Elegant and understated.', priceFactor: 1.0 },
  { type: 'glossy', name: 'Glossy', description: 'Vibrant, shiny finish. Colors pop with a premium look.', priceFactor: 1.15 },
];

export const COVERS: { type: CoverType; name: string; description: string; priceFactor: number }[] = [
  { type: 'softcover', name: 'Softcover', description: 'Flexible, lightweight cover. Perfect for casual albums.', priceFactor: 1.0 },
  { type: 'hardboundLeather', name: 'Hardbound', description: 'Durable hard cover with genuine leather feel.', priceFactor: 1.8 },
];

export const FILTER_PRESETS: { name: string; filters: Partial<PhotoFilters> }[] = [
  { name: 'Original', filters: {} },
  { name: 'B&W', filters: { grayscale: 100, brightness: 100, contrast: 110 } },
  { name: 'B&W High Contrast', filters: { grayscale: 100, brightness: 95, contrast: 140, bwHighContrast: true } },
  { name: 'Sepia', filters: { sepia: 80, brightness: 105, contrast: 105 } },
  { name: 'Vintage', filters: { sepia: 30, brightness: 115, contrast: 90, saturate: 80, fade: true, vintage: true } },
  { name: 'Cool', filters: { brightness: 105, contrast: 105, saturate: 90, hueRotate: 15, cool: true } },
  { name: 'Warm', filters: { brightness: 110, contrast: 100, saturate: 115, sepia: 15, hueRotate: -10, warm: true } },
  { name: 'Fade', filters: { brightness: 120, contrast: 85, saturate: 75, fade: true } },
  { name: 'Vivid', filters: { brightness: 105, contrast: 115, saturate: 140, vivid: true } },
  { name: 'Soft', filters: { brightness: 110, contrast: 90, saturate: 90, blur: 0.5 } },
  { name: 'Dramatic', filters: { grayscale: 0, brightness: 90, contrast: 130, saturate: 110 } },
];

// Geometric PATTERNS were replaced by material TEXTURES — the single source of
// truth now lives in ./textures.ts. Re-exported here for any legacy importer.
export { TEXTURE_NAMES as TEXTURES } from './textures';

export const GRADIENT_PRESETS = [
  { name: 'Sunset', stops: [{ offset: 0, color: '#FF6B6B' }, { offset: 0.5, color: '#FFE66D' }, { offset: 1, color: '#FF8E53' }] },
  { name: 'Ocean', stops: [{ offset: 0, color: '#2193B0' }, { offset: 1, color: '#6DD5ED' }] },
  { name: 'Pastel Dream', stops: [{ offset: 0, color: '#F4C2A1' }, { offset: 0.5, color: '#B8A9D9' }, { offset: 1, color: '#9BCFB8' }] },
  { name: 'Rose Gold', stops: [{ offset: 0, color: '#E8A598' }, { offset: 1, color: '#F4C2A1' }] },
  { name: 'Mint Fresh', stops: [{ offset: 0, color: '#9BCFB8' }, { offset: 1, color: '#E4F0E0' }] },
  { name: 'Lavender Mist', stops: [{ offset: 0, color: '#B8A9D9' }, { offset: 1, color: '#E8E0F0' }] },
  { name: 'Peach', stops: [{ offset: 0, color: '#F4C2A1' }, { offset: 1, color: '#FDE8E4' }] },
  { name: 'Midnight', stops: [{ offset: 0, color: '#2D2D2D' }, { offset: 1, color: '#6B6B6B' }] },
];

export const THEMES: Record<TemplateType, ThemeConfig> = {
  wedding: {
    type: 'wedding', name: 'Wedding', description: 'Romantic elegance',
    coverImage: './album-wedding.jpg',
    backgroundPalette: ['#F8F3ED', '#F0E8D8', '#FAF5EF', '#E8DDD0', '#F5EDE0'],
    backgroundImage: '/themes/bg/wedding.svg',
    backgroundVariants: ['/themes/bg/wedding.svg', '/themes/bg/wedding-2.svg', '/themes/bg/wedding-3.svg'],
    accentColor: '#C9A96E',
    photoBorderColor: '#E8DDD0',
    photoBorderWidth: 1,
    fontFamily: '"Playfair Display", serif',
    textColor: '#5C4A3A',
    layoutPreferences: ['fullBleed', 'portraitSingle', 'duoPortrait', 'heroSupporting', 'panorama'],
  },
  baby: {
    type: 'baby', name: 'Baby', description: 'Soft pastels',
    coverImage: './album-baby.jpg',
    backgroundPalette: ['#E8F0E8', '#F0E8E8', '#E8E8F0', '#F0F0E8', '#E0ECE0'],
    backgroundImage: '/themes/bg/baby.svg',
    backgroundVariants: ['/themes/bg/baby.svg', '/themes/bg/baby-2.svg', '/themes/bg/baby-3.svg'],
    accentColor: '#A8C5A8',
    photoBorderColor: '#D8E8D8',
    photoBorderWidth: 2,
    fontFamily: '"DM Sans", sans-serif',
    textColor: '#5A6B5A',
    layoutPreferences: ['portraitSingle', 'duoPortrait', 'fourGrid', 'collage3', 'trio'],
  },
  birthday: {
    type: 'birthday', name: 'Birthday', description: 'Festive warmth',
    coverImage: './album-birthday.jpg',
    backgroundPalette: ['#FFF3D8', '#FFE8C8', '#FFF0D0', '#FFECD0', '#FFF5D8'],
    backgroundImage: '/themes/bg/birthday.svg',
    backgroundVariants: ['/themes/bg/birthday.svg', '/themes/bg/birthday-2.svg', '/themes/bg/birthday-3.svg'],
    accentColor: '#E8B84B',
    photoBorderColor: '#F0D890',
    photoBorderWidth: 2,
    fontFamily: '"DM Sans", sans-serif',
    textColor: '#6B5A3A',
    layoutPreferences: ['collage3', 'fourGrid', 'trio', 'heroSupporting', 'fullBleed'],
  },
  family: {
    type: 'family', name: 'Family', description: 'Warm and timeless',
    coverImage: './album-family.jpg',
    backgroundPalette: ['#F0E5D0', '#E8DCC0', '#F5E8D0', '#EDE0C8', '#F8F0E0'],
    backgroundImage: '/themes/bg/family.svg',
    backgroundVariants: ['/themes/bg/family.svg', '/themes/bg/family-2.svg', '/themes/bg/family-3.svg'],
    accentColor: '#B8956A',
    photoBorderColor: '#D4C4A8',
    photoBorderWidth: 2,
    fontFamily: '"Playfair Display", serif',
    textColor: '#5C4A32',
    layoutPreferences: ['duoPortrait', 'portraitSingle', 'heroSupporting', 'asymDuo', 'collage3'],
  },
  graduation: {
    type: 'graduation', name: 'Graduation', description: 'Academic achievement',
    coverImage: './album-graduation.jpg',
    backgroundPalette: ['#E0E0E8', '#D8D8E0', '#E8E8F0', '#D0D0E0', '#E5E5F0'],
    backgroundImage: '/themes/bg/graduation.svg',
    backgroundVariants: ['/themes/bg/graduation.svg', '/themes/bg/graduation-2.svg', '/themes/bg/graduation-3.svg'],
    accentColor: '#2B4A7A',
    photoBorderColor: '#C0C8D8',
    photoBorderWidth: 1,
    fontFamily: '"Playfair Display", serif',
    textColor: '#2B3A5A',
    layoutPreferences: ['portraitSingle', 'duoPortrait', 'trio', 'heroSupporting', 'panorama'],
  },
  travel: {
    type: 'travel', name: 'Travel', description: 'Adventure',
    coverImage: './album-travel.jpg',
    backgroundPalette: ['#E8DFC8', '#DDD0B8', '#E5D8C0', '#F0E8D8', '#D8C8A8'],
    backgroundImage: '/themes/bg/travel.svg',
    backgroundVariants: ['/themes/bg/travel.svg', '/themes/bg/travel-2.svg', '/themes/bg/travel-3.svg'],
    accentColor: '#8B7355',
    photoBorderColor: '#C4B49C',
    photoBorderWidth: 1,
    fontFamily: '"DM Sans", sans-serif',
    textColor: '#4A4030',
    layoutPreferences: ['panorama', 'fullBleed', 'heroSupporting', 'duoLandscape', 'asymDuo'],
  },
  minimalist: {
    type: 'minimalist', name: 'Minimalist', description: 'Clean and quiet',
    coverImage: './album-minimalist.jpg',
    backgroundPalette: ['#F0F0F0', '#E8E8E8', '#F5F5F5', '#E0E0E0', '#F8F8F8'],
    backgroundImage: '/themes/bg/minimalist.svg',
    backgroundVariants: ['/themes/bg/minimalist.svg', '/themes/bg/minimalist-2.svg', '/themes/bg/minimalist-3.svg'],
    accentColor: '#9B9B9B',
    photoBorderColor: '#D0D0D0',
    photoBorderWidth: 1,
    fontFamily: '"DM Sans", sans-serif',
    textColor: '#2D2D2D',
    layoutPreferences: ['portraitSingle', 'duoPortrait', 'panorama', 'asymDuo'],
  },
  kids: {
    type: 'kids', name: 'Kids', description: 'Playful and bright',
    coverImage: './album-kids.jpg',
    backgroundPalette: ['#FFF0E8', '#E8F0FF', '#FFF0F0', '#F0FFF5', '#F8F0FF'],
    backgroundImage: '/themes/bg/kids.svg',
    backgroundVariants: ['/themes/bg/kids.svg', '/themes/bg/kids-2.svg', '/themes/bg/kids-3.svg'],
    accentColor: '#E8A598',
    photoBorderColor: '#F4D0C4',
    photoBorderWidth: 3,
    fontFamily: '"DM Sans", sans-serif',
    textColor: '#5A4A3A',
    layoutPreferences: ['fourGrid', 'collage3', 'trio', 'duoPortrait', 'fullBleed'],
  },
  vintage: {
    type: 'vintage', name: 'Vintage', description: 'Old-world charm',
    coverImage: './album-vintage.jpg',
    backgroundPalette: ['#E8D8B8', '#DDD0A8', '#F0E0C0', '#E5D8B8', '#D8C8A0'],
    backgroundImage: '/themes/bg/vintage.svg',
    backgroundVariants: ['/themes/bg/vintage.svg', '/themes/bg/vintage-2.svg', '/themes/bg/vintage-3.svg'],
    accentColor: '#8B6F4E',
    photoBorderColor: '#C4A882',
    photoBorderWidth: 2,
    fontFamily: '"Playfair Display", serif',
    textColor: '#4A3A28',
    layoutPreferences: ['portraitSingle', 'duoPortrait', 'portraitSingle', 'asymDuo', 'panorama'],
  },
  classic: {
    type: 'classic', name: 'Classic', description: 'Timeless sophistication',
    coverImage: './album-elegant.jpg',
    backgroundPalette: ['#F0E8D8', '#E8DCC8', '#F5F0E0', '#F8F0E0', '#E8DFD0'],
    backgroundImage: '/themes/bg/classic.svg',
    backgroundVariants: ['/themes/bg/classic.svg', '/themes/bg/classic-2.svg', '/themes/bg/classic-3.svg'],
    accentColor: '#9B8B6E',
    photoBorderColor: '#D8CFC0',
    photoBorderWidth: 1,
    fontFamily: '"Playfair Display", serif',
    textColor: '#3A3028',
    layoutPreferences: ['fullBleed', 'portraitSingle', 'heroSupporting', 'duoPortrait', 'panorama'],
  },
  baptism: {
    type: 'baptism', name: 'Baptism', description: 'Sacred & serene',
    coverImage: './album-baptism.jpg',
    backgroundImage: '/themes/bg/baptism-1.svg',
    backgroundVariants: ['/themes/bg/baptism-1.svg', '/themes/bg/baptism-2.svg', '/themes/bg/baptism-3.svg'],
    backgroundPalette: ['#FBFAF6', '#F4F6FB', '#FAF8F4', '#F0F4FA', '#F8FAF8'],
    accentColor: '#B9A66B',
    photoBorderColor: '#E6E0CF',
    photoBorderWidth: 2,
    fontFamily: '"Playfair Display", serif',
    textColor: '#4A4636',
    layoutPreferences: ['portraitSingle', 'duoPortrait', 'heroSupporting', 'fullBleed', 'panorama'],
  },
};

/** The selectable background designs for a theme (3 per theme), falling back to
 *  the single backgroundImage, then to an empty list. */
export function getThemeBackgroundVariants(theme: TemplateType): string[] {
  const config = THEMES[theme];
  if (config.backgroundVariants?.length) return config.backgroundVariants;
  return config.backgroundImage ? [config.backgroundImage] : [];
}

export function getThemedBackground(theme: TemplateType, pageIndex: number): AlbumBackground {
  const config = THEMES[theme];
  if (config.backgroundImage) {
    return { type: 'image', image: config.backgroundImage };
  }
  const color = config.backgroundPalette[pageIndex % config.backgroundPalette.length];
  return { type: 'solid', solid: color };
}

export function getThemedPhotoBorder(theme: TemplateType): { color: string; width: number } {
  const config = THEMES[theme];
  // Frames carry the theme's signature accent color (kept thin so it reads as
  // an elegant mat border, not a heavy outline).
  return { color: config.accentColor, width: config.photoBorderWidth };
}

/** A friendly default cover title per theme, auto-placed on page 1 so the
 *  theme's font + accent color are visible without the user adding anything. */
export const THEME_TITLES: Record<TemplateType, string> = {
  wedding: 'Our Wedding',
  baby: 'Our Little One',
  birthday: 'Happy Birthday',
  family: 'Our Family',
  graduation: 'Congratulations',
  travel: 'Our Adventures',
  minimalist: 'Memories',
  kids: 'Good Times',
  vintage: 'Cherished Memories',
  classic: 'Our Story',
  baptism: 'Blessed Day',
};

/** Style + text for a theme's auto-placed title (font + accent color). */
export function getThemedTitle(theme: TemplateType): { text: string; fontFamily: string; color: string } {
  const config = THEMES[theme];
  return { text: THEME_TITLES[theme], fontFamily: config.fontFamily, color: config.accentColor };
}

/** Themes that ship decorative page-corner art (one set used album-wide).
 *  Assets live under public/themes/<dir>/pages/<set>_<corner>.png.
 *
 *  DISABLED: the available PNGs (wedding1/family1/baptism1) are scrapbook
 *  photo-FRAME templates with empty ornate frames baked in, so overlaying them
 *  scatters empty frames in every corner — it looks broken. The corner-render
 *  pipeline (cornerBase on AlbumPage, editor/preview/print) is intact and ready;
 *  re-enable a theme here once we have real flourish art (no empty frames), or
 *  build a "photos fill the frames" feature. */
const THEME_CORNER_SETS: Partial<Record<TemplateType, string>> = {};

/** Base path for a theme's corner art (album-wide), or undefined if none. */
export function getThemeCornerBase(theme: TemplateType): string | undefined {
  return THEME_CORNER_SETS[theme];
}

export type CornerPos = 'tl' | 'tr' | 'bl' | 'br';
export const CORNER_POSITIONS: CornerPos[] = ['tl', 'tr', 'bl', 'br'];

/** Build the URL for one corner image from a baked corner base. */
export function cornerImageUrl(base: string, pos: CornerPos): string {
  return `${base}_${pos}.png`;
}

export const DEFAULT_ALBUM_SIZE: AlbumSizePreset = '8x8';
export const DEFAULT_MATERIAL: MaterialType = 'matte';
export const DEFAULT_COVER: CoverType = 'softcover';

/* ───────────────────────────────────────────────────────────────────────────
   BORDER + FRAME STYLE REGISTRIES (single source of truth)

   These registries are shared by the Step-2 customization pickers AND by all
   three renderers (BuilderPreview PageView, useCanvasEngine Fabric, and the
   print pipeline) so a style change can never drift between them.
   ─────────────────────────────────────────────────────────────────────────── */

/** A selectable photo-border preset. `style` maps to the CSS border-style /
 *  the Fabric dash array / the print ctx.setLineDash equivalent. */
export interface BorderStyleOption {
  id: string;
  label: string;
  color: string;
  width: number;
  style: 'solid' | 'dashed' | 'dotted';
}

/** Curated border presets surfaced by the Step-2 "Border" picker. */
export const BORDER_STYLES: BorderStyleOption[] = [
  { id: 'thin-white', label: 'Thin White', color: '#FFFFFF', width: 4, style: 'solid' },
  { id: 'hairline-charcoal', label: 'Hairline Charcoal', color: '#2D2D2D', width: 2, style: 'solid' },
  { id: 'peach', label: 'Peach', color: '#F4C2A1', width: 5, style: 'solid' },
  { id: 'dashed-charcoal', label: 'Dashed Charcoal', color: '#4A4A4A', width: 3, style: 'dashed' },
  { id: 'dotted-peach', label: 'Dotted Peach', color: '#E8A598', width: 3, style: 'dotted' },
  { id: 'bold-gold', label: 'Bold Gold', color: '#C9A24B', width: 6, style: 'solid' },
];

/** Decorative frame treatments drawn AROUND each photo slot. */
export type FrameStyle =
  | 'none'
  | 'thin'
  | 'double'
  | 'rounded'
  | 'matte'
  | 'polaroid'
  | 'shadowbox';

/** A selectable frame preset surfaced by the Step-2 "Frame" picker. */
export interface FrameStyleOption {
  id: FrameStyle;
  label: string;
}

/** Curated frame presets, in picker order. */
export const FRAME_STYLES: FrameStyleOption[] = [
  { id: 'none', label: 'None' },
  { id: 'thin', label: 'Thin' },
  { id: 'double', label: 'Double' },
  { id: 'rounded', label: 'Rounded' },
  { id: 'matte', label: 'Matte' },
  { id: 'polaroid', label: 'Polaroid' },
  { id: 'shadowbox', label: 'Shadow Box' },
];

/** The two-layer CSS spec a frame produces: an optional outer `wrapper` style
 *  (mat / padding / shadow) and an optional `inner` style applied to the photo
 *  element itself (radius / extra border). Returned by {@link frameStyleToCss}
 *  and consumed by the DOM renderer + the picker thumbnails so they cannot
 *  drift apart. */
export interface FrameCss {
  wrapper?: CSSProperties;
  inner?: CSSProperties;
}

/**
 * Pure helper translating a {@link FrameStyle} into composable CSS.
 *
 * Used by the DOM renderer (BuilderPreview PageView) and the picker thumbnails;
 * the Fabric + print renderers mirror the same intent with their own
 * primitives keyed off {@link FRAME_STYLES}.
 *
 * @param frame  The frame treatment (undefined / 'none' → no decoration).
 * @param accent Accent colour used where the frame draws a tinted line
 *               (e.g. the inner hairline of the `thin`/`double` frames).
 */
export function frameStyleToCss(
  frame: FrameStyle | undefined,
  accent: string = '#FFFFFF',
): FrameCss {
  switch (frame) {
    case 'thin':
      return {
        inner: {
          boxShadow: `inset 0 0 0 1px ${accent}`,
        },
      };
    case 'double':
      return {
        inner: {
          border: `1px solid ${accent}`,
          outline: `1px solid ${accent}`,
          outlineOffset: '3px',
        },
      };
    case 'rounded':
      return {
        inner: {
          borderRadius: '10%',
          border: `3px solid ${accent}`,
        },
      };
    case 'matte':
      return {
        wrapper: {
          backgroundColor: '#FFFFFF',
          padding: '8px',
          boxShadow: 'inset 0 0 6px rgba(0,0,0,0.18)',
        },
      };
    case 'polaroid':
      return {
        wrapper: {
          backgroundColor: '#FFFFFF',
          padding: '8px 8px 28px',
          boxShadow: '0 6px 16px rgba(0,0,0,0.22)',
        },
      };
    case 'shadowbox':
      return {
        wrapper: {
          border: '1px solid rgba(0,0,0,0.15)',
          boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
        },
      };
    case 'none':
    default:
      return {};
  }
}
