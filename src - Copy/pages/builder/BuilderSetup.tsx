import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, BookOpen, Layout, Ruler, Sparkles } from 'lucide-react';
import { ALBUM_SIZES } from './types';
import type { AlbumSizePreset } from './types';

/* ═══════════════════════════════════════════════════════════
   REAL PHOTO SAMPLES — watermark-free from Pexels/Unsplash
   ═══════════════════════════════════════════════════════════ */

const PHOTOS = {
  wedding1: 'https://images.pexels.com/photos/2253870/pexels-photo-2253870.jpeg?auto=compress&w=400',
  wedding2: 'https://images.pexels.com/photos/2959192/pexels-photo-2959192.jpeg?auto=compress&w=400',
  family1: 'https://images.pexels.com/photos/1128318/pexels-photo-1128318.jpeg?auto=compress&w=400',
  family2: 'https://images.pexels.com/photos/3764119/pexels-photo-3764119.jpeg?auto=compress&w=400',
  baby1: 'https://images.pexels.com/photos/459957/pexels-photo-459957.jpeg?auto=compress&w=400',
  baby2: 'https://images.pexels.com/photos/161709/newborn-baby-finger-hand-161709.jpeg?auto=compress&w=400',
  travel1: 'https://images.pexels.com/photos/1287145/pexels-photo-1287145.jpeg?auto=compress&w=400',
  travel2: 'https://images.pexels.com/photos/2166553/pexels-photo-2166553.jpeg?auto=compress&w=400',
  birthday1: 'https://images.pexels.com/photos/1543762/pexels-photo-1543762.jpeg?auto=compress&w=400',
  birthday2: 'https://images.pexels.com/photos/1405528/pexels-photo-1405528.jpeg?auto=compress&w=400',
  couple1: 'https://images.pexels.com/photos/1024960/pexels-photo-1024960.jpeg?auto=compress&w=400',
  couple2: 'https://images.pexels.com/photos/3494942/pexels-photo-3494942.jpeg?auto=compress&w=400',
  landscape1: 'https://images.pexels.com/photos/132037/pexels-photo-132037.jpeg?auto=compress&w=400',
  food1: 'https://images.pexels.com/photos/3184183/pexels-photo-3184183.jpeg?auto=compress&w=400',
  grad1: 'https://images.pexels.com/photos/267885/pexels-photo-267885.jpeg?auto=compress&w=400',
};

interface PageSample {
  bg: string;
  slots: { x: number; y: number; w: number; h: number; photo: string; rotation?: number }[];
}

/** Standard album pages — visible center crease, margins */
const STANDARD_PAGES: PageSample[] = [
  {
    bg: '#F8F3ED',
    slots: [
      { x: 12, y: 18, w: 34, h: 38, photo: PHOTOS.wedding1, rotation: -2 },
      { x: 54, y: 22, w: 32, h: 32, photo: PHOTOS.couple1 },
    ],
  },
  {
    bg: '#F0EDE5',
    slots: [
      { x: 10, y: 12, w: 80, h: 48, photo: PHOTOS.family1 },
    ],
  },
  {
    bg: '#FAF5EF',
    slots: [
      { x: 10, y: 14, w: 24, h: 32, photo: PHOTOS.baby1 },
      { x: 40, y: 10, w: 28, h: 36, photo: PHOTOS.baby2, rotation: 3 },
      { x: 14, y: 56, w: 58, h: 28, photo: PHOTOS.family2 },
    ],
  },
  {
    bg: '#E8DDD0',
    slots: [
      { x: 20, y: 12, w: 60, h: 58, photo: PHOTOS.wedding2, rotation: -1 },
    ],
  },
  {
    bg: '#F5EDE0',
    slots: [
      { x: 12, y: 14, w: 36, h: 42, photo: PHOTOS.travel1 },
      { x: 52, y: 18, w: 36, h: 38, photo: PHOTOS.travel2, rotation: 2 },
    ],
  },
];

/** Layflat album pages — full spread, no crease, edge-to-edge */
const LAYFLAT_PAGES: PageSample[] = [
  {
    bg: '#E8DFC8',
    slots: [
      { x: 0, y: 5, w: 100, h: 45, photo: PHOTOS.landscape1 },
    ],
  },
  {
    bg: '#DDD0B8',
    slots: [
      { x: 5, y: 5, w: 42, h: 50, photo: PHOTOS.birthday1, rotation: -2 },
      { x: 48, y: 10, w: 47, h: 45, photo: PHOTOS.birthday2, rotation: 2 },
    ],
  },
  {
    bg: '#F0E8D8',
    slots: [
      { x: 8, y: 8, w: 84, h: 40, photo: PHOTOS.grad1 },
      { x: 25, y: 52, w: 50, h: 38, photo: PHOTOS.food1, rotation: 1 },
    ],
  },
  {
    bg: '#E5D8C0',
    slots: [
      { x: 3, y: 3, w: 94, h: 94, photo: PHOTOS.couple2 },
    ],
  },
  {
    bg: '#D8C8A8',
    slots: [
      { x: 5, y: 10, w: 28, h: 35, photo: PHOTOS.baby1 },
      { x: 36, y: 5, w: 28, h: 40, photo: PHOTOS.wedding1, rotation: -3 },
      { x: 67, y: 12, w: 28, h: 35, photo: PHOTOS.family2, rotation: 3 },
    ],
  },
];

/* ── Scrolling album preview component ── */

function ScrollingAlbumPreview({
  pages,
  isLayflat,
  isSelected,
}: {
  pages: PageSample[];
  isLayflat: boolean;
  isSelected: boolean;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % pages.length);
    }, 2800);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [pages.length]);

  const page = pages[currentIndex];

  return (
    <div
      className="relative w-full h-full overflow-hidden rounded-t-2xl"
      style={{ backgroundColor: page.bg }}
    >
      {/* Center crease line */}
      {!isLayflat && (
        <div className="absolute left-1/2 top-0 bottom-0 w-[3px] -translate-x-1/2 z-20"
          style={{ background: 'linear-gradient(90deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.1) 100%)' }} />
      )}
      {isLayflat && (
        <div className="absolute left-1/2 top-0 bottom-0 w-[1px] -translate-x-1/2 z-20 bg-white/20" />
      )}

      {/* Photo slots */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="absolute inset-0 p-3"
        >
          {page.slots.map((slot, i) => (
            <motion.div
              key={`${currentIndex}-${i}`}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.08 + i * 0.08, duration: 0.35 }}
              className="absolute overflow-hidden"
              style={{
                left: `${slot.x}%`,
                top: `${slot.y}%`,
                width: `${slot.w}%`,
                height: `${slot.h}%`,
                transform: slot.rotation ? `rotate(${slot.rotation}deg)` : undefined,
                borderRadius: '4px',
                border: '2px solid rgba(255,255,255,0.7)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              }}
            >
              <img
                src={slot.photo}
                alt=""
                className="w-full h-full object-cover"
                loading="eager"
              />
            </motion.div>
          ))}
        </motion.div>
      </AnimatePresence>

      {/* Page indicator dots */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 z-10">
        {pages.map((_, i) => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full transition-all"
            style={{ backgroundColor: i === currentIndex ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.2)' }} />
        ))}
      </div>

      {/* Type label */}
      <div className="absolute top-2 left-2 z-10">
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-black/40 text-white backdrop-blur-sm">
          {isLayflat ? 'Layflat Spread' : 'Standard Page'}
        </span>
      </div>

      {/* Selected glow */}
      {isSelected && (
        <div className="absolute inset-0 rounded-t-2xl z-10 pointer-events-none"
          style={{ boxShadow: 'inset 0 0 0 3px #F4C2A1' }} />
      )}
    </div>
  );
}

/* ── Size card renderer ── */
function renderSizeCard(size: typeof ALBUM_SIZES[0], selectedSize: AlbumSizePreset, onSizeChange: (s: AlbumSizePreset) => void) {
  const isSelected = selectedSize === size.preset;
  return (
    <button
      key={size.preset}
      onClick={() => onSizeChange(size.preset)}
      className="p-4 rounded-xl border-2 text-left transition-all hover:shadow-md"
      style={{ borderColor: isSelected ? '#F4C2A1' : '#E8E8E8', backgroundColor: isSelected ? '#FFF5F0' : '#FFFFFF' }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <Ruler size={14} className={isSelected ? 'text-[#E8A598]' : 'text-[#9B9B9B]'} />
        {isSelected && <div className="w-5 h-5 rounded-full bg-[#F4C2A1] flex items-center justify-center"><svg width="10" height="8" viewBox="0 0 10 8"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg></div>}
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
    description: 'Classic bound pages with a visible center crease. Photos stay within individual page margins. The most popular choice for everyday memories.',
    pages: STANDARD_PAGES,
    icon: BookOpen,
    features: ['Traditional binding', 'Page-by-page layouts', 'Great for all occasions', 'Most affordable'],
  },
  {
    id: 'layflat' as const,
    name: 'Layflat Album',
    description: 'Pages lay completely flat when opened. Full spread designs cross the center with no crease — perfect for panoramas and wow-factor layouts.',
    pages: LAYFLAT_PAGES,
    icon: Layout,
    features: ['Pages lay 180° flat', 'Full-spread panoramas', 'No photo lost in crease', 'Premium feel'],
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
          <p className="text-[#6B6B6B] text-sm max-w-md mx-auto">Choose your album type and size first. This helps you plan your photo layouts better.</p>
        </motion.div>
      </div>

      {/* Step 1: Album Type */}
      {step === 1 && (
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex-1 px-4 pb-8">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-xl font-semibold text-[#2D2D2D] mb-6 text-center">What type of album do you want?</h2>

            <div className="grid md:grid-cols-2 gap-8 mb-6">
              {ALBUM_TYPES.map((type) => {
                const isSelected = selectedType === type.id;
                const Icon = type.icon;
                return (
                  <button
                    key={type.id}
                    onClick={() => onTypeChange(type.id)}
                    className="group text-left rounded-2xl border-2 transition-all overflow-hidden hover:shadow-2xl hover:scale-[1.01]"
                    style={{ borderColor: isSelected ? '#F4C2A1' : '#E8E8E8', backgroundColor: '#FFFFFF' }}
                  >
                    {/* Scrolling preview */}
                    <div className="relative h-80 md:h-96">
                      <ScrollingAlbumPreview pages={type.pages} isLayflat={type.id === 'layflat'} isSelected={isSelected} />
                    </div>

                    {/* Info */}
                    <div className="p-6">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors" style={{ backgroundColor: isSelected ? '#FDE8E4' : '#F0F0F0' }}>
                          <Icon size={20} style={{ color: isSelected ? '#E8A598' : '#9B9B9B' }} />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg text-[#2D2D2D]">{type.name}</h3>
                        </div>
                        {isSelected && (
                          <div className="w-7 h-7 rounded-full bg-[#F4C2A1] flex items-center justify-center shadow-md flex-shrink-0">
                            <svg width="12" height="9" viewBox="0 0 12 9"><path d="M1 4.5L4 7.5L11 1" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </div>
                        )}
                      </div>
                      <p className="text-sm text-[#6B6B6B] mb-4 leading-relaxed">{type.description}</p>
                      <div className="flex flex-wrap gap-2">
                        {type.features.map((f) => (
                          <span key={f} className="px-3 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: isSelected ? '#FDE8E4' : '#F0F0F0', color: isSelected ? '#E8A598' : '#9B9B9B' }}>{f}</span>
                        ))}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Comparison hint */}
            <div className="text-center mb-6">
              <p className="text-xs text-[#9B9B9B] inline-flex items-center gap-1.5 px-4 py-2 bg-white rounded-full border border-[#E8E8E8]">
                <Sparkles size={12} className="text-[#F4C2A1]" />
                Standard shows a center crease — Layflat spreads edge-to-edge with no gap
              </p>
            </div>

            <div className="text-center">
              <button onClick={() => setStep(2)} className="inline-flex items-center gap-2 px-8 py-3 bg-[#F4C2A1] text-white font-medium rounded-xl hover:brightness-105 transition-all shadow-lg shadow-[#F4C2A1]/20">
                Next: Choose Size <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Step 2: Size — unchanged */}
      {step === 2 && (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex-1 px-4 pb-8">
          <div className="max-w-4xl mx-auto">
            <button onClick={() => setStep(1)} className="text-sm text-[#9B9B9B] hover:text-[#E8A598] mb-4 transition-colors">Back to album type</button>
            <h2 className="text-xl font-semibold text-[#2D2D2D] mb-2">What size album do you want?</h2>
            <p className="text-sm text-[#6B6B6B] mb-8">Choose the orientation that fits your photos best.</p>

            <div className="mb-6">
              <h3 className="text-sm font-semibold text-[#9B9B9B] uppercase tracking-wider mb-3 flex items-center gap-2"><div className="w-2 h-2 rounded-sm bg-[#F4C2A1]" /> Square</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{ALBUM_SIZES.filter(s => s.category === 'square').map(s => renderSizeCard(s, selectedSize, onSizeChange))}</div>
            </div>
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-[#9B9B9B] uppercase tracking-wider mb-3 flex items-center gap-2"><div className="w-2 h-3 rounded-sm bg-[#E8A598]" /> Portrait <span className="text-xs font-normal normal-case text-[#C4C4C4]">taller than wide</span></h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{ALBUM_SIZES.filter(s => s.category === 'portrait').map(s => renderSizeCard(s, selectedSize, onSizeChange))}</div>
            </div>
            <div className="mb-10">
              <h3 className="text-sm font-semibold text-[#9B9B9B] uppercase tracking-wider mb-3 flex items-center gap-2"><div className="w-3 h-2 rounded-sm bg-[#C4B5E0]" /> Landscape <span className="text-xs font-normal normal-case text-[#C4C4C4]">wider than tall</span></h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{ALBUM_SIZES.filter(s => s.category === 'landscape').map(s => renderSizeCard(s, selectedSize, onSizeChange))}</div>
            </div>
            <div className="text-center">
              <button onClick={onNext} className="inline-flex items-center gap-2 px-8 py-3 bg-[#F4C2A1] text-white font-medium rounded-xl hover:brightness-105 transition-all shadow-lg shadow-[#F4C2A1]/20">
                Start Creating <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
