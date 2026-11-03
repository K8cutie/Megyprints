import { describe, it, expect } from 'vitest';

/* ══════════════════════════════════════════════════════════════════════════
   TODAY'S TASK IN THE ALBUM (owner, 2026-10-29: "Including your other
   suggestions make that pool"). Where each one opens (a page with what it
   needs, never page 1 or the last page), and when it is done, read from the
   album itself, on any page.
   ══════════════════════════════════════════════════════════════════════════ */

import { albumTaskTarget, detectAlbumTask, snapPages, OPEN_BOOK_DONE } from './dailyAlbumTask';
import { getTemplatesForAlbum } from './pageTemplates';
import type { AlbumPage } from './types';

const all = getTemplatesForAlbum('8x8');
const withBox = all.find((t) => (t.textSlots?.length ?? 0) > 0 && t.slots.length >= 1)!;
const plain = all.filter((t) => !(t.textSlots?.length) && t.slots.length === 1);
type P = Pick<AlbumPage, 'templateId' | 'slotFills' | 'slotLooks' | 'textElements' | 'slotTexts' | 'studio'>;
const page = (i: number, over: Partial<P> = {}): P => ({ templateId: plain[0].id, slotFills: [i], textElements: [], ...over });
const album = (n = 40, over: (i: number) => Partial<P> = () => ({})) => Array.from({ length: n }, (_, i) => page(i, over(i)));

describe('where today\'s task opens', () => {
  it('a new layout: a page with photos, page 5 when it has them; never page 1 or the last page', () => {
    expect(albumTaskTarget('layout', album())).toEqual({ task: 'layout', page: 4, slot: null });
    // Pages 5 on without photos: the next with them, then the ones before.
    const sparse = album(40, (i) => (i >= 4 && i < 39 ? { slotFills: [null] } : {}));
    const t = albumTaskTarget('layout', sparse);
    expect(t.page).toBeGreaterThan(0);
    expect(t.page).toBeLessThan(39);
    expect(sparse[t.page].slotFills?.some((f) => f != null)).toBe(true);
  });

  it('a look and a swap: a photo on a page (its slot), page 3 and page 4', () => {
    expect(albumTaskTarget('look', album())).toEqual({ task: 'look', page: 2, slot: 0 });
    expect(albumTaskTarget('swap', album())).toEqual({ task: 'swap', page: 3, slot: 0 });
    // A page the customer made their own (Studio) is skipped.
    expect(albumTaskTarget('look', album(40, (i) => (i === 2 ? { studio: true } : {}))).page).toBe(3);
  });

  it('words in a box: the first page with an empty caption box, that box', () => {
    const a = album(40, (i) => (i === 6 || i === 9 ? { templateId: withBox.id, slotFills: withBox.slots.map((_, k) => k + i) } : {}));
    expect(albumTaskTarget('caption', a)).toEqual({ task: 'caption', page: 6, slot: 0 });
    // A box with words in it already: the next empty one.
    a[6] = { ...a[6], textElements: (withBox.textSlots ?? []).map((_, k) => ({ id: `t${k}`, boxIndex: k, text: 'Hi' }) as never) };
    expect(albumTaskTarget('caption', a).page).toBe(9);
  });

  it('an album with no box to type in: the new layout instead', () => {
    expect(albumTaskTarget('caption', album())).toEqual({ task: 'layout', page: 4, slot: null });
  });

  it('the open book: Preview, past the cover (page 2), where its button is', () => {
    expect(albumTaskTarget('openBook', album())).toEqual({ task: 'openBook', page: 1, slot: null });
  });
});

describe('when it is done: a change in the album, on any page', () => {
  const made = album();
  const start = snapPages(made);
  const change = (i: number, over: Partial<P>) => made.map((p, k) => (k === i ? { ...p, ...over } : p));

  it('nothing changed: not done, whatever the task', () => {
    for (const task of ['layout', 'caption', 'look', 'swap', 'openBook'] as const) expect(detectAlbumTask(task, start, made, 4)).toBeNull();
  });

  it('a new layout', () => {
    expect(detectAlbumTask('layout', start, change(4, { templateId: 't-another-layout' }), 4)).toBe('new layout on page 5');
    // On another page counts too, and says that page.
    expect(detectAlbumTask('layout', start, change(11, { templateId: 't-another-layout' }), 4)).toBe('new layout on page 12');
  });

  it('words typed in a box', () => {
    expect(detectAlbumTask('caption', start, change(6, { textElements: [{ id: 'x', boxIndex: 0, text: 'Lola' } as never] }), 6)).toBe('words on page 7');
    // An empty box is not words.
    expect(detectAlbumTask('caption', start, change(6, { textElements: [{ id: 'x', boxIndex: 0, text: '  ' } as never] }), 6)).toBeNull();
  });

  it('a photo filter (Studio\'s look)', () => {
    expect(detectAlbumTask('look', start, change(2, { slotLooks: ['warm'] }), 2)).toBe('filter on page 3');
    expect(detectAlbumTask('look', start, change(2, { slotLooks: [null] }), 2)).toBeNull();
  });

  it('photos swapped: both pages change; the page it opened on is the one named', () => {
    const swapped = made.map((p, k) => (k === 3 ? { ...p, slotFills: [20] } : k === 20 ? { ...p, slotFills: [3] } : p));
    expect(detectAlbumTask('swap', start, swapped, 3)).toBe('swapped a photo on page 4');
    // A new layout is not a swap.
    expect(detectAlbumTask('swap', start, change(3, { templateId: 't-another-layout', slotFills: [3, null] }), 3)).toBeNull();
  });

  it('the open book is not in the album: Preview says it', () => {
    expect(OPEN_BOOK_DONE).toBe('open book view');
  });
});
