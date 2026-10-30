import type { AlbumPage } from './types';
import { memoriesOn } from './generateAlbum';

/* A photo onto the album's LAST page, by trading places with the photo
   there (testing phase: the sample album's "end of the day" photo, the one
   under "You're done with today's test!", lib/samplePhotos). The album maker
   reserves photos for full pages and memories, so the latest-timed photo
   doesn't always end up last; this puts it there.
   Each photo keeps its own pan and zoom (they travel with it). Nothing
   changes when the photo isn't in the album, is on the last page already,
   or either page holds a video memory or is the customer's own (Studio). */
export function withPhotoOnLastPage(pages: readonly AlbumPage[], photoIndex: number): AlbumPage[] {
  const last = pages.length - 1;
  const end = pages[last];
  const lastSlot = end?.slotFills?.findIndex((f) => f != null) ?? -1;
  if (!end || lastSlot < 0) return [...pages];
  if (end.slotFills!.includes(photoIndex)) return [...pages];
  const from = pages.findIndex((p) => p.slotFills?.includes(photoIndex));
  if (from < 0) return [...pages];
  const page = pages[from];
  if (page.studio || end.studio || memoriesOn(page).length > 0 || memoriesOn(end).length > 0) return [...pages];
  const slot = page.slotFills!.indexOf(photoIndex);

  const take = (p: AlbumPage, i: number) => ({
    fill: p.slotFills![i], scale: p.slotScales?.[i], x: p.slotOffsetsX?.[i], y: p.slotOffsetsY?.[i],
  });
  const put = (p: AlbumPage, i: number, v: ReturnType<typeof take>): AlbumPage => {
    const set = <T,>(arr: T[] | undefined, value: T | undefined): T[] | undefined => {
      if (!arr && value === undefined) return arr;
      const next = [...(arr ?? [])];
      if (value === undefined) delete next[i]; else next[i] = value;
      return next;
    };
    const slotFills = [...p.slotFills!];
    slotFills[i] = v.fill;
    return {
      ...p, slotFills,
      ...(p.slotScales || v.scale !== undefined ? { slotScales: set(p.slotScales, v.scale) } : {}),
      ...(p.slotOffsetsX || v.x !== undefined ? { slotOffsetsX: set(p.slotOffsetsX, v.x) } : {}),
      ...(p.slotOffsetsY || v.y !== undefined ? { slotOffsetsY: set(p.slotOffsetsY, v.y) } : {}),
    };
  };
  const mine = take(page, slot);
  const theirs = take(end, lastSlot);
  const next = [...pages];
  next[from] = put(page, slot, theirs);
  next[last] = put(end, lastSlot, mine);
  return next;
}
