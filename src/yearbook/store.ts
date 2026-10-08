/* ── Saving the yearbook on this computer ────────────────────────────────────
   Phase 1 keeps the project and its photos in this browser (IndexedDB), so a
   reload or a closed tab loses nothing. Phase 2 moves both to the school's
   cloud account so the adviser can switch computers (build plan §2.2). */
import type { PhotoMeta, YearbookProject } from './types';

const DB_NAME = 'megy-yearbook';
const DB_VERSION = 1;

export interface PhotoRecord extends PhotoMeta { blob: Blob }

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { dbPromise = null; reject(req.error); };
    });
  }
  return dbPromise;
}

function tx<T>(store: 'photos' | 'kv', mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return openDb().then((db) => new Promise<T | undefined>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req ? (req as IDBRequest<T>).result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const putPhoto = (rec: PhotoRecord) => tx('photos', 'readwrite', (s) => s.put(rec));
export const getPhoto = (id: string) => tx<PhotoRecord>('photos', 'readonly', (s) => s.get(id));
export const deletePhoto = (id: string) => tx('photos', 'readwrite', (s) => s.delete(id));

export async function allPhotoMeta(): Promise<Record<string, PhotoMeta>> {
  const all = (await tx<PhotoRecord[]>('photos', 'readonly', (s) => s.getAll())) ?? [];
  const out: Record<string, PhotoMeta> = {};
  for (const { blob: _blob, ...meta } of all) out[meta.id] = meta;
  return out;
}

export async function updatePhotoMeta(meta: PhotoMeta): Promise<void> {
  const rec = await getPhoto(meta.id);
  if (rec) await putPhoto({ ...rec, ...meta, blob: rec.blob });
}

export const saveProject = (p: YearbookProject) => tx('kv', 'readwrite', (s) => s.put(p, 'project'));
export const loadProject = () => tx<YearbookProject>('kv', 'readonly', (s) => s.get('project'));

export async function clearAll(): Promise<void> {
  await tx('photos', 'readwrite', (s) => s.clear());
  await tx('kv', 'readwrite', (s) => s.clear());
  bitmaps.clear();
}

/* Decoded photos for the painter, kept while the page is open. */
const bitmaps = new Map<string, ImageBitmap>();
const pending = new Map<string, Promise<ImageBitmap | null>>();

export function bitmapNow(id: string): ImageBitmap | null {
  return bitmaps.get(id) ?? null;
}

export function loadBitmap(id: string): Promise<ImageBitmap | null> {
  const have = bitmaps.get(id);
  if (have) return Promise.resolve(have);
  let p = pending.get(id);
  if (!p) {
    p = getPhoto(id)
      .then((rec) => (rec ? createImageBitmap(rec.blob) : null))
      .then((bmp) => { if (bmp) bitmaps.set(id, bmp); pending.delete(id); return bmp; })
      .catch(() => { pending.delete(id); return null; });
    pending.set(id, p);
  }
  return p;
}
