/* A page's picture going on show (usePagePicture), for whoever waits for it:
   the editor's move-and-zoom preview stays over the photo until the page it
   changed is drawn, so the photo never jumps back to where it was for a
   moment. Its own file, so the editor's parts can listen without loading the
   page renderer (tests have no Skia). */
import type { AlbumPage } from '@web/pages/builder/types';

const listeners = new Set<(page: AlbumPage) => void>();

export function onPagePictureShown(fn: (page: AlbumPage) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function pagePictureShown(page: AlbumPage): void {
  listeners.forEach((fn) => fn(page));
}
