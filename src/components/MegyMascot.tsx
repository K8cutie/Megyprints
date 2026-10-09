import { MEGY_MASCOT_FALLBACK, MEGY_MASCOT_SRCSET } from '../lib/megyMascot';

// The sizes Megy shows at, in CSS px. Literal classes so Tailwind keeps them.
const SIZE_CLASS = {
  28: 'w-7 h-7',
  32: 'w-8 h-8',
  40: 'w-10 h-10',
  64: 'w-16 h-16',
  80: 'w-20 h-20',
  96: 'w-24 h-24',
  128: 'w-32 h-32',
} as const;

export type MegyMascotSize = keyof typeof SIZE_CLASS;

/**
 * Megy, at one of the sizes above. `sizes` tells the browser how big she is
 * drawn, so a phone fetches only the copy its screen needs (~6–40 KB) instead
 * of the 1.5 MB master. width/height reserve the box before the file lands.
 */
export default function MegyMascot({ size, alt = 'Megy', className = '' }: {
  size: MegyMascotSize;
  /** '' when the picture is decoration next to a heading that already says it. */
  alt?: string;
  className?: string;
}) {
  return (
    <img
      src={MEGY_MASCOT_FALLBACK}
      srcSet={MEGY_MASCOT_SRCSET}
      sizes={`${size}px`}
      width={size}
      height={size}
      alt={alt}
      className={`${SIZE_CLASS[size]} ${className}`.trim()}
      draggable={false}
    />
  );
}
