/* The checkout's way to the phone's event links (eventLinks.ts), loaded only
   when used so the checkout screen and its tests don't load the phone's
   storage otherwise. Anything it can't read counts as "no link": checkout
   then prices the album as a normal one, as the website does. */
import type { EventAlbumLink } from './eventDeal';

type Links = typeof import('./eventLinks');
function links(): Links | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('./eventLinks') as Links;
  } catch {
    return null;
  }
}

export async function readEventLink(albumId: string | null | undefined): Promise<EventAlbumLink | null> {
  try { return (await links()?.eventLinkForAlbum(albumId)) ?? null; } catch { return null; }
}
export async function saveEventLink(albumId: string, link: EventAlbumLink): Promise<void> {
  try { await links()?.linkAlbumToBooking(albumId, link); } catch { /* checkout keeps it for this visit */ }
}
export async function dropEventLink(albumId: string): Promise<void> {
  try { await links()?.unlinkAlbum(albumId); } catch { /* nothing to undo */ }
}
