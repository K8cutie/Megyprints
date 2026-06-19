import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Sparkles } from 'lucide-react';
import { ALBUM_SIZES } from './types';
import type { AlbumSizePreset } from './types';

/* ═══════════════════════════════════════════════════════════
   MEGY SIZE SETUP — Megy is the star. Sizes are clean.
   ═══════════════════════════════════════════════════════════ */

function MegyFace({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const sz = { sm: 'w-10 h-10', md: 'w-16 h-16', lg: 'w-24 h-24', xl: 'w-32 h-32' };
  return <img src="/megy-character.png" alt="Megy" className={`${sz[size]} object-contain drop-shadow-lg`} draggable={false} />;
}

function TypeText({ text, speed = 28 }: { text: string; speed?: number }) {
  const [d, setD] = useState('');
  useEffect(() => {
    setD('');
    let i = 0;
    const t = setInterval(() => {
      if (i < text.length) { setD(text.slice(0, i + 1)); i++; }
      else clearInterval(t);
    }, speed);
    return () => clearInterval(t);
  }, [text, speed]);
  return <span>{d}{d.length < text.length && <span className="inline-block w-0.5 h-4 bg-[#F4C2A1] ml-0.5 animate-pulse align-middle" />}</span>;
}

/* ── Size card renderer ── */
function SizeCard({ size, selected, onSelect }: {
  size: typeof ALBUM_SIZES[0];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <motion.button
      onClick={onSelect}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      className="relative p-5 rounded-2xl border-2 text-left transition-all hover:shadow-lg"
      style={{
        borderColor: selected ? '#F4C2A1' : '#E8E8E8',
        backgroundColor: selected ? '#FFF5F0' : '#FFFFFF',
      }}
    >
      {selected && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute top-3 right-3 w-6 h-6 rounded-full bg-[#F4C2A1] flex items-center justify-center"
        >
          <svg width="12" height="10" viewBox="0 0 10 8">
            <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          </svg>
        </motion.div>
      )}
      <div className="flex items-center gap-3 mb-2">
        <div
          className="rounded-lg border border-[#E8E8E8] bg-[#F9F9F9] flex items-center justify-center"
          style={{
            width: size.category === 'landscape' ? 48 : size.category === 'portrait' ? 32 : 40,
            height: size.category === 'landscape' ? 32 : size.category === 'portrait' ? 48 : 40,
          }}
        >
          <div
            className="rounded bg-[#FDE8E4]"
            style={{
              width: size.category === 'landscape' ? 36 : size.category === 'portrait' ? 20 : 28,
              height: size.category === 'landscape' ? 20 : size.category === 'portrait' ? 36 : 28,
            }}
          />
        </div>
        <div>
          <p className="font-semibold text-sm text-[#2D2D2D]">{size.name}</p>
          <p className="text-[10px] text-[#9B9B9B] capitalize">{size.category}</p>
        </div>
      </div>
      <p className="text-[11px] text-[#8B7E7A] leading-relaxed">
        {size.preset === '6x6' && 'Perfect for small gifts & keepsakes'}
        {size.preset === '8x8' && 'Great for travel & everyday memories'}
        {size.preset === '9x9' && 'Bold statement piece for special occasions'}
        {size.preset === '6x4' && 'Compact landscape for panoramas'}
        {size.preset === '11.5x8' && 'Wide format for events & weddings'}
        {size.preset === '8.5x11' && 'Classic portrait for portraits & families'}
      </p>
    </motion.button>
  );
}

interface BuilderSetupProps {
  selectedSize: AlbumSizePreset;
  onSizeChange: (size: AlbumSizePreset) => void;
  onNext: () => void;
}

export default function BuilderSetup({ selectedSize, onSizeChange, onNext }: BuilderSetupProps) {
  return (
    <div className="h-full flex flex-col items-center justify-center bg-[#FFFBF7] overflow-y-auto px-4 py-8">
      {/* Megy — center attraction */}
      <motion.div
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', damping: 14, stiffness: 200 }}
        className="flex flex-col items-center text-center mb-8"
      >
        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
        >
          <MegyFace size="xl" />
        </motion.div>
        <h1 className="font-display text-2xl md:text-3xl text-[#2D2D2D] mt-4 mb-2">
          <TypeText text="Let's pick the perfect size for your album!" speed={30} />
        </h1>
        <p className="text-sm text-[#8B7E7A] max-w-xs">
          Choose the size that fits your photos best. You can always change this later!
        </p>
      </motion.div>

      {/* Size Grid — 5 streamlined options */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.4 }}
        className="w-full max-w-lg"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
          {ALBUM_SIZES.map((size) => (
            <SizeCard
              key={size.preset}
              size={size}
              selected={selectedSize === size.preset}
              onSelect={() => onSizeChange(size.preset)}
            />
          ))}
        </div>

        {/* Start Creating */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="text-center"
        >
          <button
            onClick={onNext}
            className="inline-flex items-center gap-2 px-10 py-3.5 bg-gradient-to-r from-[#F4C2A1] to-[#E8A598] text-white font-semibold rounded-2xl hover:brightness-105 transition-all shadow-lg shadow-[#F4C2A1]/25 text-base"
          >
            <Sparkles size={18} />
            Start Creating
            <ChevronRight size={18} />
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
}
