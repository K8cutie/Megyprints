/* ══════════════════════════════════════════════════════════════════════════
   The album being made, for every screen, saved on the phone.

   Saved in a file in the app's own folder (draftFile) after every change, so
   closing the app (or the phone killing it) keeps the picked photos. There is
   no size limit: an album of 20,000 photos saves and opens like one of 40.
   Saves run one after another, so an older save can never land after a newer
   one; changes made while a save runs go out together in the next one.

   A saved album that can't be read is never written over: it is moved aside
   first, and Your photos tells the person to pick their photos again.
   ══════════════════════════════════════════════════════════════════════════ */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fileDraftStorage, type DraftStorage } from './draftFile';
import { addPhotos, emptyDraft, readDraft, removePhotos, serializeDraft, type AddResult, type AlbumDraft, type DraftPhoto } from './photoDraft';

interface DraftValue {
  /** Still reading the saved album from the phone. */
  loading: boolean;
  draft: AlbumDraft;
  /** The album saved before could not be opened (it was kept aside). True
   *  until the person adds photos or closes the message. */
  couldNotOpen: boolean;
  closeCouldNotOpen: () => void;
  add: (photos: readonly DraftPhoto[]) => AddResult;
  remove: (keys: readonly string[]) => void;
  clear: () => void;
  /** The album as it is right now, even between renders (for timers). */
  peek: () => AlbumDraft;
}

const DraftContext = createContext<DraftValue | null>(null);

/** Saves drafts in order; the latest one always wins. While one save runs,
 *  only the newest waiting draft is saved next (no pile-up of big writes).
 *  Exported for tests. */
export function makeSaver(write: (text: string) => Promise<void>, onError: (e: unknown) => void = () => {}) {
  let waiting: AlbumDraft | null = null;
  let running: Promise<void> | null = null;
  const run = async () => {
    while (waiting) {
      const draft = waiting;
      waiting = null;
      try {
        await write(serializeDraft(draft));
      } catch (e) {
        onError(e);
      }
    }
    running = null;
  };
  return (draft: AlbumDraft): Promise<void> => {
    waiting = draft;
    if (!running) running = run();
    return running;
  };
}

export type LoadState = 'none' | 'loaded' | 'unreadable';

/** Reads the saved album, and says whether there was none, or one that
 *  could not be read (never confused with "none"). */
export async function loadDraft(storage: DraftStorage): Promise<{ draft: AlbumDraft; state: LoadState }> {
  let text: string | null;
  try {
    text = await storage.read();
  } catch {
    return { draft: emptyDraft(), state: 'unreadable' };
  }
  if (!text) return { draft: emptyDraft(), state: 'none' };
  const draft = readDraft(text);
  return draft ? { draft, state: 'loaded' } : { draft: emptyDraft(), state: 'unreadable' };
}

export interface OpenedDraft {
  draft: AlbumDraft;
  /** A saved album was there but could not be read. */
  couldNotOpen: boolean;
  /** False only when an unreadable save could not be moved aside: then
   *  nothing is saved, so it is never written over. */
  canSave: boolean;
}

/** Opens the saved album for the app. One that can't be read is moved aside
 *  before anything else is saved. */
export async function openDraft(storage: DraftStorage): Promise<OpenedDraft> {
  const { draft, state } = await loadDraft(storage);
  if (state !== 'unreadable') return { draft, couldNotOpen: false, canSave: true };
  try {
    await storage.keepAside();
    return { draft: emptyDraft(), couldNotOpen: true, canSave: true };
  } catch {
    return { draft: emptyDraft(), couldNotOpen: true, canSave: false };
  }
}

export function DraftProvider({ children, storage = fileDraftStorage }: { children: ReactNode; storage?: DraftStorage }) {
  const [draft, setDraft] = useState<AlbumDraft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [couldNotOpen, setCouldNotOpen] = useState(false);
  const current = useRef<AlbumDraft>(draft);
  const canSave = useRef(false);
  const write = useMemo(() => makeSaver((text) => storage.write(text), (e) => console.warn('Could not save the album on the phone', e)), [storage]);
  const save = useCallback((d: AlbumDraft) => (canSave.current ? write(d) : Promise.resolve()), [write]);

  useEffect(() => {
    let live = true;
    void openDraft(storage).then((opened) => {
      if (!live) return;
      canSave.current = opened.canSave;
      // A photo added before the saved album finished opening is kept too.
      const early = current.current.photos;
      const merged = early.length ? addPhotos(opened.draft, early).draft : opened.draft;
      current.current = merged;
      setDraft(merged);
      setCouldNotOpen(opened.couldNotOpen && early.length === 0);
      setLoading(false);
      if (early.length) void save(merged);
    });
    return () => { live = false; };
  }, [storage, save]);

  const commit = useCallback((next: AlbumDraft) => {
    if (next === current.current) return;
    current.current = next;
    setDraft(next);
    setCouldNotOpen(false);
    void save(next);
  }, [save]);

  const add = useCallback((photos: readonly DraftPhoto[]) => {
    const result = addPhotos(current.current, photos);
    commit(result.draft);
    return result;
  }, [commit]);

  const remove = useCallback((keys: readonly string[]) => commit(removePhotos(current.current, keys)), [commit]);
  const clear = useCallback(() => commit({ ...emptyDraft(), updatedAt: Date.now() }), [commit]);
  const peek = useCallback(() => current.current, []);
  const closeCouldNotOpen = useCallback(() => setCouldNotOpen(false), []);

  const value = useMemo(
    () => ({ loading, draft, couldNotOpen, closeCouldNotOpen, add, remove, clear, peek }),
    [loading, draft, couldNotOpen, closeCouldNotOpen, add, remove, clear, peek],
  );
  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

export function useDraft(): DraftValue {
  const v = useContext(DraftContext);
  if (!v) throw new Error('useDraft must be used inside <DraftProvider>');
  return v;
}
