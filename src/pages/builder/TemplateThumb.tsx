/* A lightweight preview of a page template: photo frames as peach blocks (labeled
   with their ratio), text boxes as dashed "text" regions. No photos needed — used
   in the admin grid to eyeball every layout. Renders in the album's true aspect. */

import type { PageTemplate, AlbumSizePreset } from './types';
import { getCanvasDimensions } from './layouts';

export default function TemplateThumb({ template, size, w = 140 }: {
  template: PageTemplate;
  size: AlbumSizePreset;
  w?: number;
}) {
  const dims = getCanvasDimensions(size);
  const aspect = dims.width / Math.max(1, dims.height);
  const H = Math.round(w / aspect);
  const m = template.fullBleed ? { top: 0, bottom: 0, left: 0, right: 0 } : template.margin;
  const safeX = m.left, safeY = m.top;
  const safeW = 1 - m.left - m.right, safeH = 1 - m.top - m.bottom;
  const pct = (n: number) => `${n * 100}%`;

  return (
    <div style={{ position: 'relative', width: w, height: H, background: '#fff', border: '1px solid #E8E8E8', borderRadius: 6, overflow: 'hidden' }}>
      {template.slots.map((s, i) => (
        <div key={`s${i}`} style={{
          position: 'absolute',
          left: pct(safeX + s.x * safeW), top: pct(safeY + s.y * safeH),
          width: pct(s.width * safeW), height: pct(s.height * safeH),
          background: '#F4C2A1', border: '1px solid #fff', boxSizing: 'border-box',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, color: 'rgba(90,60,40,0.7)', overflow: 'hidden',
        }}>{s.ratio ?? template.targetRatio}</div>
      ))}
      {template.textSlots?.map((ts, i) => (
        <div key={`t${i}`} style={{
          position: 'absolute',
          left: pct(safeX + ts.x * safeW), top: pct(safeY + ts.y * safeH),
          width: pct(ts.width * safeW), height: pct(ts.height * safeH),
          border: '1px dashed #B9A07A', boxSizing: 'border-box',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 8, color: '#B9A07A', fontStyle: 'italic',
        }}>text</div>
      ))}
    </div>
  );
}
