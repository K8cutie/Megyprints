import { useState, useCallback, useRef } from 'react';
import { supabase } from './supabase';

// =============================================================================
// Types
// =============================================================================

export interface AlbumPage {
  id: string;
  slots: Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    size: { width: number; height: number };
    photoId?: string | null;
    style?: Record<string, unknown>;
  }>;
  photos: Array<{
    id: string;
    url: string;
    position?: { x: number; y: number };
    size?: { width: number; height: number };
    rotation?: number;
    filters?: Record<string, unknown>;
  }>;
  textElements: Array<{
    id: string;
    text: string;
    position: { x: number; y: number };
    style?: Record<string, unknown>;
    fontSize?: number;
    color?: string;
    fontFamily?: string;
  }>;
  background: {
    type: 'color' | 'gradient' | 'image';
    value: string;
    opacity?: number;
  };
  pageNumber?: number;
}

export interface AlbumData {
  id?: string;
  title: string;
  sizePreset: string;
  pages: AlbumPage[];
  photos?: Array<{
    id: string;
    name: string;
    cloudUrl?: string;
    storagePath?: string;
    previewUrl?: string;
  }>;
  createdAt?: string;
  updatedAt?: string;
  coverPhoto?: string | null;
  /** The front cover — one builder page, stored in albums.cover_front (0035).
   *  Its photo slots index `photos`, so it only makes sense with this album.
   *  Loaded: null when the album was saved without one. */
  coverFront?: Record<string, unknown> | null;
}

export interface UseAlbumSyncReturn {
  save: (userId: string, albumData: AlbumData) => Promise<{ success: boolean; albumId?: string }>;
  load: (userId: string, albumId?: string) => Promise<AlbumData | null>;
  loadAll: (userId: string) => Promise<AlbumData[]>;
  deleteAlbum: (albumId: string) => Promise<{ success: boolean }>;
  loading: boolean;
  error: string | null;
  clearError: () => void;
}

// =============================================================================
// Helper: Serialize album for DB storage (pages -> JSON)
// =============================================================================

export function serializeAlbum(albumData: AlbumData): Record<string, unknown> {
  // Only save lightweight photo metadata — the actual File bytes stay in
  // IndexedDB.  This keeps DB writes tiny (KBs) and eliminates all
  // Supabase Storage Disk I/O.
  const photosMeta = (albumData.photos ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    // No cloudUrl, no storagePath, no previewUrl — all local-only now.
  }));

  return {
    title: albumData.title,
    album_size: albumData.sizePreset,
    pages: albumData.pages as unknown as Record<string, unknown>[],
    photos: photosMeta,
    // Only when the caller has one to say — a save built from a stored draft
    // has no thumbnail and must not blank the one already saved.
    ...(albumData.coverPhoto !== undefined ? { cover_photo: albumData.coverPhoto } : {}),
    // Same rule for the cover: a save that has none to say keeps the saved one.
    ...(albumData.coverFront !== undefined ? { cover_front: albumData.coverFront } : {}),
    updated_at: new Date().toISOString(),
  };
}

export function deserializeAlbum(row: Record<string, unknown>): AlbumData {
  const dbPhotos = Array.isArray(row.photos)
    ? (row.photos as Array<{ id: string; name: string; cloudUrl?: string; storagePath?: string; previewUrl?: string }>)
    : [];

  return {
    id: row.id as string,
    title: (row.title as string) ?? 'Untitled Album',
    sizePreset: (row.album_size as string) ?? '8x8',
    pages: Array.isArray(row.pages) ? (row.pages as AlbumPage[]) : [],
    // Map DB photo metadata back to AlbumData format.
    // cloudUrl/storagePath are legacy fields — will be null for new albums.
    photos: dbPhotos.map((p) => ({
      id: p.id,
      name: p.name ?? 'Untitled',
      cloudUrl: p.cloudUrl ?? undefined,
      storagePath: p.storagePath ?? undefined,
      previewUrl: p.previewUrl ?? undefined,
    })),
    coverPhoto: (row.cover_photo as string) ?? null,
    // Absent when the database predates 0035 or the query didn't ask for it.
    coverFront: isPlainObject(row.cover_front) ? row.cover_front : null,
    createdAt: (row.created_at as string) ?? undefined,
    updatedAt: (row.updated_at as string) ?? undefined,
  };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** albums.cover_front arrived in migration 0035, and the app can reach a
 *  database that doesn't have it yet (a deploy lands before db:push). PostgREST
 *  then refuses the WHOLE request over that one column: PGRST204 on a write
 *  ("Could not find the 'cover_front' column of 'albums' in the schema cache"),
 *  42703 on a read that names it. */
export function isMissingCoverFrontColumn(err: { code?: string; message?: string } | null | undefined): boolean {
  return !!err
    && (err.code === 'PGRST204' || err.code === '42703')
    && (err.message ?? '').includes('cover_front');
}

/** Upsert one album row. If the database has no cover_front column yet, the
 *  album is saved again without its cover rather than not at all. */
export async function upsertAlbumRow(row: Record<string, unknown>) {
  const write = (r: Record<string, unknown>) =>
    supabase.from('albums').upsert(r, { onConflict: 'id' }).select('id').single();
  const first = await write(row);
  if (!first.error || !('cover_front' in row) || !isMissingCoverFrontColumn(first.error)) return first;
  const withoutCover = { ...row };
  delete withoutCover.cover_front;
  return write(withoutCover);
}

// =============================================================================
// Hook
// =============================================================================

export function useAlbumSync(): UseAlbumSyncReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const clearError = useCallback(() => setError(null), []);

  /**
   * Upsert an album for a user. If albumData.id is provided, updates that album;
   * otherwise creates a new one.
   */
  const save = useCallback(
    async (userId: string, albumData: AlbumData): Promise<{ success: boolean; albumId?: string }> => {
      // Cancel any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        if (controller.signal.aborted) {
          return { success: false };
        }

        const payload = {
          ...serializeAlbum(albumData),
          user_id: userId,
          // If album has an id, include it so upsert targets the right row
          ...(albumData.id ? { id: albumData.id } : {}),
        };

        const { data, error: upsertError } = await upsertAlbumRow(payload);

        if (upsertError) {
          throw upsertError;
        }

        return { success: true, albumId: data?.id as string | undefined };
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          return { success: false };
        }
        const message =
          err instanceof Error ? err.message : 'Failed to save album. Please try again.';
        setError(message);
        return { success: false };
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /**
   * Load a single album by ID, or the user's most recent album if no albumId given.
   */
  const load = useCallback(
    async (userId: string, albumId?: string): Promise<AlbumData | null> => {
      setLoading(true);
      setError(null);

      try {
        let query = supabase
          .from('albums')
          .select('*')
          .eq('user_id', userId);

        if (albumId) {
          query = query.eq('id', albumId);
        } else {
          query = query.order('updated_at', { ascending: false }).limit(1);
        }

        const { data, error: selectError } = await query.maybeSingle();

        if (selectError) {
          throw selectError;
        }

        if (!data) return null;

        return deserializeAlbum(data as Record<string, unknown>);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Failed to load album. Please try again.';
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /**
   * Load all albums for a user.
   */
  const loadAll = useCallback(async (userId: string): Promise<AlbumData[]> => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: selectError } = await supabase
        .from('albums')
        // List view only needs lightweight columns — NOT the full `pages` JSON.
        // The full album is fetched on demand via load() when one is opened.
        // `photos` is just ids + names; the resume prompt uses it to skip
        // empty albums.
        .select('id, title, album_size, photos, cover_photo, created_at, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

      if (selectError) {
        throw selectError;
      }

      if (!data || !Array.isArray(data)) return [];

      return data.map((row) => deserializeAlbum(row as Record<string, unknown>));
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to load albums. Please try again.';
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Delete an album by its ID.
   */
  const deleteAlbum = useCallback(async (albumId: string): Promise<{ success: boolean }> => {
    setLoading(true);
    setError(null);

    try {
      const { error: deleteError } = await supabase
        .from('albums')
        .delete()
        .eq('id', albumId);

      if (deleteError) {
        throw deleteError;
      }

      return { success: true };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to delete album. Please try again.';
      setError(message);
      return { success: false };
    } finally {
      setLoading(false);
    }
  }, []);

  return { save, load, loadAll, deleteAlbum, loading, error, clearError };
}
