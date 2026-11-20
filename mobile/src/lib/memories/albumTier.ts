/* The quality an album's memory videos were made for, for checkout's HD
   line (Order.tsx: hdMemories = qrCount > 0 && (albumTier ??
   currentClipQuality()) === 'hd'): this album's kept videos say it; with
   none kept on this phone, the phone-wide setting. The phone's store is
   loaded only here, so the checkout screen and its tests don't load it
   otherwise; anything it can't read counts as Standard. */
import { albumVideoMinutes, type VideoMinutes } from '@web/lib/pricing';
import type { ClipQuality } from './clips';

/** LONGER VIDEOS (0067): the album's tier, its longest video kept on this
 *  phone (pricing.ts albumVideoMinutes); unreadable counts as included. */
export async function albumVideoMinutesOnPhone(codes: string[]): Promise<VideoMinutes> {
  if (!codes.length) return 2;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { clipStore } = require('./clipStore') as typeof import('./clipStore');
    const kept = await Promise.all(codes.map((c) => clipStore.getStagedClip(c).catch(() => null)));
    return albumVideoMinutes(kept.map((k) => k?.durationSec ?? null));
  } catch {
    return 2;
  }
}

export async function albumClipTier(codes: string[]): Promise<ClipQuality> {
  if (!codes.length) return 'standard';
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { clipStore, currentClipQuality } = require('./clipStore') as typeof import('./clipStore');
    return (await clipStore.stagedClipQuality(codes)) ?? (await currentClipQuality());
  } catch {
    return 'standard';
  }
}
