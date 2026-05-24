import { useState, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Paintbrush,
  Image,
  GraduationCap,
  Check,
} from 'lucide-react';
import type { AlbumPage } from './types';

/* ─── Tabs ─── */
type BgTab = 'solid' | 'gradient' | 'image' | 'pattern';

const TABS: { key: BgTab; label: string; icon: React.ReactNode }[] = [
  { key: 'solid', label: 'Solid', icon: <Paintbrush size={16} /> },
  // Design choice: GraduationCap icon is used here as a visual metaphor for
  // "gradation" / gradient. Keeping as-is since it's an intentional design choice.
  { key: 'gradient', label: 'Gradient', icon: <GraduationCap size={16} /> },
  { key: 'image', label: 'Image', icon: <Image size={16} /> },
  { key: 'pattern', label: 'Pattern', icon: <Paintbrush size={16} /> },
];

/* ─── Pattern definitions ─── */
const PATTERN_NAMES = ['dots', 'stripes', 'grid', 'diagonal', 'circles', 'chevron'] as const;

/* ─── Component ─── */
interface BackgroundDesignerProps {
  background: AlbumPage['background'];
  onChange: (bg: AlbumPage['background']) => void;
}

export default function BackgroundDesigner({ background, onChange }: BackgroundDesignerProps) {
  const [activeTab, setActiveTab] = useState<BgTab>('solid');

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

  /* Image presets */
  const imagePresets = [
    '/bg-textures/paper.jpg',
    '/bg-textures/linen.jpg',
    '/bg-textures/leather.jpg',
    '/bg-textures/marble.jpg',
    '/bg-textures/wood.jpg',
  ];

  return (
    <div className="w-full space-y-4">
      {/* Tab bar */}
      <div className="flex gap-1 p-1 bg-stone-100 rounded-lg">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm rounded-md transition-all ${
              activeTab === t.key
                ? 'bg-white shadow-sm text-stone-900 font-medium'
                : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── SOLID ─── */}
      <AnimatePresence mode="wait">
        {activeTab === 'solid' && (
          <motion.div
            key="solid"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-3"
          >
            <div className="grid grid-cols-5 gap-2">
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
        {activeTab === 'gradient' && (
          <motion.div
            key="gradient"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-3"
          >
            <div className="grid grid-cols-2 gap-2">
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
        {activeTab === 'image' && (
          <motion.div
            key="image"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-3"
          >
            <div className="grid grid-cols-3 gap-2">
              {imagePresets.map((src) => (
                <button
                  key={src}
                  onClick={() => onChange({ type: 'image', image: src })}
                  className={`relative w-full aspect-square rounded-lg border-2 overflow-hidden transition-all ${
                    background.type === 'image' && background.image === src
                      ? 'border-rose-400 shadow'
                      : 'border-transparent hover:scale-105'
                  }`}
                >
                  <img src={src} alt="" className="w-full h-full object-cover" loading="lazy" />
                  {background.type === 'image' && background.image === src && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                      <Check size={20} className="text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* ─── PATTERN ─── */}
        {activeTab === 'pattern' && (
          <motion.div
            key="pattern"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-3"
          >
            <div className="grid grid-cols-3 gap-2">
              {PATTERN_NAMES.map((name) => (
                <button
                  key={name}
                  onClick={() => onChange({ type: 'pattern', pattern: name })}
                  className={`w-full aspect-square rounded-lg border-2 overflow-hidden transition-all ${
                    background.type === 'pattern' && background.pattern === name
                      ? 'border-rose-400 shadow'
                      : 'border-transparent hover:scale-105'
                  }`}
                >
                  <PatternPreview name={name} color="#A8A29E" />
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── PatternPreview ─── */
function PatternPreview({ name, color }: { name: string; color: string }) {
  // BUG FIX: Use React 18's useId() to generate unique pattern IDs so multiple
  // PatternPreview instances on the same page don't have colliding SVG ids.
  const uniqueId = useId();
  const patternId = `${name}-${uniqueId}`;

  const svgContent = () => {
    switch (name) {
      case 'dots':
        return (
          <svg width="100%" height="100%">
            <pattern id={patternId} x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
              <circle cx="10" cy="10" r="2" fill={color} opacity="0.3" />
            </pattern>
            <rect width="100%" height="100%" fill={`url(#${patternId})`} />
          </svg>
        );
      case 'stripes':
        return (
          <svg width="100%" height="100%">
            <pattern id={patternId} x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
              <rect x="0" y="0" width="5" height="10" fill={color} opacity="0.3" />
            </pattern>
            <rect width="100%" height="100%" fill={`url(#${patternId})`} />
          </svg>
        );
      case 'grid':
        return (
          <svg width="100%" height="100%">
            <pattern id={patternId} x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke={color} strokeWidth="1" opacity="0.3" />
            </pattern>
            <rect width="100%" height="100%" fill={`url(#${patternId})`} />
          </svg>
        );
      case 'diagonal':
        return (
          <svg width="100%" height="100%">
            <pattern id={patternId} x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M 0 10 L 10 0" stroke={color} strokeWidth="1" opacity="0.3" />
            </pattern>
            <rect width="100%" height="100%" fill={`url(#${patternId})`} />
          </svg>
        );
      case 'circles':
        return (
          <svg width="100%" height="100%">
            <pattern id={patternId} x="0" y="0" width="30" height="30" patternUnits="userSpaceOnUse">
              <circle cx="15" cy="15" r="8" fill="none" stroke={color} strokeWidth="1" opacity="0.3" />
            </pattern>
            <rect width="100%" height="100%" fill={`url(#${patternId})`} />
          </svg>
        );
      case 'chevron':
        return (
          <svg width="100%" height="100%">
            <pattern id={patternId} x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 0 10 L 10 0 L 20 10" fill="none" stroke={color} strokeWidth="1" opacity="0.3" />
            </pattern>
            <rect width="100%" height="100%" fill={`url(#${patternId})`} />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <div className="w-full h-full">
      {svgContent()}
    </div>
  );
}
