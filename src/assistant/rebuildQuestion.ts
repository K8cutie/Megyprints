/* ══════════════════════════════════════════════════════════════════════════
   rebuildQuestion — what Megy asks before a typed command rebuilds a made
   album. Rebuilding replaces every page's layout and the customer's layout
   edits, so a typed "generate", or a size change on an album already laid out
   for another size (it re-lays out every page for the new shape), asks first;
   a yes, or asking again, does it ("Surprise me" too). The wizard's own
   buttons are explicit choices and aren't asked.
   1-star testers, 2026-10-04 (the Penny-Pincher): "change size to 6x4" said
   "Album size changed" and left the 6×8 layout squashed onto 6×4.
   A size change that grows the album says so, the way the photos-per-page
   step does: "change the album size to 8x8" on a 40-page 6×4 at 2 a page
   made 50 single pages (₱318 more) and the question never said (1-star
   testers round 3, the Indecisive One).
   ══════════════════════════════════════════════════════════════════════════ */

import type { AssistantIntent } from './types';
import type { AlbumPage, AlbumSizePreset, UploadedPhoto } from '../pages/builder/types';
import { photosPerPageNote } from '../pages/builder/generateAlbum';

/** An album is made once any page holds a photo. */
export function albumIsMade(pages: AlbumPage[]): boolean {
  return pages.some((p) => (p.slotFills ?? []).some((f) => f != null));
}

/** Video memories placed on the album's pages (photo-slot and box QRs). */
export function placedMemories(pages: AlbumPage[]): number {
  return pages.reduce((n, p) => n + (p.qrFills ?? []).filter(Boolean).length + (p.textSlotQr ?? []).filter(Boolean).length, 0);
}

const memoriesPhrase = (n: number) => (n > 0 ? ` and your ${n} video ${n === 1 ? 'memory' : 'memories'} (you'd add ${n === 1 ? 'it' : 'them'} again)` : '');

/** What making a made album again replaces, in the customer's words. */
export function remakeLosesMessage(memories: number): string {
  return `Every page is laid out again from your photos. That replaces your layout changes, the text you wrote${memoriesPhrase(memories)}. Your photos stay.`;
}

/** The question to ask before running `intent`, or null to just run it.
 *  `extraCost` is what `pages` pages add at a size on the live schedule (null
 *  before it loads: pages, no pesos). */
export function rebuildQuestion(
  intent: AssistantIntent,
  album: { albumPages: AlbumPage[]; albumSize: AlbumSizePreset; uploadedPhotos?: UploadedPhoto[]; photosPerPage?: number },
  extraCost?: ((size: AlbumSizePreset, pages: number) => number) | null,
): string | null {
  if (!albumIsMade(album.albumPages)) return null;
  if (intent.type === 'generate_album') {
    return `That rebuilds your whole album: every page gets a new layout and your layout changes are replaced (Studio pages stay)${memoriesPhrase(placedMemories(album.albumPages))}. Say "yes" to go ahead, or keep editing.`;
  }
  // "Surprise me" rebuilds every page too (random layouts) — it rearranged a
  // made album without asking and wiped layout edits and custom text (1-star
  // testers round 2, the Perfectionist), while "generate" asked.
  if (intent.type === 'surprise_me') {
    return "That gives every page a fresh, surprise layout: your layout changes and the text you wrote in caption boxes are replaced (Studio pages stay). Say \"yes\" to go ahead, or keep editing.";
  }
  const size = intent.type === 'change_size' ? (intent.payload?.size as AlbumSizePreset | undefined) : undefined;
  if (size && size !== album.albumSize) {
    // What the new size makes of these photos at the photos-per-page picked,
    // when that's more pages than included: the same note as the upload step.
    const note = photosPerPageNote(album.uploadedPhotos ?? [], size, album.photosPerPage,
      extraCost ? (pages) => extraCost(size, pages) : null);
    const grows = note && /more than the \d+ included/.test(note) ? ` ${note}` : '';
    return `That makes your album ${size.replace('x', '×')} and lays out every page again for the new shape. Your photos stay; your layout changes are replaced, Studio pages too.${grows} Say "yes" to go ahead, or keep editing.`;
  }
  return null;
}
