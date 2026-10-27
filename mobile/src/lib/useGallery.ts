/* The pick-photos grid's data: photo access, and the phone's photos loaded
   page by page (a small first page shows at once, the rest follows in big
   pages). Loads again when the app comes back to the front (photo access may
   have changed in Settings) and when the phone's photos change. */
import { addListener } from 'expo-media-library';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  askPhotoAccess,
  checkPhotoAccess,
  chooseMorePhotos,
  FIRST_PAGE,
  loadGalleryPage,
  NEXT_PAGE,
  type GalleryPhoto,
  type PhotoAccess,
} from './gallery';
import { sortNewestFirst } from './photoDays';

export interface GalleryValue {
  /** Null while the first check runs. */
  access: PhotoAccess | null;
  /** Newest first. */
  photos: GalleryPhoto[];
  /** More pages are still coming. */
  loadingMore: boolean;
  /** The first page is not here yet. */
  loadingFirst: boolean;
  failed: boolean;
  ask: () => Promise<void>;
  chooseMore: () => Promise<void>;
  reload: () => void;
  /** Resolves once every page has loaded (at once if it already has). */
  whenLoaded: () => Promise<void>;
}

const granted = (a: PhotoAccess | null) => a?.state === 'all' || a?.state === 'limited';

export function useGallery(): GalleryValue {
  const [access, setAccess] = useState<PhotoAccess | null>(null);
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingFirst, setLoadingFirst] = useState(true);
  const [failed, setFailed] = useState(false);
  const run = useRef(0);
  const waiters = useRef<(() => void)[]>([]);
  const loadingRef = useRef(false);

  const settle = () => {
    loadingRef.current = false;
    const w = waiters.current;
    waiters.current = [];
    w.forEach((f) => f());
  };

  const shown = useRef(0);

  const load = useCallback(async () => {
    const id = ++run.current;
    loadingRef.current = true;
    // The first load shows photos page by page. A reload (back from Settings,
    // photos changed) keeps the grid as it is and swaps it once, at the end,
    // so the grid never shrinks to one page and grows again.
    const progressive = shown.current === 0;
    setFailed(false);
    setLoadingMore(true);
    try {
      let all: GalleryPhoto[] = [];
      let offset = 0;
      let size = FIRST_PAGE;
      for (;;) {
        const page = await loadGalleryPage(offset, size);
        if (id !== run.current) return; // a newer load took over
        const seen = new Set(all.map((p) => p.id));
        all = sortNewestFirst([...all, ...page.filter((p) => !seen.has(p.id))]);
        if (progressive) {
          setPhotos(all);
          setLoadingFirst(false);
        }
        if (page.length < size) break;
        offset += size;
        size = NEXT_PAGE;
      }
      shown.current = all.length;
      setPhotos(all);
      setLoadingFirst(false);
    } catch (e) {
      if (id !== run.current) return;
      console.warn('Could not read the phone photos', e);
      setFailed(true);
      setLoadingFirst(false);
    }
    if (id === run.current) {
      setLoadingMore(false);
      settle();
    }
  }, []);

  const refresh = useCallback(async () => {
    const a = await checkPhotoAccess().catch(() => null);
    if (!a) return;
    setAccess(a);
    if (granted(a)) void load();
    else {
      run.current++;
      shown.current = 0;
      setPhotos([]);
      setLoadingFirst(false);
      setLoadingMore(false);
      settle();
    }
  }, [load]);

  useEffect(() => {
    void refresh();
    const appState = AppState.addEventListener('change', (s) => { if (s === 'active') void refresh(); });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const changes = addListener(() => {
      // Photos added or deleted: load again, once the burst of changes ends.
      clearTimeout(timer);
      timer = setTimeout(() => { void refresh(); }, 800);
    });
    return () => {
      appState.remove();
      changes.remove();
      clearTimeout(timer);
      run.current++; // stop a load in progress
    };
  }, [refresh]);

  const ask = useCallback(async () => {
    const a = await askPhotoAccess();
    setAccess(a);
    if (granted(a)) void load();
  }, [load]);

  const chooseMore = useCallback(async () => {
    const a = await chooseMorePhotos();
    setAccess(a);
    if (granted(a)) void load();
  }, [load]);

  const whenLoaded = useCallback(() => (loadingRef.current ? new Promise<void>((resolve) => { waiters.current.push(resolve); }) : Promise.resolve()), []);

  return useMemo(
    () => ({ access, photos, loadingMore, loadingFirst, failed, ask, chooseMore, reload: () => { void load(); }, whenLoaded }),
    [access, photos, loadingMore, loadingFirst, failed, ask, chooseMore, load, whenLoaded],
  );
}
