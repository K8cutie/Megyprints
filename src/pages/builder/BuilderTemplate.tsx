import { useMemo, useCallback } from 'react';
import { Check, ChevronLeft, Sparkles, EyeOff } from 'lucide-react';
import type { TemplateType } from './types';
import { THEMES } from './types';
import { PAGE_TEMPLATES, hasQrSlot, photoSlotCount } from './pageTemplates';

interface BuilderTemplateProps {
  selected: TemplateType;
  onSelect: (t: TemplateType) => void;
  onBack: () => void;
  onGenerate: () => void;
  onGenerateFull?: () => void;
  rejectedIds?: string[];
  onHideTemplate?: (id: string) => void;
  onUnhideAll?: () => void;
  preferredSlotCount?: number | null;
  onPreferredSlotCountChange?: (count: number | null) => void;
}

/** Grid column class */
const GRID_COLUMNS = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4';

/** Single template card */
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
        {/* Hover overlay */}
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

/** Page template preview card — shows actual layout geometry */
function PageTemplatePreview({
  template,
  isHidden,
  onHide,
}: {
  template: typeof PAGE_TEMPLATES[0];
  isHidden: boolean;
  onHide: () => void;
}) {
  return (
    <div className={`relative group ${isHidden ? 'opacity-40 grayscale' : ''}`}>
      {/* Mini canvas showing slot layout */}
      <div className="relative aspect-[3/4] rounded-xl overflow-hidden border border-[#E8E8E8] bg-[#FFFBF7]">
        {template.slots.map((slot) => (
          <div
            key={slot.id}
            className="absolute"
            style={{
              left: `${slot.x}%`,
              top: `${slot.y}%`,
              width: `${slot.width}%`,
              height: `${slot.height}%`,
              transform: slot.rotation ? `rotate(${slot.rotation}deg)` : undefined,
              borderRadius: slot.shape === 'circle' || slot.shape === 'oval'
                ? '50%'
                : slot.shape === 'rounded'
                ? `${slot.borderRadius ?? 4}px`
                : slot.shape === 'heart'
                ? undefined
                : '2px',
              border: slot.borderWidth
                ? `${slot.borderWidth}px solid ${slot.borderColor || '#fff'}`
                : '1px solid #E8E8E8',
              backgroundColor: slot.shape === 'heart'
                ? '#F4C2A1'
                : slot.shape === 'star'
                ? '#B8A9D9'
                : '#F0F0F0',
              clipPath: slot.shape === 'heart'
                ? 'path("M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z")'
                : slot.shape === 'star'
                ? 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)'
                : undefined,
            }}
          />
        ))}

        {/* Hide button */}
        <button
          onClick={(e) => { e.stopPropagation(); onHide(); }}
          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white/90 shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50"
          title={isHidden ? 'Template hidden from generation' : 'Hide this template'}
        >
          <EyeOff size={12} className={isHidden ? 'text-red-400' : 'text-[#9B9B9B]'} />
        </button>

        {isHidden && (
          <div className="absolute inset-0 bg-black/10 flex items-center justify-center">
            <span className="text-[10px] font-medium text-[#6B6B6B] bg-white/80 px-2 py-0.5 rounded-full">
              Hidden
            </span>
          </div>
        )}
      </div>
      <p className="text-[10px] font-medium text-[#2D2D2D] mt-1 text-center truncate">
        {template.name}
      </p>
      <p className="text-[9px] text-[#9B9B9B] text-center">
        {photoSlotCount(template)} photo{photoSlotCount(template) > 1 ? 's' : ''}{hasQrSlot(template) ? ' + QR' : ''}
      </p>
    </div>
  );
}

export default function BuilderTemplate({
  selected,
  onSelect,
  onBack,
  onGenerate,
  onGenerateFull,
  rejectedIds = [],
  onHideTemplate,
  onUnhideAll,
  preferredSlotCount,
  onPreferredSlotCountChange,
}: BuilderTemplateProps) {
  const themes = useMemo(() => Object.values(THEMES), []);
  const hiddenCount = rejectedIds.length;

  // Filter templates by slot count preference
  const filteredTemplates = useMemo(() => {
    if (preferredSlotCount === undefined || preferredSlotCount === null) return PAGE_TEMPLATES;
    return PAGE_TEMPLATES.filter((t) => photoSlotCount(t) === preferredSlotCount);
  }, [preferredSlotCount]);

  // Slot count options
  const slotOptions = [1, 2, 3, 4, 5];

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
              Pick a starting point — hide layouts you don't like
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {hiddenCount > 0 && onUnhideAll && (
            <button
              onClick={onUnhideAll}
              className="text-xs text-[#9B9B9B] hover:text-[#F4C2A1] underline transition-colors"
            >
              Unhide all ({hiddenCount})
            </button>
          )}
          <button
            onClick={onGenerate}
            className="px-6 py-2 bg-[#F4C2A1] text-white font-body text-sm font-semibold rounded-lg hover:brightness-105 flex items-center gap-1.5 transition-all"
          >
            <Sparkles size={14} aria-hidden="true" /> Apply to Current Page
          </button>
          {onGenerateFull && (
            <button
              onClick={onGenerateFull}
              className="px-4 py-2 bg-white border border-[#E8E8E8] text-[#6B6B6B] font-body text-xs font-semibold rounded-lg hover:bg-[#F5F5F5] flex items-center gap-1.5 transition-all"
            >
              <Sparkles size={12} aria-hidden="true" /> Generate Full Album
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {/* Theme selector */}
        <div className="p-6 border-b border-[#F0F0F0]">
          <h3 className="text-sm font-semibold text-[#2D2D2D] mb-4">Theme</h3>
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

        {/* Slot count preference */}
        <div className="p-6 border-b border-[#F0F0F0] bg-white">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-[#2D2D2D]">Slot Count</h3>
            <p className="text-xs text-[#9B9B9B]">
              {filteredTemplates.length} layout{filteredTemplates.length !== 1 ? 's' : ''} match
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* All option */}
            <button
              onClick={() => onPreferredSlotCountChange?.(null)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                preferredSlotCount === undefined || preferredSlotCount === null
                  ? 'bg-[#F4C2A1] text-white shadow-sm'
                  : 'bg-[#F5F5F5] text-[#6B6B6B] hover:bg-[#E8E8E8]'
              }`}
            >
              All
            </button>
            {slotOptions.map((count) => (
              <button
                key={count}
                onClick={() => onPreferredSlotCountChange?.(count)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  preferredSlotCount === count
                    ? 'bg-[#F4C2A1] text-white shadow-sm'
                    : 'bg-[#F5F5F5] text-[#6B6B6B] hover:bg-[#E8E8E8]'
                }`}
              >
                {count} slot{count > 1 ? 's' : ''}
              </button>
            ))}
          </div>
        </div>

        {/* Page template preview — with hide buttons */}
        {onHideTemplate && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[#2D2D2D]">
                Layouts ({filteredTemplates.length - hiddenCount} active)
              </h3>
              <p className="text-xs text-[#9B9B9B]">
                Hover and click the eye icon to hide a layout from generation
              </p>
            </div>
            <div className={`${GRID_COLUMNS} max-w-[1400px] mx-auto`}>
              {filteredTemplates.map((template) => (
                <PageTemplatePreview
                  key={template.id}
                  template={template}
                  isHidden={rejectedIds.includes(template.id)}
                  onHide={() => onHideTemplate(template.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
