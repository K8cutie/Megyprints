/* >>> LAST MODIFIED: 2026-06-05 04:45 SGT — Session 7: Local-only photo storage <<< */
/* ══════════════════════════════════════════════════════════════════════════
   useIndexedDBPhotos — Replaces useCloudPhotos.  Stores photo bytes in the
   browser's IndexedDB (zero cloud Disk I/O).  Only lightweight metadata
   (id, name, width, height) travels to Supabase.

   Operations:
     store(file, id?)   → saves File to IndexedDB, returns local metadata
     get(id)            → returns { blob, url } from IndexedDB
     getMany(ids)       → batch get for album loading
     delete(id)         → removes from IndexedDB
     clear()            → wipes all stored photos
     list()             → returns metadata for all stored photos

   IndexedDB schema:
     DB: "megy-photos"
     Store: "photos"  { id, name, type, size, width, height, blob, storedAt }
   ══════════════════════════════════════════════════════════════════════════ */

import { useState, useCallback, useRef } from 'react';

/* ── Types ─────────────────────────────────────────────────────────────── */

export interface LocalPhoto {
  id: string;
  name: string;
  type: string;
  size: number;
  width: number;
  height: number;
  storedAt: string;
}

export interface StoredPhoto extends LocalPhoto {
  blob: Blob;
  url: string; // blob URL for canvas/img src
}

export interface UseIndexedDBPhotosReturn {
  store: (file: File, id?: string) => Promise<LocalPhoto | null>;
  get: (id: string) => Promise<StoredPhoto | null>;
  getMany: (ids: string[]) => Promise<Map<string, StoredPhoto>>;
  deletePhoto: (id: string) => Promise<void>;
  clear: () => Promise<void>;
  list: () => Promise<LocalPhoto[]>;
  loading: boolean;
  error: string | null;
  clearError: () => void;
}

/* ── Constants ─────────────────────────────────────────────────────────── */

const DB_NAME = 'megy-photos';
const DB_VERSION = 1;
const STORE_NAME = 'photos';

/* ── DB Helper ─────────────────────────────────────────────────────────── */

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(new Error('Failed to open IndexedDB'));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

/* ── Image dimension helper ────────────────────────────────────────────── */

function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 0, height: 0 });
    };
    img.src = url;
  });
}

/* ── Hook ──────────────────────────────────────────────────────────────── */

export function useIndexedDBPhotos(): UseIndexedDBPhotosReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urlCache = useRef<Map<string, string>>(new Map());

  const clearError = useCallback(() => setError(null), []);

  /** Store a File in IndexedDB. Returns lightweight metadata (no blob). */
  const store = useCallback(
    async (file: File, id?: string): Promise<LocalPhoto | null> => {
      setLoading(true);
      setError(null);
      try {
        const photoId = id || `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const dims = await getImageDimensions(file);

        const record = {
          id: photoId,
          name: file.name,
          type: file.type,
          size: file.size,
          width: dims.width,
          height: dims.height,
          blob: file, // IndexedDB stores Blobs natively
          storedAt: new Date().toISOString(),
        };

        await withStore('readwrite', (s) => s.put(record));

        // Clean up old blob URL if re-storing same ID
        const oldUrl = urlCache.current.get(photoId);
        if (oldUrl) URL.revokeObjectURL(oldUrl);

        return {
          id: photoId,
          name: file.name,
          type: file.type,
          size: file.size,
          width: dims.width,
          height: dims.height,
          storedAt: record.storedAt,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to store photo';
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  /** Retrieve a photo from IndexedDB with a fresh blob URL. */
  const get = useCallback(async (id: string): Promise<StoredPhoto | null> => {
    try {
      const record = await withStore('readonly', (s) => s.get(id));
      if (!record) return null;

      // Reuse cached URL if available and valid
      let url = urlCache.current.get(id);
      if (!url) {
        url = URL.createObjectURL(record.blob);
        urlCache.current.set(id, url);
      }

      return {
        id: record.id,
        name: record.name,
        type: record.type,
        size: record.size,
        width: record.width,
        height: record.height,
        storedAt: record.storedAt,
        blob: record.blob as Blob,
        url,
      };
    } catch {
      return null;
    }
  }, []);

  /** Batch retrieve many photos. Used when loading an album. */
  const getMany = useCallback(async (ids: string[]): Promise<Map<string, StoredPhoto>> => {
    const result = new Map<string, StoredPhoto>();
    await Promise.all(
      ids.map(async (id) => {
        const photo = await get(id);
        if (photo) result.set(id, photo);
      }),
    );
    return result;
  }, [get]);

  /** Delete a photo from IndexedDB. */
  const deletePhoto = useCallback(async (id: string): Promise<void> => {
    setLoading(true);
    try {
      const cachedUrl = urlCache.current.get(id);
      if (cachedUrl) {
        URL.revokeObjectURL(cachedUrl);
        urlCache.current.delete(id);
      }
      await withStore('readwrite', (s) => s.delete(id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete photo');
    } finally {
      setLoading(false);
    }
  }, []);

  /** Wipe ALL photos from IndexedDB. */
  const clear = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      // Revoke all cached URLs
      urlCache.current.forEach((url) => URL.revokeObjectURL(url));
      urlCache.current.clear();
      await withStore('readwrite', (s) => s.clear());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to clear photos');
    } finally {
      setLoading(false);
    }
  }, []);

  /** List all stored photo metadata (no blobs — lightweight). */
  const list = useCallback(async (): Promise<LocalPhoto[]> => {
    try {
      const records = await withStore('readonly', (s) => s.getAll());
      return (records || []).map((r: any) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        size: r.size,
        width: r.width,
        height: r.height,
        storedAt: r.storedAt,
      }));
    } catch {
      return [];
    }
  }, []);

  return { store, get, getMany, deletePhoto, clear, list, loading, error, clearError };
}
