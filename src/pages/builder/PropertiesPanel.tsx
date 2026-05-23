import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Type, Trash2, Copy, ArrowUp, ArrowDown,
  Sun, Moon, Contrast, Droplets, Sparkles, RotateCcw,
  ChevronDown, Palette, Frame, ZoomIn, Move, Replace,
} from 'lucide-react';
import type { CanvasPhoto, TextElement, PhotoFilters, AlbumBackground, UploadedPhoto } from './types';
import { FILTER_PRESETS, DEFAULT_FILTERS, DEFAULT_BG_FILTERS } from './types';
import BackgroundDesigner from './BackgroundDesigner';

/* ── Filter Slider ── */
function FilterSlider({
  label, value, min, max, icon, onChange,
}: {
  label: string; value: number; min: number; max: number;
  icon: React.ReactNode; onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-[#9B9B9B] w-4 flex-shrink-0">{icon}</span>
      <span className="text-[11px] text-[#6B6B6B] w-14 flex-shrink-0">{label}</span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-1 accent-[#F4C2A1]" />
      <span className="text-[10px] text-[#9B9B9B] w-7 text-right">{value}</span>
    </div>
  );
}

/* ── Filter Presets ── */
function FilterPresetButtons({ current, onPreset }: { current: PhotoFilters; onPreset: (name: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1 mb-3">
      {FILTER_PRESETS.map((preset) => {
        const isActive = Object.entries(preset.filters).every(([key, val]) => {
          if (val === undefined) return true;
          return (current as unknown as Record<string, unknown>)[key] === val;
        });
        return (
          <button key={preset.name} onClick={() => onPreset(preset.name)}
            className="py-1.5 px-1 rounded-md text-[10px] font-medium transition-all"
            style={{ backgroundColor: isActive ? '#F4C2A1' : '#F0F0F0', color: isActive ? '#fff' : '#6B6B6B' }}>
            {preset.name}
          </button>
        );
      })}
    </div>
  );
}

/* ── Extended background type with transforms for editing ── */
type EditableBackground = AlbumBackground & {
  x: number; y: number; width: number; height: number; rotation: number;
  filters: PhotoFilters; opacity: number;
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
  onUpdateBackgroundTransform: (updates: Partial<Pick<AlbumBackground, 'x' | 'y' | 'width' | 'height' | 'rotation'>>) => void;
  onUpdateBackgroundFilters: (filters: Partial<PhotoFilters>) => void;
  onClearSlot: (slotIndex: number) => void;
  onSetSlotScale: (slotIndex: number, scale: number) => void;
  onSetSlotOffset: (slotIndex: number, dx: number, dy: number) => void;
  onReplaceSlotPhoto: () => void;
}

/* ── Main ── */
export default function PropertiesPanel(props: PropertiesPanelProps) {
  const [expanded, setExpanded] = useState<string>('filters');
  const toggle = (id: string) => setExpanded(expanded === id ? '' : id);

  const {
    selectedPhoto, selectedText, selectedBackground, background,
    selectedSlotIndex, slotFills, slotScales, slotOffsetsX, slotOffsetsY, uploadedPhotos,
    onUpdatePhoto, onUpdateFilters, onUpdateText,
    onDeletePhoto, onDeleteText, onDuplicatePhoto, onBringToFront, onSendToBack,
    onUpdateBackground, onUpdateBackgroundTransform, onUpdateBackgroundFilters,
    onClearSlot, onSetSlotScale, onSetSlotOffset, onReplaceSlotPhoto,
  } = props;

  /* ── Section wrapper ── */
  const Section = ({ id, title, icon, children }: { id: string; title: string; icon: React.ReactNode; children: React.ReactNode }) => (
    <div className="border-b border-[#F0F0F0] last:border-0">
      <button onClick={() => toggle(id)} className="w-full flex items-center justify-between py-2.5 text-left">
        <span className="flex items-center gap-2 text-xs font-semibold text-[#2D2D2D]">{icon} {title}</span>
        <ChevronDown size={14} className="text-[#9B9B9B] transition-transform" style={{ transform: expanded === id ? 'rotate(180deg)' : 'rotate(0deg)' }} />
      </button>
      <AnimatePresence>
        {expanded === id && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }} className="overflow-hidden pb-3">
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  /* ── Background selected ── */
  if (selectedBackground) {
    const bg = selectedBackground;
    const f = bg.filters;
    return (
      <div className="w-full h-full overflow-y-auto px-3 py-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-sm font-semibold text-[#2D2D2D]">Background</h3>
          <button onClick={() => onUpdateBackground({ ...background, x: 0, y: 0, width: undefined, height: undefined, rotation: 0 })}
            className="px-2 py-1 text-[10px] rounded-md bg-[#F0F0F0] text-[#6B6B6B] hover:bg-[#FDE8E4] transition-colors">
            Reset Transform
          </button>
        </div>

        <Section id="bgFilters" title="Filters" icon={<Sparkles size={14} />}>
          <FilterPresetButtons
            current={f}
            onPreset={(name) => {
              const preset = FILTER_PRESETS.find((p) => p.name === name);
              if (preset) onUpdateBackgroundFilters({ ...DEFAULT_BG_FILTERS, ...preset.filters });
            }}
          />
          <FilterSlider label="Grayscale" value={f.grayscale} min={0} max={100} icon={<Moon size={12} />} onChange={(v) => onUpdateBackgroundFilters({ grayscale: v })} />
          <FilterSlider label="Sepia" value={f.sepia} min={0} max={100} icon={<Sun size={12} />} onChange={(v) => onUpdateBackgroundFilters({ sepia: v })} />
          <FilterSlider label="Brightness" value={f.brightness} min={0} max={200} icon={<Sun size={12} />} onChange={(v) => onUpdateBackgroundFilters({ brightness: v })} />
          <FilterSlider label="Contrast" value={f.contrast} min={0} max={200} icon={<Contrast size={12} />} onChange={(v) => onUpdateBackgroundFilters({ contrast: v })} />
          <FilterSlider label="Saturate" value={f.saturate} min={0} max={200} icon={<Droplets size={12} />} onChange={(v) => onUpdateBackgroundFilters({ saturate: v })} />
          <FilterSlider label="Blur" value={f.blur} min={0} max={10} icon={<Droplets size={12} />} onChange={(v) => onUpdateBackgroundFilters({ blur: v })} />
          <FilterSlider label="Hue" value={f.hueRotate} min={0} max={360} icon={<Palette size={12} />} onChange={(v) => onUpdateBackgroundFilters({ hueRotate: v })} />
          <FilterSlider label="Opacity" value={bg.opacity} min={0} max={100} icon={<Droplets size={12} />} onChange={(v) => onUpdateBackground({ ...background, opacity: v })} />
          <button onClick={() => onUpdateBackgroundFilters({ ...DEFAULT_BG_FILTERS })}
            className="w-full mt-2 py-1.5 text-xs text-[#6B6B6B] hover:text-[#E8A598] flex items-center justify-center gap-1 transition-colors">
            <RotateCcw size={12} /> Reset All Filters
          </button>
        </Section>

        <Section id="bgPosition" title="Position & Size" icon={<Frame size={14} />}>
          <div className="grid grid-cols-2 gap-2 mb-2">
            {(['x', 'y', 'width', 'height'] as const).map((k) => (
              <div key={k}>
                <label className="text-[10px] text-[#9B9B9B]">{k.toUpperCase()}</label>
                <input type="number" value={Math.round(bg[k])}
                  onChange={(e) => onUpdateBackgroundTransform({ [k]: Number(e.target.value) })}
                  className="w-full text-xs border border-[#E8E8E8] rounded-md px-2 py-1" />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-[#9B9B9B]">Rotation</label>
            <input type="range" min="-180" max="180" value={bg.rotation}
              onChange={(e) => onUpdateBackgroundTransform({ rotation: Number(e.target.value) })}
              className="flex-1 h-1 accent-[#F4C2A1]" />
            <span className="text-[10px] text-[#9B9B9B] w-8 text-right">{bg.rotation}°</span>
          </div>
        </Section>

        <Section id="bgType" title="Background Type" icon={<Palette size={14} />}>
          <BackgroundDesigner background={background} onChange={onUpdateBackground} />
        </Section>
      </div>
    );
  }

  /* ── No selection: page properties ── */
  if (!selectedPhoto && !selectedText && selectedSlotIndex === null) {
    return (
      <div className="w-full h-full overflow-y-auto px-3 py-4">
        <h3 className="font-display text-sm font-semibold text-[#2D2D2D] mb-3">Page Properties</h3>
        <BackgroundDesigner background={background} onChange={onUpdateBackground} />
      </div>
    );
  }

  /* ── Slot photo selected ── */
  if (selectedSlotIndex !== null && slotFills[selectedSlotIndex] !== null && uploadedPhotos) {
    const photoIndex = slotFills[selectedSlotIndex];
    const photo = photoIndex !== null ? uploadedPhotos[photoIndex] : null;
    const currentScale = slotScales[selectedSlotIndex] ?? 1;
    const currentOffsetX = slotOffsetsX[selectedSlotIndex] ?? 0;
    const currentOffsetY = slotOffsetsY[selectedSlotIndex] ?? 0;

    if (!photo) {
      return (
        <div className="w-full h-full overflow-y-auto px-3 py-4">
          <h3 className="font-display text-sm font-semibold text-[#2D2D2D] mb-3">Slot {selectedSlotIndex + 1}</h3>
          <p className="text-xs text-[#9B9B9B]">Photo not found.</p>
        </div>
      );
    }

    return (
      <div className="w-full h-full overflow-y-auto px-3 py-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-sm font-semibold text-[#2D2D2D]">Slot {selectedSlotIndex + 1}</h3>
          <div className="flex gap-1">
            <button onClick={onReplaceSlotPhoto} title="Replace photo" className="p-1.5 rounded-md hover:bg-[#F0F0F0] text-[#6B6B6B]"><Replace size={14} /></button>
            <button onClick={() => onClearSlot(selectedSlotIndex)} title="Clear slot" className="p-1.5 rounded-md hover:bg-[#FDE8E4] text-[#E8A598]"><Trash2 size={14} /></button>
          </div>
        </div>

        <div className="mb-3 rounded-lg overflow-hidden border border-[#E8E8E8]">
          <img src={photo.previewUrl} alt={photo.name} className="w-full aspect-square object-cover" />
          <p className="text-[10px] text-[#9B9B9B] px-2 py-1 truncate bg-white">{photo.name}</p>
        </div>

        <Section id="slotZoom" title="Zoom" icon={<ZoomIn size={14} />}>
          <div className="flex items-center gap-2 mb-2">
            <input
              type="range" min={0.1} max={10} step={0.05}
              value={currentScale}
              onChange={(e) => onSetSlotScale(selectedSlotIndex, Number(e.target.value))}
              className="flex-1 h-1 accent-[#F4C2A1]"
            />
            <span className="text-[10px] text-[#9B9B9B] w-10 text-right">{Math.round(currentScale * 100)}%</span>
          </div>
          <p className="text-[10px] text-[#9B9B9B]">Drag corner handles on the canvas to zoom in or out.</p>
        </Section>

        <Section id="slotPan" title="Pan" icon={<Move size={14} />}>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <label className="text-[10px] text-[#9B9B9B]">Offset X</label>
              <input
                type="number" value={Math.round(currentOffsetX)}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  const delta = val - currentOffsetX;
                  onSetSlotOffset(selectedSlotIndex, delta, 0);
                }}
                className="w-full text-xs border border-[#E8E8E8] rounded-md px-2 py-1"
              />
            </div>
            <div>
              <label className="text-[10px] text-[#9B9B9B]">Offset Y</label>
              <input
                type="number" value={Math.round(currentOffsetY)}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  const delta = val - currentOffsetY;
                  onSetSlotOffset(selectedSlotIndex, 0, delta);
                }}
                className="w-full text-xs border border-[#E8E8E8] rounded-md px-2 py-1"
              />
            </div>
          </div>
          <p className="text-[10px] text-[#9B9B9B]">Shift the photo within its slot frame.</p>
        </Section>
      </div>
    );
  }

  /* ── Photo selected ── */
  if (selectedPhoto) {
    const f = selectedPhoto.filters;
    return (
      <div className="w-full h-full overflow-y-auto px-3 py-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-sm font-semibold text-[#2D2D2D]">Photo</h3>
          <div className="flex gap-1">
            <button onClick={() => onBringToFront(selectedPhoto.id)} title="Bring to front" className="p-1.5 rounded-md hover:bg-[#F0F0F0] text-[#6B6B6B]"><ArrowUp size={14} /></button>
            <button onClick={() => onSendToBack(selectedPhoto.id)} title="Send to back" className="p-1.5 rounded-md hover:bg-[#F0F0F0] text-[#6B6B6B]"><ArrowDown size={14} /></button>
            <button onClick={() => onDuplicatePhoto(selectedPhoto.id)} title="Duplicate" className="p-1.5 rounded-md hover:bg-[#F0F0F0] text-[#6B6B6B]"><Copy size={14} /></button>
            <button onClick={() => onDeletePhoto(selectedPhoto.id)} title="Delete" className="p-1.5 rounded-md hover:bg-[#FDE8E4] text-[#E8A598]"><Trash2 size={14} /></button>
          </div>
        </div>

        <Section id="filters" title="Filters" icon={<Sparkles size={14} />}>
          <FilterPresetButtons
            current={f}
            onPreset={(name) => {
              const preset = FILTER_PRESETS.find((p) => p.name === name);
              if (preset) onUpdateFilters(selectedPhoto.id, { ...DEFAULT_FILTERS, ...preset.filters });
            }}
          />
          <FilterSlider label="Grayscale" value={f.grayscale} min={0} max={100} icon={<Moon size={12} />} onChange={(v) => onUpdateFilters(selectedPhoto.id, { grayscale: v })} />
          <FilterSlider label="Sepia" value={f.sepia} min={0} max={100} icon={<Sun size={12} />} onChange={(v) => onUpdateFilters(selectedPhoto.id, { sepia: v })} />
          <FilterSlider label="Brightness" value={f.brightness} min={0} max={200} icon={<Sun size={12} />} onChange={(v) => onUpdateFilters(selectedPhoto.id, { brightness: v })} />
          <FilterSlider label="Contrast" value={f.contrast} min={0} max={200} icon={<Contrast size={12} />} onChange={(v) => onUpdateFilters(selectedPhoto.id, { contrast: v })} />
          <FilterSlider label="Saturate" value={f.saturate} min={0} max={200} icon={<Droplets size={12} />} onChange={(v) => onUpdateFilters(selectedPhoto.id, { saturate: v })} />
          <FilterSlider label="Blur" value={f.blur} min={0} max={10} icon={<Droplets size={12} />} onChange={(v) => onUpdateFilters(selectedPhoto.id, { blur: v })} />
          <FilterSlider label="Hue" value={f.hueRotate} min={0} max={360} icon={<Palette size={12} />} onChange={(v) => onUpdateFilters(selectedPhoto.id, { hueRotate: v })} />
          <FilterSlider label="Opacity" value={f.opacity} min={0} max={100} icon={<Droplets size={12} />} onChange={(v) => onUpdateFilters(selectedPhoto.id, { opacity: v })} />
          <button onClick={() => onUpdateFilters(selectedPhoto.id, { ...DEFAULT_FILTERS })}
            className="w-full mt-2 py-1.5 text-xs text-[#6B6B6B] hover:text-[#E8A598] flex items-center justify-center gap-1 transition-colors">
            <RotateCcw size={12} /> Reset All Filters
          </button>
        </Section>

        <Section id="position" title="Position & Size" icon={<Frame size={14} />}>
          <div className="grid grid-cols-2 gap-2 mb-2">
            {(['x', 'y', 'width', 'height'] as const).map((k) => (
              <div key={k}>
                <label className="text-[10px] text-[#9B9B9B]">{k.toUpperCase()}</label>
                <input type="number" value={Math.round(selectedPhoto[k])}
                  onChange={(e) => onUpdatePhoto(selectedPhoto.id, { [k]: Number(e.target.value) })}
                  className="w-full text-xs border border-[#E8E8E8] rounded-md px-2 py-1" />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-[#9B9B9B]">Rotation</label>
            <input type="range" min="-180" max="180" value={selectedPhoto.rotation}
              onChange={(e) => onUpdatePhoto(selectedPhoto.id, { rotation: Number(e.target.value) })}
              className="flex-1 h-1 accent-[#F4C2A1]" />
            <span className="text-[10px] text-[#9B9B9B] w-8 text-right">{selectedPhoto.rotation}°</span>
          </div>
        </Section>
      </div>
    );
  }

  /* ── Text selected ── */
  if (selectedText) {
    return (
      <div className="w-full h-full overflow-y-auto px-3 py-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-sm font-semibold text-[#2D2D2D]">Text</h3>
          <button onClick={() => onDeleteText(selectedText.id)} className="p-1.5 rounded-md hover:bg-[#FDE8E4] text-[#E8A598]"><Trash2 size={14} /></button>
        </div>
        <Section id="textContent" title="Content" icon={<Type size={14} />}>
          <textarea value={selectedText.text} onChange={(e) => onUpdateText(selectedText.id, { text: e.target.value })}
            className="w-full text-xs border border-[#E8E8E8] rounded-md px-2 py-1.5 resize-none h-16" />
        </Section>
        <Section id="textStyle" title="Style" icon={<Palette size={14} />}>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <label className="text-[10px] text-[#9B9B9B]">Size</label>
              <input type="number" value={selectedText.fontSize}
                onChange={(e) => onUpdateText(selectedText.id, { fontSize: Number(e.target.value) })}
                className="w-full text-xs border border-[#E8E8E8] rounded-md px-2 py-1" />
            </div>
            <div>
              <label className="text-[10px] text-[#9B9B9B]">Color</label>
              <input type="color" value={selectedText.color}
                onChange={(e) => onUpdateText(selectedText.id, { color: e.target.value })}
                className="w-full h-7 rounded-md border border-[#E8E8E8]" />
            </div>
          </div>
          <div className="flex gap-1">
            {(['left', 'center', 'right'] as const).map((align) => (
              <button key={align} onClick={() => onUpdateText(selectedText.id, { alignment: align })}
                className="flex-1 py-1 text-[10px] rounded-md font-medium capitalize transition-colors"
                style={{ backgroundColor: selectedText.alignment === align ? '#F4C2A1' : '#F0F0F0', color: selectedText.alignment === align ? '#fff' : '#6B6B6B' }}>
                {align}
              </button>
            ))}
          </div>
        </Section>
      </div>
    );
  }

  return null;
}
