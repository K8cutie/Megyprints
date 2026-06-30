import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Type, Copy, ArrowUp, ArrowDown,
  Sun, Moon, Contrast, Droplets, Sparkles, RotateCcw,
  ChevronDown, Palette, Frame, ZoomIn, Move, Replace,
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  TypeOutline, Trash2, Layers,
} from 'lucide-react';
import type { CanvasPhoto, TextElement, PhotoFilters, AlbumBackground, UploadedPhoto } from './types';
import { FILTER_PRESETS, DEFAULT_FILTERS, DEFAULT_BG_FILTERS } from './types';
import BackgroundDesigner from './BackgroundDesigner';

/* ── Constants ── */

const FONT_FAMILIES = [
  // Sans-serif
  { name: 'DM Sans', value: '"DM Sans", sans-serif', preview: 'Aa' },
  { name: 'Inter', value: '"Inter", sans-serif', preview: 'Aa' },
  { name: 'Montserrat', value: '"Montserrat", sans-serif', preview: 'Aa' },
  { name: 'Poppins', value: '"Poppins", sans-serif', preview: 'Aa' },
  { name: 'Open Sans', value: '"Open Sans", sans-serif', preview: 'Aa' },
  { name: 'Lato', value: '"Lato", sans-serif', preview: 'Aa' },
  { name: 'Nunito', value: '"Nunito", sans-serif', preview: 'Aa' },
  { name: 'Raleway', value: '"Raleway", sans-serif', preview: 'Aa' },
  { name: 'Work Sans', value: '"Work Sans", sans-serif', preview: 'Aa' },
  { name: 'Source Sans 3', value: '"Source Sans 3", sans-serif', preview: 'Aa' },
  { name: 'Outfit', value: '"Outfit", sans-serif', preview: 'Aa' },
  // Serif
  { name: 'Playfair Display', value: '"Playfair Display", serif', preview: 'Aa' },
  { name: 'Lora', value: '"Lora", serif', preview: 'Aa' },
  { name: 'Merriweather', value: '"Merriweather", serif', preview: 'Aa' },
  { name: 'Libre Baskerville', value: '"Libre Baskerville", serif', preview: 'Aa' },
  { name: 'Crimson Text', value: '"Crimson Text", serif', preview: 'Aa' },
  { name: 'Cormorant Garamond', value: '"Cormorant Garamond", serif', preview: 'Aa' },
  { name: 'Georgia', value: 'Georgia, serif', preview: 'Aa' },
  { name: 'Times New Roman', value: '"Times New Roman", serif', preview: 'Aa' },
  // Display / Decorative
  { name: 'Dancing Script', value: '"Dancing Script", cursive', preview: 'Aa' },
  { name: 'Great Vibes', value: '"Great Vibes", cursive', preview: 'Aa' },
  { name: 'Pacifico', value: '"Pacifico", cursive', preview: 'Aa' },
  { name: 'Caveat', value: '"Caveat", cursive', preview: 'Aa' },
  { name: 'Satisfy', value: '"Satisfy", cursive', preview: 'Aa' },
  { name: 'Amatic SC', value: '"Amatic SC", cursive', preview: 'Aa' },
  { name: 'Bebas Neue', value: '"Bebas Neue", sans-serif', preview: 'Aa' },
  { name: 'Abril Fatface', value: '"Abril Fatface", serif', preview: 'Aa' },
  { name: 'Righteous', value: '"Righteous", sans-serif', preview: 'Aa' },
  { name: 'Fredoka', value: '"Fredoka", sans-serif', preview: 'Aa' },
  // Monospace
  { name: 'Courier New', value: '"Courier New", monospace', preview: 'Aa' },
  { name: 'JetBrains Mono', value: '"JetBrains Mono", monospace', preview: 'Aa' },
];

const FONT_SIZE_PRESETS = [12, 16, 20, 24, 32, 48, 64, 96, 120];

const COLOR_PRESETS = [
  '#2D2D2D', '#FFFFFF', '#F4C2A1', '#E8A598', '#B8A9D9',
  '#9BCFB8', '#8FBFE0', '#E8958C', '#D4B896', '#9B9B9B',
  '#C4A882', '#6B6B6B', '#FF6B6B', '#4ECDC4', '#45B7D1',
];

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

/* ── Toggle Button ── */
function ToggleBtn({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex-1 py-1.5 rounded-md text-xs font-medium transition-all border"
      style={{
        backgroundColor: active ? '#F4C2A1' : '#fff',
        color: active ? '#fff' : '#6B6B6B',
        borderColor: active ? '#F4C2A1' : '#E8E8E8',
      }}
    >
      {children}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   FULL-FEATURED TEXT EDITOR
   ═══════════════════════════════════════════════════════════════════ */

function TextEditor({
  text,
  onUpdate,
  onDelete,
}: {
  text: TextElement;
  onUpdate: (id: string, updates: Partial<TextElement>) => void;
  onDelete: (id: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<'content' | 'style' | 'layout'>('content');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus textarea when content tab opens
  useEffect(() => {
    if (activeTab === 'content' && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [activeTab]);

  const update = useCallback((updates: Partial<TextElement>) => {
    onUpdate(text.id, updates);
  }, [text.id, onUpdate]);

  return (
    <div className="w-full h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-[#F0F0F0]">
        <h3 className="font-display text-sm font-semibold text-[#2D2D2D] flex items-center gap-2">
          <TypeOutline size={16} className="text-[#F4C2A1]" />
          Text Editor
        </h3>
        <button
          onClick={() => onDelete(text.id)}
          className="p-1.5 rounded-md hover:bg-[#FDE8E4] text-[#E8A598] transition-colors"
          title="Delete text"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Live Preview */}
      <div className="mx-3 mt-3 p-3 bg-[#FFFBF7] rounded-lg border border-[#F0F0F0]">
        <p
          className="text-center break-words"
          style={{
            fontFamily: text.fontFamily,
            fontSize: Math.min(text.fontSize * 0.4, 28),
            color: text.color,
            fontWeight: text.bold ? 'bold' : 'normal',
            fontStyle: text.italic ? 'italic' : 'normal',
            textDecoration: text.underline ? 'underline' : 'none',
            textAlign: text.alignment,
            opacity: text.opacity / 100,
          }}
        >
          {text.text || 'Your text here'}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 bg-[#F0F0F0] rounded-lg p-0.5 mx-3 mt-3">
        {[
          { id: 'content' as const, label: 'Content', icon: <Type size={12} /> },
          { id: 'style' as const, label: 'Style', icon: <Palette size={12} /> },
          { id: 'layout' as const, label: 'Layout', icon: <Frame size={12} /> },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex-1 py-1.5 rounded-md text-[11px] font-medium transition-all flex items-center justify-center gap-1"
            style={{
              backgroundColor: activeTab === tab.id ? '#fff' : 'transparent',
              color: activeTab === tab.id ? '#2D2D2D' : '#9B9B9B',
              boxShadow: activeTab === tab.id ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ── Content Tab ── */}
      {activeTab === 'content' && (
        <div className="px-3 py-3 space-y-4">
          {/* Text Area */}
          <div>
            <label className="text-[11px] font-medium text-[#6B6B6B] mb-1 block">Text Content</label>
            <textarea
              ref={textareaRef}
              value={text.text}
              onChange={(e) => update({ text: e.target.value })}
              className="w-full text-xs border border-[#E8E8E8] rounded-lg px-3 py-2 resize-none h-24 focus:outline-none focus:border-[#F4C2A1] focus:ring-1 focus:ring-[#F4C2A1]/30 transition-all"
              placeholder="Enter your text here..."
            />
          </div>

          {/* Quick alignment */}
          <div>
            <label className="text-[11px] font-medium text-[#6B6B6B] mb-1 block">Alignment</label>
            <div className="flex gap-1">
              <ToggleBtn active={text.alignment === 'left'} onClick={() => update({ alignment: 'left' })} title="Align left">
                <AlignLeft size={14} className="mx-auto" />
              </ToggleBtn>
              <ToggleBtn active={text.alignment === 'center'} onClick={() => update({ alignment: 'center' })} title="Align center">
                <AlignCenter size={14} className="mx-auto" />
              </ToggleBtn>
              <ToggleBtn active={text.alignment === 'right'} onClick={() => update({ alignment: 'right' })} title="Align right">
                <AlignRight size={14} className="mx-auto" />
              </ToggleBtn>
            </div>
          </div>

          {/* Format toggles */}
          <div>
            <label className="text-[11px] font-medium text-[#6B6B6B] mb-1 block">Formatting</label>
            <div className="flex gap-1">
              <ToggleBtn active={text.bold} onClick={() => update({ bold: !text.bold })} title="Bold">
                <Bold size={14} className="mx-auto" />
              </ToggleBtn>
              <ToggleBtn active={text.italic} onClick={() => update({ italic: !text.italic })} title="Italic">
                <Italic size={14} className="mx-auto" />
              </ToggleBtn>
              <ToggleBtn active={text.underline} onClick={() => update({ underline: !text.underline })} title="Underline">
                <Underline size={14} className="mx-auto" />
              </ToggleBtn>
            </div>
          </div>
        </div>
      )}

      {/* ── Style Tab ── */}
      {activeTab === 'style' && (
        <div className="px-3 py-3 space-y-4">
          {/* Font Family */}
          <div>
            <label className="text-[11px] font-medium text-[#6B6B6B] mb-1 block">Font Family</label>
            <div className="grid grid-cols-3 gap-1 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
              {FONT_FAMILIES.map((font) => (
                <button
                  key={font.value}
                  onClick={() => update({ fontFamily: font.value })}
                  className="py-1.5 px-1 rounded-md text-[10px] transition-all border text-center"
                  style={{
                    fontFamily: font.value,
                    backgroundColor: text.fontFamily === font.value ? '#FDE8E4' : '#fff',
                    borderColor: text.fontFamily === font.value ? '#F4C2A1' : '#E8E8E8',
                    color: text.fontFamily === font.value ? '#E8A598' : '#6B6B6B',
                  }}
                >
                  <span className="text-base block leading-tight">{font.preview}</span>
                  <span className="text-[8px] opacity-70 block truncate">{font.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Font Size */}
          <div>
            <label className="text-[11px] font-medium text-[#6B6B6B] mb-1 block">Size: {text.fontSize}px</label>
            <input
              type="range"
              min={8}
              max={200}
              value={text.fontSize}
              onChange={(e) => update({ fontSize: Number(e.target.value) })}
              className="w-full h-1 accent-[#F4C2A1] mb-2"
            />
            <div className="flex flex-wrap gap-1">
              {FONT_SIZE_PRESETS.map((size) => (
                <button
                  key={size}
                  onClick={() => update({ fontSize: size })}
                  className="px-2 py-0.5 rounded text-[10px] font-medium transition-all"
                  style={{
                    backgroundColor: text.fontSize === size ? '#F4C2A1' : '#F0F0F0',
                    color: text.fontSize === size ? '#fff' : '#6B6B6B',
                  }}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          {/* Color */}
          <div>
            <label className="text-[11px] font-medium text-[#6B6B6B] mb-1 block">Color</label>
            <div className="flex items-center gap-2 mb-2">
              <input
                type="color"
                value={text.color}
                onChange={(e) => update({ color: e.target.value })}
                className="w-10 h-8 rounded-md border border-[#E8E8E8] cursor-pointer"
              />
              <input
                type="text"
                value={text.color}
                onChange={(e) => update({ color: e.target.value })}
                className="flex-1 text-xs border border-[#E8E8E8] rounded-md px-2 py-1"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  onClick={() => update({ color: c })}
                  className="w-6 h-6 rounded-full border-2 transition-all"
                  style={{
                    backgroundColor: c,
                    borderColor: text.color === c ? '#F4C2A1' : '#E8E8E8',
                    transform: text.color === c ? 'scale(1.15)' : 'scale(1)',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Opacity */}
          <div>
            <label className="text-[11px] font-medium text-[#6B6B6B] mb-1 block">Opacity: {text.opacity}%</label>
            <input
              type="range"
              min={0}
              max={100}
              value={text.opacity}
              onChange={(e) => update({ opacity: Number(e.target.value) })}
              className="w-full h-1 accent-[#F4C2A1]"
            />
          </div>
        </div>
      )}

      {/* ── Layout Tab ── */}
      {activeTab === 'layout' && (
        <div className="px-3 py-3 space-y-4">
          {/* Position */}
          <div>
            <label className="text-[11px] font-medium text-[#6B6B6B] mb-1 block">Position</label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-[#9B9B9B]">X</label>
                <input
                  type="number"
                  value={Math.round(text.x)}
                  onChange={(e) => update({ x: Number(e.target.value) })}
                  className="w-full text-xs border border-[#E8E8E8] rounded-md px-2 py-1"
                />
              </div>
              <div>
                <label className="text-[10px] text-[#9B9B9B]">Y</label>
                <input
                  type="number"
                  value={Math.round(text.y)}
                  onChange={(e) => update({ y: Number(e.target.value) })}
                  className="w-full text-xs border border-[#E8E8E8] rounded-md px-2 py-1"
                />
              </div>
            </div>
          </div>

          {/* Rotation */}
          <div>
            <label className="text-[11px] font-medium text-[#6B6B6B] mb-1 flex items-center gap-1">
              <RotateCcw size={12} /> Rotation: {text.rotation}°
            </label>
            <input
              type="range"
              min={-180}
              max={180}
              value={text.rotation}
              onChange={(e) => update({ rotation: Number(e.target.value) })}
              className="w-full h-1 accent-[#F4C2A1]"
            />
            <div className="flex gap-1 mt-1">
              {[0, 45, 90, -45, -90, 180].map((deg) => (
                <button
                  key={deg}
                  onClick={() => update({ rotation: deg })}
                  className="flex-1 py-0.5 rounded text-[9px] font-medium transition-all"
                  style={{
                    backgroundColor: text.rotation === deg ? '#F4C2A1' : '#F0F0F0',
                    color: text.rotation === deg ? '#fff' : '#6B6B6B',
                  }}
                >
                  {deg}°
                </button>
              ))}
            </div>
          </div>

          {/* Quick nudge buttons */}
          <div>
            <label className="text-[11px] font-medium text-[#6B6B6B] mb-1 block">Nudge</label>
            <div className="grid grid-cols-3 gap-1">
              <div />
              <button onClick={() => update({ y: text.y - 10 })} className="py-1 rounded bg-[#F0F0F0] text-[#6B6B6B] text-xs hover:bg-[#FDE8E4]">↑</button>
              <div />
              <button onClick={() => update({ x: text.x - 10 })} className="py-1 rounded bg-[#F0F0F0] text-[#6B6B6B] text-xs hover:bg-[#FDE8E4]">←</button>
              <button onClick={() => update({ x: text.x + 10 })} className="py-1 rounded bg-[#F4C2A1] text-white text-xs hover:brightness-105">→</button>
              <button onClick={() => update({ x: text.x + 10 })} className="py-1 rounded bg-[#F0F0F0] text-[#6B6B6B] text-xs hover:bg-[#FDE8E4]">→</button>
              <div />
              <button onClick={() => update({ y: text.y + 10 })} className="py-1 rounded bg-[#F0F0F0] text-[#6B6B6B] text-xs hover:bg-[#FDE8E4]">↓</button>
              <div />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Extended background type ── */
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
  onApplyBackgroundToAll?: () => void;
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
    onApplyBackgroundToAll,
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

  /* ── Text selected: FULL EDITOR ── */
  if (selectedText) {
    return <TextEditor text={selectedText} onUpdate={onUpdateText} onDelete={onDeleteText} />;
  }

  /* ── Background selected ── */
  if (selectedBackground) {
    const bg = selectedBackground;
    const f = bg.filters ?? DEFAULT_BG_FILTERS;
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
          <BackgroundDesigner background={background} onChange={onUpdateBackground} photos={uploadedPhotos} />
        </Section>
      </div>
    );
  }

  /* ── No selection: page properties ── */
  if (!selectedPhoto && !selectedText && selectedSlotIndex === null) {
    return (
      <div className="w-full h-full overflow-y-auto px-3 py-4">
        <h3 className="font-display text-sm font-semibold text-[#2D2D2D] mb-3">Page Properties</h3>
        <BackgroundDesigner background={background} onChange={onUpdateBackground} photos={uploadedPhotos} />
        {onApplyBackgroundToAll && (
          <button
            onClick={onApplyBackgroundToAll}
            className="w-full mt-3 py-2 bg-white border border-[#F4C2A1] text-[#F4C2A1] text-[11px] font-medium rounded-xl hover:bg-[#F4C2A1] hover:text-white flex items-center justify-center gap-1.5 transition-all"
          >
            <Layers size={12} /> Apply to All Pages
          </button>
        )}
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
    const f = selectedPhoto.filters ?? DEFAULT_FILTERS;
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

  return null;
}
