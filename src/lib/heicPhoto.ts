/* ══════════════════════════════════════════════════════════════════════════
   heicPhoto — iPhone photos (.heic / .heif) in the album.

   Owner (2026-10-11): "we need heic format to be recognized by the album".
   An iPhone saves its photos as HEIC. Chrome (Android, Windows) can't open
   one, so a HEIC went into the album with no picture, no size and no date
   (it couldn't be laid out, checked or printed), or, with no type from the
   picker, was left out as "not a photo". Each HEIC is now turned into a JPEG
   as it comes in, and the rest of the album never sees a HEIC:
     • Safari (iPhone, Mac) opens HEIC itself: drawn and saved as a JPEG;
     • anywhere else, libheif-js (the WebAssembly build of libheif, LGPL-3.0,
       ~2 MB, loaded only when a HEIC arrives) decodes it in background
       workers (lib/heicWorker), so the screen never freezes. It replaced
       heic-to (plain-JavaScript libheif): 2.9× faster, 44 photos in 3.7 s
       instead of 11.0 s, the same pictures (owner, 2026-10-12: a long wait
       "may think it hanged").
   The capture date is read from the original (lib/heifExif, exif.ts), since
   the JPEG copy carries none.
   ══════════════════════════════════════════════════════════════════════════ */

/** How long "Your photos are ready" stays up once a batch is done. */
export const HEIC_READY_SHOWN_MS = 2000;

/** JPEG quality for the converted copy: the print reads this file. */
export const HEIC_JPEG_QUALITY = 0.92;

/** What a HEIC shows while it is being turned into a JPEG (a browser that
 *  can't open HEIC would show a broken picture): a soft square with a
 *  turning ring. Replaced by the real photo as soon as it is ready. */
export const HEIC_CONVERTING_PREVIEW = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#F3E9DC"/>'
  + '<circle cx="50" cy="50" r="12" fill="none" stroke="#B85C38" stroke-width="4" stroke-linecap="round" stroke-dasharray="50 26">'
  + '<animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="1s" repeatCount="indefinite"/></circle></svg>',
)}`;

const HEIC_TYPE = /^image\/(heic|heif)(-sequence)?$/i;
const HEIC_NAME = /\.(heic|heif)$/i;
/** ISO-BMFF major brands of HEIC/HEIF stills (not AVIF: Chrome opens those). */
const HEIF_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'hevm', 'hevs', 'mif1', 'msf1']);

/** By its label: the type the picker gave, or the file name. */
export function looksHeic(f: { type: string; name: string }): boolean {
  return HEIC_TYPE.test(f.type) || HEIC_NAME.test(f.name);
}

/** By its bytes: an ISO-BMFF "ftyp" box with a HEIF brand. */
export async function isHeifBytes(blob: Blob): Promise<boolean> {
  try {
    const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    if (head.length < 12) return false;
    const s = (a: number) => String.fromCharCode(head[a], head[a + 1], head[a + 2], head[a + 3]);
    return s(4) === 'ftyp' && HEIF_BRANDS.has(s(8));
  } catch {
    return false;
  }
}

/** Does this photo need turning into a JPEG? Its label says so, or it has
 *  no usable label and its bytes do. */
export async function needsHeicConversion(file: File): Promise<boolean> {
  if (looksHeic(file)) return true;
  if (file.type && file.type !== 'application/octet-stream') return false;
  return isHeifBytes(file);
}

/** "IMG_4100.HEIC" → "IMG_4100.jpg". */
export function jpegName(name: string): string {
  return HEIC_NAME.test(name) ? name.replace(HEIC_NAME, '.jpg') : `${name}.jpg`;
}

/** Safari's own decoder: fast, and right on an iPhone. Null where it can't. */
async function nativeToJpeg(file: Blob): Promise<Blob | null> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
  let bmp: ImageBitmap | null = null;
  try {
    bmp = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0);
    const out = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', HEIC_JPEG_QUALITY));
    canvas.width = 0; // free the pixels now
    return out;
  } catch {
    return null;
  } finally {
    bmp?.close?.();
  }
}

/** How many photos are decoded at once. Each one is a full 12 MP picture in a
 *  worker's memory, so a phone with little memory gets fewer (Chrome reports
 *  `navigator.deviceMemory` in GB); never more than addPhotos runs at once. */
export function heicWorkerCount(deviceMemoryGB?: number, cores?: number): number {
  const byMemory = deviceMemoryGB === undefined ? 3 : deviceMemoryGB <= 2 ? 1 : deviceMemoryGB <= 4 ? 2 : 3;
  const byCores = cores ? Math.max(1, cores - 1) : 3;
  return Math.max(1, Math.min(3, byMemory, byCores));
}

/** Workers are closed after this long with nothing to do (their memory goes). */
export const HEIC_WORKER_IDLE_MS = 15_000;

type WorkerReply = { id: number; blob?: Blob; pixels?: { width: number; height: number; data: ArrayBuffer }; error?: string };
interface Job { id: number; buffer: ArrayBuffer; resolve: (b: Blob) => void; reject: (e: Error) => void }

const pool: { workers: { w: Worker; job: Job | null }[]; queue: Job[]; seq: number; idle?: number } = { workers: [], queue: [], seq: 0 };

/** The page makes the JPEG when the worker had no OffscreenCanvas. */
async function pixelsToJpeg(p: { width: number; height: number; data: ArrayBuffer }): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = p.width;
  canvas.height = p.height;
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(p.data), p.width, p.height), 0, 0);
  const out = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', HEIC_JPEG_QUALITY));
  canvas.width = 0;
  if (!out) throw new Error('Could not make the JPEG');
  return out;
}

function closeIdleWorkersLater() {
  window.clearTimeout(pool.idle);
  pool.idle = window.setTimeout(() => {
    if (pool.queue.length || pool.workers.some((x) => x.job)) return;
    for (const x of pool.workers) x.w.terminate();
    pool.workers = [];
  }, HEIC_WORKER_IDLE_MS);
}

function pump() {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const max = heicWorkerCount(nav.deviceMemory, nav.hardwareConcurrency);
  while (pool.queue.length) {
    let slot = pool.workers.find((x) => !x.job);
    if (!slot && pool.workers.length < max) {
      const w = new Worker(new URL('./heicWorker.ts', import.meta.url), { type: 'module' });
      slot = { w, job: null };
      const me = slot;
      w.onmessage = (e: MessageEvent<WorkerReply>) => {
        const job = me.job;
        me.job = null;
        if (job && job.id === e.data.id) {
          if (e.data.blob) job.resolve(e.data.blob);
          else if (e.data.pixels) pixelsToJpeg(e.data.pixels).then(job.resolve, job.reject);
          else job.reject(new Error(e.data.error || 'HEIF processing error'));
        }
        pump();
      };
      w.onerror = (ev) => {
        ev.preventDefault();
        const job = me.job;
        me.job = null;
        pool.workers = pool.workers.filter((x) => x !== me);
        w.terminate();
        job?.reject(new Error('The photo converter stopped'));
        pump();
      };
      pool.workers.push(slot);
    }
    if (!slot) break;
    const job = pool.queue.shift()!;
    slot.job = job;
    slot.w.postMessage({ id: job.id, buffer: job.buffer, quality: HEIC_JPEG_QUALITY }, [job.buffer]);
  }
  if (!pool.queue.length && !pool.workers.some((x) => x.job)) closeIdleWorkersLater();
}

/** libheif (WebAssembly), for every browser that can't open HEIC (Chrome), in
 *  background workers (lib/heicWorker). */
async function libheifToJpeg(file: Blob): Promise<Blob> {
  const buffer = await file.arrayBuffer();
  return new Promise<Blob>((resolve, reject) => {
    pool.queue.push({ id: ++pool.seq, buffer, resolve, reject });
    window.clearTimeout(pool.idle);
    pump();
  });
}

/** Overridable for tests (jsdom has no decoder). */
export const heicConverters = { native: nativeToJpeg, libheif: libheifToJpeg };

/** The HEIC as a JPEG File (same name, .jpg). Throws if it can't be read. */
export async function heicToJpeg(file: File): Promise<File> {
  const jpeg = (await heicConverters.native(file)) ?? (await heicConverters.libheif(file));
  if (!jpeg || jpeg.size === 0) throw new Error(`Couldn't open ${file.name}`);
  return new File([jpeg], jpegName(file.name), { type: 'image/jpeg', lastModified: file.lastModified });
}

/** The file the album keeps: a JPEG copy of a HEIC, any other photo as it is. */
export async function toAlbumPhoto(file: File): Promise<File> {
  return (await needsHeicConversion(file)) ? heicToJpeg(file) : file;
}
