import type { PhotoCheck } from './photoCheck';
import { useState, useCallback } from 'react';
import { supabase } from './supabase';
import { cleanAlbumTheme } from './albumTheme';

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
    /** The original file's size and pixels, and when it was taken — a few
     *  bytes that let another device put the same photo back (photoRelink). */
    size?: number;
    width?: number;
    height?: number;
    capturedAt?: number | null;
    cloudUrl?: string;
    storagePath?: string;
    previewUrl?: string;
    /** Megy's photo check and the customer's keep / leave-out choice. */
    check?: PhotoCheck;
    kept?: boolean;
    leftOut?: boolean;
  }>;
  createdAt?: string;
  updatedAt?: string;
  coverPhoto?: string | null;
  /** The front cover — one builder page, stored in albums.cover_front (0036).
   *  Its photo slots index `photos`, so it only makes sense with this album.
   *  Loaded: null when the album was saved without one. */
  coverFront?: Record<string, unknown> | null;
  /** The occasion (Step 1 — "Vacation", or anything typed), albums.occasion
   *  (0038). Loaded: null when saved without one. */
  occasion?: string | null;
  /** The photos-per-page pick (albums.photos_per_page); null = Surprise. */
  photosPerPage?: number | null;
}

export interface SaveOptions {
  /** The cloud version (albums.updated_at) this copy of the album is based on.
   *  Given, the save only lands on that same version: when another device
   *  saved since, nothing is overwritten and the reply says `conflict`
   *  (albumSyncRecord). Absent, the album is saved as a NEW row. */
  base?: string | null;
}

export interface SaveResult {
  success: boolean;
  albumId?: string;
  /** The saved version (albums.updated_at). */
  updatedAt?: string;
  /** Another device saved this album since `base`: the cloud's version. */
  conflict?: { updatedAt: string };
  /** Nothing was written because this account has no such row to write:
   *  - 'deleted': saved on a version, and the row is gone (deleted on another
   *    device). It is never put back without asking.
   *  - 'taken': a new album whose id is already used by a row this account
   *    cannot see. The album needs a new id. */
  gone?: 'deleted' | 'taken';
}

export interface UseAlbumSyncReturn {
  save: (userId: string, albumData: AlbumData, opts?: SaveOptions) => Promise<SaveResult>;
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
    // The file's size, pixels and capture time: how another device knows the
    // same photo again when it is added there (photoRelink). Bytes, not files.
    ...(p.size ? { size: p.size } : {}),
    ...(p.width && p.height ? { width: p.width, height: p.height } : {}),
    ...(p.capturedAt ? { capturedAt: p.capturedAt } : {}),
    // No cloudUrl, no storagePath, no previewUrl — all local-only now.
    // The photo check and the keep / leave-out choice are tiny and travel with it.
    ...(p.check ? { check: p.check } : {}),
    ...(p.kept ? { kept: true } : {}),
    ...(p.leftOut ? { leftOut: true } : {}),
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
    // The occasion and photos-per-page travel with the album (round 2, N4).
    // The occasion is capped here, the one place every row is built: a longer
    // one (the quote picker took any length) broke albums_occasion_chk, and
    // then every save failed (Kraken, 2026-10-05).
    ...(albumData.occasion !== undefined ? { occasion: cleanAlbumTheme(albumData.occasion ?? '') || null } : {}),
    ...(albumData.photosPerPage !== undefined ? { photos_per_page: albumData.photosPerPage ?? null } : {}),
    // No updated_at: the database sets it on every write (0001 on update, 0040
    // on insert). It IS the version, so this device's clock must not pick it.
  };
}

export function deserializeAlbum(row: Record<string, unknown>): AlbumData {
  const dbPhotos = Array.isArray(row.photos)
    ? (row.photos as Array<{ id: string; name: string; size?: number; width?: number; height?: number; capturedAt?: number | null; cloudUrl?: string; storagePath?: string; previewUrl?: string; check?: PhotoCheck; kept?: boolean; leftOut?: boolean }>)
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
      ...(typeof p.size === 'number' && p.size > 0 ? { size: p.size } : {}),
      ...(typeof p.width === 'number' && typeof p.height === 'number' && p.width > 0 && p.height > 0 ? { width: p.width, height: p.height } : {}),
      ...(typeof p.capturedAt === 'number' ? { capturedAt: p.capturedAt } : {}),
      cloudUrl: p.cloudUrl ?? undefined,
      storagePath: p.storagePath ?? undefined,
      previewUrl: p.previewUrl ?? undefined,
      ...(p.check && typeof p.check === 'object' ? { check: p.check } : {}),
      ...(p.kept ? { kept: true } : {}),
      ...(p.leftOut ? { leftOut: true } : {}),
    })),
    coverPhoto: (row.cover_photo as string) ?? null,
    // Absent when the database predates 0036 or the query didn't ask for it.
    coverFront: isPlainObject(row.cover_front) ? row.cover_front : null,
    occasion: typeof row.occasion === 'string' && row.occasion.trim() ? row.occasion : null,
    photosPerPage: typeof row.photos_per_page === 'number' && row.photos_per_page > 0 ? row.photos_per_page : null,
    createdAt: (row.created_at as string) ?? undefined,
    updatedAt: (row.updated_at as string) ?? undefined,
  };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** albums.cover_front arrived in migration 0036, and the app can reach a
 *  database that doesn't have it yet (a deploy lands before db:push). PostgREST
 *  then refuses the WHOLE request over that one column: PGRST204 on a write
 *  ("Could not find the 'cover_front' column of 'albums' in the schema cache"),
 *  42703 on a read that names it. */
export function isMissingCoverFrontColumn(err: { code?: string; message?: string } | null | undefined): boolean {
  return !!err
    && (err.code === 'PGRST204' || err.code === '42703')
    && (err.message ?? '').includes('cover_front');
}

/** Columns added after 0001 that a save can carry. The app can reach a
 *  database that doesn't have them yet (a deploy lands before db:push), and
 *  PostgREST then refuses the whole write over one of them. */
const OPTIONAL_COLUMNS = ['cover_front', 'occasion'] as const;

/** Which optional column the database just said it doesn't have, if any. */
export function missingOptionalColumn(err: { code?: string; message?: string } | null | undefined): string | null {
  if (!err || (err.code !== 'PGRST204' && err.code !== '42703')) return null;
  return OPTIONAL_COLUMNS.find((c) => (err.message ?? '').includes(c)) ?? null;
}

/** Write a row; each optional column the database lacks is dropped and the
 *  write sent again — the album is saved without it rather than not at all. */
async function writeDroppingMissing<R>(row: Record<string, unknown>, write: (r: Record<string, unknown>) => PromiseLike<R & { error: { code?: string; message?: string } | null }>) {
  let r = { ...row };
  let res = await write(r);
  for (let i = 0; i < OPTIONAL_COLUMNS.length && res.error; i++) {
    const col = missingOptionalColumn(res.error);
    if (!col || !(col in r)) break;
    r = { ...r };
    delete r[col];
    res = await write(r);
  }
  return res;
}

/** Insert one NEW album row (see writeDroppingMissing). */
export async function insertAlbumRow(row: Record<string, unknown>) {
  return writeDroppingMissing(row, (r) =>
    supabase.from('albums').insert(r).select('id, updated_at').single());
}

/** Write the album row ONLY if the cloud still holds version `base` (the
 *  database sets updated_at on every write, so another device's save moves
 *  it). The rows written: one, or none when the version moved — or when
 *  there is no such row. Same missing-column retry as insertAlbumRow. */
export async function updateAlbumRowAt(row: Record<string, unknown>, base: string) {
  return writeDroppingMissing(row, (r) =>
    supabase.from('albums').update(r).eq('id', row.id as string).eq('updated_at', base).select('id, updated_at'));
}

const readVersion = async (id: string) => {
  const { data, error } = await supabase.from('albums').select('id, updated_at').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as { updated_at: string } | null)?.updated_at ?? null;
};

/**
 * Save one album row for `userId`. Never overwrites blindly:
 *  - on a version (`base`): lands only on that version. Moved on: `conflict`.
 *    Gone: `gone: 'deleted'`, and it is NOT put back. It used to fall through
 *    to an upsert, so an album deleted on the laptop came back from the phone
 *    without a word (Kraken, 2026-10-05).
 *  - no version: a NEW row (insert). Its id already saved by this account:
 *    `conflict` (the builder decides whose work it is). Used by a row this
 *    account cannot see: `gone: 'taken'`. An upsert there failed with 42501 on
 *    every save, forever.
 * Throws on any other error.
 */
export async function saveAlbumRow(userId: string, albumData: AlbumData, opts?: SaveOptions): Promise<SaveResult> {
  const payload = {
    ...serializeAlbum(albumData),
    user_id: userId,
    ...(albumData.id ? { id: albumData.id } : {}),
  };

  if (albumData.id && opts?.base) {
    const { data: rows, error: updateError } = await updateAlbumRowAt(payload, opts.base);
    if (updateError) throw updateError;
    const written = Array.isArray(rows) ? rows[0] as { id?: string; updated_at?: string } | undefined : undefined;
    if (written) return { success: true, albumId: written.id, updatedAt: written.updated_at };
    const now = await readVersion(albumData.id);
    return now ? { success: false, conflict: { updatedAt: now } } : { success: false, gone: 'deleted' };
  }

  const { data, error: insertError } = await insertAlbumRow(payload);
  if (insertError) {
    if (insertError.code === '23505' && albumData.id) {
      const now = await readVersion(albumData.id);
      return now ? { success: false, conflict: { updatedAt: now } } : { success: false, gone: 'taken' };
    }
    throw insertError;
  }
  return { success: true, albumId: data?.id as string | undefined, updatedAt: (data as { updated_at?: string } | null)?.updated_at };
}

// =============================================================================
// Hook
// =============================================================================

export function useAlbumSync(): UseAlbumSyncReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  /** Save an album for a user (saveAlbumRow), with loading / error state. */
  const save = useCallback(
    async (userId: string, albumData: AlbumData, opts?: SaveOptions): Promise<SaveResult> => {
      setLoading(true);
      setError(null);
      try {
        return await saveAlbumRow(userId, albumData, opts);
      } catch (err: unknown) {
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
