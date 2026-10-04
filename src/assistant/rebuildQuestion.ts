/* ══════════════════════════════════════════════════════════════════════════
   rebuildQuestion — what Megy asks before a typed command rebuilds a made
   album. Rebuilding replaces every page's layout and the customer's layout
   edits, so a typed "generate", or a size change on an album already laid out
   for another size (it re-lays out every page for the new shape), asks first;
   a yes, or asking again, does it. The wizard's own buttons are explicit
   choices and aren't asked.
   1-star testers, 2026-10-04 (the Penny-Pincher): "change size to 6x4" said
   "Album size changed" and left the 6×8 layout squashed onto 6×4.
   ══════════════════════════════════════════════════════════════════════════ */

import type { AssistantIntent } from './types';
import type { AlbumPage, AlbumSizePreset } from '../pages/builder/types';

/** An album is made once any page holds a photo. */
export function albumIsMade(pages: AlbumPage[]): boolean {
  return pages.some((p) => (p.slotFills ?? []).some((f) => f != null));
}

/** The question to ask before running `intent`, or null to just run it. */
export function rebuildQuestion(intent: AssistantIntent, album: { albumPages: AlbumPage[]; albumSize: AlbumSizePreset }): string | null {
  if (!albumIsMade(album.albumPages)) return null;
  if (intent.type === 'generate_album') {
    return "That rebuilds your whole album: every page gets a new layout and your layout changes are replaced (Studio pages stay). Say \"yes\" to go ahead, or keep editing.";
  }
  const size = intent.type === 'change_size' ? (intent.payload?.size as AlbumSizePreset | undefined) : undefined;
  if (size && size !== album.albumSize) {
    return `That makes your album ${size.replace('x', '×')} and lays out every page again for the new shape. Your photos stay; your layout changes are replaced, Studio pages too. Say "yes" to go ahead, or keep editing.`;
  }
  return null;
}
