/* One yearbook page on screen, painted by the same painter as the print file. */
import { useEffect, useRef, useState } from 'react';
import { paintPage } from '@/yearbook/painter';
import { bitmapNow, loadBitmap } from '@/yearbook/store';
import type { YbPage } from '@/yearbook/layout';
import { TRIM } from '@/yearbook/geometry';

interface Props {
  page: YbPage;
  widthPx: number;
  selectedPersonId?: string;
  onPickPerson?: (personId: string) => void;
}

export default function PageCanvas({ page, widthPx, selectedPersonId, onPickPerson }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState(0);
  const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
  const ppi = (widthPx / TRIM.w) * dpr;

  // Decode this page's photos, then repaint once they're in.
  useEffect(() => {
    let alive = true;
    const ids = page.elements.flatMap((e) => (e.kind === 'photo' ? [e.photoId] : []));
    const missing = ids.filter((id) => !bitmapNow(id));
    if (missing.length) Promise.all(missing.map(loadBitmap)).then(() => alive && setLoaded((n) => n + 1));
    return () => { alive = false; };
  }, [page]);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    paintPage(c, page, { ppi, bleed: false, photo: bitmapNow, guides: true, highlightPersonId: selectedPersonId });
  }, [page, ppi, loaded, selectedPersonId]);

  const onClick = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onPickPerson) return;
    const rect = ev.currentTarget.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * TRIM.w;
    const y = ((ev.clientY - rect.top) / rect.height) * TRIM.h;
    const hit = page.elements.find((e) => e.kind === 'photo' && e.personId && x >= e.x && x <= e.x + e.w && y >= e.y && y <= e.y + e.h);
    if (hit && hit.kind === 'photo' && hit.personId) onPickPerson(hit.personId);
  };

  return (
    <canvas
      ref={ref}
      onClick={onClick}
      data-page={page.number}
      className="block bg-white shadow-[0_1px_3px_rgba(0,0,0,0.12),0_8px_24px_rgba(0,0,0,0.06)] cursor-pointer"
      style={{ width: widthPx, height: (widthPx * TRIM.h) / TRIM.w }}
    />
  );
}
