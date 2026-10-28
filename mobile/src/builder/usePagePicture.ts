/* ══════════════════════════════════════════════════════════════════════════
   A PAGE'S PICTURE FOR A SCREEN (the Preview's book): drawn on the phone by
   the page renderer (pageImages.ts), saved as a JPEG in the app's cache under
   a name made from everything drawn on it, and shown from there. A page that
   did not change is not drawn again, even after the app was closed.

   One page is drawn at a time (a queue): drawing takes the JS thread for
   tens of milliseconds, and the photo copies it holds are a few MB each.
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useState } from 'react';
import { Directory, File, Paths } from 'expo-file-system';
import { Image } from 'expo-image';
import '@shopify/react-native-skia/lib/commonjs/skia/NativeSetup';
import { Skia } from '@shopify/react-native-skia/lib/commonjs/skia/Skia';
import { ImageFormat } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import { drawableCopy } from '../../modules/photo-files';
import type { PageText } from '../render/pageText';
import { drawPageImage, hashText, pageKey, photoImageCache, PHOTO_MAX_SIDE, type PageRequest } from './pageImages';

const PAGES_FOLDER = 'megy-pages';
const PHOTOS_FOLDER = 'megy-photo-copies';

function folder(name: string): Directory {
  const d = new Directory(Paths.cache, name);
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
}

/** A photo's small sRGB copy (made once, kept in the cache), decoded by Skia. */
async function loadPhoto(uri: string) {
  const copy = new File(folder(PHOTOS_FOLDER), `${hashText(uri)}-${PHOTO_MAX_SIDE}.jpg`);
  if (!copy.exists) {
    const made = await drawableCopy(uri, copy.uri, PHOTO_MAX_SIDE);
    if (!made) return null; // a build without the phone's half
  }
  const data = await Skia.Data.fromURI(copy.uri);
  return Skia.Image.MakeImageFromEncoded(data);
}

const photos = photoImageCache(loadPhoto);

let queue: Promise<unknown> = Promise.resolve();
function inTurn<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}

export interface PagePicture {
  /** file:// of the JPEG, or null while it is being drawn. */
  uri: string | null;
  /** What is on the page that the app does not draw yet. */
  notDrawn: string[];
  missing: number;
  error: string | null;
}

const known = new Map<string, { uri: string; notDrawn: string[]; missing: number }>();

/** Draws (or finds) the picture of one page. */
export function pagePicture(text: PageText, req: PageRequest): Promise<{ uri: string; notDrawn: string[]; missing: number }> {
  const key = pageKey(req);
  const hit = known.get(key);
  if (hit) return Promise.resolve(hit);
  return inTurn(async () => {
    const again = known.get(key);
    if (again) return again;
    const file = new File(folder(PAGES_FOLDER), `${key}.jpg`);
    const drawn = await drawPageImage(Skia, text, req, photos);
    try {
      if (!file.exists) file.writeSync(drawn.image.encodeToBytes(ImageFormat.JPEG, 90));
    } finally {
      drawn.image.dispose();
    }
    const out = { uri: file.uri, notDrawn: drawn.plan.notDrawn, missing: drawn.missing };
    known.set(key, out);
    return out;
  });
}

/** Draws a page ahead of time and puts its picture in the image view's
 *  memory, so a page turn shows it at once (the Preview's next and previous
 *  pages, and the leaf of a turn before it starts). Never throws. */
export async function preparePagePicture(text: PageText, req: PageRequest): Promise<void> {
  try {
    const p = await pagePicture(text, req);
    await Image.prefetch(p.uri, 'memory-disk');
  } catch { /* drawn when shown instead */ }
}

/** The picture of `req`'s page for a screen; null req = nothing to draw. */
export function usePagePicture(text: PageText | null, req: PageRequest | null): PagePicture {
  const key = req && text ? pageKey(req) : null;
  const [state, setState] = useState<PagePicture>(() => {
    const hit = key ? known.get(key) : undefined;
    return hit ? { ...hit, error: null } : { uri: null, notDrawn: [], missing: 0, error: null };
  });
  useEffect(() => {
    if (!key || !req || !text) return;
    let live = true;
    const hit = known.get(key);
    if (hit) { setState({ ...hit, error: null }); return; }
    setState((s) => ({ ...s, uri: null }));
    pagePicture(text, req)
      .then((p) => { if (live) setState({ ...p, error: null }); })
      .catch((e: unknown) => { if (live) setState({ uri: null, notDrawn: [], missing: 0, error: e instanceof Error ? e.message : String(e) }); });
    return () => { live = false; };
    // `key` covers everything in `req` that is drawn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, text]);
  return state;
}
