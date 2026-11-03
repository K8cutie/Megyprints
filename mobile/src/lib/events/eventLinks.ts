/* Which album the host tied to which event booking, on this phone (the
   website's eventAlbum.ts linkAlbumToBooking / eventLinkForAlbum /
   unlinkAlbum, in AsyncStorage under the website's key). */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { EventAlbumLink } from './eventDeal';

export const LINKS_KEY = 'megy-event-albums';

async function readLinks(): Promise<Record<string, EventAlbumLink>> {
  try {
    const v = JSON.parse((await AsyncStorage.getItem(LINKS_KEY)) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

export async function linkAlbumToBooking(albumId: string, link: EventAlbumLink): Promise<void> {
  try {
    const all = await readLinks();
    all[albumId] = link;
    await AsyncStorage.setItem(LINKS_KEY, JSON.stringify(all));
  } catch { /* checkout then prices it as a normal album */ }
}

export async function eventLinkForAlbum(albumId: string | null | undefined): Promise<EventAlbumLink | null> {
  if (!albumId) return null;
  const l = (await readLinks())[albumId];
  return l && typeof l.bookingId === 'string' ? l : null;
}

export async function unlinkAlbum(albumId: string): Promise<void> {
  try {
    const all = await readLinks();
    delete all[albumId];
    await AsyncStorage.setItem(LINKS_KEY, JSON.stringify(all));
  } catch { /* nothing to undo */ }
}
