/* ══════════════════════════════════════════════════════════════════════════
   mobileNet — the one small picture model the website runs on the device
   (MobileNet v2, TensorFlow.js). Two things read a photo with it, and they
   share this one copy:
     • the look pass (photoCheckRunner → lib/photoLook): what a photo looks
       like, so photos of the same scene are put together;
     • Megy's "what is this album about?" guess (pages/builder/themeDetector).

   TensorFlow.js and the model are loaded LAZILY (dynamic import), so they
   stay out of the main bundle. The model (about 14 MB) comes from Google's
   public TensorFlow.js model store the first time (MOBILENET_URL) and is
   then kept in this browser (IndexedDB), so a later visit downloads
   nothing. Photos never leave the device, and there is no bill: nothing
   here calls a server of ours.

   WHY THAT ADDRESS: the live site's Content-Security-Policy (vercel.json,
   connect-src) lets the page reach storage.googleapis.com. The address the
   mobilenet package uses when it is given none starts at tfhub.dev and is
   sent on to kaggle.com, which the policy does not allow: on the live site
   that download never started (2026-11-09; the album guess failed quietly
   there). mobileNet.spec.ts fails if MOBILENET_URL's host is not in the
   policy. The package's own address stays as the last try, for a site with
   another policy.
   ══════════════════════════════════════════════════════════════════════════ */

/** What the two readers use of the model. */
export interface MobileNet {
  classify(img: HTMLImageElement, topk?: number): Promise<{ className: string; probability: number }[]>;
  /** The 1,280 numbers before the labels (`embedding` true), as a tensor
   *  to read with data() and then dispose(). */
  infer(img: ImageBitmap | HTMLCanvasElement | HTMLImageElement, embedding: boolean): { data(): Promise<ArrayLike<number>>; dispose(): void };
}

export interface LoadedMobileNet {
  net: MobileNet;
  /** 'webgl' (the graphics chip: fast) or 'cpu' (slow: about a second a photo). */
  backend: string;
}

/** MobileNet v2 1.0 224 for TensorFlow.js, in Google's public model store:
 *  the same TF Hub module the mobilenet package loads (its pixels 0 to 1). */
export const MOBILENET_URL = 'https://storage.googleapis.com/tfjs-models/savedmodel/mobilenet_v2_1.0_224/model.json';
/** Where this browser keeps the model after the first download. */
const KEPT = 'indexeddb://megy-mobilenet-v2-100-224';

let loading: Promise<LoadedMobileNet> | null = null;

/** The model, loaded once a visit. Rejects when TensorFlow.js has no way to
 *  run here or the model can't be fetched; a later call tries again. */
export function loadMobileNet(): Promise<LoadedMobileNet> {
  if (!loading) {
    loading = (async () => {
      const tf = await import('@tensorflow/tfjs');
      // The graphics chip when there is one; else the CPU, so the album
      // guess still works (the look pass only runs on the graphics chip).
      let backend = '';
      for (const b of ['webgl', 'cpu']) {
        try {
          if (await tf.setBackend(b)) { await tf.ready(); backend = b; break; }
        } catch { /* try the next one */ }
      }
      if (!backend) throw new Error('no tfjs backend available');
      const mobilenet = await import('@tensorflow-models/mobilenet');
      const from = (modelUrl: string) => mobilenet.load({ version: 2, alpha: 1.0, modelUrl, inputRange: [0, 1] });
      let net: unknown;
      try {
        net = await from(KEPT); // the copy this browser kept
      } catch {
        try {
          net = await from(MOBILENET_URL);
        } catch {
          net = await mobilenet.load({ version: 2, alpha: 1.0 }); // the package's own address
        }
        // Keep it for the next visit. A browser that can't (private mode, a
        // full disk) just downloads it again.
        const graph = (net as { model?: { save?: (to: string) => Promise<unknown> } }).model;
        void graph?.save?.(KEPT).catch(() => { /* not kept */ });
      }
      return { net: net as MobileNet, backend };
    })().catch((err) => {
      loading = null; // a later call may try again
      throw err;
    });
  }
  return loading;
}
