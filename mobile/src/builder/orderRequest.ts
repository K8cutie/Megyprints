/* ══════════════════════════════════════════════════════════════════════════
   AN ORDER ASKED FROM OUTSIDE THE PREVIEW: "Order this album again" on an
   order (Your orders) opens the album, then asks the Preview to order it.
   The website's way (src/pages/Builder.tsx requestOrder, BuilderPreview's
   orderRequested): the Preview orders it exactly like its own "Order this
   album" button, through the same checks and save, never around them.

   One request, for one album, taken once: a later visit to the Preview,
   or a different album on screen, never orders by itself. Kept in memory
   only (gone when the app closes).
   ══════════════════════════════════════════════════════════════════════════ */

let asked: string | null = null;

/** Ask the Preview to order this album once it is on screen. */
export function requestOrder(albumId: string): void {
  asked = albumId;
}

/** The Preview takes the request for the album on screen: true once, then
 *  never again. A request for another album is dropped (that album is no
 *  longer the one to order). */
export function takeOrderRequest(albumOnScreen: string | undefined): boolean {
  const mine = !!albumOnScreen && asked === albumOnScreen;
  asked = null;
  return mine;
}
