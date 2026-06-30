/* ══════════════════════════════════════════════════════════════════════════
   ThemePreviewCard — a theme tile for the Step 2 "Pick a Theme" picker.
   Shows the theme's REAL album cover photo (public/album-*.jpg) so each occasion
   looks distinct and appealing — a Wedding reads as a wedding, Kids as kids, etc.
   (An earlier version rendered an identical beige placeholder for every theme,
   which made them indistinguishable / useless.)
   ══════════════════════════════════════════════════════════════════════════ */

import type { TemplateType } from './types';
import { THEMES } from './types';

export default function ThemePreviewCard({ id, label, selected, onSelect }: {
  id: TemplateType;
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = THEMES[id];

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`group flex flex-col rounded-xl overflow-hidden border-2 text-left transition-all ${
        selected ? 'border-[#F4C2A1] ring-2 ring-[#F4C2A1]/30' : 'border-[#F0F0F0] hover:border-[#F4C2A1]/60'
      }`}
    >
      {/* Real per-theme album cover photo */}
      <div className="relative w-full aspect-[4/3] overflow-hidden bg-[#F5F0E8]">
        <img
          src={t.coverImage}
          alt={`${label} album`}
          loading="lazy"
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {selected && (
          <div
            className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-white shadow"
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
