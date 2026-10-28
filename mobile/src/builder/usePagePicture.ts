/* ══════════════════════════════════════════════════════════════════════════
   A PAGE'S PICTURE FOR A SCREEN (the Preview's book): drawn on the phone by
   the page renderer (pageImages.ts), saved as a JPEG in the app's cache under
   a name made from everything drawn on it, and shown from there. A page that
   did not change is not drawn again, even after the app was closed: what the
   drawing found (what isn't drawn yet, photos missing) is kept next to the
   picture in a small file.

   One page is drawn at a time (a queue): drawing takes the JS thread for
   tens of milliseconds, and the photo copies it holds are about 5 MB each.
   The last few stay decoded for the next page (pageImages photoImageCache);
   they are let go when the pages are off screen and when the app goes to
   the background.
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import '@shopify/react-native-skia/lib/commonjs/skia/NativeSetup';
import { Skia } from '@shopify/react-native-skia/lib/commonjs/skia/Skia';
import { ImageFormat } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import { drawableCopy } from '../../modules/photo-files';
import type { PageText } from '../render/pageText';
import { drawPageImage, hashText, pageKey, photoImageCache, PHOTO_MAX_SIDE, type PageRequest } from './pageImages';
import { pagePictureShown } from './pageShown';

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

/** Lets the decoded photos go, once the page being drawn (if any) is done. */
export function forgetPhotoPictures(): void {
  void inTurn(async () => photos.clear());
}
AppState.addEventListener('change', (s) => { if (s === 'background') forgetPhotoPictures(); });

export interface PagePicture {
  /** file:// of the JPEG, or null while it is being drawn. */
  uri: string | null;
  /** What is on the page that the app does not draw yet. */
  notDrawn: string[];
  missing: number;
  error: string | null;
}

const known = new Map<string, { uri: string; notDrawn: string[]; missing: number }>();

/** Page pictures kept at most (a picture and its small file each); the
 *  oldest go first, once per app start. Every album and size makes its own. */
const MAX_PAGE_FILES = 1200;
const KEEP_PAGE_FILES = 800;
let pruned = false;
function pruneOldPages(): void {
  if (pruned) return;
  pruned = true;
  try {
    const files = folder(PAGES_FOLDER).list().filter((f): f is File => f instanceof File);
    if (files.length <= MAX_PAGE_FILES) return;
    files.sort((a, b) => (a.lastModified ?? 0) - (b.lastModified ?? 0));
    for (const f of files.slice(0, files.length - KEEP_PAGE_FILES)) f.delete();
  } catch { /* the phone can clear the cache itself */ }
}

/** What a drawing found, kept next to its picture. */
function readFound(file: File): { notDrawn: string[]; missing: number } | null {
  try {
    if (!file.exists) return null;
    const f = JSON.parse(file.textSync()) as { notDrawn?: unknown; missing?: unknown };
    return Array.isArray(f.notDrawn) && typeof f.missing === 'number' ? { notDrawn: f.notDrawn.map(String), missing: f.missing } : null;
  } catch {
    return null;
  }
}

/** Draws (or finds) the picture of one page. */
export function pagePicture(text: PageText, req: PageRequest): Promise<{ uri: string; notDrawn: string[]; missing: number }> {
  const key = pageKey(req);
  const hit = known.get(key);
  if (hit) return Promise.resolve(hit);
  return inTurn(async () => {
    const again = known.get(key);
    if (again) return again;
    pruneOldPages();
    const file = new File(folder(PAGES_FOLDER), `${key}.jpg`);
    const foundFile = new File(folder(PAGES_FOLDER), `${key}.json`);
    // Drawn on an earlier visit: the picture and what was found are on file.
    const found = file.exists ? readFound(foundFile) : null;
    if (found) {
      const out = { uri: file.uri, ...found };
      known.set(key, out);
      return out;
    }
    const drawn = await drawPageImage(Skia, text, req, photos);
    try {
      file.writeSync(drawn.image.encodeToBytes(ImageFormat.JPEG, 90));
    } finally {
      drawn.image.dispose();
      photos.trim();
    }
    const out = { uri: file.uri, notDrawn: drawn.plan.notDrawn, missing: drawn.missing };
    // A page with a photo that could not be opened is drawn again on the
    // next start (the photo may open then), so its findings are not kept.
    try {
      if (drawn.missing === 0) foundFile.writeSync(JSON.stringify({ notDrawn: out.notDrawn, missing: 0 }));
      else if (foundFile.exists) foundFile.delete();
    } catch { /* drawn again next visit */ }
    known.set(key, out);
    return out;
  });
}

/** Draws a page ahead of time (the Preview's next and previous pages, and
 *  the leaf of a turn before it starts), so a turn shows it from its file at
 *  once. Never throws. (Nothing is put in the image view's memory: expo-image
 *  on Android can't prefetch a file:// picture, it only logs an error.) */
export async function preparePagePicture(text: PageText, req: PageRequest): Promise<void> {
  try {
    await pagePicture(text, req);
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
    if (hit) { setState({ ...hit, error: null }); pagePictureShown(req.page); return; }
    setState((s) => ({ ...s, uri: null }));
    pagePicture(text, req)
      .then((p) => { if (live) { setState({ ...p, error: null }); pagePictureShown(req.page); } })
      .catch((e: unknown) => { if (live) setState({ uri: null, notDrawn: [], missing: 0, error: e instanceof Error ? e.message : String(e) }); });
    return () => { live = false; };
    // `key` covers everything in `req` that is drawn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, text]);
  return state;
}
