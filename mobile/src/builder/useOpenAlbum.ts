/* ══════════════════════════════════════════════════════════════════════════
   OPEN ONE OF MY ALBUMS ON THE PHONE: the website's loadAlbum (the same one
   /builder?album=<id> runs), then, once the album is on screen, `then`.

   Used by My albums (tap an album) and by an order's "Order this album
   again". Its rules, held by test/albumsOpen.test.tsx:
     • one album opens at a time (a second tap while one opens does nothing);
     • a read that failed leaves the album on the phone as it was, and says
       so (`couldNot`): nothing is opened half-way;
     • `then` runs once, after the album is really on screen (its pages in),
       never while it is still being read.
   ══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface AlbumOpener {
  loadAlbum: (albumId: string) => Promise<void>;
  getAlbumId: () => string | undefined;
  isLoadingCloud: boolean;
}

export function useOpenAlbum(builder: AlbumOpener, then: (albumId: string) => void) {
  const [opening, setOpening] = useState<string | null>(null);
  const openingRef = useRef<string | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const [couldNot, setCouldNot] = useState<string | null>(null);
  const thenRef = useRef(then);
  thenRef.current = then;

  const open = useCallback(async (albumId: string) => {
    if (openingRef.current) return;
    openingRef.current = albumId;
    setOpening(albumId);
    setCouldNot(null);
    try { await builder.loadAlbum(albumId); } catch { /* not opened: said below */ }
    // A read that failed leaves the album on the phone as it was.
    if (builder.getAlbumId() === albumId) { setOpened(albumId); return; }
    openingRef.current = null;
    setOpening(null);
    setCouldNot(albumId);
  }, [builder]);

  // Once the album is on screen.
  useEffect(() => {
    if (!opened || builder.isLoadingCloud || builder.getAlbumId() !== opened) return;
    setOpened(null);
    openingRef.current = null;
    setOpening(null);
    thenRef.current(opened);
  }, [opened, builder]);

  return { open, opening, couldNot };
}
