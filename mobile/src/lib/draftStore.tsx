/* ══════════════════════════════════════════════════════════════════════════
   The album being made, for every screen, saved on the phone.

   Saved in AsyncStorage under DRAFT_STORAGE_KEY after every change, so
   closing the app (or the phone killing it) keeps the picked photos. Saves
   run one after another, so an older save can never land after a newer one.

   Size: a photo takes about 200 bytes saved. Android's AsyncStorage reads
   one saved value up to about 2 MB, so one album holds roughly 8,000 photos
   before that limit; far more than an album uses.
   ══════════════════════════════════════════════════════════════════════════ */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { addPhotos, emptyDraft, parseDraft, removePhotos, serializeDraft, type AddResult, type AlbumDraft, type DraftPhoto } from './photoDraft';

export const DRAFT_STORAGE_KEY = 'megy-2.0-album-draft-v1';

interface DraftValue {
  /** Still reading the saved album from the phone. */
  loading: boolean;
  draft: AlbumDraft;
  add: (photos: readonly DraftPhoto[]) => AddResult;
  remove: (keys: readonly string[]) => void;
  clear: () => void;
}

const DraftContext = createContext<DraftValue | null>(null);

/** Saves drafts in order; the latest one always wins. Exported for tests. */
export function makeSaver(write: (text: string) => Promise<void>, onError: (e: unknown) => void = () => {}) {
  let chain: Promise<void> = Promise.resolve();
  return (draft: AlbumDraft): Promise<void> => {
    const text = serializeDraft(draft);
    chain = chain.then(() => write(text)).catch(onError);
    return chain;
  };
}

/** Reads the saved album. A broken or missing save gives an empty album. */
export async function loadDraft(read: (key: string) => Promise<string | null> = (k) => AsyncStorage.getItem(k)): Promise<AlbumDraft> {
  try {
    return parseDraft(await read(DRAFT_STORAGE_KEY));
  } catch {
    return emptyDraft();
  }
}

export function DraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<AlbumDraft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const current = useRef<AlbumDraft>(draft);
  const save = useMemo(() => makeSaver((text) => AsyncStorage.setItem(DRAFT_STORAGE_KEY, text), (e) => console.warn('Could not save the album on the phone', e)), []);

  useEffect(() => {
    let live = true;
    void loadDraft().then((saved) => {
      if (!live) return;
      // A photo added before the saved album finished loading is kept too.
      const early = current.current.photos;
      const merged = early.length ? addPhotos(saved, early).draft : saved;
      current.current = merged;
      setDraft(merged);
      setLoading(false);
      if (early.length) void save(merged);
    });
    return () => { live = false; };
  }, [save]);

  const commit = useCallback((next: AlbumDraft) => {
    if (next === current.current) return;
    current.current = next;
    setDraft(next);
    void save(next);
  }, [save]);

  const add = useCallback((photos: readonly DraftPhoto[]) => {
    const result = addPhotos(current.current, photos);
    commit(result.draft);
    return result;
  }, [commit]);

  const remove = useCallback((keys: readonly string[]) => commit(removePhotos(current.current, keys)), [commit]);
  const clear = useCallback(() => commit({ ...emptyDraft(), updatedAt: Date.now() }), [commit]);

  const value = useMemo(() => ({ loading, draft, add, remove, clear }), [loading, draft, add, remove, clear]);
  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

export function useDraft(): DraftValue {
  const v = useContext(DraftContext);
  if (!v) throw new Error('useDraft must be used inside <DraftProvider>');
  return v;
}
