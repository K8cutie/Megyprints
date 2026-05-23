import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, BookOpen, Layout, Ruler, Sparkles } from 'lucide-react';
import { ALBUM_SIZES } from './types';
import type { AlbumSizePreset } from './types';

/* ── Size card renderer ── */
function renderSizeCard(size: typeof ALBUM_SIZES[0], selectedSize: AlbumSizePreset, onSizeChange: (s: AlbumSizePreset) => void) {
  const isSelected = selectedSize === size.preset;
  return (
    <button
      key={size.preset}
      onClick={() => onSizeChange(size.preset)}
      className="p-4 rounded-xl border-2 text-left transition-all duration-200 hover:shadow-md"
      style={{
        borderColor: isSelected ? '#F4C2A1' : '#E8E8E8',
        backgroundColor: isSelected ? '#FFF5F0' : '#FFFFFF',
      }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <Ruler size={14} className={isSelected ? 'text-[#E8A598]' : 'text-[#9B9B9B]'} />
        {isSelected && (
          <div className="w-5 h-5 rounded-full bg-[#F4C2A1] flex items-center justify-center">
            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
              <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        )}
      </div>
      <p className="font-semibold text-sm text-[#2D2D2D]">{size.name}</p>
    </button>
  );
}

interface BuilderSetupProps {
  selectedSize: AlbumSizePreset;
  selectedType: 'standard' | 'layflat';
  onSizeChange: (size: AlbumSizePreset) => void;
  onTypeChange: (type: 'standard' | 'layflat') => void;
  onNext: () => void;
}

const ALBUM_TYPES = [
  {
    id: 'standard' as const,
    name: 'Standard Album',
    description: 'Classic bound pages with a visible crease between spreads. Photos stay within individual page margins.',
    image: './album-type-standard.jpg',
    icon: BookOpen,
    features: ['Traditional binding', 'Page-by-page layouts', 'Great for all occasions', 'Most affordable'],
  },
  {
    id: 'layflat' as const,
    name: 'Layflat Album',
    description: 'Pages lay completely flat when opened. Full spread designs that cross the center crease for maximum impact.',
    image: './album-type-layflat.jpg',
    icon: Layout,
    features: ['Pages lay 180 flat', 'Full-spread panoramas', 'No photo lost in crease', 'Premium feel'],
  },
];

export default function BuilderSetup({ selectedSize, selectedType, onSizeChange, onTypeChange, onNext }: BuilderSetupProps) {
  const [step, setStep] = useState<1 | 2>(1);

  return (
    <div className="h-full flex flex-col bg-[#FFFBF7] overflow-y-auto">
      {/* Header */}
      <div className="text-center pt-10 pb-6 px-4">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-[#FDE8E4] rounded-full mb-4">
            <Sparkles size={14} className="text-[#E8A598]" />
            <span className="text-xs font-medium text-[#E8A598]">Step 1 of 4</span>
          </div>
          <h1 className="font-display text-3xl md:text-4xl text-[#2D2D2D] mb-2">Create Your Album</h1>
          <p className="text-[#6B6B6B] text-sm max-w-md mx-auto">
            Choose your album type and size first. This helps you plan your photo layouts better.
          </p>
        </motion.div>
      </div>

      {/* Step 1: Choose Album Type */}
      {step === 1 && (
        <motion.div
          initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
          className="flex-1 px-4 pb-8"
        >
          <div className="max-w-5xl mx-auto">
            <h2 className="text-xl font-semibold text-[#2D2D2D] mb-6 text-center">What type of album do you want?</h2>

            <div className="grid md:grid-cols-2 gap-6 mb-8">
              {ALBUM_TYPES.map((type) => {
                const isSelected = selectedType === type.id;
                const Icon = type.icon;
                return (
                  <button
                    key={type.id}
                    onClick={() => onTypeChange(type.id)}
                    className="group text-left rounded-2xl border-2 transition-all duration-200 overflow-hidden hover:shadow-xl hover:scale-[1.01]"
                    style={{
                      borderColor: isSelected ? '#F4C2A1' : '#E8E8E8',
                      backgroundColor: '#FFFFFF',
                    }}
                  >
                    {/* Image area */}
                    <div className="relative h-48 md:h-56 overflow-hidden bg-[#FFF5F0]">
                      <img
                        src={type.image}
                        alt={type.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      {isSelected && (
                        <div className="absolute top-3 right-3 w-7 h-7 rounded-full bg-[#F4C2A1] flex items-center justify-center shadow-md">
                          <svg width="12" height="9" viewBox="0 0 12 9" fill="none">
                            <path d="M1 4.5L4 7.5L11 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Text area */}
                    <div className="p-6">
                      <div className="flex items-center gap-3 mb-2">
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
                          style={{ backgroundColor: isSelected ? '#FDE8E4' : '#F0F0F0' }}
                        >
                          <Icon size={18} style={{ color: isSelected ? '#E8A598' : '#9B9B9B' }} />
                        </div>
                        <h3 className="font-semibold text-lg text-[#2D2D2D]">{type.name}</h3>
                      </div>
                      <p className="text-sm text-[#6B6B6B] mb-4 leading-relaxed">{type.description}</p>
                      <div className="flex flex-wrap gap-2">
                        {type.features.map((f) => (
                          <span
                            key={f}
                            className="px-3 py-1 rounded-full text-xs font-medium"
                            style={{
                              backgroundColor: isSelected ? '#FDE8E4' : '#F0F0F0',
                              color: isSelected ? '#E8A598' : '#9B9B9B',
                            }}
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="text-center">
              <button
                onClick={() => setStep(2)}
                className="inline-flex items-center gap-2 px-8 py-3 bg-[#F4C2A1] text-white font-medium rounded-xl hover:brightness-105 transition-all shadow-lg shadow-[#F4C2A1]/20"
              >
                Next: Choose Size <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Step 2: Choose Size */}
      {step === 2 && (
        <motion.div
          initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
          className="flex-1 px-4 pb-8"
        >
          <div className="max-w-4xl mx-auto">
            <button
              onClick={() => setStep(1)}
              className="text-sm text-[#9B9B9B] hover:text-[#E8A598] mb-4 transition-colors"
            >
              Back to album type
            </button>
            <h2 className="text-xl font-semibold text-[#2D2D2D] mb-2">What size album do you want?</h2>
            <p className="text-sm text-[#6B6B6B] mb-8">
              Choose the orientation that fits your photos best.
            </p>

            {/* ── Square ── */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-[#9B9B9B] uppercase tracking-wider mb-3 flex items-center gap-2">
                <div className="w-2 h-2 rounded-sm bg-[#F4C2A1]" /> Square
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {ALBUM_SIZES.filter((s) => s.category === 'square').map((size) => renderSizeCard(size, selectedSize, onSizeChange))}
              </div>
            </div>

            {/* ── Portrait ── */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-[#9B9B9B] uppercase tracking-wider mb-3 flex items-center gap-2">
                <div className="w-2 h-3 rounded-sm bg-[#E8A598]" /> Portrait <span className="text-xs font-normal normal-case text-[#C4C4C4]">taller than wide</span>
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {ALBUM_SIZES.filter((s) => s.category === 'portrait').map((size) => renderSizeCard(size, selectedSize, onSizeChange))}
              </div>
            </div>

            {/* ── Landscape ── */}
            <div className="mb-10">
              <h3 className="text-sm font-semibold text-[#9B9B9B] uppercase tracking-wider mb-3 flex items-center gap-2">
                <div className="w-3 h-2 rounded-sm bg-[#C4B5E0]" /> Landscape <span className="text-xs font-normal normal-case text-[#C4C4C4]">wider than tall</span>
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {ALBUM_SIZES.filter((s) => s.category === 'landscape').map((size) => renderSizeCard(size, selectedSize, onSizeChange))}
              </div>
            </div>

            <div className="text-center">
              <button
                onClick={onNext}
                className="inline-flex items-center gap-2 px-8 py-3 bg-[#F4C2A1] text-white font-medium rounded-xl hover:brightness-105 transition-all shadow-lg shadow-[#F4C2A1]/20"
              >
                Start Creating <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
