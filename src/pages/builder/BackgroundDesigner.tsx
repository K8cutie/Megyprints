import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PaintBucket,
  Image,
  Blend,
  Layers,
  Check,
  Droplets,
  Upload,
  X,
} from 'lucide-react';
import type { AlbumPage, UploadedPhoto } from './types';
import { resolveBgImageSrc } from './types';
import { TEXTURE_NAMES, TEXTURE_COLORS, DEFAULT_TEXTURE_COLORS, textureDataUri, TEXTURE_TILE_PX } from './textures';

/* ─── Tabs ─── */
type BgTab = 'solid' | 'gradient' | 'image' | 'texture';

const TABS: { key: BgTab; label: string; icon: React.ReactNode; title: string }[] = [
  { key: 'solid', label: 'Solid', title: 'Solid Color', icon: <PaintBucket size={20} /> },
  { key: 'gradient', label: 'Gradient', title: 'Gradient', icon: <Blend size={20} /> },
  { key: 'image', label: 'Image', title: 'Image Background', icon: <Image size={20} /> },
  { key: 'texture', label: 'Textures', title: 'Material Textures', icon: <Layers size={20} /> },
];

/* ─── Live-preview CSS for a background (so opacity etc. is visible) ─── */
function bgPreviewStyle(bg: AlbumPage['background'], photos: UploadedPhoto[]): React.CSSProperties {
  if (!bg) return {};
  const b = bg as any;
  if (bg.type === 'solid') return { backgroundColor: b.solid || '#FFFBF7' };
  if (bg.type === 'image') {
    const img = resolveBgImageSrc(b, photos);
    if (!img) return { backgroundColor: '#FFFBF7' };
    // Image presets store a CSS gradient in .image; uploads / photos store a URL.
    // Quote the url() so URLs with special chars (e.g. data: SVGs) stay valid.
    return img.includes('gradient(')
      ? { background: img }
      : { backgroundImage: `url("${img}")`, backgroundSize: 'cover', backgroundPosition: 'center' };
  }
  if (bg.type === 'gradient' && b.gradient) {
    const g = b.gradient;
    const stops = g.stops.map((s: { color: string; offset: number }) => `${s.color} ${Math.round((s.offset ?? 0) * 100)}%`).join(', ');
    return { background: g.type === 'radial' ? `radial-gradient(circle, ${stops})` : `linear-gradient(${g.angle ?? 0}deg, ${stops})` };
  }
  if (bg.type === 'texture') {
    return {
      backgroundImage: `url("${textureDataUri(b.texture, b.textureColor)}")`,
      backgroundSize: `${TEXTURE_TILE_PX}px ${TEXTURE_TILE_PX}px`,
      backgroundRepeat: 'repeat',
    };
  }
  return { backgroundColor: '#FFFBF7' };
}

/* ─── Component ─── */
interface BackgroundDesignerProps {
  background: AlbumPage['background'];
  onChange: (bg: AlbumPage['background']) => void;
  /** The user's uploaded album photos — offered as background choices. */
  photos?: UploadedPhoto[];
  /** Hide the built-in "Page preview" (when the host already shows a preview,
   *  e.g. the cover editor's live panel). */
  hidePreview?: boolean;
  /** Denser swatch grids (smaller swatches) — used by the cover editor so the
   *  preview can be bigger. Leaves Step 3 at its normal sizes. */
  compact?: boolean;
  /** PHOTO-ONLY mode: hide the Solid/Gradient/Textures options and go straight to
   *  the picture browser. Used by the cover editor — a cover background is a photo. */
  imageOnly?: boolean;
}

export default function BackgroundDesigner({ background, onChange, photos = [], hidePreview = false, compact = false, imageOnly = false }: BackgroundDesignerProps) {
  const [activeTab, setActiveTab] = useState<BgTab>('solid');
  // In photo-only mode the picture browser is the whole panel.
  const effectiveTab: BgTab = imageOnly ? 'image' : activeTab;
  const [customImageUrl, setCustomImageUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setCustomImageUrl(url);
    onChange({ type: 'image', image: url });
    e.target.value = '';
  }, [onChange]);

  /* Solid colour presets */
  const solidPresets = [
    '#FFFBF7', '#FFFFFF', '#F5F5F4', '#E7E5E4', '#D6D3D1',
    '#FDA4AF', '#FCD34D', '#86EFAC', '#93C5FD', '#C4B5FD',
    '#1C1917', '#44403C', '#78716C', '#A8A29E', '#0EA5E9',
  ];

  /* Gradient presets */
  const gradientPresets = [
    { type: 'linear' as const, angle: 45, stops: [{ color: '#FFFBF7', offset: 0 }, { color: '#FDA4AF', offset: 1 }] },
    { type: 'linear' as const, angle: 135, stops: [{ color: '#93C5FD', offset: 0 }, { color: '#C4B5FD', offset: 1 }] },
    { type: 'linear' as const, angle: 90, stops: [{ color: '#FCD34D', offset: 0 }, { color: '#FFFBF7', offset: 1 }] },
    { type: 'linear' as const, angle: 0, stops: [{ color: '#86EFAC', offset: 0 }, { color: '#0EA5E9', offset: 1 }] },
    { type: 'radial' as const, angle: 0, stops: [{ color: '#FFFBF7', offset: 0 }, { color: '#E7E5E4', offset: 1 }] },
  ];

  return (
    <div className="w-full flex flex-col h-full">
      {/* Live page preview — shows the real background WITH opacity over the
          page base, so the user isn't guessing. Suppressed when the host already
          shows its own preview (e.g. the cover editor). */}
      {!hidePreview && (
        <div
          className="relative w-full h-48 rounded-xl overflow-hidden border border-stone-200 shrink-0 mb-2.5"
          style={{ backgroundColor: '#FFFBF7' }}
        >
          <div className="absolute inset-0" style={{ ...bgPreviewStyle(background, photos), opacity: (background.opacity ?? 100) / 100 }} />
          <span className="absolute bottom-1.5 left-2 text-[10px] font-medium text-stone-500 bg-white/75 px-1.5 py-0.5 rounded">
            Page preview · {Math.round(background.opacity ?? 100)}%
          </span>
        </div>
      )}

      {/* ─── OPACITY SLIDER — sits right under the live preview ─── */}
      <div className="shrink-0 mb-2.5 space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-xs text-stone-500 font-medium">
            <Droplets size={13} /> Opacity
          </label>
          <span className="text-xs text-stone-400 tabular-nums">
            {Math.round((background.opacity ?? 100))}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={background.opacity ?? 100}
          onChange={(e) =>
            onChange({ ...background, opacity: Number(e.target.value) })
          }
          className="w-full cursor-pointer accent-rose-400"
        />
      </div>

      {/* Tab cards — 2×2 on mobile, 4-across on wider screens.
          Hidden in photo-only mode (the cover goes straight to the picture browser). */}
      <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2 shrink-0 ${imageOnly ? 'hidden' : ''}`}>
        {TABS.map((t) => {
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              title={t.title}
              className={`flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-xl border-2 text-xs font-medium transition-all ${
                active
                  ? 'border-rose-400 bg-rose-50 text-stone-900 shadow'
                  : 'border-stone-200 bg-white text-stone-500 hover:border-stone-300 hover:text-stone-700 hover:shadow-sm'
              }`}
            >
              <span className={active ? 'text-rose-500' : 'text-stone-400'}>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto min-h-0 py-3">
        <AnimatePresence mode="wait">
        {effectiveTab === 'solid' && (
          <motion.div
            key="solid"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-3"
          >
            <div className={`grid gap-2 ${compact ? 'grid-cols-8' : 'grid-cols-5'}`}>
              {solidPresets.map((c) => (
                <button
                  key={c}
                  onClick={() => onChange({ type: 'solid', solid: c })}
                  className={`w-full aspect-square rounded-lg border-2 transition-all ${
                    background.type === 'solid' && background.solid === c
                      ? 'border-rose-400 scale-110 shadow'
                      : 'border-transparent hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-stone-500">Custom</label>
              <input
                type="color"
                value={background.type === 'solid' ? background.solid || '#FFFBF7' : '#FFFBF7'}
                onChange={(e) => onChange({ type: 'solid', solid: e.target.value })}
                className="w-8 h-8 rounded cursor-pointer"
              />
            </div>
          </motion.div>
        )}

        {/* ─── GRADIENT ─── */}
        {effectiveTab === 'gradient' && (
          <motion.div
            key="gradient"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-3"
          >
            <div className={`grid gap-1.5 ${compact ? 'grid-cols-4' : 'grid-cols-2'}`}>
              {gradientPresets.map((g, i) => {
                const css =
                  g.type === 'linear'
                    ? `linear-gradient(${g.angle}deg, ${g.stops.map((s) => `${s.color}`).join(', ')})`
                    : `radial-gradient(circle, ${g.stops.map((s) => `${s.color}`).join(', ')})`;
                return (
                  <button
                    key={i}
                    onClick={() =>
                      onChange({
                        type: 'gradient',
                        gradient: { type: g.type, angle: g.angle, stops: g.stops },
                      })
                    }
                    className={`w-full h-12 rounded-lg border-2 transition-all ${
                      background.type === 'gradient' &&
                      background.gradient?.type === g.type &&
                      background.gradient.stops[0]?.color === g.stops[0]?.color &&
                      background.gradient.stops[1]?.color === g.stops[1]?.color
                        ? 'border-rose-400 shadow'
                        : 'border-transparent hover:scale-105'
                    }`}
                    style={{ background: css }}
                  />
                );
              })}
            </div>
          </motion.div>
        )}

        {/* ─── IMAGE ─── */}
        {effectiveTab === 'image' && (
          <motion.div
            key="image"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="space-y-3"
          >
            {/* ─── Your uploaded photos → use one as the page background ─── */}
            <p className="text-[10px] text-stone-400 font-medium uppercase tracking-wider">Your Photos</p>
            {photos.length > 0 ? (
              <div className={`grid gap-1.5 ${compact ? 'grid-cols-5' : 'grid-cols-3'}`}>
                {photos.map((p) => {
                  const active = background.type === 'image' && background.photoId === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => onChange({ type: 'image', image: p.previewUrl, photoId: p.id, opacity: background.opacity ?? 100 })}
                      title={p.name}
                      className={`relative w-full aspect-square rounded-lg border-2 overflow-hidden transition-all ${
                        active ? 'border-rose-400 shadow' : 'border-transparent hover:scale-105'
                      }`}
                    >
                      <img src={p.previewUrl} alt={p.name} draggable={false} className="w-full h-full object-cover" />
                      {active && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/25">
                          <Check size={16} className="text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-[11px] text-stone-400 text-center py-2 bg-stone-50 rounded-lg">
                Upload photos first to use one as a background.
              </p>
            )}

            <div className="border-t border-stone-100" />

            {/* Upload button */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-8 border-2 border-dashed border-rose-300 rounded-xl text-rose-500 text-sm font-semibold hover:bg-rose-50 transition-all flex flex-col items-center justify-center gap-2"
            >
              <Upload size={28} /> Upload Custom Image
            </button>

            {/* The uploaded image is shown big in the Page preview above —
                here we only offer a way to remove it. */}
            {customImageUrl && (
              <button
                onClick={() => { setCustomImageUrl(null); onChange({ type: 'solid', solid: '#FFFBF7' }); }}
                className="w-full py-2 rounded-lg text-xs font-medium text-red-500 border border-red-200 hover:bg-red-50 transition-all flex items-center justify-center gap-1.5"
              >
                <X size={12} /> Remove custom image
              </button>
            )}
          </motion.div>
        )}

        {/* ─── TEXTURES ─── */}
        {effectiveTab === 'texture' && (
          <motion.div
            key="texture"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-3"
          >
            {/* Material */}
            <div>
              <p className="text-[10px] text-stone-400 mb-1.5 uppercase tracking-wider font-semibold">Material</p>
              <div className={`grid gap-1.5 ${compact ? 'grid-cols-6' : 'grid-cols-4'}`}>
                {TEXTURE_NAMES.map((name) => (
                  <button
                    key={name}
                    onClick={() => onChange({ type: 'texture', texture: name, textureColor: background.textureColor, opacity: background.opacity ?? 100 })}
                    title={name}
                    className={`relative w-full aspect-square rounded-lg border-2 overflow-hidden transition-all ${
                      background.type === 'texture' && background.texture === name
                        ? 'border-rose-400 shadow'
                        : 'border-transparent hover:scale-105'
                    }`}
                  >
                    <TextureSwatch name={name} color={background.textureColor} />
                    <span className="absolute bottom-0 inset-x-0 text-[8px] font-semibold capitalize text-stone-700 bg-white/70 py-0.5 text-center">
                      {name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            {/* Color — applies to the chosen material */}
            <div>
              <p className="text-[10px] text-stone-400 mb-1.5 uppercase tracking-wider font-semibold">Color</p>
              <div className={`grid gap-1.5 ${compact ? 'grid-cols-6' : 'grid-cols-4'}`}>
                {TEXTURE_COLORS.map((c) => {
                  const mat = (background.type === 'texture' && background.texture) ? background.texture : TEXTURE_NAMES[0];
                  const active = background.type === 'texture'
                    && (background.textureColor ?? DEFAULT_TEXTURE_COLORS[mat as keyof typeof DEFAULT_TEXTURE_COLORS]).toLowerCase() === c.hex.toLowerCase();
                  return (
                    <button
                      key={c.hex}
                      onClick={() => onChange({ type: 'texture', texture: mat, textureColor: c.hex, opacity: background.opacity ?? 100 })}
                      title={c.name}
                      className={`relative w-full aspect-square rounded-lg border-2 overflow-hidden transition-all ${active ? 'border-rose-400 shadow' : 'border-transparent hover:scale-105'}`}
                    >
                      <TextureSwatch name={mat} color={c.hex} />
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}

/* ─── TextureSwatch ─── */
/* Renders the REAL material texture (same procedural data URI the page uses),
 * so the swatch is a faithful preview of what lands on the page. */
function TextureSwatch({ name, color }: { name: string; color?: string }) {
  return (
    <div
      className="w-full h-full"
      style={{
        backgroundImage: `url("${textureDataUri(name, color)}")`,
        backgroundSize: `${TEXTURE_TILE_PX}px ${TEXTURE_TILE_PX}px`,
        backgroundRepeat: 'repeat',
      }}
    />
  );
}
