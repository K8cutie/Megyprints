// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* ══════════════════════════════════════════════════════════════════════════
   "Write a line for this photo" in the quote picker (owner, 2026-10-21:
   Haiku, the customer picks from 3). A signed-out tap is answered with the
   sign-in step — never a greyed button — and carries on by itself after it;
   a signed-in tap shows 3 lines written for the photo; tapping one puts it in
   the box. Every way it can end has words, and "Type your own words" is
   always there. The quote bank's theme lines are OFF (owner, 2026-10-21:
   "disable it since haiku is now dynamically doing the quotes"): the picker
   never asks for them and never shows one.
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({
  user: null as { id: string } | null,
  openLogin: vi.fn(),
  write: vi.fn(),
  bankAsked: vi.fn(),
}));
vi.mock('../../lib/authContext', () => ({ useAuth: () => ({ user: h.user }) }));
vi.mock('../../components/AuthModalProvider', () => ({ useAuthModal: () => ({ openLogin: h.openLogin }) }));
vi.mock('../../lib/photoQuotes', () => ({ writeLinesForPhotos: (...a: unknown[]) => h.write(...a) }));
const fit = vi.hoisted(() => ({ room: 100 as number | null }));
vi.mock('./textFit', () => ({
  quoteRoom: () => fit.room,
  // a line marked TOO LONG would not print whole in the box
  captionFits: (line: string) => ({ fits: !line.includes('TOO LONG'), fitsAt: null }),
}));
vi.mock('../../lib/quotes', () => ({
  fetchThemeQuotes: async () => { h.bankAsked(); return { quotes: ['A line for the trip'], source: 'curated' }; },
  moreThemeQuotes: async () => { h.bankAsked(); return { quotes: ['A line for the trip'], source: 'curated' }; },
  curatedQuotesFor: () => { h.bankAsked(); return ['A line for the trip']; },
  MAX_QUOTE_CHARS: 46,
}));

import QuotePickerModal, { PHOTO_QUOTE_MESSAGES, NO_PHOTO_NOTE } from './QuotePickerModal';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
const onPick = vi.fn();
const onClose = vi.fn();
const onEdit = vi.fn();
const show = (photoUrls: string[] = ['blob:x/0']) => act(() => root.render(createElement(QuotePickerModal, { photoUrls, onPick, onClose, onEdit, mobile: true })));
const $ = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const $$ = (id: string) => [...host.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
const tap = async (el: HTMLElement | null) => { await act(async () => { el!.click(); }); await act(async () => { await Promise.resolve(); }); };
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

beforeEach(() => {
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  h.user = null; h.openLogin.mockReset(); h.write.mockReset(); h.bankAsked.mockReset(); onPick.mockReset(); onClose.mockReset(); onEdit.mockReset();
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe('the button', () => {
  it('a page with no photos: no button (nothing to look at)', async () => {
    show([]);
    await settle();
    expect($('photo-quote')).toBeNull();
  });
  it('says this photo / these photos, in words, and that the copy is not kept', async () => {
    show(['blob:x/0']);
    await settle();
    expect($('photo-quote-write')!.textContent!.trim()).toBe('Write a line for this photo');
    expect($('photo-quote')!.textContent).toContain('We don’t keep it.');
    show(['blob:x/0', 'blob:x/1']);
    expect($('photo-quote-write')!.textContent!.trim()).toBe('Write a line for these photos');
    expect($('photo-quote-write')!.hasAttribute('disabled')).toBe(false); // never a greyed, dead tap
  });
});

describe('signed out', () => {
  it('the tap asks to sign in and sends nothing; "Sign in" opens sign-in; once in, it carries on by itself', async () => {
    show();
    await settle();
    await tap($('photo-quote-write'));
    expect($('photo-quote-sign-in')).not.toBeNull();
    expect(h.write).not.toHaveBeenCalled();
    await tap($('photo-quote-sign-in')!.querySelector('button'));
    expect(h.openLogin).toHaveBeenCalledTimes(1);

    h.user = { id: 'u1' };
    h.write.mockResolvedValue({ lines: ['Making each other laugh', 'Riding the train together', 'A castle at night'] });
    show();
    await settle();
    expect(h.write).toHaveBeenCalledTimes(1);
    expect($$('photo-quote-line').map((b) => b.textContent)).toEqual(['Making each other laugh', 'Riding the train together', 'A castle at night']);
  });
});

describe('signed in', () => {
  beforeEach(() => { h.user = { id: 'u1' }; });
  it('a page of several photos: all of them go, and the lines say they are for these photos', async () => {
    h.write.mockResolvedValue({ lines: ['A happy start to a big day', 'Arriving with big smiles', 'A fun day out in Hong Kong'] });
    show(['blob:x/0', 'blob:x/1', 'blob:x/2']);
    await settle();
    await tap($('photo-quote-write'));
    expect(h.write.mock.calls[0][0]).toEqual(['blob:x/0', 'blob:x/1', 'blob:x/2']);
    expect($('photo-quote-heading')!.textContent).toBe('Written for these photos'); // walk 2026-10-21: it said "this photos"
  });
  it('3 lines written for the photo; tapping one puts it in the box', async () => {
    h.write.mockResolvedValue({ lines: ['Making each other laugh', 'Riding the train together', 'A castle at night'] });
    show(['blob:x/0']);
    await settle();
    await tap($('photo-quote-write'));
    expect(h.write.mock.calls[0][0]).toEqual(['blob:x/0']);
    expect($('photo-quote-heading')!.textContent).toBe('Written for this photo');
    const lines = $$('photo-quote-line');
    expect(lines).toHaveLength(3);
    await tap(lines[1]);
    expect(onPick).toHaveBeenCalledWith('Riding the train together');
    expect(onClose).toHaveBeenCalled();
  });
  it('"Write 3 more" sends the lines already shown so they are not repeated', async () => {
    h.write.mockResolvedValueOnce({ lines: ['One', 'Two', 'Three'] }).mockResolvedValueOnce({ lines: ['Four', 'Five', 'Six'] });
    show();
    await settle();
    await tap($('photo-quote-write'));
    await tap($('photo-quote-more'));
    expect(h.write.mock.calls[1][2]).toEqual(['One', 'Two', 'Three']);
    expect($$('photo-quote-line').map((b) => b.textContent)).toEqual(['Four', 'Five', 'Six']);
  });
  it('every way it can end has words, and "Type your own words" is there', async () => {
    for (const error of ['limit_user', 'limit_all', 'refused', 'failed'] as const) {
      h.write.mockResolvedValueOnce({ error });
      show();
      await settle();
      await tap($('photo-quote-write'));
      expect($('photo-quote-note')!.textContent).toBe(PHOTO_QUOTE_MESSAGES[error]);
      expect($('quote-own-words')).not.toBeNull();
      expect(PHOTO_QUOTE_MESSAGES[error]).not.toMatch(/below/); // nothing is listed below any more
      act(() => root.unmount());
      root = createRoot(host);
    }
  });
  it('a session that ran out on the server asks to sign in again', async () => {
    h.write.mockResolvedValue({ error: 'sign_in' });
    show();
    await settle();
    await tap($('photo-quote-write'));
    expect($('photo-quote-sign-in')).not.toBeNull();
    expect(h.write).toHaveBeenCalledTimes(1); // and does not loop
  });
});

describe('box-sized lines (owner, 2026-10-21: longer lines where the box has room)', () => {
  const quoteBox = { box: { w: 349, h: 372 }, style: { fontSize: 28, italic: true } };
  beforeEach(() => { h.user = { id: 'u1' }; fit.room = 100; });
  const showBox = () => act(() => root.render(createElement(QuotePickerModal, { photoUrls: ['blob:x/0'], quoteBox, onPick, onClose, onEdit, mobile: true })));
  it("asks for lines as long as the box takes", async () => {
    h.write.mockResolvedValue({ lines: ['A fun day out, with bright signs and happy stops all along the way'] });
    showBox();
    await settle();
    await tap($('photo-quote-write'));
    expect(h.write.mock.calls[0][3]).toBe(100);
  });
  it('offers only the lines that print whole in this box', async () => {
    h.write.mockResolvedValue({ lines: ['Fits nicely', 'TOO LONG for this box', 'Also fits'] });
    showBox();
    await settle();
    await tap($('photo-quote-write'));
    expect($$('photo-quote-line').map((b) => b.textContent)).toEqual(['Fits nicely', 'Also fits']);
  });
  it('none fit: it says so, and "Type your own words" is there', async () => {
    h.write.mockResolvedValue({ lines: ['TOO LONG one', 'TOO LONG two'] });
    showBox();
    await settle();
    await tap($('photo-quote-write'));
    expect($('photo-quote-note')!.textContent).toBe(PHOTO_QUOTE_MESSAGES.no_fit);
    expect($('quote-own-words')).not.toBeNull();
  });
  it("can't measure, or no box (a quote in a photo frame): no room is sent, the server's cap applies", async () => {
    fit.room = null;
    h.write.mockResolvedValue({ lines: ['Short line'] });
    showBox();
    await settle();
    await tap($('photo-quote-write'));
    expect(h.write.mock.calls[0][3]).toBeUndefined();
  });
});

describe('the quote bank is off (owner, 2026-10-21): only lines for the photos, or your own words', () => {
  it('opening the picker never asks for theme lines and shows none', async () => {
    h.user = { id: 'u1' };
    h.write.mockResolvedValue({ lines: ['One', 'Two', 'Three'] });
    show();
    await settle();
    expect(h.bankAsked).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain('A line for the trip');
    expect(host.textContent).not.toMatch(/theme|curated/i);
  });
  it('"Type your own words" hands the box to the typing editor', async () => {
    show();
    await settle();
    expect($('quote-own-words')!.textContent!.trim()).toBe('Type your own words');
    await tap($('quote-own-words'));
    expect(onClose).toHaveBeenCalled();
    expect(onEdit).toHaveBeenCalledTimes(1);
  });
  it('signed out: the sign-in step, and your own words right there', async () => {
    show();
    await settle();
    await tap($('photo-quote-write'));
    expect($('photo-quote-sign-in')).not.toBeNull();
    expect($('quote-own-words')).not.toBeNull();
  });
  it('a page with no photo yet: says to put one on, and your own words', async () => {
    show([]);
    await settle();
    expect($('quote-no-photo')!.textContent).toBe(NO_PHOTO_NOTE);
    expect($('quote-own-words')).not.toBeNull();
  });
  it('a box that already has a line: "Edit the words" below instead (no second way in)', async () => {
    act(() => root.render(createElement(QuotePickerModal, { photoUrls: ['blob:x/0'], initial: 'Our big week', onPick, onClose, onEdit, onRemove: vi.fn(), mobile: true })));
    await settle();
    expect($('quote-own-words')).toBeNull();
    expect($('quote-edit-words')).not.toBeNull();
  });
});

describe('"Let AI write a quote": an empty quote box starts writing in ONE tap (owner, 2026-10-21)', () => {
  const open = (props: Record<string, unknown>) => act(() => root.render(createElement(QuotePickerModal, { onPick, onClose, mobile: true, ...props })));
  it('opened on an empty quote box: the lines are written without a second tap', async () => {
    h.user = { id: 'u1' };
    h.write.mockResolvedValue({ lines: ['A happy start to a big day'] });
    open({ photoUrls: ['blob:x/0', 'blob:x/1'], autoWrite: true });
    await settle();
    await settle();
    expect(h.write).toHaveBeenCalledTimes(1);
    expect($$('photo-quote-line').map((b) => b.textContent)).toEqual(['A happy start to a big day']);
  });
  it('opened on a quote already there (the pool): nothing starts by itself', async () => {
    h.user = { id: 'u1' };
    open({ photoUrls: ['blob:x/0'], autoWrite: false, initial: 'Old line' });
    await settle();
    expect(h.write).not.toHaveBeenCalled();
  });
  it('signed out: it asks to sign in first, and sends nothing', async () => {
    h.user = null;
    open({ photoUrls: ['blob:x/0'], autoWrite: true });
    await settle();
    expect($('photo-quote-sign-in')).not.toBeNull();
    expect(h.write).not.toHaveBeenCalled();
  });
  it('a page with no photos: nothing to write from, so nothing starts', async () => {
    h.user = { id: 'u1' };
    open({ photoUrls: [], autoWrite: true });
    await settle();
    expect(h.write).not.toHaveBeenCalled();
  });
  it('the empty quote box says "Let AI write a quote" on desktop and phone, and only an EMPTY box auto-writes', () => {
    const canvas = readFileSync(resolve(__dirname, 'useCanvasEngine.ts'), 'utf8');
    const dom = readFileSync(resolve(__dirname, 'BuilderPreview.tsx'), 'utf8');
    expect(canvas).toMatch(/roll === 'quote' \? 'Let AI write a quote'/);
    expect(dom).toMatch(/quote: 'Let AI write a quote',/);
    expect(readFileSync(resolve(__dirname, 'BuilderEdit.tsx'), 'utf8')).toMatch(/autoWrite=\{!actions\.currentPage\?\.textElements\?\.some\(\(t\) => t\.boxIndex === boxQuoteSlot\)\}/);
    expect(readFileSync(resolve(__dirname, 'MobileReview.tsx'), 'utf8')).toMatch(/autoWrite=\{!page\?\.textElements\?\.some\(\(t\) => t\.boxIndex === boxQuoteSlot\)\}/);
  });
});

describe('wired in all four places the picker opens', () => {
  it('BuilderEdit (desktop) and MobileReview (phone) pass the page photos to both pickers', () => {
    for (const f of ['BuilderEdit.tsx', 'MobileReview.tsx']) {
      const src = readFileSync(resolve(__dirname, f), 'utf8');
      expect(src.match(/photoUrls=\{pagePhotoUrls\(/g)).toHaveLength(2);
      // the quote BOX picker sizes lines to its box; the photo-frame one has none
      expect(src.match(/quoteBox=\{quoteBoxFor\(/g)).toHaveLength(1);
    }
  });
});
