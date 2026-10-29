/* ══════════════════════════════════════════════════════════════════════════
   A PAGE'S PICTURE FOR A SCREEN (the Preview's book): drawn on the phone by
   the page renderer (pageImages.ts), saved as a JPEG in the app's cache under
   a name made from everything drawn on it, and shown from there. A page that
   did not change is not drawn again, even after the app was closed: what the
   drawing found (what isn't drawn yet, photos missing) is kept next to the
   picture in a small file.

   One page is drawn at a time (pictureQueue.ts): drawing takes the JS
   thread for tens of milliseconds, and the photo copies it holds are about
   5 MB each. The page a customer is editing goes first (priority), a
   picture nobody waits for any more is dropped before it is drawn, and a
   screen that is not on top asks for nothing (pass a null request). The
   last few photos stay decoded for the next page (pageImages
   photoImageCache); they are let go when the pages are off screen and when
   the app goes to the background.

   Every change to a page is a new picture under a new name, so the folder
   is pruned during a session too (every PRUNE_EVERY pictures), by count and
   by size, oldest first.
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import '@shopify/react-native-skia/lib/commonjs/skia/NativeSetup';
import { Skia } from '@shopify/react-native-skia/lib/commonjs/skia/Skia';
import { ImageFormat } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import { drawableCopy } from '../../modules/photo-files';
import type { PageText } from '../render/pageText';
import { drawnFontsVersion, onDrawnFontsChange } from '../render/fontTable';
import { drawPageImage, hashText, pageKey, photoImageCache, PHOTO_MAX_SIDE, type PageRequest } from './pageImages';
import { pagePictureShown } from './pageShown';
import { createPictureQueue, PictureDropped } from './pictureQueue';

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

type Found = { uri: string; notDrawn: string[]; missing: number };
const queue = createPictureQueue<Found>();

/** How much a picture is wanted (higher goes first). */
export const PRIORITY = {
  /** The page being edited, the cover being designed. */
  editing: 3,
  /** A page on screen (the Preview's book, the cover step). */
  shown: 2,
  /** A layout's small picture in "Change layout". */
  thumbnail: 1,
  /** A page drawn ahead (the next page, a turn's leaf). */
  ahead: 0,
} as const;

/** Lets the decoded photos go, once the page being drawn (if any) is done. */
export function forgetPhotoPictures(): void {
  queue.whenIdle(() => photos.clear());
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

/** Page pictures kept at most (a picture and its small file each), and the
 *  most room they take; past either, the oldest go first, down to the KEEP
 *  numbers. Checked at the first picture of a run and every PRUNE_EVERY new
 *  pictures after (an editing session makes a new picture per change). */
const MAX_PAGE_FILES = 1200;
const KEEP_PAGE_FILES = 800;
const MAX_PAGE_BYTES = 200 * 1024 * 1024;
const KEEP_PAGE_BYTES = 120 * 1024 * 1024;
const PRUNE_EVERY = 60;
let writesSincePrune = -1;
function pruneOldPages(): void {
  if (writesSincePrune >= 0 && writesSincePrune < PRUNE_EVERY) return;
  writesSincePrune = 0;
  try {
    const files = folder(PAGES_FOLDER).list().filter((f): f is File => f instanceof File);
    let bytes = files.reduce((n, f) => n + (f.size ?? 0), 0);
    let count = files.length;
    if (count <= MAX_PAGE_FILES && bytes <= MAX_PAGE_BYTES) return;
    files.sort((a, b) => (a.lastModified ?? 0) - (b.lastModified ?? 0));
    for (const f of files) {
      if (count <= KEEP_PAGE_FILES && bytes <= KEEP_PAGE_BYTES) break;
      const size = f.size ?? 0;
      const name = f.name.replace(/\.(jpg|json)$/, '');
      try { f.delete(); } catch { continue; }
      known.delete(name); // drawn again if it is asked for again
      count--;
      bytes -= size;
    }
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

/** Draws (or finds) the picture of one page: a ticket to wait on, and to
 *  release when it is no longer wanted. */
function requestPicture(text: PageText, req: PageRequest, priority: number): { promise: Promise<Found>; release: () => void } {
  const key = pageKey(req);
  const hit = known.get(key);
  if (hit) return { promise: Promise.resolve(hit), release: () => {} };
  return queue.request(key, async () => {
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
      writesSincePrune++;
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
  }, priority);
}

/** Draws (or finds) the picture of one page. */
export function pagePicture(text: PageText, req: PageRequest, priority: number = PRIORITY.shown): Promise<Found> {
  return requestPicture(text, req, priority).promise;
}

/** Draws a page ahead of time (the Preview's next and previous pages, and
 *  the leaf of a turn before it starts), so a turn shows it from its file at
 *  once, after anything on screen. Never throws. (Nothing is put in the
 *  image view's memory: expo-image on Android can't prefetch a file://
 *  picture, it only logs an error.) */
export async function preparePagePicture(text: PageText, req: PageRequest, priority: number = PRIORITY.ahead): Promise<void> {
  try {
    await pagePicture(text, req, priority);
  } catch { /* drawn when shown instead */ }
}

/** The picture of `req`'s page for a screen; null req = nothing to draw
 *  (also: a screen that is not on top). Its drawing is dropped if the screen
 *  stops wanting it before it starts. */
export function usePagePicture(text: PageText | null, req: PageRequest | null, priority: number = PRIORITY.shown): PagePicture {
  // A caption font downloaded meanwhile changes the key of a page that uses it.
  useSyncExternalStore(onDrawnFontsChange, drawnFontsVersion);
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
    const ticket = requestPicture(text, req, priority);
    ticket.promise
      .then((p) => { if (live) { setState({ ...p, error: null }); pagePictureShown(req.page); } })
      .catch((e: unknown) => {
        if (!live || e instanceof PictureDropped) return;
        setState({ uri: null, notDrawn: [], missing: 0, error: e instanceof Error ? e.message : String(e) });
      });
    return () => { live = false; ticket.release(); };
    // `key` covers everything in `req` that is drawn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, text]);
  return state;
}
