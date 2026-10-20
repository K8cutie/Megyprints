// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useIndexedDBPhotos, type UseIndexedDBPhotosReturn } from './useIndexedDBPhotos';

/* ══════════════════════════════════════════════════════════════════════════
   A PHOTO STORED AGAIN UNDER ITS OWN ID (replacePhoto) gets a fresh link.
   store() revoked the old cached link but kept it in the cache, so the next
   get() — opening the album from Your Projects, say — handed out that dead
   link and the photo showed blank (found 2026-10-21 while chasing the owner's
   "photos sometimes dont appear on a page").
   The real hook, over a small in-memory stand-in for the browser's photo store.
   ══════════════════════════════════════════════════════════════════════════ */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const rows = new Map<string, Record<string, unknown>>();
const fakeIndexedDB = {
  open() {
    const req: { result?: unknown; onsuccess?: () => void } = {};
    setTimeout(() => {
      req.result = {
        objectStoreNames: { contains: () => true },
        close() {},
        transaction() {
          const tx: { oncomplete?: () => void; objectStore?: () => unknown } = {};
          tx.objectStore = () => ({
            put: (rec: Record<string, unknown>) => { rows.set(rec.id as string, rec); return { result: rec.id }; },
            get: (id: string) => ({ result: rows.get(id) }),
            delete: (id: string) => { rows.delete(id); return { result: undefined }; },
            getAll: () => ({ result: [...rows.values()] }),
          });
          setTimeout(() => tx.oncomplete?.(), 0);
          return tx;
        },
      };
      req.onsuccess?.();
    }, 0);
    return req;
  },
};

let made = 0;
const revoked = new Set<string>();
let root: Root;
let api: UseIndexedDBPhotosReturn;
beforeEach(() => {
  rows.clear(); revoked.clear(); made = 0;
  Object.defineProperty(globalThis, 'indexedDB', { value: fakeIndexedDB, configurable: true });
  Object.defineProperty(URL, 'createObjectURL', { value: () => `blob:test/${++made}`, configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: (u: string) => { revoked.add(u); }, configurable: true });
  Object.defineProperty(globalThis, 'createImageBitmap', { value: async () => ({ width: 1200, height: 900, close() {} }), configurable: true });
  const Probe = () => { api = useIndexedDBPhotos(); return null; };
  root = createRoot(document.createElement('div'));
  act(() => root.render(createElement(Probe)));
});
afterEach(() => act(() => root.unmount()));

const photo = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: 'image/jpeg' });

describe('useIndexedDBPhotos: a photo stored again gets a live link', () => {
  it('get after a second store of the same id: a NEW link, not the revoked one', async () => {
    await act(async () => { await api.store(photo('IMG_1.jpg'), 'p1'); });
    const first = (await api.get('p1'))!.url;
    expect(revoked.has(first)).toBe(false);

    await act(async () => { await api.store(photo('IMG_1-new.jpg'), 'p1'); }); // replaced
    expect(revoked.has(first)).toBe(true); // the old link is let go…
    const second = (await api.get('p1'))!.url;
    expect(second).not.toBe(first); // …and never handed out again
    expect(revoked.has(second)).toBe(false);
  });

  it('get twice with nothing stored in between: the same link (still cached)', async () => {
    await act(async () => { await api.store(photo('IMG_2.jpg'), 'p2'); });
    const a = (await api.get('p2'))!.url;
    const b = (await api.get('p2'))!.url;
    expect(b).toBe(a);
  });
});
