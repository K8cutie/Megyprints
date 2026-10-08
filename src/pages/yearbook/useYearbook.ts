/* The yearbook's state on this computer: the project (autosaved) and the
   photo details. Photo pixels stay in IndexedDB and are decoded on demand. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { allPhotoMeta, clearAll, loadProject, saveProject } from '@/yearbook/store';
import type { PhotoMeta, YearbookProject } from '@/yearbook/types';

export function useYearbook() {
  const [project, setProjectState] = useState<YearbookProject | null>(null);
  const [photos, setPhotos] = useState<Record<string, PhotoMeta>>({});
  const [ready, setReady] = useState(false);
  const saveTimer = useRef<number | undefined>(undefined);
  const latest = useRef<YearbookProject | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([loadProject(), allPhotoMeta()])
      .then(([p, ph]) => { if (!alive) return; setProjectState(p ?? null); latest.current = p ?? null; setPhotos(ph); })
      .catch(() => undefined)
      .finally(() => alive && setReady(true));
    return () => { alive = false; };
  }, []);

  const flush = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    if (latest.current) void saveProject(latest.current);
  }, []);

  useEffect(() => {
    window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('pagehide', flush); flush(); };
  }, [flush]);

  const setProject = useCallback((next: YearbookProject | null | ((p: YearbookProject | null) => YearbookProject | null)) => {
    setProjectState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      latest.current = value;
      // Save on the next tick (several changes in one click become one write).
      // Not debounced longer: an IndexedDB write started while the tab closes
      // can be dropped, so the window for losing a change must stay ~0.
      window.clearTimeout(saveTimer.current);
      if (value) saveTimer.current = window.setTimeout(() => void saveProject(value), 0);
      return value;
    });
  }, []);

  const addPhotos = useCallback((list: PhotoMeta[]) => {
    setPhotos((prev) => ({ ...prev, ...Object.fromEntries(list.map((p) => [p.id, p])) }));
  }, []);

  const startOver = useCallback(async () => {
    window.clearTimeout(saveTimer.current);
    latest.current = null;
    await clearAll();
    setProjectState(null);
    setPhotos({});
  }, []);

  return { ready, project, setProject, photos, addPhotos, startOver };
}
