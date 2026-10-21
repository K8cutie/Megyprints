import { describe, it, expect } from 'vitest';
import type { AlbumPage } from './types';
import { findPhotoSlot, placedPhotoPages, placePhoto, swapNotice } from './slotSwap';

/* ══════════════════════════════════════════════════════════════════════════
   ONE PHOTO, ONE PLACE (owner, 2026-10-20): pick a photo that is already on
   another page and it comes here — the two frames swap, so no photo is ever
   printed twice. Desktop used to hide placed photos from the picker; the
   phone used to copy them.
   ══════════════════════════════════════════════════════════════════════════ */

const page = (i: number, slotFills: (number | null)[], framing = false): AlbumPage => ({
  id: `page-${i}`, layout: 'freeform', size: '8x8', background: { type: 'solid', solid: '#FFFFFF' },
  photos: [], textElements: [], templateId: 't88-fb-duo-exact-v-gap', slotFills,
  ...(framing ? { slotScales: slotFills.map((_, s) => 1 + i + s / 10), slotOffsetsX: slotFills.map((_, s) => 10 * i + s), slotOffsetsY: slotFills.map((_, s) => 100 * i + s) } : {}),
});

/** page 1: photos 0,1 · page 2: empty · page 3: photos 4,5 · photo 9 unplaced */
const album = () => [page(0, [0, 1], true), page(1, [null, null], true), page(2, [4, 5], true)];

describe('where a photo is', () => {
  it('finds the frame holding a photo, or null when it is not placed', () => {
    expect(findPhotoSlot(album(), 5)).toEqual({ pageIndex: 2, slotIndex: 1 });
    expect(findPhotoSlot(album(), 0)).toEqual({ pageIndex: 0, slotIndex: 0 });
    expect(findPhotoSlot(album(), 9)).toBeNull();
  });
  it('maps every placed photo to its page (for the "Page 3" tag in the pickers)', () => {
    expect([...placedPhotoPages(album())]).toEqual([[0, 0], [1, 0], [4, 2], [5, 2]]);
  });
});

describe('placing a photo', () => {
  it('an unplaced photo simply fills the frame', () => {
    const { pages, swappedWith } = placePhoto(album(), 1, 0, 9);
    expect(pages[1].slotFills).toEqual([9, null]);
    expect(swappedWith).toBeNull();
    expect(pages[0].slotFills).toEqual([0, 1]);
    expect(pages[2].slotFills).toEqual([4, 5]);
  });

  it('a photo from ANOTHER page moves here and leaves that frame empty (the owner\'s case: cleared frame, then pick)', () => {
    const { pages, swappedWith } = placePhoto(album(), 1, 0, 5);
    expect(pages[1].slotFills).toEqual([5, null]);
    expect(pages[2].slotFills).toEqual([4, null]);
    expect(swappedWith).toEqual({ pageIndex: 2, slotIndex: 1 });
    // the photo's framing (zoom + pan) travels with it
    expect(pages[1].slotScales?.[0]).toBe(3.1);
    expect(pages[1].slotOffsetsX?.[0]).toBe(21);
    expect(pages[1].slotOffsetsY?.[0]).toBe(201);
  });

  it('a photo from another page SWAPS with the photo already in the frame — never two copies', () => {
    const { pages, swappedWith } = placePhoto(album(), 0, 1, 4);
    expect(pages[0].slotFills).toEqual([0, 4]);
    expect(pages[2].slotFills).toEqual([1, 5]);
    expect(swappedWith).toEqual({ pageIndex: 2, slotIndex: 0 });
    expect(pages[2].slotScales?.[0]).toBe(1.1); // photo 1 kept its zoom
    expect(pages[0].slotScales?.[1]).toBe(3); // photo 4 kept its zoom
    const all = pages.flatMap((p) => p.slotFills ?? []).filter((f) => f != null);
    expect(new Set(all).size).toBe(all.length);
  });

  it('on the same page the two frames swap, as the app always did', () => {
    const { pages, swappedWith } = placePhoto(album(), 0, 1, 0);
    expect(pages[0].slotFills).toEqual([1, 0]);
    expect(swappedWith).toEqual({ pageIndex: 0, slotIndex: 0 });
    expect(pages[0].slotScales).toEqual([1.1, 1]);
  });

  it('re-picking the photo already in that frame changes nothing but keeps it there', () => {
    const { pages, swappedWith } = placePhoto(album(), 0, 1, 1);
    expect(pages[0].slotFills).toEqual([0, 1]);
    expect(swappedWith).toBeNull();
  });

  it('a photo claims the frame: its quote / text / QR / graphic are cleared', () => {
    const withText = album();
    withText[1] = { ...withText[1], slotTexts: [{ text: 'hi' } as never, null], qrFills: [null, null] };
    const { pages } = placePhoto(withText, 1, 0, 9);
    expect(pages[1].slotTexts).toEqual([null, null]);
  });

  it('does not touch the pages it was given', () => {
    const before = album();
    const snapshot = JSON.stringify(before);
    placePhoto(before, 1, 0, 5);
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe('what the customer is told', () => {
  it('names the page the photo came from, in their numbering', () => {
    expect(swapNotice({ pageIndex: 2, slotIndex: 1 }, 1, true)).toBe('Moved here from page 3 — that page has an empty frame now');
    expect(swapNotice({ pageIndex: 2, slotIndex: 0 }, 0, false)).toBe('Swapped with the photo on page 3');
  });
  it('says nothing for a plain fill or a same-page swap', () => {
    expect(swapNotice(null, 1, true)).toBeNull();
    expect(swapNotice({ pageIndex: 0, slotIndex: 0 }, 0, false)).toBeNull();
  });
});
