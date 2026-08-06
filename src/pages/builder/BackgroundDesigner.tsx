import { useState, useRef, useCallback } from 'react';
import {
  Check,
  Droplets,
  Upload,
  X,
} from 'lucide-react';
import type { AlbumPage, UploadedPhoto } from './types';
import { resolveBgImageSrc } from './types';
import { TEXTURE_NAMES, TEXTURE_COLORS, DEFAULT_TEXTURE_COLORS, textureDataUri, TEXTURE_TILE_PX } from './textures';

/* ─── Modes ───
   TEXTURES-ONLY by design (owner call 2026-08-06): solid/gradient/image page
   backgrounds were removed from the picker — materials read premium, photo
   backgrounds made interiors chaotic. The renderers still DRAW legacy
   solid/gradient/image backgrounds (bgPreviewStyle below, and the page
   renderers), so old drafts keep rendering; they just can't be re-picked.
   The `imageOnly` cover mode is the ONE exception — a cover background IS a
   photo (the picture browser is the whole panel there). */
type BgTab = 'image' | 'texture';

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
  /** PHOTO-ONLY mode: swap the texture grid for the picture browser. Used by
   *  the cover editor — a cover background is a photo. */
  imageOnly?: boolean;
  /** Hide the opacity slider (not meaningful on a cover panel). */
  hideOpacity?: boolean;
}

export default function BackgroundDesigner({ background, onChange, photos = [], hidePreview = false, compact = false, imageOnly = false, hideOpacity = false }: BackgroundDesignerProps) {
  // One fixed mode per host: covers browse pictures, everything else picks a texture.
  const effectiveTab: BgTab = imageOnly ? 'image' : 'texture';
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

      {/* ─── OPACITY SLIDER — sits right under the live preview.
              Hidden on a cover panel, where opacity isn't meaningful. ─── */}
      <div className={`shrink-0 mb-2.5 space-y-1.5 ${hideOpacity ? 'hidden' : ''}`}>
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

      {/* Scrollable content area — ONE fixed mode (no tab row): the texture
          grid, or the picture browser in the cover's photo-only mode. */}
      <div className="flex-1 overflow-y-auto min-h-0 py-3">
        {/* ─── IMAGE (cover photo-only mode) ─── */}
        {effectiveTab === 'image' && (
          <div className="space-y-3">
            {/* ─── Your uploaded photos → use one as the page background ───
                In photo-only mode the whole panel IS the picture browser, so the
                "Your Photos" heading and the empty-state line are just noise. */}
            {!imageOnly && (
              <p className="text-[10px] text-stone-400 font-medium uppercase tracking-wider">Your Photos</p>
            )}
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
              !imageOnly && (
                <p className="text-[11px] text-stone-400 text-center py-2 bg-stone-50 rounded-lg">
                  Upload photos first to use one as a background.
                </p>
              )
            )}

            {/* No divider when there's nothing above it (photo-only, no photos yet). */}
            {!(imageOnly && photos.length === 0) && <div className="border-t border-stone-100" />}

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
          </div>
        )}

        {/* ─── TEXTURES (the picker, everywhere else) ─── */}
        {effectiveTab === 'texture' && (
          <div className="space-y-3">
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
          </div>
        )}
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
