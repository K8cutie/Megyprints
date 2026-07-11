/* CoverWrapPreview — DOM preview of the flat cover wrap (back · spine · front).
   Consumes the shared coverLayout so it stays pixel-faithful to the print
   output. Text styling mirrors BuilderPreview's page-text mapping exactly
   (fontFamily||'serif', lineHeight 1.25, + wordArtDomStyle) so a cover title and
   a page caption render the same. */

import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { resolveBgImageSrc, type UploadedPhoto } from './types';
import type { CoverWrapGeometry } from './coverGeometry';
import type { CoverDesign } from './types';
import { coverLayout, type PanelLayout, type PositionedText } from './coverLayout';
import { wordArtDomStyle } from './wordArt';

interface Props {
  geometry: CoverWrapGeometry;
  coverDesign: CoverDesign;
  photos: UploadedPhoto[];
  /** Rendered width in CSS px; height derives from the wrap aspect ratio. */
  width: number;
  /** Draw dashed fold/crease guides at the spine edges. */
  showGuides?: boolean;
  className?: string;
}

export function CoverWrapPreview({ geometry, coverDesign, photos, width, showGuides, className }: Props) {
  const layout = useMemo(() => coverLayout(geometry, coverDesign), [geometry, coverDesign]);
  const scale = width / layout.wrap.wPx;
  const height = layout.wrap.hPx * scale;
  // Full-bleed base — mirrors the print renderer so preview and print both have
  // no white turn-in edges (back colour left of the spine, front colour right).
  const backBg = layout.panels.find((p) => p.panel === 'back')?.bg || '#ffffff';
  const frontBg = layout.panels.find((p) => p.panel === 'front')?.bg || '#ffffff';

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width,
        height,
        background: '#ffffff',
        overflow: 'hidden',
        borderRadius: 4,
        boxShadow: '0 2px 12px rgba(0,0,0,0.14)',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, background: backBg }} />
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: layout.foldXPx[0] * scale, right: 0, background: frontBg }} />
      {layout.panels.map((p) => (
        <PanelView key={p.panel} p={p} scale={scale} photos={photos} />
      ))}
      {showGuides &&
        layout.foldXPx.map((fx, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: 0,
              left: fx * scale,
              width: 0,
              height: '100%',
              borderLeft: '1px dashed rgba(0,0,0,0.35)',
              pointerEvents: 'none',
            }}
          />
        ))}
    </div>
  );
}

function PanelView({ p, scale, photos }: { p: PanelLayout; scale: number; photos: UploadedPhoto[] }) {
  const photoSrc = p.photoId ? resolveBgImageSrc({ photoId: p.photoId }, photos) : undefined;
  return (
    <div
      style={{
        position: 'absolute',
        left: p.rect.x * scale,
        top: p.rect.y * scale,
        width: p.rect.width * scale,
        height: p.rect.height * scale,
        background: p.bg || 'transparent',
        overflow: 'hidden',
      }}
    >
      {photoSrc && (
        <img
          src={photoSrc}
          alt=""
          draggable={false}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}
      {p.texts.map((t, i) => (
        <TextView key={i} t={t} panelRect={p.rect} scale={scale} />
      ))}
      {p.brandMark && (
        <div
          style={{
            position: 'absolute',
            left: (p.brandMark.x - p.rect.x) * scale,
            top: (p.brandMark.y - p.rect.y) * scale,
            width: p.brandMark.width * scale,
            height: p.brandMark.height * scale,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            style={{
              fontFamily: 'Cinzel, Georgia, serif',
              fontSize: p.brandMark.height * scale * 0.62,
              color: 'rgba(0,0,0,0.55)',
              letterSpacing: '0.08em',
              whiteSpace: 'nowrap',
            }}
          >
            Megy Prints
          </span>
        </div>
      )}
    </div>
  );
}

function textCss(st: PositionedText['style'], scale: number): CSSProperties {
  return {
    width: '100%',
    fontFamily: st.fontFamily || 'serif',
    fontSize: (st.fontSize || 24) * scale,
    fontWeight: st.bold ? 'bold' : 'normal',
    fontStyle: st.italic ? 'italic' : 'normal',
    textDecoration: st.underline ? 'underline' : 'none',
    color: st.color || '#2D2D2D',
    textAlign: st.alignment as CSSProperties['textAlign'],
    lineHeight: 1.25,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    ...wordArtDomStyle(st, scale),
  };
}

function TextView({ t, panelRect, scale }: { t: PositionedText; panelRect: PositionedText['rect']; scale: number }) {
  // Spine (rotated) text: fill the panel, centre, rotate the (nowrap) line.
  if (t.rotateDeg) {
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ ...textCss(t.style, scale), width: 'auto', whiteSpace: 'nowrap', transform: `rotate(${t.rotateDeg}deg)`, transformOrigin: 'center center' }}>
          {t.style.text}
        </div>
      </div>
    );
  }
  const justify = t.valign === 'top' ? 'flex-start' : t.valign === 'bottom' ? 'flex-end' : 'center';
  return (
    <div
      style={{
        position: 'absolute',
        left: (t.rect.x - panelRect.x) * scale,
        top: (t.rect.y - panelRect.y) * scale,
        width: t.rect.width * scale,
        height: t.rect.height * scale,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: justify,
      }}
    >
      <div style={textCss(t.style, scale)}>{t.style.text}</div>
    </div>
  );
}
