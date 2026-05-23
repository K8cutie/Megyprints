import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, ChevronLeft, Sparkles } from 'lucide-react';
import type { TemplateType } from './types';
import { THEMES } from './types';

interface BuilderTemplateProps {
  selected: TemplateType;
  onSelect: (t: TemplateType) => void;
  onBack: () => void;
  onGenerate: () => void;
}

export default function BuilderTemplate({ selected, onSelect, onBack, onGenerate }: BuilderTemplateProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const themes = Object.values(THEMES);

  return (
    <div className="flex flex-col h-full bg-[#FFF8F0]">
      <div className="px-6 py-4 border-b border-[#F0F0F0] flex items-center justify-between bg-white">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-lg hover:bg-[#F0F0F0] text-[#6B6B6B]">
            <ChevronLeft size={18} />
          </button>
          <div>
            <h2 className="font-display text-xl font-semibold text-[#2D2D2D]">Step 2: Choose Style</h2>
            <p className="text-xs text-[#9B9B9B]">Pick a starting point — customize everything later</p>
          </div>
        </div>
        <button onClick={onGenerate} className="px-6 py-2 bg-[#F4C2A1] text-white font-body text-sm font-semibold rounded-lg hover:brightness-105 flex items-center gap-1.5 transition-all">
          <Sparkles size={14} /> Continue to Editor
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-4 max-w-[1400px] mx-auto">
          {themes.map((t) => (
            <motion.div
              key={t.type}
              whileHover={{ y: -4 }}
              onClick={() => onSelect(t.type)}
              onMouseEnter={() => setHovered(t.type)}
              onMouseLeave={() => setHovered(null)}
              className="cursor-pointer group"
            >
              <div
                className="relative aspect-[3/4] rounded-xl overflow-hidden border-2 transition-all shadow-sm"
                style={{
                  borderColor: selected === t.type ? t.accentColor : '#E8E8E8',
                  boxShadow: selected === t.type ? `0 4px 16px ${t.accentColor}40` : 'none',
                }}
              >
                <img src={t.coverImage} alt={t.name} className="w-full h-full object-cover" />
                {selected === t.type && (
                  <div className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: t.accentColor }}>
                    <Check size={14} className="text-white" />
                  </div>
                )}
                {hovered === t.type && (
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                    <span className="text-white text-xs font-medium">Click to select</span>
                  </div>
                )}
              </div>
              <p className="text-xs font-medium text-[#2D2D2D] mt-1.5 text-center truncate">{t.name}</p>
              <p className="text-[10px] text-[#9B9B9B] text-center line-clamp-1">{t.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
