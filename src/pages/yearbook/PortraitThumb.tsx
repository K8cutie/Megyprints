/* A small portrait exactly as it will print: the same-head-size crop. */
import { useEffect, useRef, useState } from 'react';
import { fitPortrait, mainFace } from '@/yearbook/portraitFit';
import { bitmapNow, loadBitmap } from '@/yearbook/store';
import type { PhotoMeta } from '@/yearbook/types';

export default function PortraitThumb({ photo, width = 72, fitted = true }: { photo?: PhotoMeta; width?: number; fitted?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [tick, setTick] = useState(0);
  const height = Math.round(width / 0.8);

  useEffect(() => {
    if (photo && !bitmapNow(photo.id)) loadBitmap(photo.id).then(() => setTick((t) => t + 1));
  }, [photo]);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = width * dpr; c.height = height * dpr;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#eceef1';
    ctx.fillRect(0, 0, c.width, c.height);
    const bmp = photo ? bitmapNow(photo.id) : null;
    if (!photo || !bmp) return;
    const crop = fitted ? fitPortrait(photo.width, photo.height, mainFace(photo.faces)).crop : { x: 0, y: 0, w: photo.width, h: photo.height };
    if (fitted) ctx.drawImage(bmp, crop.x, crop.y, crop.w, crop.h, 0, 0, c.width, c.height);
    else {
      const s = Math.min(c.width / photo.width, c.height / photo.height);
      ctx.drawImage(bmp, (c.width - photo.width * s) / 2, (c.height - photo.height * s) / 2, photo.width * s, photo.height * s);
    }
  }, [photo, width, height, tick, fitted]);

  return <canvas ref={ref} style={{ width, height }} className="rounded-sm block shrink-0" />;
}
