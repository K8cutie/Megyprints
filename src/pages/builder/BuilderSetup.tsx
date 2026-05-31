import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, BookOpen, Ruler, Sparkles } from 'lucide-react';
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
  onSizeChange: (size: AlbumSizePreset) => void;
  onNext: () => void;
}

const ALBUM_TYPES = [
  {
    id: 'standard' as const,
    name: 'Standard Album',
    description: 'Classic bound pages with customizable backgrounds per page.',
    pages: STANDARD_PAGES,
    icon: BookOpen,
    features: ['Customizable backgrounds', 'Page-by-page layouts', 'Great for all occasions'],
  },
];

// Deprecated: Layflat removed — users customize backgrounds in the editor instead

export default function BuilderSetup({ selectedSize, onSizeChange, onNext }: BuilderSetupProps) {
  return (
    <div className="h-full flex flex-col bg-[#FFFBF7] overflow-y-auto">
      {/* Header */}
      <div className="text-center pt-10 pb-6 px-4">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-[#FDE8E4] rounded-full mb-4">
            <Sparkles size={14} className="text-[#E8A598]" />
            <span className="text-xs font-medium text-[#E8A598]">Step 1 of 3</span>
          </div>
          <h1 className="font-display text-3xl md:text-4xl text-[#2D2D2D] mb-2">Create Your Album</h1>
          <p className="text-[#6B6B6B] text-sm max-w-md mx-auto">Choose your album size. Backgrounds and styles are fully customizable in the editor.</p>
        </motion.div>
      </div>

      {/* Album type indicator (Standard only — Layflat removed) */}
      <div className="max-w-4xl mx-auto w-full px-4 mb-6">
        <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-[#E8E8E8]">
          <div className="w-8 h-8 rounded-lg bg-[#FDE8E4] flex items-center justify-center">
            <BookOpen size={16} className="text-[#E8A598]" />
          </div>
          <div>
            <p className="text-sm font-medium text-[#2D2D2D]">Standard Album</p>
            <p className="text-[10px] text-[#9B9B9B]">Customize backgrounds per page in the editor</p>
          </div>
        </div>
      </div>

      {/* Size selection */}
      <div className="flex-1 px-4 pb-8">
        <div className="max-w-4xl mx-auto">
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
      </div>
    </div>
  );
}
