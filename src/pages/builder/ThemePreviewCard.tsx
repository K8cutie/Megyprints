/* ══════════════════════════════════════════════════════════════════════════
   ThemePreviewCard — a mini "this is your album" preview for the Step 2 theme
   picker. Instead of a flat color swatch, it shows the elements a theme actually
   controls, all at once: the background (SVG/texture), a framed sample photo (the
   theme's frame colour + width), and a sample caption in the theme's font + text
   colour. So the card reads as the real look, not a paint chip.
   ══════════════════════════════════════════════════════════════════════════ */

import type { TemplateType } from './types';
import { THEMES } from './types';
import { THEME_QUOTES } from './themeQuotes';

export default function ThemePreviewCard({ id, label, selected, onSelect }: {
  id: TemplateType;
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = THEMES[id];
  const quote = THEME_QUOTES[id]?.[0] ?? '';
  const frame = `${Math.max(1, t.photoBorderWidth)}px solid ${t.photoBorderColor}`;
  const fallbackBg = t.backgroundPalette?.[0] ?? '#FFFBF7';

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`group flex flex-col rounded-xl overflow-hidden border-2 text-left transition-all ${
        selected ? 'border-[#F4C2A1] ring-2 ring-[#F4C2A1]/30' : 'border-[#F0F0F0] hover:border-[#F4C2A1]/60'
      }`}
    >
      {/* Mini album page */}
      <div className="relative w-full" style={{ aspectRatio: '4 / 3', backgroundColor: fallbackBg }}>
        {t.backgroundImage && (
          <img
            src={t.backgroundImage}
            alt=""
            draggable={false}
            className="absolute inset-0 h-full w-full object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        {/* Page content: a framed sample photo + a themed caption, inset like a real page */}
        <div className="absolute inset-0 flex flex-col gap-1 p-2">
          <div
            className="flex-1 overflow-hidden rounded-[3px]"
            style={{ border: frame, background: 'linear-gradient(135deg,#cfc7ba 0%,#ece5d9 55%,#dcd3c4 100%)' }}
          />
          <div
            className="px-0.5 text-center leading-snug line-clamp-2"
            style={{ fontFamily: t.fontFamily, color: t.textColor, fontSize: 10 }}
          >
            {quote}
          </div>
        </div>
        {selected && (
          <div
            className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-white"
            style={{ backgroundColor: t.accentColor, fontSize: 11 }}
            aria-hidden="true"
          >
            ✓
          </div>
        )}
      </div>

      {/* Label + occasion */}
      <div className="bg-white px-2 py-1.5">
        <div className="text-xs font-semibold text-[#2D2D2D]">{label}</div>
        <div className="truncate text-[10px] text-[#9B9B9B]">{t.description}</div>
      </div>
    </button>
  );
}
