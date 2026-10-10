/* ══════════════════════════════════════════════════════════════════════════
   A guest's photo or video, made ready ON THE PHONE before it uploads (the
   cost plan: shrink on the device, never resize in the cloud).

   A photo becomes three JPEGs:
     • print master, long edge ≤ PRINT_MAX (300 dpi on a 12" page) — private,
       for the host's album;
     • view copy, ≤ VIEW_MAX — what the feed and the venue screen show;
     • thumbnail, ≤ THUMB_MAX — the grid.
   A video gets a poster thumbnail (a frame near its start) and its duration.
   ══════════════════════════════════════════════════════════════════════════ */

export const PRINT_MAX = 3600;
export const VIEW_MAX = 1200;
export const THUMB_MAX = 400;

/** The size a long edge of `max` makes of (w, h), never upscaling. */
export function fitWithin(w: number, h: number, max: number): { width: number; height: number } {
  const long = Math.max(w, h);
  if (long <= max || long <= 0) return { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) };
  const k = max / long;
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

type Drawable = ImageBitmap | HTMLImageElement | HTMLVideoElement;
const sizeOf = (d: Drawable) =>
  d instanceof HTMLVideoElement ? { w: d.videoWidth, h: d.videoHeight }
    : d instanceof HTMLImageElement ? { w: d.naturalWidth, h: d.naturalHeight }
      : { w: d.width, h: d.height };

/** Draw `src` at most `max` on its long edge, as a JPEG. */
export async function jpegOf(src: Drawable, max: number, quality: number): Promise<{ blob: Blob; width: number; height: number }> {
  const { w, h } = sizeOf(src);
  const { width, height } = fitWithin(w, h, max);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This phone couldn’t prepare the photo.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('This phone couldn’t prepare the photo.');
  return { blob, width, height };
}

async function decodeImage(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* fall back below */ }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('This photo couldn’t be opened. Try a different one.'));
      img.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export interface PhotoCopies { original: Blob; view: Blob; thumb: Blob; width: number; height: number }

export async function makePhotoCopies(file: Blob): Promise<PhotoCopies> {
  const img = await decodeImage(file);
  try {
    const original = await jpegOf(img, PRINT_MAX, 0.9);
    const view = await jpegOf(img, VIEW_MAX, 0.8);
    const thumb = await jpegOf(img, THUMB_MAX, 0.75);
    return { original: original.blob, view: view.blob, thumb: thumb.blob, width: original.width, height: original.height };
  } finally {
    if ('close' in img && typeof img.close === 'function') img.close();
  }
}

export interface VideoFacts { thumb: Blob; durationS: number; width: number; height: number }

/** A frame near the start as the poster, plus the video's length and size. */
export function videoFacts(file: Blob, timeoutMs = 10_000): Promise<VideoFacts> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    let done = false;
    const finish = (err: Error | null, facts?: VideoFacts) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      if (err) reject(err); else resolve(facts!);
    };
    const timer = setTimeout(() => finish(new Error('This video couldn’t be read on this phone.')), timeoutMs);
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.onerror = () => finish(new Error('This video couldn’t be read on this phone.'));
    v.onloadedmetadata = () => {
      const d = Number.isFinite(v.duration) ? v.duration : 0;
      v.currentTime = Math.min(0.5, d / 2);
    };
    v.onseeked = () => {
      jpegOf(v, THUMB_MAX, 0.75)
        .then((t) => finish(null, { thumb: t.blob, durationS: Number.isFinite(v.duration) ? v.duration : 0, width: v.videoWidth, height: v.videoHeight }))
        .catch((e: Error) => finish(e));
    };
    v.src = url;
  });
}
