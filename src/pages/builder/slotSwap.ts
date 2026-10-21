import type { AlbumPage } from './types';

/* ══════════════════════════════════════════════════════════════════════════
   ONE PHOTO, ONE PLACE. Pick a photo for a frame and it comes HERE — from
   wherever it was. The owner (2026-10-20): "I delete a picture and I want to
   replace it with something else, and that something else is already placed
   on a different page: it's going to remove the pic on that different page
   and put it where I want." His word for it: swap.

   Before this, desktop HID every placed photo from the picker ("All your
   photos are already in the album"), and the phone COPIED it — the same
   photo on two pages, printed twice. Auto-fill already refused to reuse a
   placed photo (1-star testers, 2026-10-04); the pickers now agree.

   A swap, not a move: the two frames exchange contents, framing (zoom + pan)
   travelling with each photo. With the target frame empty that is a move,
   and the other page's frame becomes empty ("Click to add"). The same-page
   case is the swap the app always did.
   ══════════════════════════════════════════════════════════════════════════ */

export interface SlotRef { pageIndex: number; slotIndex: number }

/** The frame holding `photoIndex`, searching `pages` in order (null = not placed).
 *  Only template photo frames (slotFills) count — not caption-box photos. */
export function findPhotoSlot(pages: readonly AlbumPage[], photoIndex: number): SlotRef | null {
  for (let p = 0; p < pages.length; p++) {
    const s = (pages[p].slotFills ?? []).indexOf(photoIndex);
    if (s !== -1) return { pageIndex: p, slotIndex: s };
  }
  return null;
}

/** photo index → the page (index) it is placed on, for every placed photo. */
export function placedPhotoPages(pages: readonly AlbumPage[]): Map<number, number> {
  const out = new Map<number, number>();
  pages.forEach((page, p) => (page.slotFills ?? []).forEach((f) => { if (f != null && !out.has(f)) out.set(f, p); }));
  return out;
}

function swapAt<T>(a: T[], i: number, b: T[], j: number): void {
  const t = a[i]; a[i] = b[j]; b[j] = t;
}

/** Put `photoIndex` into frame `slotIndex` of page `pageIndex`.
 *  Placed elsewhere (this page or another) → the two frames SWAP; otherwise a
 *  plain fill. The target frame's QR / text / ornament are cleared: a photo
 *  claims it. Returns the new pages and the frame the photo came from. */
export function placePhoto(
  pages: readonly AlbumPage[], pageIndex: number, slotIndex: number, photoIndex: number,
): { pages: AlbumPage[]; swappedWith: SlotRef | null } {
  const target = pages[pageIndex];
  if (!target) return { pages: [...pages], swappedWith: null };

  const next = [...pages];
  const t = {
    fills: [...(target.slotFills ?? [])],
    scales: [...(target.slotScales ?? [])],
    offX: [...(target.slotOffsetsX ?? [])],
    offY: [...(target.slotOffsetsY ?? [])],
  };
  // Mutual exclusivity: a photo claims this frame → clear any QR/text/ornament there.
  const qrFills = [...(target.qrFills ?? [])];
  const slotTexts = [...(target.slotTexts ?? [])];
  const ornamentFills = [...(target.ornamentFills ?? [])];
  qrFills[slotIndex] = null;
  slotTexts[slotIndex] = null;
  ornamentFills[slotIndex] = null;

  const from = findPhotoSlot(pages, photoIndex);
  if (!from || (from.pageIndex === pageIndex && from.slotIndex === slotIndex)) {
    t.fills[slotIndex] = photoIndex;
    next[pageIndex] = { ...target, slotFills: t.fills, qrFills, slotTexts, ornamentFills };
    return { pages: next, swappedWith: null };
  }

  if (from.pageIndex === pageIndex) {
    // Same page: the swap the app always did (framing travels with each photo).
    const o = from.slotIndex;
    t.fills[o] = t.fills[slotIndex] ?? null;
    t.fills[slotIndex] = photoIndex;
    swapAt(t.scales, o, t.scales, slotIndex);
    swapAt(t.offX, o, t.offX, slotIndex);
    swapAt(t.offY, o, t.offY, slotIndex);
    next[pageIndex] = { ...target, slotFills: t.fills, slotScales: t.scales, slotOffsetsX: t.offX, slotOffsetsY: t.offY, qrFills, slotTexts, ornamentFills };
    return { pages: next, swappedWith: from };
  }

  // Another page: the two frames exchange contents across pages.
  const source = pages[from.pageIndex];
  const s = {
    fills: [...(source.slotFills ?? [])],
    scales: [...(source.slotScales ?? [])],
    offX: [...(source.slotOffsetsX ?? [])],
    offY: [...(source.slotOffsetsY ?? [])],
  };
  const o = from.slotIndex;
  s.fills[o] = t.fills[slotIndex] ?? null;
  t.fills[slotIndex] = photoIndex;
  swapAt(s.scales, o, t.scales, slotIndex);
  swapAt(s.offX, o, t.offX, slotIndex);
  swapAt(s.offY, o, t.offY, slotIndex);
  next[from.pageIndex] = { ...source, slotFills: s.fills, slotScales: s.scales, slotOffsetsX: s.offX, slotOffsetsY: s.offY };
  next[pageIndex] = { ...target, slotFills: t.fills, slotScales: t.scales, slotOffsetsX: t.offX, slotOffsetsY: t.offY, qrFills, slotTexts, ornamentFills };
  return { pages: next, swappedWith: from };
}

/** What to tell the customer after a pick that took a photo from elsewhere
 *  (null = nothing moved). Page numbers as the customer sees them (1-based). */
export function swapNotice(swappedWith: SlotRef | null, targetPageIndex: number, targetWasEmpty: boolean): string | null {
  if (!swappedWith || swappedWith.pageIndex === targetPageIndex) return null;
  const n = swappedWith.pageIndex + 1;
  return targetWasEmpty ? `Moved here from page ${n} — that page has an empty frame now` : `Swapped with the photo on page ${n}`;
}
