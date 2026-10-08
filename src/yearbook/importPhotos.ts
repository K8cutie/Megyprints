/* ── Bringing photos in ──────────────────────────────────────────────────────
   Each file is turned upright (camera orientation), stored at print size
   (portraits 2400 px on the long edge, class photos 3600 px — enough for
   300 dpi on the page, no more), and scanned by the on-device face AI for
   the face box and both eyes. Nothing leaves the computer. */
import { initFaceLandmarks, detectFaceGeometry } from '../pages/builder/faceDetection';
import { readCaptureTime } from '../pages/builder/exif';
import { putPhoto } from './store';
import type { FaceGeom, PhotoFlag, PhotoMeta } from './types';

export type PhotoKind = 'portrait' | 'group';

const LONG_EDGE: Record<PhotoKind, number> = { portrait: 2400, group: 3600 };
const SCAN_EDGE: Record<PhotoKind, number> = { portrait: 900, group: 1800 };
const ACCEPT = /\.(jpe?g|png|webp)$/i;

export const isPhotoFile = (f: File): boolean => ACCEPT.test(f.name) || /^image\/(jpeg|png|webp)$/.test(f.type);

function canvasOf(src: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

const toJpeg = (c: HTMLCanvasElement): Promise<Blob> =>
  new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not save the photo'))), 'image/jpeg', 0.92));

export const newId = (): string => crypto.randomUUID();

/** Scan a canvas for faces and turn them into the yearbook's FaceGeom. */
export async function scanFaces(c: HTMLCanvasElement, kind: PhotoKind): Promise<{ faces: FaceGeom[]; scanned: boolean }> {
  const ready = await initFaceLandmarks();
  if (!ready) return { faces: [], scanned: false };
  const found = await detectFaceGeometry(c, kind === 'group' ? 608 : 416);
  return { faces: found.map((f) => ({ ...f, source: 'ai' as const })), scanned: true };
}

function flagsFor(meta: { width: number; height: number; faces: FaceGeom[]; scanned: boolean }, kind: PhotoKind, sourceLongEdge: number): PhotoFlag[] {
  const flags: PhotoFlag[] = [];
  if (kind === 'portrait' && meta.scanned) {
    if (!meta.faces.length) flags.push('no_face');
    const areas = meta.faces.map((f) => f.box.w * f.box.h).sort((a, b) => b - a);
    if (areas.length > 1 && areas[1] > areas[0] * 0.5) flags.push('many_faces');
  }
  // A 4-per-page portrait is ~3.6 in wide: 1000 px is the least for a sharp print.
  if (kind === 'portrait' && sourceLongEdge < 1000) flags.push('low_res');
  return flags;
}

export async function importPhoto(file: File | Blob, name: string, kind: PhotoKind, order: number, preset?: { faces: FaceGeom[] }): Promise<PhotoMeta> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  const longEdge = Math.max(bmp.width, bmp.height);
  const s = Math.min(1, LONG_EDGE[kind] / longEdge);
  const stored = canvasOf(bmp, bmp.width * s, bmp.height * s);
  const blob = file instanceof Blob && s === 1 && (file.type === 'image/jpeg') ? file : await toJpeg(stored);
  let faces: FaceGeom[] = preset?.faces ?? [];
  let scanned = !!preset;
  if (!preset) {
    const ss = Math.min(1, SCAN_EDGE[kind] / longEdge);
    const r = await scanFaces(canvasOf(bmp, bmp.width * ss, bmp.height * ss), kind);
    faces = r.faces; scanned = r.scanned;
  }
  bmp.close?.();
  let when: number | null = null;
  if (file instanceof File) when = await readCaptureTime(file);
  const meta: PhotoMeta = { id: newId(), fileName: name, width: stored.width, height: stored.height, order: when ?? order, faces, flags: [], scanned };
  meta.flags = flagsFor(meta, kind, longEdge);
  await putPhoto({ ...meta, blob });
  return meta;
}

export async function importFiles(files: File[], kind: PhotoKind, onProgress?: (done: number, total: number) => void): Promise<{ photos: PhotoMeta[]; skipped: string[] }> {
  const usable = files.filter(isPhotoFile);
  const skipped = files.filter((f) => !isPhotoFile(f)).map((f) => f.name);
  const photos: PhotoMeta[] = [];
  for (let i = 0; i < usable.length; i++) {
    try {
      photos.push(await importPhoto(usable[i], usable[i].name, kind, i));
    } catch {
      skipped.push(usable[i].name);
    }
    onProgress?.(i + 1, usable.length);
  }
  return { photos, skipped };
}
