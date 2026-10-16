/* ══════════════════════════════════════════════════════════════════════════
   heicWorker — one iPhone photo (HEIC) → JPEG, off the main thread.

   libheif-js: the WebAssembly build of libheif (LGPL-3.0, used unchanged,
   loaded only when a HEIC arrives). It decodes synchronously, so it runs
   here, in a worker, and the screen never freezes while it works. Measured
   2.9× faster than the plain-JavaScript build used before (44 photos: 3.7 s
   vs 11.0 s, same pictures; owner: "the user may think it hanged").

   In: { id, buffer, quality }. Out: { id, blob } (a JPEG), or, where this
   browser has no OffscreenCanvas, { id, pixels } for the page to encode,
   or { id, error }.
   ══════════════════════════════════════════════════════════════════════════ */

import libheifFactory, { type LibHeif } from 'libheif-js/libheif-wasm/libheif-bundle.mjs';

interface Req { id: number; buffer: ArrayBuffer; quality: number }

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<Req>) => void) | null;
  postMessage: (msg: unknown, transfer?: Transferable[]) => void;
};

let lib: Promise<LibHeif> | null = null;

scope.onmessage = async (e) => {
  const { id, buffer, quality } = e.data;
  try {
    lib ??= libheifFactory();
    const libheif = await lib;
    const decoder = new libheif.HeifDecoder();
    const images = decoder.decode(new Uint8Array(buffer));
    if (!images || images.length === 0) throw new Error('No picture in this file');
    const image = images[0]; // the photo itself (a HEIC's other items are thumbnails)
    const width = image.get_width();
    const height = image.get_height();
    const pixels = new ImageData(width, height);
    await new Promise<void>((res, rej) => image.display(pixels, (d) => (d ? res() : rej(new Error('HEIF processing error')))));
    for (const im of images) im.free?.();
    decoder.free?.();
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.putImageData(pixels, 0, 0);
        const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
        scope.postMessage({ id, blob });
        return;
      }
    }
    // No OffscreenCanvas here: hand the pixels back, the page makes the JPEG.
    scope.postMessage({ id, pixels: { width, height, data: pixels.data.buffer } }, [pixels.data.buffer]);
  } catch (err) {
    scope.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
