import type { CSSProperties } from 'react';

/* ── The open-book look of the preview ──────────────────────────────────────
   Owner (2026-09-13): "in the preview it looks so flat, no realism." These are
   the physical cues an open album has and a flat spread lacks. All of them are
   layers AROUND or OVER the untouched pages; none of them can catch a tap. */
const GRAIN_SVG = "data:image/svg+xml;utf8," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.35  0 0 0 0 0.25  0 0 0 0 0.15  0 0 0 0.5 0"/></filter><rect width="160" height="160" filter="url(#g)"/></svg>');
export const BOOK = {
  /** The stage: a softly lit table, darker at the edges, so the paper reads lighter than what it sits on. */
  table: {
    background: 'radial-gradient(ellipse at 50% 38%, rgb(var(--t-paper)) 0%, rgb(var(--t-paper)) 35%, #E3DED6 75%, #D8D1C8 100%)',
  } as CSSProperties,
  /** The cover peeking out around the page block, and the book's shadow on the table. */
  cover: (w: number, h: number, s: number): CSSProperties => {
    const lip = Math.max(5, Math.round(11 * s));
    return {
      position: 'relative', padding: lip, borderRadius: Math.max(2, Math.round(4 * s)),
      background: 'linear-gradient(135deg, #5A463B 0%, #3F2F27 55%, #4A382F 100%)',
      boxShadow: `0 ${Math.round(28 * s)}px ${Math.round(60 * s)}px -${Math.round(14 * s)}px rgba(45,28,16,0.55), 0 ${Math.round(8 * s)}px ${Math.round(18 * s)}px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.10)`,
      width: w + lip * 2, height: h + lip * 2, boxSizing: 'border-box',
    };
  },
  /** The stack of page edges under the spread: thin light/dark lines that step out on the outer sides and the foot. */
  edges: (w: number, h: number, s: number): CSSProperties => {
    const lip = Math.max(5, Math.round(11 * s));
    const step = Math.max(1, Math.round(1.6 * s));
    const shadow: string[] = [];
    for (let i = 1; i <= 4; i++) {
      const c = i % 2 ? '#F3EFE9' : '#D9D2C8';
      shadow.push(`${step * i}px ${step * i}px 0 ${c}`, `-${step * i}px ${step * i}px 0 ${c}`);
    }
    return { position: 'absolute', left: lip, top: lip, width: w, height: h, background: '#FBF8F3', boxShadow: shadow.join(', '), pointerEvents: 'none' };
  },
  /** A light vignette over both pages: prints under real light are never perfectly even. */
  vignette: (s: number): CSSProperties => ({
    position: 'absolute', inset: 0, zIndex: 40, pointerEvents: 'none',
    boxShadow: `inset 0 0 ${Math.round(34 * s)}px rgba(60,40,20,0.10)`,
  }),
  /** Paper grain, barely there. */
  grain: {
    position: 'absolute', inset: 0, zIndex: 41, pointerEvents: 'none',
    backgroundImage: `url("${GRAIN_SVG}")`, backgroundSize: '160px 160px', opacity: 0.10, mixBlendMode: 'multiply',
  } as CSSProperties,
  /** The gutter: each page darkens toward the spine and the fold itself is a soft valley with a hairline of light beside it. */
  gutter: {
    position: 'absolute', inset: 0, zIndex: 42, pointerEvents: 'none',
    background: [
      'linear-gradient(to right,',
      '  rgba(0,0,0,0) 0%, rgba(0,0,0,0) 38%, rgba(0,0,0,0.04) 45%, rgba(0,0,0,0.13) 48.6%, rgba(0,0,0,0.30) 49.75%,',
      '  rgba(0,0,0,0.34) 50%,',
      '  rgba(0,0,0,0.30) 50.25%, rgba(0,0,0,0.13) 51.4%, rgba(0,0,0,0.04) 55%, rgba(0,0,0,0) 62%, rgba(0,0,0,0) 100%)',
      ', linear-gradient(to right, rgba(255,255,255,0) 47.6%, rgba(255,255,255,0.22) 48.9%, rgba(255,255,255,0) 49.6%, rgba(255,255,255,0) 50.4%, rgba(255,255,255,0.22) 51.1%, rgba(255,255,255,0) 52.4%)',
    ].join(''),
  } as CSSProperties,
  /** A single page (the album's last, odd page): shade its free edge instead of a gutter. */
  edgeShade: (side: 'left' | 'right'): CSSProperties => ({
    position: 'absolute', inset: 0, zIndex: 42, pointerEvents: 'none',
    background: side === 'right'
      ? 'linear-gradient(to left, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0) 6%)'
      : 'linear-gradient(to right, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0) 6%)',
  }),
};
