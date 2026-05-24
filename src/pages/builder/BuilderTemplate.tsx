import { useMemo, useCallback } from 'react';
import { Check, ChevronLeft, Sparkles } from 'lucide-react';
import type { TemplateType } from './types';
import { THEMES } from './types';

interface BuilderTemplateProps {
  selected: TemplateType;
  onSelect: (t: TemplateType) => void;
  onBack: () => void;
  onGenerate: () => void;
}

/** Grid column class — extracted as constant to avoid re-computing */
const GRID_COLUMNS = 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-4';

/** Single template card — extracted for cleaner parent JSX */
function TemplateCard({
  theme,
  isSelected,
  onSelect,
}: {
  theme: (typeof THEMES)[TemplateType];
  isSelected: boolean;
  onSelect: () => void;
}) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect();
      }
    },
    [onSelect]
  );

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-label={`${theme.name} template. ${theme.description}. Press Enter to select.`}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      className="cursor-pointer group hover:-translate-y-1 transition-transform duration-200"
    >
      <div
        className="relative aspect-[3/4] rounded-xl overflow-hidden border-2 transition-all shadow-sm"
        style={{
          borderColor: isSelected ? theme.accentColor : '#E8E8E8',
          boxShadow: isSelected ? `0 4px 16px ${theme.accentColor}40` : 'none',
        }}
      >
        <img
          src={theme.coverImage}
          alt=""
          loading="lazy"
          className="w-full h-full object-cover"
          aria-hidden="true"
        />
        {isSelected && (
          <div
            className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center"
            style={{ backgroundColor: theme.accentColor }}
          >
            <Check size={14} className="text-white" aria-hidden="true" />
          </div>
        )}
        {/* Hover overlay — CSS only, no JS state */}
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <span className="text-white text-xs font-medium">Click to select</span>
        </div>
      </div>
      <p className="text-xs font-medium text-[#2D2D2D] mt-1.5 text-center truncate">
        {theme.name}
      </p>
      <p className="text-[10px] text-[#9B9B9B] text-center line-clamp-1">
        {theme.description}
      </p>
    </div>
  );
}

export default function BuilderTemplate({ selected, onSelect, onBack, onGenerate }: BuilderTemplateProps) {
  /** Memoize themes array so it doesn't re-create on every render */
  const themes = useMemo(() => Object.values(THEMES), []);

  return (
    <div className="flex flex-col h-full bg-[#FFF8F0]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#F0F0F0] flex items-center justify-between bg-white">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            aria-label="Go back"
            className="p-2 rounded-lg hover:bg-[#F0F0F0] text-[#6B6B6B] transition-colors"
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <div>
            <h2 className="font-display text-xl font-semibold text-[#2D2D2D]">
              Step 2: Choose Style
            </h2>
            <p className="text-xs text-[#9B9B9B]">
              Pick a starting point — customize everything later
            </p>
          </div>
        </div>
        <button
          onClick={onGenerate}
          className="px-6 py-2 bg-[#F4C2A1] text-white font-body text-sm font-semibold rounded-lg hover:brightness-105 flex items-center gap-1.5 transition-all"
        >
          <Sparkles size={14} aria-hidden="true" /> Continue to Editor
        </button>
      </div>

      {/* Template Grid */}
      <div className="flex-1 overflow-auto p-6">
        <div className={`${GRID_COLUMNS} max-w-[1400px] mx-auto`}>
          {themes.map((t) => (
            <TemplateCard
              key={t.type}
              theme={t}
              isSelected={selected === t.type}
              onSelect={() => onSelect(t.type)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
