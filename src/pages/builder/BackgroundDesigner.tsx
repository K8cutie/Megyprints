import { useState } from 'react';
import { HexColorPicker } from 'react-colorful';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Paintbrush, GraduationCap, Shapes, ImageIcon, Check,
} from 'lucide-react';
import type { AlbumBackground } from './types';
import { GRADIENT_PRESETS, PATTERNS } from './types';

type Tab = 'solid' | 'gradient' | 'pattern' | 'image';

const PASTEL_SWATCHES = [
  '#FFFBF7', '#FFF8F0', '#FDE8E4', '#FBE5D8', '#F0E8F5',
  '#E8E0F0', '#E4F0E0', '#E0E8F0', '#E4E8F8', '#F5F0E8',
  '#FDE8F0', '#E8F5F0', '#F0F0F0', '#E8E8E8', '#D4D4D4',
  '#F4C2A1', '#E8A598', '#B8A9D9', '#9BCFB8', '#8FBFE0',
  '#D4B896', '#C9A96E', '#E8B84B', '#C27BA0', '#A8D8B9',
  '#FFFFFF', '#2D2D2D', '#6B6B6B', '#9B9B9B', '#C4C4C4',
];

const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'solid', label: 'Solid', icon: <Paintbrush size={14} /> },
  { id: 'gradient', label: 'Gradient', icon: <GraduationCap size={14} /> },
  { id: 'pattern', label: 'Pattern', icon: <Shapes size={14} /> },
  { id: 'image', label: 'Image', icon: <ImageIcon size={14} /> },
];

/* ── Pattern SVG generators ── */
function PatternPreview({ name, color }: { name: string; color: string }) {
  const svgContent = () => {
    switch (name) {
      case 'dots': return (
        <svg width="100%" height="100%">
          <pattern id="dots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="10" cy="10" r="2" fill={color} opacity="0.3" />
          </pattern>
          <rect width="100%" height="100%" fill={`url(#dots)`} />
        </svg>
      );
      case 'stripes': return (
        <svg width="100%" height="100%">
          <pattern id="stripes" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect x="0" y="0" width="8" height="16" fill={color} opacity="0.15" />
          </pattern>
          <rect width="100%" height="100%" fill={`url(#stripes)`} />
        </svg>
      );
      case 'diagonal': return (
        <svg width="100%" height="100%">
          <pattern id="diag" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M0 20L20 0" stroke={color} strokeWidth="1" opacity="0.2" />
          </pattern>
          <rect width="100%" height="100%" fill={`url(#diag)`} />
        </svg>
      );
      case 'chevron': return (
        <svg width="100%" height="100%">
          <pattern id="chev" x="0" y="0" width="30" height="30" patternUnits="userSpaceOnUse">
            <path d="M0 15L15 0L30 15" stroke={color} strokeWidth="1" fill="none" opacity="0.2" />
          </pattern>
          <rect width="100%" height="100%" fill={`url(#chev)`} />
        </svg>
      );
      case 'grid': return (
        <svg width="100%" height="100%">
          <pattern id="grid" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
            <rect x="0" y="0" width="24" height="24" fill="none" stroke={color} strokeWidth="0.5" opacity="0.15" />
          </pattern>
          <rect width="100%" height="100%" fill={`url(#grid)`} />
        </svg>
      );
      case 'floral': return (
        <svg width="100%" height="100%">
          <pattern id="floral" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
            <circle cx="20" cy="20" r="8" fill="none" stroke={color} strokeWidth="0.8" opacity="0.15" />
            <circle cx="20" cy="20" r="3" fill={color} opacity="0.1" />
          </pattern>
          <rect width="100%" height="100%" fill={`url(#floral)`} />
        </svg>
      );
      case 'geometric': return (
        <svg width="100%" height="100%">
          <pattern id="geo" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
            <polygon points="16,2 30,16 16,30 2,16" fill="none" stroke={color} strokeWidth="0.6" opacity="0.15" />
          </pattern>
          <rect width="100%" height="100%" fill={`url(#geo)`} />
        </svg>
      );
      case 'watercolor': return (
        <svg width="100%" height="100%">
          <pattern id="wc" x="0" y="0" width="50" height="50" patternUnits="userSpaceOnUse">
            <circle cx="15" cy="15" r="12" fill={color} opacity="0.06" />
            <circle cx="40" cy="35" r="10" fill={color} opacity="0.04" />
          </pattern>
          <rect width="100%" height="100%" fill={`url(#wc)`} />
        </svg>
      );
      case 'marble': return (
        <svg width="100%" height="100%">
          <pattern id="marble" x="0" y="0" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M0 30Q15 10 30 30T60 30" stroke={color} strokeWidth="0.8" fill="none" opacity="0.1" />
            <path d="M0 45Q20 25 40 45T60 45" stroke={color} strokeWidth="0.5" fill="none" opacity="0.08" />
          </pattern>
          <rect width="100%" height="100%" fill={`url(#marble)`} />
        </svg>
      );
      case 'wood': return (
        <svg width="100%" height="100%">
          <pattern id="wood" x="0" y="0" width="40" height="12" patternUnits="userSpaceOnUse">
            <rect x="0" y="0" width="40" height="1" fill={color} opacity="0.1" />
            <rect x="0" y="6" width="40" height="0.5" fill={color} opacity="0.06" />
          </pattern>
          <rect width="100%" height="100%" fill={`url(#wood)`} />
        </svg>
      );
      case 'confetti': return (
        <svg width="100%" height="100%">
          <pattern id="conf" x="0" y="0" width="35" height="35" patternUnits="userSpaceOnUse">
            <rect x="5" y="5" width="4" height="4" fill={color} opacity="0.12" transform="rotate(15 7 7)" />
            <rect x="25" y="20" width="3" height="3" fill={color} opacity="0.08" transform="rotate(45 26 21)" />
          </pattern>
          <rect width="100%" height="100%" fill={`url(#conf)`} />
        </svg>
      );
      case 'stars': return (
        <svg width="100%" height="100%">
          <pattern id="stars" x="0" y="0" width="30" height="30" patternUnits="userSpaceOnUse">
            <polygon points="15,2 17,10 25,10 19,15 21,23 15,18 9,23 11,15 5,10 13,10" fill={color} opacity="0.08" transform="scale(0.4) translate(15,15)" />
          </pattern>
          <rect width="100%" height="100%" fill={`url(#stars)`} />
        </svg>
      );
      case 'hearts': return (
        <svg width="100%" height="100%">
          <pattern id="hearts" x="0" y="0" width="30" height="30" patternUnits="userSpaceOnUse">
            <path d="M15 22C15 22 7 16 7 11C7 8 9 6 12 6C13.5 6 15 7 15 7C15 7 16.5 6 18 6C21 6 23 8 23 11C23 16 15 22 15 22Z" fill={color} opacity="0.08" transform="scale(0.5) translate(15,15)" />
          </pattern>
          <rect width="100%" height="100%" fill={`url(#hearts)`} />
        </svg>
      );
      case 'polka': return (
        <svg width="100%" height="100%">
          <pattern id="polka" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="12" cy="12" r="4" fill={color} opacity="0.1" />
          </pattern>
          <rect width="100%" height="100%" fill={`url(#polka)`} />
        </svg>
      );
      case 'waves': return (
        <svg width="100%" height="100%">
          <pattern id="waves" x="0" y="0" width="40" height="20" patternUnits="userSpaceOnUse">
            <path d="M0 10Q10 0 20 10T40 10" stroke={color} strokeWidth="1" fill="none" opacity="0.12" />
          </pattern>
          <rect width="100%" height="100%" fill={`url(#waves)`} />
        </svg>
      );
      default: return (
        <svg width="100%" height="100%">
          <pattern id="default" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="10" cy="10" r="1.5" fill={color} opacity="0.15" />
          </pattern>
          <rect width="100%" height="100%" fill={`url(#default)`} />
        </svg>
      );
    }
  };

  return <div className="w-full h-full">{svgContent()}</div>;
}

/* ── Main Component ── */

interface BackgroundDesignerProps {
  background: AlbumBackground;
  onChange: (bg: AlbumBackground) => void;
  compact?: boolean;
}

export default function BackgroundDesigner({ background, onChange, compact }: BackgroundDesignerProps) {
  const [activeTab, setActiveTab] = useState<Tab>(background.type);
  const [customColor, setCustomColor] = useState(background.solid ?? '#FFFBF7');
  const [patternColor, setPatternColor] = useState('#B8A9D9');
  const [gradientType, setGradientType] = useState<'linear' | 'radial'>('linear');
  const [gradientAngle, setGradientAngle] = useState(135);
  const [customStops, setCustomStops] = useState<{ offset: number; color: string }[]>([
    { offset: 0, color: '#F4C2A1' },
    { offset: 1, color: '#B8A9D9' },
  ]);

  const handleSolid = (color: string) => {
    setCustomColor(color);
    onChange({ type: 'solid', solid: color });
  };

  const handleGradientPreset = (preset: typeof GRADIENT_PRESETS[0]) => {
    const bg: AlbumBackground = {
      type: 'gradient',
      gradient: { type: gradientType, angle: gradientAngle, stops: preset.stops },
    };
    onChange(bg);
  };

  const handleCustomGradient = () => {
    onChange({
      type: 'gradient',
      gradient: { type: gradientType, angle: gradientAngle, stops: customStops },
    });
  };

  const handlePattern = (name: string) => {
    onChange({ type: 'pattern', pattern: name });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      onChange({ type: 'image', image: url });
    }
  };

  const renderBgPreview = () => {
    if (background.type === 'solid' && background.solid) {
      return <div className="w-full h-full" style={{ backgroundColor: background.solid }} />;
    }
    if (background.type === 'gradient' && background.gradient) {
      const { type, angle, stops } = background.gradient;
      const gradientStr = type === 'linear'
        ? `linear-gradient(${angle}deg, ${stops.map((s) => `${s.color} ${s.offset * 100}%`).join(', ')})`
        : `radial-gradient(circle, ${stops.map((s) => `${s.color} ${s.offset * 100}%`).join(', ')})`;
      return <div className="w-full h-full" style={{ background: gradientStr }} />;
    }
    if (background.type === 'pattern' && background.pattern) {
      return <PatternPreview name={background.pattern} color={patternColor} />;
    }
    if (background.type === 'image' && background.image) {
      return <img src={background.image} alt="bg" className="w-full h-full object-cover" />;
    }
    return <div className="w-full h-full bg-[#FFFBF7]" />;
  };

  return (
    <div className={compact ? '' : 'bg-white rounded-xl p-4 shadow-sm'}>
      {!compact && <h3 className="font-display text-sm font-semibold text-[#2D2D2D] mb-3">Background</h3>}

      {/* Preview */}
      <div className="w-full h-20 rounded-lg overflow-hidden border border-[#E8E8E8] mb-3">
        {renderBgPreview()}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-3 bg-[#F0F0F0] rounded-lg p-0.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-xs font-medium transition-all"
            style={{
              backgroundColor: activeTab === t.id ? '#fff' : 'transparent',
              color: activeTab === t.id ? '#2D2D2D' : '#9B9B9B',
              boxShadow: activeTab === t.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          transition={{ duration: 0.15 }}
        >
          {activeTab === 'solid' && (
            <div>
              <div className="grid grid-cols-6 gap-1.5 mb-3">
                {PASTEL_SWATCHES.map((color) => (
                  <button
                    key={color}
                    onClick={() => handleSolid(color)}
                    className="w-full aspect-square rounded-md border border-[#E8E8E8] hover:scale-110 transition-transform relative"
                    style={{ backgroundColor: color }}
                  >
                    {background.type === 'solid' && background.solid === color && (
                      <Check size={12} className="absolute inset-0 m-auto text-[#2D2D2D] drop-shadow" />
                    )}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 items-center">
                <div
                  className="w-8 h-8 rounded-md border border-[#E8E8E8] flex-shrink-0"
                  style={{ backgroundColor: customColor }}
                />
                <HexColorPicker
                  color={customColor}
                  onChange={handleSolid}
                  style={{ width: '100%', height: '80px' }}
                />
              </div>
            </div>
          )}

          {activeTab === 'gradient' && (
            <div>
              {/* Gradient type toggle */}
              <div className="flex gap-1 mb-2">
                {(['linear', 'radial'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setGradientType(t)}
                    className="flex-1 py-1 text-xs rounded-md font-medium capitalize transition-colors"
                    style={{
                      backgroundColor: gradientType === t ? '#F4C2A1' : '#F0F0F0',
                      color: gradientType === t ? '#fff' : '#6B6B6B',
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {gradientType === 'linear' && (
                <div className="mb-2">
                  <label className="text-xs text-[#6B6B6B]">Angle: {gradientAngle}°</label>
                  <input
                    type="range" min="0" max="360" value={gradientAngle}
                    onChange={(e) => { setGradientAngle(Number(e.target.value)); handleCustomGradient(); }}
                    className="w-full h-1 accent-[#F4C2A1]"
                  />
                </div>
              )}

              {/* Gradient presets */}
              <p className="text-xs text-[#9B9B9B] mb-1.5">Presets</p>
              <div className="grid grid-cols-2 gap-1.5 mb-3">
                {GRADIENT_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => handleGradientPreset(preset)}
                    className="h-10 rounded-md border border-[#E8E8E8] hover:border-[#F4C2A1] transition-colors relative overflow-hidden"
                  >
                    <div
                      className="absolute inset-0"
                      style={{
                        background: `linear-gradient(135deg, ${preset.stops.map((s) => `${s.color} ${s.offset * 100}%`).join(', ')})`,
                      }}
                    />
                    <span className="relative z-10 text-[10px] font-medium text-white drop-shadow">{preset.name}</span>
                  </button>
                ))}
              </div>

              {/* Custom gradient stops */}
              <p className="text-xs text-[#9B9B9B] mb-1.5">Custom</p>
              <div className="flex gap-1">
                {customStops.map((stop, i) => (
                  <div key={i} className="flex-1">
                    <input
                      type="color"
                      value={stop.color}
                      onChange={(e) => {
                        const newStops = [...customStops];
                        newStops[i] = { ...stop, color: e.target.value };
                        setCustomStops(newStops);
                        handleCustomGradient();
                      }}
                      className="w-full h-8 rounded-md border border-[#E8E8E8] cursor-pointer"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'pattern' && (
            <div>
              <div className="flex gap-2 items-center mb-2">
                <span className="text-xs text-[#6B6B6B]">Color:</span>
                <input
                  type="color" value={patternColor}
                  onChange={(e) => setPatternColor(e.target.value)}
                  className="w-6 h-6 rounded border border-[#E8E8E8] cursor-pointer"
                />
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {PATTERNS.map((name) => (
                  <button
                    key={name}
                    onClick={() => handlePattern(name)}
                    className="h-14 rounded-md border overflow-hidden relative hover:border-[#F4C2A1] transition-colors"
                    style={{
                      borderColor: background.type === 'pattern' && background.pattern === name ? '#F4C2A1' : '#E8E8E8',
                      borderWidth: background.type === 'pattern' && background.pattern === name ? '2px' : '1px',
                    }}
                  >
                    <PatternPreview name={name} color={patternColor} />
                    <span className="absolute bottom-0.5 left-0 right-0 text-center text-[9px] font-medium text-[#6B6B6B] bg-white/80">{name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'image' && (
            <div>
              <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-[#D4D4D4] rounded-lg cursor-pointer hover:border-[#F4C2A1] hover:bg-[#FFF8F0] transition-colors">
                <ImageIcon size={20} className="text-[#9B9B9B] mb-1" />
                <span className="text-xs text-[#6B6B6B]">Upload background image</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              </label>
              {background.type === 'image' && background.image && (
                <button
                  onClick={() => onChange({ type: 'solid', solid: '#FFFBF7' })}
                  className="mt-2 w-full py-1.5 text-xs text-[#E8A598] hover:underline"
                >
                  Remove background image
                </button>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
