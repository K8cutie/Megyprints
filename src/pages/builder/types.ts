export type BuilderPhase = 'setup' | 'upload' | 'template' | 'edit' | 'preview';

export type TemplateType =
  | 'wedding' | 'baby' | 'birthday' | 'family' | 'graduation'
  | 'travel' | 'minimalist' | 'kids' | 'vintage' | 'classic' | 'baptism';

export type LayoutStyle =
  | 'fullBleed' | 'duoPortrait' | 'duoLandscape' | 'fourGrid'
  | 'heroSupporting' | 'portraitSingle' | 'collage' | 'collage3'
  | 'trio' | 'asymDuo' | 'panorama' | 'freeform';

export type SlotShape = 'rectangle' | 'rounded' | 'circle' | 'oval' | 'heart' | 'star';

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
}

export interface FilledSlot {
  slotId: string;
  photoIndex: number | null;
}

export type BackgroundType = 'solid' | 'gradient' | 'pattern' | 'image';

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
  pattern?: string;
  image?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  filters?: PhotoFilters;
  opacity?: number;
}

export const DEFAULT_BACKGROUND: AlbumBackground = {
  type: 'solid', solid: '#FFFBF7',
};

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

export interface TextElement {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fontFamily: string;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  alignment: 'left' | 'center' | 'right';
  rotation: number;
  opacity: number;
  backgroundColor?: string;
  width?: number;
  scaleX?: number;
  scaleY?: number;
  /** If set, this text fills template.textSlots[boxIndex] instead of free x/y. */
  boxIndex?: number;
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
  /** Theme-baked decorative corner-art base path, e.g.
   *  "/themes/wedding/pages/wedding1". Renderers append "_tl.png"/"_tr.png"/
   *  "_bl.png"/"_br.png". Undefined = no corner decorations. */
  cornerBase?: string;
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
  { type: 'semigloss', name: 'Semi-Gloss', description: 'Balanced sheen. Best of both matte and glossy worlds.', priceFactor: 1.25 },
  { type: 'pearl', name: 'Pearl', description: 'Subtle shimmer with metallic warmth. Truly special.', priceFactor: 1.5 },
  { type: 'linen', name: 'Linen', description: 'Textured paper with a classic, tactile feel.', priceFactor: 1.35 },
];

export const COVERS: { type: CoverType; name: string; description: string; priceFactor: number }[] = [
  { type: 'softcover', name: 'Softcover', description: 'Flexible, lightweight cover. Perfect for casual albums.', priceFactor: 1.0 },
  { type: 'hardboundLeather', name: 'Hardbound Leather', description: 'Durable hard cover with genuine leather feel.', priceFactor: 1.8 },
  { type: 'hardboundLinen', name: 'Hardbound Linen', description: 'Classic hard cover wrapped in textured linen.', priceFactor: 1.6 },
  { type: 'premiumVelvet', name: 'Premium Velvet', description: 'Luxurious velvet touch cover. Our finest option.', priceFactor: 2.2 },
  { type: 'acrylicLayflat', name: 'Acrylic Layflat', description: 'Crystal clear acrylic with layflat pages. Ultra-premium.', priceFactor: 2.8 },
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

export const PATTERNS = [
  'dots', 'stripes', 'diagonal', 'chevron', 'grid',
  'floral', 'geometric', 'watercolor', 'marble', 'wood',
  'confetti', 'stars', 'hearts', 'polka', 'waves',
];

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

export const PRICE_CONFIG = { basePrice: 500 };
