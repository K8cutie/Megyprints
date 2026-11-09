import { useId, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import type { ArtPaint, MaskArt } from './maskArt';

/* ══════════════════════════════════════════════════════════════════════════
   A mask that paints (maskArt.ts), in the DOM: the website's preview and the
   phone Studio's thumbnails. The same description print draws: the card
   under the photo, the photo clipped to the shape, the paint inside it, the
   paint over it, each as SVG paths (a canvas shadow is an SVG drop shadow
   with half its blur as the deviation, as Skia and Chrome's canvas draw it).
   `art` is in the box's own px, its corner at 0,0.
   ══════════════════════════════════════════════════════════════════════════ */

function ArtSvg({ paints, w, h }: { paints: readonly ArtPaint[]; w: number; h: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  if (!paints.length) return null;
  const shadowOf = (i: number, a: ArtPaint) => (a.kind !== 'radial' && a.shadow ? `url(#${uid}s${i})` : undefined);
  return (
    <svg aria-hidden width={w} height={h} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}>
      <defs>
        {paints.map((a, i) => (a.kind === 'radial' ? (
          <radialGradient key={i} id={`${uid}g${i}`} gradientUnits="userSpaceOnUse" cx={a.cx} cy={a.cy} r={a.r}>
            {a.stops.map((s, j) => <stop key={j} offset={s.offset} stopColor={s.color} />)}
          </radialGradient>
        ) : a.shadow ? (
          <filter key={i} id={`${uid}s${i}`} filterUnits="userSpaceOnUse" x={-w} y={-h} width={w * 3} height={h * 3}>
            <feDropShadow dx={0} dy={a.shadow.dy} stdDeviation={a.shadow.blur / 2} floodColor={a.shadow.color} />
          </filter>
        ) : null))}
      </defs>
      {paints.map((a, i) => {
        if (a.kind === 'radial') return <path key={i} d={a.d} fill={`url(#${uid}g${i})`} />;
        if (a.kind === 'fill') return <path key={i} d={a.d} fill={a.color} fillRule={a.evenOdd ? 'evenodd' : 'nonzero'} filter={shadowOf(i, a)} />;
        return (
          <path key={i} d={a.d} fill="none" stroke={a.color} strokeWidth={a.width} strokeDasharray={a.dash?.join(' ')}
            strokeLinecap={a.round ? 'round' : 'butt'} strokeMiterlimit={10} filter={shadowOf(i, a)} />
        );
      })}
    </svg>
  );
}

/** The mask over a box `w` × `h` (place it with `style`); `photo` is the
 *  photo, laid out in the box's own px (it is clipped to the shape). */
export function MaskArtView({ art, w, h, photo, style, children, onClick, slotIndex }: {
  art: MaskArt;
  w: number;
  h: number;
  photo: ReactNode;
  style?: CSSProperties;
  /** More on top (a remove button). */
  children?: ReactNode;
  onClick?: (e: MouseEvent) => void;
  /** The page's frame number (data-slot, as the preview marks every photo). */
  slotIndex?: number;
}) {
  return (
    <div data-slot={slotIndex} onClick={onClick} style={{ position: 'absolute', width: w, height: h, ...style }}>
      <ArtSvg paints={art.under} w={w} h={h} />
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', clipPath: `path("${art.clip}")` }}>
        {photo}
        <ArtSvg paints={art.inside} w={w} h={h} />
      </div>
      <ArtSvg paints={art.over} w={w} h={h} />
      {children}
    </div>
  );
}
