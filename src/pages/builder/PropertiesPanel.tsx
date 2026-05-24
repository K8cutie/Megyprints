import { useState, useMemo, useId, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Type, Trash2, Copy, ArrowUp, ArrowDown,
  Sun, Moon, Contrast, Droplets, Sparkles, RotateCcw,
  ChevronDown, Palette, Frame, ZoomIn, Move, Replace,
} from 'lucide-react';
import type { CanvasPhoto, TextElement, PhotoFilters, AlbumBackground, UploadedPhoto } from './types';
import { FILTER_PRESETS, DEFAULT_FILTERS, DEFAULT_BG_FILTERS } from './types';
import BackgroundDesigner from './BackgroundDesigner';

/* ── Types ── */

/** Numeric filter keys that have slider controls */
type FilterKey = 'grayscale' | 'sepia' | 'brightness' | 'contrast' | 'saturate' | 'blur' | 'hueRotate' | 'opacity';

/** Config entry that drives every FilterSlider via map() instead of copy-paste */
interface FilterConfigEntry {
  key: FilterKey;
  label: string;
  min: number;
  max: number;
  icon: React.ReactNode;
}

/** Filter presets are partial filters applied on top of defaults */
type FilterPreset = {
  name: string;
  filters: Partial<PhotoFilters>;
};

/* ── Constants ── */

/** Single source of truth for the 8 filter sliders */
const FILTER_CONFIG: FilterConfigEntry[] = [
  { key: 'grayscale', label: 'Grayscale', min: 0, max: 100, icon: <Moon size={12} aria-hidden="true" /> },
  { key: 'sepia', label: 'Sepia', min: 0, max: 100, icon: <Sun size={12} aria-hidden="true" /> },
  { key: 'brightness', label: 'Brightness', min: 0, max: 200, icon: <Sun size={12} aria-hidden="true" /> },
  { key: 'contrast', label: 'Contrast', min: 0, max: 200, icon: <Contrast size={12} aria-hidden="true" /> },
  { key: 'saturate', label: 'Saturate', min: 0, max: 200, icon: <Droplets size={12} aria-hidden="true" /> },
  { key: 'blur', label: 'Blur', min: 0, max: 10, icon: <Droplets size={12} aria-hidden="true" /> },
  { key: 'hueRotate', label: 'Hue', min: 0, max: 360, icon: <Palette size={12} aria-hidden="true" /> },
  { key: 'opacity', label: 'Opacity', min: 0, max: 100, icon: <Droplets size={12} aria-hidden="true" /> },
];

/* ── Filter Slider ── */

function FilterSlider({
  label,
  value,
  min,
  max,
  icon,
  onChange,
  inputId,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  icon: React.ReactNode;
  onChange: (v: number) => void;
  inputId: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-[#9B9B9B] w-4 flex-shrink-0">{icon}</span>
      <label htmlFor={inputId} className="text-[11px] text-[#6B6B6B] w-14 flex-shrink-0">
        {label}
      </label>
      <input
        id={inputId}
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-1 accent-[#F4C2A1]"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={`${label}: ${value}`}
      />
      <span className="text-[10px] text-[#9B9B9B] w-7 text-right">{value}</span>
    </div>
  );
}

/* ── Filter Presets ── */

function FilterPresetButtons({
  current,
  onPreset,
}: {
  current: PhotoFilters;
  onPreset: (name: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-1 mb-3">
      {FILTER_PRESETS.map((preset: FilterPreset) => {
        // Type-safe iteration over preset filter entries — no `as unknown` hack
        const isActive = (
          Object.entries(preset.filters) as [FilterKey, number | undefined][]
        ).every(([key, val]) => val === undefined || current[key] === val);

        return (
          <button
            key={preset.name}
            onClick={() => onPreset(preset.name)}
            className="py-1.5 px-1 rounded-md text-[10px] font-medium transition-all"
            style={{
              backgroundColor: isActive ? '#F4C2A1' : '#F0F0F0',
              color: isActive ? '#fff' : '#6B6B6B',
            }}
            aria-pressed={isActive}
            aria-label={`Apply ${preset.name} filter preset`}
          >
            {preset.name}
          </button>
        );
      })}
    </div>
  );
}

/* ── Filter Section (replaces duplicated slider blocks) ── */

interface FilterSectionProps {
  title: string;
  filters: PhotoFilters;
  onUpdate: (filters: Partial<PhotoFilters>) => void;
  onReset: () => void;
  presets?: FilterPreset[];
}

function FilterSection({
  title,
  filters,
  onUpdate,
  onReset,
  presets,
}: FilterSectionProps) {
  const baseId = useId();

  return (
    <div>
      {presets && presets.length > 0 && (
        <FilterPresetButtons
          current={filters}
          onPreset={(name) => {
            const preset = presets.find((p) => p.name === name);
            if (preset) onUpdate({ ...DEFAULT_FILTERS, ...preset.filters });
          }}
        />
      )}
      {FILTER_CONFIG.map(({ key, label, min, max, icon: filterIcon }) => (
        <FilterSlider
          key={key}
          inputId={`${baseId}-${key}`}
          label={label}
          value={filters[key]}
          min={min}
          max={max}
          icon={filterIcon}
          onChange={(v) => onUpdate({ [key]: v } as Partial<PhotoFilters>)}
        />
      ))}
      <button
        onClick={onReset}
        className="w-full mt-2 py-1.5 text-xs text-[#6B6B6B] hover:text-[#E8A598] flex items-center justify-center gap-1 transition-colors"
        aria-label={`Reset all ${title.toLowerCase()}`}
      >
        <RotateCcw size={12} aria-hidden="true" />
        Reset All Filters
      </button>
    </div>
  );
}

/* ── Section wrapper ── */

function Section({
  id,
  title,
  icon,
  expanded,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-[#F0F0F0] last:border-0">
      <button
        onClick={() => onToggle(id)}
        className="w-full flex items-center justify-between py-2.5 text-left"
        aria-expanded={expanded}
        aria-controls={`section-${id}`}
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-[#2D2D2D]">
          {icon} {title}
        </span>
        <ChevronDown
          size={14}
          className="text-[#9B9B9B] transition-transform"
          style={{
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
          aria-hidden="true"
        />
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            id={`section-${id}`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden pb-3"
            role="region"
            aria-label={title}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Extended background type with transforms for editing ── */

type EditableBackground = AlbumBackground & {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  filters: PhotoFilters;
  opacity: number;
};

/* ── Props ── */

interface PropertiesPanelProps {
  selectedPhoto: CanvasPhoto | null;
  selectedText: TextElement | null;
  selectedBackground: EditableBackground | null;
  background: AlbumBackground;
  selectedSlotIndex: number | null;
  slotFills: (number | null)[];
  slotScales: number[];
  slotOffsetsX: number[];
  slotOffsetsY: number[];
  uploadedPhotos: UploadedPhoto[];
  onUpdatePhoto: (id: string, updates: Partial<CanvasPhoto>) => void;
  onUpdateFilters: (id: string, filters: Partial<PhotoFilters>) => void;
  onUpdateText: (id: string, updates: Partial<TextElement>) => void;
  onDeletePhoto: (id: string) => void;
  onDeleteText: (id: string) => void;
  onDuplicatePhoto: (id: string) => void;
  onBringToFront: (id: string) => void;
  onSendToBack: (id: string) => void;
  onUpdateBackground: (bg: AlbumBackground) => void;
  onUpdateBackgroundTransform: (
    updates: Partial<Pick<AlbumBackground, 'x' | 'y' | 'width' | 'height' | 'rotation'>>,
  ) => void;
  onUpdateBackgroundFilters: (filters: Partial<PhotoFilters>) => void;
  onClearSlot: (slotIndex: number) => void;
  onSetSlotScale: (slotIndex: number, scale: number) => void;
  onSetSlotOffset: (slotIndex: number, dx: number, dy: number) => void;
  onReplaceSlotPhoto: () => void;
}

/* ──── Sub-components for each selection state ────
   Extracted so hooks (useMemo, useCallback, useId) are always
   called at the top level of a component render.            ──── */

/* ── Background Panel ── */

function BackgroundPanel({
  bg,
  background,
  expandedSections,
  onToggleSection,
  onUpdateBackground,
  onUpdateBackgroundTransform,
  onUpdateBackgroundFilters,
}: {
  bg: EditableBackground;
  background: AlbumBackground;
  expandedSections: string;
  onToggleSection: (id: string) => void;
  onUpdateBackground: (bg: AlbumBackground) => void;
  onUpdateBackgroundTransform: (
    updates: Partial<Pick<AlbumBackground, 'x' | 'y' | 'width' | 'height' | 'rotation'>>,
  ) => void;
  onUpdateBackgroundFilters: (filters: Partial<PhotoFilters>) => void;
}) {
  // Combine background filters with its opacity so FilterSection can render both
  const combinedBgFilters = useMemo<PhotoFilters>(
    () => ({ ...bg.filters, opacity: bg.opacity }),
    [bg.filters, bg.opacity],
  );

  const handleBgFilterUpdate = useCallback(
    (partial: Partial<PhotoFilters>) => {
      const { opacity: newOpacity, ...filterUpdates } = partial;

      if (newOpacity !== undefined) {
        onUpdateBackground({ ...background, opacity: newOpacity });
      }

      if (Object.keys(filterUpdates).length > 0) {
        onUpdateBackgroundFilters(filterUpdates);
      }
    },
    [background, onUpdateBackground, onUpdateBackgroundFilters],
  );

  const handleBgFilterReset = useCallback(() => {
    onUpdateBackground({ ...background, opacity: 100 });
    onUpdateBackgroundFilters({ ...DEFAULT_BG_FILTERS });
  }, [background, onUpdateBackground, onUpdateBackgroundFilters]);

  const posId = useId();

  return (
    <div className="w-full h-full overflow-y-auto px-3 py-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-sm font-semibold text-[#2D2D2D]">
          Background
        </h3>
        <button
          onClick={() =>
            onUpdateBackground({
              ...background,
              x: 0,
              y: 0,
              width: undefined,
              height: undefined,
              rotation: 0,
            })
          }
          className="px-2 py-1 text-[10px] rounded-md bg-[#F0F0F0] text-[#6B6B6B] hover:bg-[#FDE8E4] transition-colors"
        >
          Reset Transform
        </button>
      </div>

      <Section
        id="bgFilters"
        title="Filters"
        icon={<Sparkles size={14} />}
        expanded={expandedSections === 'bgFilters'}
        onToggle={onToggleSection}
      >
        <FilterSection
          title="Filters"
          filters={combinedBgFilters}
          onUpdate={handleBgFilterUpdate}
          onReset={handleBgFilterReset}
          presets={FILTER_PRESETS}
        />
      </Section>

      <Section
        id="bgPosition"
        title="Position & Size"
        icon={<Frame size={14} />}
        expanded={expandedSections === 'bgPosition'}
        onToggle={onToggleSection}
      >
        <div className="grid grid-cols-2 gap-2 mb-2">
          {(['x', 'y', 'width', 'height'] as const).map((k) => (
            <div key={k}>
              <label
                htmlFor={`${posId}-${k}`}
                className="text-[10px] text-[#9B9B9B]"
              >
                {k.toUpperCase()}
              </label>
              <input
                id={`${posId}-${k}`}
                type="number"
                value={Math.round(bg[k])}
                onChange={(e) =>
                  onUpdateBackgroundTransform({
                    [k]: Number(e.target.value),
                  })
                }
                className="w-full text-xs border border-[#E8E8E8] rounded-md px-2 py-1"
              />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label
            htmlFor={`${posId}-rotation`}
            className="text-[10px] text-[#9B9B9B]"
          >
            Rotation
          </label>
          <input
            id={`${posId}-rotation`}
            type="range"
            min={-180}
            max={180}
            value={bg.rotation}
            onChange={(e) =>
              onUpdateBackgroundTransform({
                rotation: Number(e.target.value),
              })
            }
            className="flex-1 h-1 accent-[#F4C2A1]"
          />
          <span className="text-[10px] text-[#9B9B9B] w-8 text-right">
            {bg.rotation}°
          </span>
        </div>
      </Section>

      <Section
        id="bgType"
        title="Background Type"
        icon={<Palette size={14} />}
        expanded={expandedSections === 'bgType'}
        onToggle={onToggleSection}
      >
        <BackgroundDesigner background={background} onChange={onUpdateBackground} />
      </Section>
    </div>
  );
}

/* ── Page Properties Panel ── */

function PagePropertiesPanel({
  background,
  onUpdateBackground,
}: {
  background: AlbumBackground;
  onUpdateBackground: (bg: AlbumBackground) => void;
}) {
  return (
    <div className="w-full h-full overflow-y-auto px-3 py-4">
      <h3 className="font-display text-sm font-semibold text-[#2D2D2D] mb-3">
        Page Properties
      </h3>
      <BackgroundDesigner background={background} onChange={onUpdateBackground} />
    </div>
  );
}

/* ── Slot Panel ── */

function SlotPanel({
  selectedSlotIndex,
  slotFills,
  slotScales,
  slotOffsetsX,
  slotOffsetsY,
  uploadedPhotos,
  expandedSections,
  onToggleSection,
  onClearSlot,
  onSetSlotScale,
  onSetSlotOffset,
  onReplaceSlotPhoto,
}: {
  selectedSlotIndex: number;
  slotFills: (number | null)[];
  slotScales: number[];
  slotOffsetsX: number[];
  slotOffsetsY: number[];
  uploadedPhotos: UploadedPhoto[];
  expandedSections: string;
  onToggleSection: (id: string) => void;
  onClearSlot: (slotIndex: number) => void;
  onSetSlotScale: (slotIndex: number, scale: number) => void;
  onSetSlotOffset: (slotIndex: number, dx: number, dy: number) => void;
  onReplaceSlotPhoto: () => void;
}) {
  const photoIndex = slotFills[selectedSlotIndex];
  const photo = photoIndex !== null ? uploadedPhotos[photoIndex] : null;
  const currentScale = slotScales[selectedSlotIndex] ?? 1;
  const currentOffsetX = slotOffsetsX[selectedSlotIndex] ?? 0;
  const currentOffsetY = slotOffsetsY[selectedSlotIndex] ?? 0;

  if (!photo) {
    return (
      <div className="w-full h-full overflow-y-auto px-3 py-4">
        <h3 className="font-display text-sm font-semibold text-[#2D2D2D] mb-3">
          Slot {selectedSlotIndex + 1}
        </h3>
        <p className="text-xs text-[#9B9B9B]">Photo not found.</p>
      </div>
    );
  }

  const slotId = useId();

  return (
    <div className="w-full h-full overflow-y-auto px-3 py-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-sm font-semibold text-[#2D2D2D]">
          Slot {selectedSlotIndex + 1}
        </h3>
        <div className="flex gap-1">
          <button
            onClick={onReplaceSlotPhoto}
            aria-label="Replace photo"
            className="p-1.5 rounded-md hover:bg-[#F0F0F0] text-[#6B6B6B]"
          >
            <Replace size={14} aria-hidden="true" />
          </button>
          <button
            onClick={() => onClearSlot(selectedSlotIndex)}
            aria-label="Clear slot"
            className="p-1.5 rounded-md hover:bg-[#FDE8E4] text-[#E8A598]"
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="mb-3 rounded-lg overflow-hidden border border-[#E8E8E8]">
        <img
          src={photo.previewUrl}
          alt={photo.name}
          className="w-full aspect-square object-cover"
        />
        <p className="text-[10px] text-[#9B9B9B] px-2 py-1 truncate bg-white">
          {photo.name}
        </p>
      </div>

      <Section
        id="slotZoom"
        title="Zoom"
        icon={<ZoomIn size={14} />}
        expanded={expandedSections === 'slotZoom'}
        onToggle={onToggleSection}
      >
        <div className="flex items-center gap-2 mb-2">
          <input
            type="range"
            min={0.1}
            max={10}
            step={0.05}
            value={currentScale}
            onChange={(e) =>
              onSetSlotScale(selectedSlotIndex, Number(e.target.value))
            }
            className="flex-1 h-1 accent-[#F4C2A1]"
            aria-label={`Zoom scale: ${Math.round(currentScale * 100)}%`}
          />
          <span className="text-[10px] text-[#9B9B9B] w-10 text-right">
            {Math.round(currentScale * 100)}%
          </span>
        </div>
        <p className="text-[10px] text-[#9B9B9B]">
          Drag corner handles on the canvas to zoom in or out.
        </p>
      </Section>

      <Section
        id="slotPan"
        title="Pan"
        icon={<Move size={14} />}
        expanded={expandedSections === 'slotPan'}
        onToggle={onToggleSection}
      >
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <label
              htmlFor={`${slotId}-offsetX`}
              className="text-[10px] text-[#9B9B9B]"
            >
              Offset X
            </label>
            <input
              id={`${slotId}-offsetX`}
              type="number"
              value={Math.round(currentOffsetX)}
              onChange={(e) => {
                const val = Number(e.target.value);
                const delta = val - currentOffsetX;
                onSetSlotOffset(selectedSlotIndex, delta, 0);
              }}
              className="w-full text-xs border border-[#E8E8E8] rounded-md px-2 py-1"
            />
          </div>
          <div>
            <label
              htmlFor={`${slotId}-offsetY`}
              className="text-[10px] text-[#9B9B9B]"
            >
              Offset Y
            </label>
            <input
              id={`${slotId}-offsetY`}
              type="number"
              value={Math.round(currentOffsetY)}
              onChange={(e) => {
                const val = Number(e.target.value);
                const delta = val - currentOffsetY;
                onSetSlotOffset(selectedSlotIndex, 0, delta);
              }}
              className="w-full text-xs border border-[#E8E8E8] rounded-md px-2 py-1"
            />
          </div>
        </div>
        <p className="text-[10px] text-[#9B9B9B]">
          Shift the photo within its slot frame.
        </p>
      </Section>
    </div>
  );
}

/* ── Photo Panel ── */

function PhotoPanel({
  selectedPhoto,
  expandedSections,
  onToggleSection,
  onUpdatePhoto,
  onUpdateFilters,
  onDeletePhoto,
  onDuplicatePhoto,
  onBringToFront,
  onSendToBack,
}: {
  selectedPhoto: CanvasPhoto;
  expandedSections: string;
  onToggleSection: (id: string) => void;
  onUpdatePhoto: (id: string, updates: Partial<CanvasPhoto>) => void;
  onUpdateFilters: (id: string, filters: Partial<PhotoFilters>) => void;
  onDeletePhoto: (id: string) => void;
  onDuplicatePhoto: (id: string) => void;
  onBringToFront: (id: string) => void;
  onSendToBack: (id: string) => void;
}) {
  const f = selectedPhoto.filters;

  const handlePhotoFilterUpdate = useCallback(
    (partial: Partial<PhotoFilters>) => {
      onUpdateFilters(selectedPhoto.id, partial);
    },
    [onUpdateFilters, selectedPhoto.id],
  );

  const handlePhotoFilterReset = useCallback(() => {
    onUpdateFilters(selectedPhoto.id, { ...DEFAULT_FILTERS });
  }, [onUpdateFilters, selectedPhoto.id]);

  const photoPosId = useId();

  return (
    <div className="w-full h-full overflow-y-auto px-3 py-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-sm font-semibold text-[#2D2D2D]">Photo</h3>
        <div className="flex gap-1">
          <button
            onClick={() => onBringToFront(selectedPhoto.id)}
            aria-label="Bring to front"
            className="p-1.5 rounded-md hover:bg-[#F0F0F0] text-[#6B6B6B]"
          >
            <ArrowUp size={14} aria-hidden="true" />
          </button>
          <button
            onClick={() => onSendToBack(selectedPhoto.id)}
            aria-label="Send to back"
            className="p-1.5 rounded-md hover:bg-[#F0F0F0] text-[#6B6B6B]"
          >
            <ArrowDown size={14} aria-hidden="true" />
          </button>
          <button
            onClick={() => onDuplicatePhoto(selectedPhoto.id)}
            aria-label="Duplicate photo"
            className="p-1.5 rounded-md hover:bg-[#F0F0F0] text-[#6B6B6B]"
          >
            <Copy size={14} aria-hidden="true" />
          </button>
          <button
            onClick={() => onDeletePhoto(selectedPhoto.id)}
            aria-label="Delete photo"
            className="p-1.5 rounded-md hover:bg-[#FDE8E4] text-[#E8A598]"
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </div>
      </div>

      <Section
        id="filters"
        title="Filters"
        icon={<Sparkles size={14} />}
        expanded={expandedSections === 'filters'}
        onToggle={onToggleSection}
      >
        <FilterSection
          title="Filters"
          filters={f}
          onUpdate={handlePhotoFilterUpdate}
          onReset={handlePhotoFilterReset}
          presets={FILTER_PRESETS}
        />
      </Section>

      <Section
        id="position"
        title="Position & Size"
        icon={<Frame size={14} />}
        expanded={expandedSections === 'position'}
        onToggle={onToggleSection}
      >
        <div className="grid grid-cols-2 gap-2 mb-2">
          {(['x', 'y', 'width', 'height'] as const).map((k) => (
            <div key={k}>
              <label
                htmlFor={`${photoPosId}-${k}`}
                className="text-[10px] text-[#9B9B9B]"
              >
                {k.toUpperCase()}
              </label>
              <input
                id={`${photoPosId}-${k}`}
                type="number"
                value={Math.round(selectedPhoto[k])}
                onChange={(e) =>
                  onUpdatePhoto(selectedPhoto.id, {
                    [k]: Number(e.target.value),
                  })
                }
                className="w-full text-xs border border-[#E8E8E8] rounded-md px-2 py-1"
              />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label
            htmlFor={`${photoPosId}-rotation`}
            className="text-[10px] text-[#9B9B9B]"
          >
            Rotation
          </label>
          <input
            id={`${photoPosId}-rotation`}
            type="range"
            min={-180}
            max={180}
            value={selectedPhoto.rotation}
            onChange={(e) =>
              onUpdatePhoto(selectedPhoto.id, {
                rotation: Number(e.target.value),
              })
            }
            className="flex-1 h-1 accent-[#F4C2A1]"
          />
          <span className="text-[10px] text-[#9B9B9B] w-8 text-right">
            {selectedPhoto.rotation}°
          </span>
        </div>
      </Section>
    </div>
  );
}

/* ── Text Panel ── */

function TextPanel({
  selectedText,
  expandedSections,
  onToggleSection,
  onUpdateText,
  onDeleteText,
}: {
  selectedText: TextElement;
  expandedSections: string;
  onToggleSection: (id: string) => void;
  onUpdateText: (id: string, updates: Partial<TextElement>) => void;
  onDeleteText: (id: string) => void;
}) {
  const textId = useId();

  return (
    <div className="w-full h-full overflow-y-auto px-3 py-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-sm font-semibold text-[#2D2D2D]">Text</h3>
        <button
          onClick={() => onDeleteText(selectedText.id)}
          aria-label="Delete text"
          className="p-1.5 rounded-md hover:bg-[#FDE8E4] text-[#E8A598]"
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </div>

      <Section
        id="textContent"
        title="Content"
        icon={<Type size={14} />}
        expanded={expandedSections === 'textContent'}
        onToggle={onToggleSection}
      >
        <label htmlFor={`${textId}-content`} className="sr-only">
          Text content
        </label>
        <textarea
          id={`${textId}-content`}
          value={selectedText.text}
          onChange={(e) =>
            onUpdateText(selectedText.id, { text: e.target.value })
          }
          aria-label="Text content"
          className="w-full text-xs border border-[#E8E8E8] rounded-md px-2 py-1.5 resize-none h-16"
        />
      </Section>

      <Section
        id="textStyle"
        title="Style"
        icon={<Palette size={14} />}
        expanded={expandedSections === 'textStyle'}
        onToggle={onToggleSection}
      >
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <label
              htmlFor={`${textId}-size`}
              className="text-[10px] text-[#9B9B9B]"
            >
              Size
            </label>
            <input
              id={`${textId}-size`}
              type="number"
              value={selectedText.fontSize}
              onChange={(e) =>
                onUpdateText(selectedText.id, {
                  fontSize: Number(e.target.value),
                })
              }
              className="w-full text-xs border border-[#E8E8E8] rounded-md px-2 py-1"
            />
          </div>
          <div>
            <label
              htmlFor={`${textId}-color`}
              className="text-[10px] text-[#9B9B9B]"
            >
              Color
            </label>
            <input
              id={`${textId}-color`}
              type="color"
              value={selectedText.color}
              onChange={(e) =>
                onUpdateText(selectedText.id, { color: e.target.value })
              }
              className="w-full h-7 rounded-md border border-[#E8E8E8]"
            />
          </div>
        </div>
        <div className="flex gap-1">
          {(['left', 'center', 'right'] as const).map((align) => (
            <button
              key={align}
              onClick={() =>
                onUpdateText(selectedText.id, { alignment: align })
              }
              className="flex-1 py-1 text-[10px] rounded-md font-medium capitalize transition-colors"
              style={{
                backgroundColor:
                  selectedText.alignment === align
                    ? '#F4C2A1'
                    : '#F0F0F0',
                color:
                  selectedText.alignment === align ? '#fff' : '#6B6B6B',
              }}
              aria-pressed={selectedText.alignment === align}
              aria-label={`Align ${align}`}
            >
              {align}
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}

/* ── Main ── */

export default function PropertiesPanel(props: PropertiesPanelProps) {
  const [expanded, setExpanded] = useState<string>('filters');
  const toggle = (id: string) => setExpanded((prev) => (prev === id ? '' : id));

  const {
    selectedPhoto,
    selectedText,
    selectedBackground,
    background,
    selectedSlotIndex,
    slotFills,
    slotScales,
    slotOffsetsX,
    slotOffsetsY,
    uploadedPhotos,
    onUpdatePhoto,
    onUpdateFilters,
    onUpdateText,
    onDeletePhoto,
    onDeleteText,
    onDuplicatePhoto,
    onBringToFront,
    onSendToBack,
    onUpdateBackground,
    onUpdateBackgroundTransform,
    onUpdateBackgroundFilters,
    onClearSlot,
    onSetSlotScale,
    onSetSlotOffset,
    onReplaceSlotPhoto,
  } = props;

  /* ──── Route to the correct sub-panel ──── */

  if (selectedBackground) {
    return (
      <BackgroundPanel
        bg={selectedBackground}
        background={background}
        expandedSections={expanded}
        onToggleSection={toggle}
        onUpdateBackground={onUpdateBackground}
        onUpdateBackgroundTransform={onUpdateBackgroundTransform}
        onUpdateBackgroundFilters={onUpdateBackgroundFilters}
      />
    );
  }

  if (!selectedPhoto && !selectedText && selectedSlotIndex === null) {
    return (
      <PagePropertiesPanel
        background={background}
        onUpdateBackground={onUpdateBackground}
      />
    );
  }

  if (
    selectedSlotIndex !== null &&
    slotFills[selectedSlotIndex] !== null &&
    uploadedPhotos
  ) {
    return (
      <SlotPanel
        selectedSlotIndex={selectedSlotIndex}
        slotFills={slotFills}
        slotScales={slotScales}
        slotOffsetsX={slotOffsetsX}
        slotOffsetsY={slotOffsetsY}
        uploadedPhotos={uploadedPhotos}
        expandedSections={expanded}
        onToggleSection={toggle}
        onClearSlot={onClearSlot}
        onSetSlotScale={onSetSlotScale}
        onSetSlotOffset={onSetSlotOffset}
        onReplaceSlotPhoto={onReplaceSlotPhoto}
      />
    );
  }

  if (selectedPhoto) {
    return (
      <PhotoPanel
        selectedPhoto={selectedPhoto}
        expandedSections={expanded}
        onToggleSection={toggle}
        onUpdatePhoto={onUpdatePhoto}
        onUpdateFilters={onUpdateFilters}
        onDeletePhoto={onDeletePhoto}
        onDuplicatePhoto={onDuplicatePhoto}
        onBringToFront={onBringToFront}
        onSendToBack={onSendToBack}
      />
    );
  }

  if (selectedText) {
    return (
      <TextPanel
        selectedText={selectedText}
        expandedSections={expanded}
        onToggleSection={toggle}
        onUpdateText={onUpdateText}
        onDeleteText={onDeleteText}
      />
    );
  }

  return null;
}
