import { describe, it, expect } from 'vitest';
import {
  isBlankPage, blankPageIndexes, blankPagePlan, blankPagesTitle, blankPagesBody,
  deleteBlankLabel, editBlankLabel, orderWithBlankLabel, deletedBlankNote,
} from './blankPages';
import { checkOrderReadiness, readinessMessage, PLACEHOLDER_TEXT } from './orderReadiness';
import { getTemplatesForAlbum } from './pageTemplates';
import type { AlbumPage, TextElement } from './types';

/* ══════════════════════════════════════════════════════════════════════════
   BLANK PAGES (tester, 2026-10-21): 50 pages, photos deleted and moved, 45
   filled, 5 left blank with no way to remove them. Owner: a reminder at the
   end, "edit the pages or delete them". The 40-page floor stays: 42 pages
   with 4 blank → delete 2, fill the other 2.
   ══════════════════════════════════════════════════════════════════════════ */

const quad = getTemplatesForAlbum('8x8').find((t) => t.slots.length === 4)!;
const page = (over: Partial<AlbumPage> = {}): AlbumPage =>
  ({ id: 'p', layout: 'freeform', size: '8x8', background: { type: 'solid', solid: '#fff' }, photos: [], textElements: [], templateId: quad.id, slotFills: [null, null, null, null], ...over } as AlbumPage);
const filled = (i: number) => page({ id: `f${i}`, slotFills: [i, null, null, null] });
const blank = (i: number) => page({ id: `b${i}` });
/** `n` pages; the indexes in `blanks` have nothing on them. */
const album = (n: number, blanks: number[]) => Array.from({ length: n }, (_, i) => (blanks.includes(i) ? blank(i) : filled(i)));

describe('isBlankPage — nothing on it prints', () => {
  it('empty frames, a page colour, a texture or the theme corners alone are blank', () => {
    expect(isBlankPage(page())).toBe(true);
    expect(isBlankPage(page({ background: { type: 'solid', solid: '#E9C46A' } }))).toBe(true);
    expect(isBlankPage(page({ background: { type: 'texture', texture: 'linen' } }))).toBe(true);
    expect(isBlankPage(page({ cornerBase: 'floral' }))).toBe(true);
    expect(isBlankPage(page({ background: { type: 'image', image: 'linear-gradient(#fff, #eee)' } }))).toBe(true);
    expect(isBlankPage(page({ textElements: [{ id: 't', text: '   ' } as TextElement] }))).toBe(true);
  });

  it('anything a customer put there makes it not blank', () => {
    const notBlank: [string, Partial<AlbumPage>][] = [
      ['a photo in a frame', { slotFills: [null, 3, null, null] }],
      ['a video QR in a frame', { qrFills: [null, { code: 'x' } as never] }],
      ['words in a frame', { slotTexts: [{ text: 'Hi' } as never] }],
      ['a quote graphic in a frame', { ornamentFills: [{ id: 'rose' } as never] }],
      ['a photo in a caption box', { textSlotFills: [7] }],
      ['a QR in a caption box', { textSlotQr: [{ code: 'y' } as never] }],
      ['a graphic in a caption box', { textSlotOrnament: [{ id: 'leaf' } as never] }],
      ['words in a caption box', { textElements: [{ id: 't', text: 'Our day', boxIndex: 0 } as TextElement] }],
      ['free words', { textElements: [{ id: 't', text: 'Hong Kong 2026' } as TextElement] }],
      ['"Double-tap to edit" (it prints)', { textElements: [{ id: 't', text: PLACEHOLDER_TEXT } as TextElement] }],
      ['a free photo', { photos: [{ id: 'c', photoIndex: 2 } as never] }],
      ['a sticker', { stickers: [{ uid: 's' } as never] }],
      ['a photo as the background', { background: { type: 'image', photoId: 'p4', image: 'blob:x' } }],
      ['an uploaded background image', { background: { type: 'image', image: 'https://x.test/bg.jpg' } }],
    ];
    for (const [what, over] of notBlank) expect(isBlankPage(page(over)), what).toBe(false);
  });

  it('lists them first to last', () => {
    expect(blankPageIndexes(album(50, [3, 17, 30, 41, 49]))).toEqual([3, 17, 30, 41, 49]);
    expect(blankPageIndexes(album(40, []))).toEqual([]);
  });
});

describe('blankPagePlan — never under 40 pages', () => {
  it('the tester: 50 pages, 45 filled → all 5 can be deleted (45 pages)', () => {
    const p = blankPagePlan(album(50, [3, 17, 30, 41, 49]));
    expect(p).toEqual({ blank: [3, 17, 30, 41, 49], deletable: [3, 17, 30, 41, 49], staying: 0 });
  });

  it('42 pages, 38 filled → 2 can go (the LAST two), 2 stay to be filled', () => {
    const p = blankPagePlan(album(42, [5, 12, 20, 33]));
    expect(p).toEqual({ blank: [5, 12, 20, 33], deletable: [20, 33], staying: 2 });
  });

  it('40 pages with blanks → none can go', () => {
    const p = blankPagePlan(album(40, [8, 9]));
    expect(p).toEqual({ blank: [8, 9], deletable: [], staying: 2 });
  });

  it('no blank pages → nothing to say', () => {
    expect(blankPagePlan(album(45, []))).toEqual({ blank: [], deletable: [], staying: 0 });
  });
});

describe('the words (plain English, says exactly what happens)', () => {
  it('heading and buttons', () => {
    expect(blankPagesTitle(5)).toBe('5 pages are blank');
    expect(blankPagesTitle(1)).toBe('1 page is blank');
    expect(deleteBlankLabel(5)).toBe('Delete 5 blank pages');
    expect(deleteBlankLabel(1)).toBe('Delete 1 blank page');
    expect(editBlankLabel(5)).toBe('Edit the blank pages');
    expect(editBlankLabel(1)).toBe('Edit the blank page');
    expect(orderWithBlankLabel(5)).toBe('Order with blank pages');
    expect(orderWithBlankLabel(1)).toBe('Order with the blank page');
    expect(deletedBlankNote(5, 45)).toBe('Deleted 5 blank pages. Your album has 45 pages.');
    expect(deletedBlankNote(1, 41)).toBe('Deleted 1 blank page. Your album has 41 pages.');
  });

  it('the sentence: all can go / some can go / none can go', () => {
    expect(blankPagesBody(blankPagePlan(album(50, [3, 17, 30, 41, 49]))))
      .toBe('They print as empty pages. Delete them, or add photos to them.');
    expect(blankPagesBody(blankPagePlan(album(45, [9]))))
      .toBe('It prints as an empty page. Delete it, or add photos to it.');
    expect(blankPagesBody(blankPagePlan(album(42, [5, 12, 20, 33]))))
      .toBe('Albums need at least 40 pages, so you can delete 2. Add photos to the other 2, or they print blank.');
    expect(blankPagesBody(blankPagePlan(album(41, [5, 12]))))
      .toBe('Albums need at least 40 pages, so you can delete 1. Add photos to the other one, or it prints blank.');
    expect(blankPagesBody(blankPagePlan(album(40, [8, 9]))))
      .toBe("Albums need at least 40 pages, so these can't be deleted. Add photos to them, or they print blank.");
    expect(blankPagesBody(blankPagePlan(album(40, [8]))))
      .toBe("Albums need at least 40 pages, so it can't be deleted. Add photos to it, or it prints blank.");
  });
});

describe('the order check counts blank pages the same way', () => {
  it('a blank page is ONE blank page, not also 4 empty frames', () => {
    const r = checkOrderReadiness(album(50, [3, 17, 30, 41, 49]));
    expect(r.blankPages).toBe(5);
    // Each filled page has 3 empty frames of its own; the blank pages add none.
    expect(r.emptyFrames).toBe(45 * 3);
    expect(r.firstPage).toBe(0);
  });

  it('"Double-tap to edit" alone: said as that text, not as a blank page', () => {
    const r = checkOrderReadiness([page({ slotFills: [0, 1, 2, 3], textElements: [{ id: 't', text: PLACEHOLDER_TEXT } as TextElement] })]);
    expect(r.blankPages).toBe(0);
    expect(r.placeholderTexts).toBe(1);
    expect(readinessMessage(r)).toBe(`Before you order: your album has 1 text still saying "${PLACEHOLDER_TEXT}". They print exactly as they look.`);
  });
});
