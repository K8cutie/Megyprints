/* >>> LAST MODIFIED: 2026-06-05 04:50 SGT — Session 7: Cloud NO-OP wrapper <<< */
/* ══════════════════════════════════════════════════════════════════════════
   useCloudPhotos — DEPRECATED.  Now a thin compatibility layer over
   useIndexedDBPhotos.  All "cloud" operations actually write to the
   browser's IndexedDB.  Zero Supabase Storage Disk I/O.

   Keep this file so existing imports don't break.  The interface is
   preserved; only the implementation changes (cloud → local).
   ══════════════════════════════════════════════════════════════════════════ */

import { useCallback } from 'react';
import { useIndexedDBPhotos } from './useIndexedDBPhotos';
import type { LocalPhoto } from './useIndexedDBPhotos';

/* ── Legacy types (preserved for backward compat) ──────────────────────── */

export interface CloudPhoto {
  id: string;
  name: string;
  url: string;
  path: string; // now === id (local identifier)
  size?: number;
  contentType?: string;
  createdAt: string;
}

export interface UseCloudPhotosReturn {
  upload: (file: File, _userId: string) => Promise<CloudPhoto | null>;
  deletePhoto: (path: string) => Promise<{ success: boolean }>;
  list: (_userId: string) => Promise<CloudPhoto[]>;
  getPublicUrl: (path: string) => string;
  loading: boolean;
  error: string | null;
  clearError: () => void;
}

/* ── Helpers ───────────────────────────────────────────────────────────── */

function toCloudPhoto(lp: LocalPhoto, url: string): CloudPhoto {
  return {
    id: lp.id,
    name: lp.name,
    url,
    path: lp.id, // path is now just the local ID
    size: lp.size,
    contentType: lp.type,
    createdAt: lp.storedAt,
  };
}

/* ── Hook (redirects everything to IndexedDB) ──────────────────────────── */

export function useCloudPhotos(): UseCloudPhotosReturn {
  const idb = useIndexedDBPhotos();

  const upload = useCallback(
    async (file: File, _userId: string): Promise<CloudPhoto | null> => {
      const local = await idb.store(file);
      if (!local) return null;

      // Create a one-time blob URL for immediate use
      const stored = await idb.get(local.id);
      const url = stored?.url ?? '';
      return toCloudPhoto(local, url);
    },
    [idb],
  );

  const deletePhoto = useCallback(
    async (path: string): Promise<{ success: boolean }> => {
      await idb.deletePhoto(path);
      return { success: true };
    },
    [idb],
  );

  const list = useCallback(
    async (_userId: string): Promise<CloudPhoto[]> => {
      const locals = await idb.list();
      // For each local photo, get its blob URL
      const results: CloudPhoto[] = [];
      for (const lp of locals) {
        const stored = await idb.get(lp.id);
        results.push(toCloudPhoto(lp, stored?.url ?? ''));
      }
      return results;
    },
    [idb],
  );

  const getPublicUrl = useCallback(
    (_path: string): string => {
      // Synchronous — returns empty string; caller should use list() or get() async
      // This maintains backward compat for code that expects sync return
      return '';
    },
    [],
  );

  return {
    upload,
    deletePhoto,
    list,
    getPublicUrl,
    loading: idb.loading,
    error: idb.error,
    clearError: idb.clearError,
  };
}
